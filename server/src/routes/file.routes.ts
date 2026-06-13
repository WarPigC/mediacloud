/**
 * File Routes — upload (chunked), download (streamed), delete, share.
 *
 * Upload flow:
 *   1. POST /init        → pre-check quota, create session
 *   2. POST /:id/chunk   → stream each 5MB chunk via busboy
 *   3. POST /:id/complete → stitch chunks, write DB, update quota
 *   4. DELETE /:id/abort  → cancel upload, delete chunks
 */

import { Router } from 'express';
import { z } from 'zod';
import Busboy from 'busboy';
import { pipeline } from 'stream/promises';
import { authenticate } from '../middleware/auth';
import { requireUser } from '../middleware/roleGuard';
import { pathGuard } from '../middleware/pathGuard';
import { uploadLimiter } from '../middleware/rateLimiter';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import * as uploadService from '../services/upload.service';
import * as fileService from '../services/file.service';

const router = Router();

// All file routes require authentication
router.use(authenticate, requireUser);

// ─── Validation Schemas ───

const uploadInitSchema = z.object({
  filename: z.string().min(1).max(500),
  totalSize: z.number().int().positive(),
  totalChunks: z.number().int().positive(),
  mimeType: z.string().optional(),
}).strict();

// ─── Upload Init ───

router.post(
  '/upload/init',
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const body = uploadInitSchema.parse(req.body);

    const result = await uploadService.initUpload(
      req.user!.userId,
      req.user!.role,
      body.filename,
      body.totalSize,
      body.totalChunks,
      body.mimeType || 'application/octet-stream',
    );

    res.status(201).json({ success: true, data: result });
  }),
);

// ─── Chunk Upload ───

router.post(
  '/upload/:sessionId/chunk',
  uploadLimiter,
  pathGuard,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const chunkIndexHeader = req.headers['x-chunk-index'];

    if (chunkIndexHeader === undefined) {
      throw new AppError('Missing x-chunk-index header', 400);
    }

    const chunkIndex = parseInt(chunkIndexHeader as string, 10);
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      throw new AppError('Invalid x-chunk-index header', 400);
    }

    // Parse multipart form data with busboy (pure streaming — no RAM buffering)
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: 6 * 1024 * 1024, // 6MB hard cap per chunk (5MB + overhead)
      },
    });

    let processed = false;

    const filePromise = new Promise<{ receivedChunks: number; totalChunks: number }>(
      (resolve, reject) => {
        busboy.on('file', (_fieldname, fileStream, _info) => {
          processed = true;

          uploadService
            .receiveChunk(sessionId, chunkIndex, fileStream, req)
            .then(resolve)
            .catch(reject);
        });

        busboy.on('error', reject);

        busboy.on('finish', () => {
          if (!processed) {
            reject(new AppError('No file data received in chunk upload', 400));
          }
        });
      },
    );

    // Pipe the request directly into busboy (streaming — no buffering)
    req.pipe(busboy);

    const result = await filePromise;

    res.json({ success: true, data: result });
  }),
);

// ─── Upload Complete ───

router.post(
  '/upload/:sessionId/complete',
  pathGuard,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const result = await uploadService.completeUpload(
      sessionId,
      req.user!.userId,
      req.user!.role,
    );

    res.json({ success: true, data: result });
  }),
);

// ─── Upload Abort ───

router.delete(
  '/upload/:sessionId/abort',
  pathGuard,
  asyncHandler(async (req, res) => {
    await uploadService.abortUpload(req.params.sessionId, req.user!.userId);
    res.json({ success: true });
  }),
);

// ─── List Files ───

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));

    const result = await fileService.listUserFiles(req.user!.userId, page, pageSize);

    res.json({
      success: true,
      data: result.files,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

// ─── Download File (Streamed) ───

router.get(
  '/:fileId/download',
  pathGuard,
  asyncHandler(async (req, res) => {
    const info = await fileService.getDownloadInfo(
      req.params.fileId,
      req.user!.userId,
      req.user!.role,
    );

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(info.originalName)}"`);
    res.setHeader('Content-Type', info.mimeType);
    res.setHeader('Content-Length', info.sizeBytes);

    const readStream = fileService.createFileReadStream(info.filePath);

    // Destroy stream on client disconnect
    req.on('close', () => {
      readStream.destroy();
    });

    await pipeline(readStream, res);
  }),
);

// ─── Delete File ───

router.delete(
  '/:fileId',
  pathGuard,
  asyncHandler(async (req, res) => {
    await fileService.deleteFile(
      req.params.fileId,
      req.user!.userId,
      req.user!.role,
    );

    res.json({ success: true });
  }),
);

// ─── Share Link: Enable ───

router.post(
  '/:fileId/share',
  pathGuard,
  asyncHandler(async (req, res) => {
    const hash = await fileService.enableSharing(
      req.params.fileId,
      req.user!.userId,
    );

    res.json({ success: true, data: { shareHash: hash } });
  }),
);

// ─── Share Link: Disable ───

router.delete(
  '/:fileId/share',
  pathGuard,
  asyncHandler(async (req, res) => {
    await fileService.disableSharing(
      req.params.fileId,
      req.user!.userId,
    );

    res.json({ success: true });
  }),
);

export default router;
