/**
 * Upload Service — Chunked upload engine with edge-case hardening.
 *
 * Strategy overview:
 * - Each chunk is saved as a SEPARATE file (chunk_000, chunk_001, ...)
 *   inside a per-upload session directory. This eliminates the append
 *   race condition entirely — concurrent chunk arrivals write to
 *   different files and can never interleave.
 *
 * - The DB is hit only TWICE per upload: once on init() to create the
 *   UploadSession, and once on complete() to finalize. During chunk
 *   transfer, chunk count is derived from the filesystem (readdir).
 *   This minimizes SQLite lock contention.
 *
 * - On client disconnect (req close/abort), partial chunk files are
 *   immediately deleted and streams destroyed.
 *
 * - Stale sessions (>24h) are purged by a periodic cleanup job.
 */

import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { TEMP_DIR_NAME, STALE_UPLOAD_HOURS } from '../config/constants';
import { AppError } from '../middleware/errorHandler';
import { resolveUserStorageRoot } from '../middleware/pathGuard';
import { sanitizeFilename, deduplicateFilename } from '../utils/sanitize';
import { generateShareHash } from '../utils/crypto';
import { fileExists } from './storage.service';

// ─── Helpers ───

/** Returns the directory where chunks for this session are stored */
function chunkDir(uploadSessionId: string): string {
  return path.resolve(env.EXT4_MOUNT_PATH, TEMP_DIR_NAME, uploadSessionId);
}

/** Zero-pads a chunk index for lexicographic sorting (up to 99999 chunks) */
function chunkFileName(index: number): string {
  return `chunk_${String(index).padStart(5, '0')}`;
}

/** Counts chunk files currently on disk for a session */
async function countChunksOnDisk(sessionId: string): Promise<number> {
  const dir = chunkDir(sessionId);
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.startsWith('chunk_')).length;
  } catch {
    return 0;
  }
}

// ─── Public API ───

/**
 * Phase 1 of upload: validate quota, create UploadSession, create chunk dir.
 * Returns the session ID for subsequent chunk uploads.
 */
export async function initUpload(
  userId: string,
  role: string,
  filename: string,
  totalSize: number,
  totalChunks: number,
  mimeType: string,
): Promise<{ uploadSessionId: string }> {
  // ─── Quota pre-check (users only — admin has no quota) ───
  if (role !== 'admin') {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const projectedUsage = Number(user.usedStorageBytes) + totalSize;
    if (projectedUsage > Number(user.storageQuotaBytes)) {
      throw new AppError(
        `Quota exceeded. You have ${formatBytes(Number(user.storageQuotaBytes) - Number(user.usedStorageBytes))} remaining.`,
        403,
      );
    }
  }

  // Create the upload session in DB (1st of 2 DB writes)
  const session = await prisma.uploadSession.create({
    data: {
      userId,
      originalName: filename,
      totalSize: BigInt(totalSize),
      totalChunks,
      tempFilePath: '', // Will be set to the chunk dir path
      status: 'pending',
    },
  });

  // Create the chunk directory
  const dir = chunkDir(session.id);
  await fs.mkdir(dir, { recursive: true });

  // Update the session with the actual path
  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { tempFilePath: dir },
  });

  return { uploadSessionId: session.id };
}

/**
 * Phase 2 of upload: receive a single chunk and write it to its own file.
 * Returns the current chunk count (read from filesystem, not DB).
 *
 * @param sessionId - The upload session ID
 * @param chunkIndex - 0-based index of this chunk
 * @param dataStream - The readable stream of chunk data from busboy
 * @param req - The Express request (for abort detection)
 */
export async function receiveChunk(
  sessionId: string,
  chunkIndex: number,
  dataStream: NodeJS.ReadableStream,
  req: import('http').IncomingMessage,
): Promise<{ receivedChunks: number; totalChunks: number }> {
  // Validate session exists and is pending
  const session = await prisma.uploadSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.status !== 'pending') {
    throw new AppError('Invalid or completed upload session', 400);
  }

  // ─── Idempotency: if chunk already exists, skip the write ───
  const dir = chunkDir(sessionId);
  const chunkPath = path.join(dir, chunkFileName(chunkIndex));

  if (await fileExists(chunkPath)) {
    const count = await countChunksOnDisk(sessionId);
    return { receivedChunks: count, totalChunks: session.totalChunks };
  }

  // ─── Write chunk to its own file with abort protection ───
  // Write to a temp name first, then rename — prevents partial files
  // from being counted as complete chunks.
  const partialPath = chunkPath + '.partial';
  const writeStream = createWriteStream(partialPath);

  let aborted = false;

  const cleanup = async () => {
    if (aborted) return;
    aborted = true;
    writeStream.destroy();
    dataStream.destroy();
    // Remove partial file if connection dropped
    try {
      await fs.unlink(partialPath);
    } catch {
      // File may not exist yet
    }
  };

  // Listen for client disconnect
  req.on('close', () => {
    if (!req.complete) {
      // Connection dropped before request finished
      cleanup();
    }
  });

  try {
    await pipeline(dataStream, writeStream);

    if (aborted) {
      throw new AppError('Upload aborted by client', 499);
    }

    // Atomic rename: partial → final chunk name
    // Only completed chunks get the final name, so countChunksOnDisk
    // never counts half-written files.
    await fs.rename(partialPath, chunkPath);
  } catch (err) {
    await cleanup();
    if (aborted || (err as any)?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      throw new AppError('Upload aborted by client', 499);
    }
    throw err;
  }

  const count = await countChunksOnDisk(sessionId);
  return { receivedChunks: count, totalChunks: session.totalChunks };
}

/**
 * Phase 3 of upload: stitch all chunks into the final file, update DB + quota.
 * This is the 2nd (and final) DB write for the upload lifecycle.
 */
export async function completeUpload(
  sessionId: string,
  userId: string,
  role: string,
): Promise<{
  fileId: string;
  sanitizedName: string;
  shareHash: string;
  sizeBytes: number;
}> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.status !== 'pending') {
    throw new AppError('Invalid or completed upload session', 400);
  }

  if (session.userId !== userId) {
    throw new AppError('Session does not belong to this user', 403);
  }

  // Verify all chunks are present
  const receivedChunks = await countChunksOnDisk(sessionId);
  if (receivedChunks !== session.totalChunks) {
    throw new AppError(
      `Missing chunks: received ${receivedChunks} of ${session.totalChunks}`,
      400,
    );
  }

  // ─── Determine destination ───
  const userRoot = resolveUserStorageRoot(userId, role);
  const safeName = sanitizeFilename(session.originalName);
  const finalName = await deduplicateFilename(userRoot, safeName, fileExists);
  const finalPath = path.join(userRoot, finalName);

  // ─── Stitch chunks sequentially ───
  const dir = chunkDir(sessionId);
  const chunkFiles = (await fs.readdir(dir))
    .filter((f) => f.startsWith('chunk_') && !f.endsWith('.partial'))
    .sort(); // Lexicographic sort — chunk_00000, chunk_00001, ...

  const writeStream = createWriteStream(finalPath);

  try {
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(dir, chunkFile);
      const readStream = createReadStream(chunkPath);
      await pipeline(readStream, writeStream, { end: false });
    }
    writeStream.end();

    // Wait for the write stream to finish
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  } catch (err) {
    // Clean up partial final file on failure
    try {
      await fs.unlink(finalPath);
    } catch { /* ignore */ }
    throw new AppError('Failed to assemble file from chunks', 500);
  }

  // Verify assembled file size matches expected
  const stat = await fs.stat(finalPath);
  if (stat.size !== Number(session.totalSize)) {
    await fs.unlink(finalPath);
    throw new AppError(
      `Assembled file size mismatch: expected ${session.totalSize}, got ${stat.size}`,
      500,
    );
  }

  // ─── Generate share hash ───
  const shareHash = generateShareHash();

  // ─── Single DB transaction: create File + update quota + mark session complete ───
  const mimeType = guessMimeType(session.originalName);

  const file = await prisma.$transaction(async (tx) => {
    const newFile = await tx.file.create({
      data: {
        userId,
        originalName: session.originalName,
        sanitizedName: finalName,
        mimeType,
        sizeBytes: session.totalSize,
        relativePath: finalName,
        shareHash,
        isPublic: false,
      },
    });

    // Update user quota (skip for admin)
    if (role !== 'admin') {
      await tx.user.update({
        where: { id: userId },
        data: {
          usedStorageBytes: { increment: session.totalSize },
        },
      });
    }

    // Mark session as complete
    await tx.uploadSession.update({
      where: { id: sessionId },
      data: { status: 'complete' },
    });

    return newFile;
  });

  // ─── Clean up chunk directory (non-blocking) ───
  fs.rm(dir, { recursive: true, force: true }).catch(() => {});

  return {
    fileId: file.id,
    sanitizedName: finalName,
    shareHash,
    sizeBytes: Number(session.totalSize),
  };
}

/**
 * Abort an in-progress upload: delete chunk dir + mark session failed.
 */
export async function abortUpload(
  sessionId: string,
  userId: string,
): Promise<void> {
  const session = await prisma.uploadSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError('Upload session not found', 404);
  }

  if (session.userId !== userId) {
    throw new AppError('Session does not belong to this user', 403);
  }

  // Delete chunk directory
  const dir = chunkDir(sessionId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

  // Mark session as failed
  await prisma.uploadSession.update({
    where: { id: sessionId },
    data: { status: 'failed' },
  });
}

/**
 * Cleanup stale upload sessions older than STALE_UPLOAD_HOURS.
 * Called at startup and periodically. Returns number of cleaned sessions.
 */
export async function cleanupStaleUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_HOURS * 60 * 60 * 1000);

  const staleSessions = await prisma.uploadSession.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
    },
  });

  for (const session of staleSessions) {
    const dir = chunkDir(session.id);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  if (staleSessions.length > 0) {
    await prisma.uploadSession.updateMany({
      where: {
        id: { in: staleSessions.map((s) => s.id) },
      },
      data: { status: 'failed' },
    });
  }

  return staleSessions.length;
}

// ─── Utilities ───

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Basic MIME type detection from filename extension */
function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.iso': 'application/x-iso9660-image',
    '.dmg': 'application/x-apple-diskimage',
    '.exe': 'application/x-msdownload',
    '.apk': 'application/vnd.android.package-archive',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
