/**
 * Public Routes — unauthenticated access for share link downloads.
 * GET /api/public/d/:hash         → file metadata (for the landing page)
 * GET /api/public/d/:hash/download → streamed file download
 */

import { Router } from 'express';
import { pipeline } from 'stream/promises';
import { publicDownloadLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import * as fileService from '../services/file.service';

const router = Router();

router.use(publicDownloadLimiter);

/** GET /api/public/d/:hash — metadata for the download landing page */
router.get(
  '/d/:hash',
  asyncHandler(async (req, res) => {
    const metadata = await fileService.getShareMetadata(req.params.hash as string);
    res.json({ success: true, data: metadata });
  }),
);

/** GET /api/public/d/:hash/download — stream the shared file */
router.get(
  '/d/:hash/download',
  asyncHandler(async (req, res) => {
    const info = await fileService.getPublicDownloadInfo(req.params.hash as string);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(info.originalName)}"`,
    );
    res.setHeader('Content-Type', info.mimeType);
    res.setHeader('Content-Length', info.sizeBytes);

    const readStream = fileService.createFileReadStream(info.filePath);

    req.on('close', () => {
      readStream.destroy();
    });

    await pipeline(readStream, res);
  }),
);

export default router;
