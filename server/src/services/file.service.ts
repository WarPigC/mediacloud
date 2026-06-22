/**
 * File Service — download streaming, deletion with quota rollback,
 * share link management, and lazy filesystem browsing.
 */

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import { resolveUserStorageRoot, isPathWithinRoot } from '../middleware/pathGuard';
import { generateShareHash } from '../utils/crypto';

// ─── MIME Type Mapping ───

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv', '.m4v': 'video/mp4', '.ts': 'video/mp2t',
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.zip': 'application/zip', '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.srt': 'text/plain', '.ass': 'text/plain', '.vtt': 'text/vtt',
};

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ─── File Listing (Regular Users) ───

export async function listUserFiles(
  userId: string,
  page: number = 1,
  pageSize: number = 50,
) {
  const skip = (page - 1) * pageSize;

  const [files, total] = await Promise.all([
    prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.file.count({ where: { userId } }),
  ]);

  return { files, total, page, pageSize };
}

// ─── Lazy Filesystem Browsing (Admin Only) ───

export interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  mimeType?: string;
  fileId?: string; // DB id, only present for indexed files
  isPublic?: boolean;
  shareHash?: string | null;
}

/**
 * Reads the contents of a directory on the admin's NTFS mount.
 * Files are lazily indexed into the database on first discovery.
 * Directories are never indexed — they're read from the filesystem each time.
 */
export async function browseDirectory(
  userId: string,
  role: string,
  relativePath: string = '',
): Promise<{ entries: BrowseEntry[]; currentPath: string }> {
  if (role !== 'admin') {
    throw new AppError('Browse is only available for admin users', 403);
  }

  const storageRoot = resolveUserStorageRoot(userId, role);
  const targetDir = path.resolve(storageRoot, relativePath);

  // Security: ensure the resolved path is within the storage root
  if (!isPathWithinRoot(targetDir, storageRoot)) {
    throw new AppError('Access denied', 403);
  }

  // Verify the directory exists
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      throw new AppError('Path is not a directory', 400);
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError('Directory not found', 404);
  }

  // Read directory contents
  const dirEntries = await fs.readdir(targetDir, { withFileTypes: true });
  const entries: BrowseEntry[] = [];

  // Batch: collect files that need lazy indexing
  const filesToIndex: { name: string; relative: string; fullPath: string }[] = [];

  for (const entry of dirEntries) {
    // Skip hidden files/dirs (starting with .)
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(targetDir, entry.name);
    const entryRelative = path.relative(storageRoot, fullPath);

    if (entry.isDirectory()) {
      entries.push({ name: entry.name, type: 'directory' });
    } else if (entry.isFile()) {
      filesToIndex.push({ name: entry.name, relative: entryRelative, fullPath });
    }
  }

  // Lazy index: check which files are already in the DB, create entries for new ones
  if (filesToIndex.length > 0) {
    const existingFiles = await prisma.file.findMany({
      where: {
        userId,
        relativePath: { in: filesToIndex.map((f) => f.relative) },
      },
    });

    const existingMap = new Map(existingFiles.map((f) => [f.relativePath, f]));

    for (const fileInfo of filesToIndex) {
      let dbFile = existingMap.get(fileInfo.relative);

      // Lazy index: create DB record if not already indexed
      if (!dbFile) {
        try {
          const stat = await fs.stat(fileInfo.fullPath);
          dbFile = await prisma.file.create({
            data: {
              userId,
              originalName: fileInfo.name,
              sanitizedName: fileInfo.name,
              mimeType: guessMime(fileInfo.name),
              sizeBytes: BigInt(stat.size),
              relativePath: fileInfo.relative,
              shareHash: crypto.randomBytes(16).toString('hex'),
            },
          });
        } catch {
          // Skip files we can't stat (permission errors, etc.)
          continue;
        }
      }

      entries.push({
        name: fileInfo.name,
        type: 'file',
        sizeBytes: Number(dbFile.sizeBytes),
        mimeType: dbFile.mimeType,
        fileId: dbFile.id,
        isPublic: dbFile.isPublic,
        shareHash: dbFile.shareHash,
      });
    }
  }

  // Sort: directories first, then files, both alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return { entries, currentPath: relativePath };
}

// ─── Download ───

export interface DownloadInfo {
  filePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Resolves the physical path + metadata for a file download.
 * Verifies ownership and that the file exists on disk.
 */
export async function getDownloadInfo(
  fileId: string,
  userId: string,
  role: string,
): Promise<DownloadInfo> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new AppError('File not found', 404);
  }

  // Verify ownership (admin can download their own files only)
  if (file.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  const userRoot = resolveUserStorageRoot(userId, role);
  const filePath = path.join(userRoot, file.relativePath);

  // Security: verify the resolved path is within the user's root
  if (!isPathWithinRoot(filePath, userRoot)) {
    throw new AppError('Access denied', 403);
  }

  // Verify file exists on disk
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError('File not found on disk', 404);
  }

  return {
    filePath,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
  };
}

/**
 * Resolves download info for a public share link.
 * No auth required — only checks that the share hash is valid.
 */
export async function getPublicDownloadInfo(
  shareHash: string,
): Promise<DownloadInfo> {
  const file = await prisma.file.findUnique({
    where: { shareHash },
    include: { user: true },
  });

  if (!file || !file.isPublic) {
    throw new AppError('File not found or sharing disabled', 404);
  }

  const userRoot = resolveUserStorageRoot(file.userId, file.user.role);
  const filePath = path.join(userRoot, file.relativePath);

  try {
    await fs.access(filePath);
  } catch {
    throw new AppError('File not found on disk', 404);
  }

  return {
    filePath,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
  };
}

/**
 * Returns metadata for a public share link (without exposing the path).
 */
export async function getShareMetadata(shareHash: string) {
  const file = await prisma.file.findUnique({ where: { shareHash } });
  if (!file || !file.isPublic) {
    throw new AppError('File not found or sharing disabled', 404);
  }

  return {
    originalName: file.originalName,
    sizeBytes: Number(file.sizeBytes),
    mimeType: file.mimeType,
  };
}

// ─── Deletion ───

/**
 * Deletes a file from disk and DB, and decrements the user's quota.
 */
export async function deleteFile(
  fileId: string,
  userId: string,
  role: string,
): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new AppError('File not found', 404);
  }

  if (file.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  const userRoot = resolveUserStorageRoot(userId, role);
  const filePath = path.join(userRoot, file.relativePath);

  // Delete from disk (ignore if already missing)
  try {
    await fs.unlink(filePath);
  } catch {
    // File might have been manually deleted — proceed with DB cleanup
  }

  // Single transaction: delete File record + decrement quota
  await prisma.$transaction(async (tx) => {
    await tx.file.delete({ where: { id: fileId } });

    if (role !== 'admin') {
      await tx.user.update({
        where: { id: userId },
        data: {
          usedStorageBytes: { decrement: file.sizeBytes },
        },
      });
    }
  });
}

// ─── Share Link Management ───

/**
 * Enables public sharing for a file and returns the share hash.
 */
export async function enableSharing(
  fileId: string,
  userId: string,
): Promise<string> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new AppError('File not found', 404);
  }
  if (file.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  // If already shared, return existing hash
  if (file.isPublic && file.shareHash) {
    return file.shareHash;
  }

  // Generate a unique hash (retry on collision)
  let hash: string;
  let attempts = 0;
  do {
    hash = generateShareHash();
    const existing = await prisma.file.findUnique({ where: { shareHash: hash } });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new AppError('Failed to generate unique share hash', 500);
  }

  await prisma.file.update({
    where: { id: fileId },
    data: { shareHash: hash, isPublic: true },
  });

  return hash;
}

/**
 * Disables public sharing for a file.
 */
export async function disableSharing(
  fileId: string,
  userId: string,
): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new AppError('File not found', 404);
  }
  if (file.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  await prisma.file.update({
    where: { id: fileId },
    data: { shareHash: null, isPublic: false },
  });
}

/**
 * Creates a ReadStream for streaming a file to the client.
 * The caller (route handler) pipes this to `res`.
 */
export function createFileReadStream(filePath: string) {
  return createReadStream(filePath);
}
