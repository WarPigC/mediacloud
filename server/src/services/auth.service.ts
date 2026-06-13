import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import type { JwtPayload } from '../middleware/auth';
import type { UserProfile } from '@mediacloud/shared';

// ─── Token Helpers ───

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRY as any,
  });
}

function computeRefreshExpiry(): Date {
  const match = env.REFRESH_EXPIRY.match(/^(\d+)([dhms])$/);
  if (!match) throw new Error('Invalid REFRESH_EXPIRY format');

  const [, amount, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return new Date(Date.now() + parseInt(amount) * multipliers[unit]);
}

// ─── Public API ───

export async function registerUser(
  username: string,
  email: string,
  password: string,
): Promise<UserProfile> {
  // Check for existing user
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    throw new AppError(
      existing.username === username
        ? 'Username already taken'
        : 'Email already registered',
      409,
    );
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  });

  return toUserProfile(user);
}

export async function loginUser(
  username: string,
  password: string,
  userAgent?: string,
): Promise<{ profile: UserProfile; accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = randomUUID();

  // Store refresh token in DB
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      userAgent: userAgent ?? null,
      expiresAt: computeRefreshExpiry(),
    },
  });

  return { profile: toUserProfile(user), accessToken, refreshToken };
}

export async function refreshTokens(
  oldRefreshToken: string,
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Find and validate the session
  const session = await prisma.session.findUnique({
    where: { refreshToken: oldRefreshToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    // If session exists but expired, clean it up
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Token rotation: delete old, create new
  const newRefreshToken = randomUUID();

  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.session.create({
      data: {
        userId: session.userId,
        refreshToken: newRefreshToken,
        userAgent: userAgent ?? null,
        expiresAt: computeRefreshExpiry(),
      },
    }),
  ]);

  const accessToken = signAccessToken({
    userId: session.user.id,
    role: session.user.role,
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(refreshToken: string): Promise<void> {
  // Delete the session — ignore if it doesn't exist
  await prisma.session.deleteMany({ where: { refreshToken } });
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return toUserProfile(user);
}

// ─── Helpers ───

function toUserProfile(user: {
  id: string;
  username: string;
  email: string;
  role: string;
  usedStorageBytes: bigint;
  storageQuotaBytes: bigint;
  createdAt: Date;
}): UserProfile {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role as UserProfile['role'],
    usedStorageBytes: Number(user.usedStorageBytes),
    storageQuotaBytes: Number(user.storageQuotaBytes),
    createdAt: user.createdAt.toISOString(),
  };
}
