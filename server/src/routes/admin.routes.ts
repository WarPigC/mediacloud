/**
 * Admin Routes — user management, NTFS file browsing, system stats.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../config/db';
import { removeUserDirectory } from '../services/storage.service';
import * as authService from '../services/auth.service';
import { createUserDirectory } from '../services/storage.service';
import fs from 'fs/promises';
import { env } from '../config/env';

const router = Router();

// All admin routes require admin role
router.use(authenticate, requireAdmin);

// ─── List All Users ───

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        usedStorageBytes: true,
        storageQuotaBytes: true,
        createdAt: true,
        _count: { select: { files: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: users });
  }),
);

// ─── Create User (Admin-provisioned) ───

const createUserSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
}).strict();

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const profile = await authService.registerUser(body.username, body.email, body.password);
    await createUserDirectory(profile.id);
    res.status(201).json({ success: true, data: profile });
  }),
);

// ─── Delete User ───

router.delete(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    if (user.role === 'admin') {
      throw new AppError('Cannot delete admin user', 403);
    }

    // Delete all user files, sessions, upload sessions, and the user record
    await prisma.$transaction([
      prisma.file.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.uploadSession.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    // Remove storage directory
    await removeUserDirectory(userId);

    res.json({ success: true });
  }),
);

// ─── Adjust Quota ───

const quotaSchema = z.object({
  storageQuotaBytes: z.number().int().min(0),
}).strict();

router.patch(
  '/users/:userId/quota',
  asyncHandler(async (req, res) => {
    const body = quotaSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { storageQuotaBytes: BigInt(body.storageQuotaBytes) },
      select: {
        id: true,
        username: true,
        storageQuotaBytes: true,
        usedStorageBytes: true,
      },
    });

    res.json({ success: true, data: user });
  }),
);

// ─── System Stats ───

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [userCount, fileCount, totalStorageUsed] = await Promise.all([
      prisma.user.count(),
      prisma.file.count(),
      prisma.user.aggregate({ _sum: { usedStorageBytes: true } }),
    ]);

    // Check disk space on ext4 mount
    let diskInfo = { free: 0, total: 0 };
    try {
      const stats = await fs.statfs(env.EXT4_MOUNT_PATH);
      diskInfo = {
        free: Number(stats.bfree * stats.bsize),
        total: Number(stats.blocks * stats.bsize),
      };
    } catch {
      // statfs may not be available
    }

    res.json({
      success: true,
      data: {
        userCount,
        fileCount,
        totalStorageUsed: Number(totalStorageUsed._sum.usedStorageBytes || 0),
        disk: diskInfo,
      },
    });
  }),
);

export default router;
