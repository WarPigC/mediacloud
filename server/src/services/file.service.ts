/**
 * File Service — download streaming, deletion with quota rollback,
 * and share link management.
 */

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import { resolveUserStorageRoot, isPathWithinRoot } from '../middleware/pathGuard';
import { generateShareHash } from '../utils/crypto';

// ─── File Listing ───

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
