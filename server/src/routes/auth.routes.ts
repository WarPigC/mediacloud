import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { authLimiter, registerLimiter } from '../middleware/rateLimiter';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../config/constants';
import { env } from '../config/env';
import * as authService from '../services/auth.service';
import { createUserDirectory } from '../services/storage.service';

const router = Router();

// ─── Validation Schemas ───

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email(),
  password: z.string().min(8).max(128),
}).strict();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
}).strict();

// ─── Cookie Helpers ───

const isProduction = () => env.NODE_ENV === 'production';

function setAuthCookies(
  res: import('express').Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/api/auth', // Only sent to auth endpoints
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearAuthCookies(res: import('express').Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
}

// ─── Routes ───

/** POST /api/auth/register */
router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const profile = await authService.registerUser(
      body.username,
      body.email,
      body.password,
    );

    // Create isolated storage directory for the new user
    await createUserDirectory(profile.id);

    res.status(201).json({ success: true, data: profile });
  }),
);

/** POST /api/auth/login */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const { profile, accessToken, refreshToken } = await authService.loginUser(
      body.username,
      body.password,
      req.headers['user-agent'],
    );

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ success: true, data: profile });
  }),
);

/** POST /api/auth/logout */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await authService.logoutUser(refreshToken);
    }

    clearAuthCookies(res);

    res.json({ success: true });
  }),
);

/** POST /api/auth/refresh */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const oldRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!oldRefreshToken) {
      throw new AppError('No refresh token provided', 401);
    }

    const { accessToken, refreshToken } = await authService.refreshTokens(
      oldRefreshToken,
      req.headers['user-agent'],
    );

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ success: true });
  }),
);

/** GET /api/auth/me */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const profile = await authService.getUserProfile(req.user!.userId);
    res.json({ success: true, data: profile });
  }),
);

export default router;
