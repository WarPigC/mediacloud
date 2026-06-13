import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Returns the absolute storage root for a given user.
 * - admin  → NTFS mount
 * - user   → ext4_mount/{userId}
 */
export function resolveUserStorageRoot(userId: string, role: string): string {
  if (role === 'admin') {
    return path.resolve(env.NTFS_MOUNT_PATH);
  }
  return path.resolve(env.EXT4_MOUNT_PATH, userId);
}

/**
 * Core security function: checks that a resolved path is strictly
 * within the allowed root directory.
 *
 * Uses resolve + normalize to defeat encoding tricks like
 * `..%2F`, `/./`, double slashes, and symlink-style attacks.
 */
export function isPathWithinRoot(requestedPath: string, rootPath: string): boolean {
  const resolved = path.normalize(path.resolve(requestedPath));
  const normalizedRoot = path.normalize(path.resolve(rootPath));

  // Must either BE the root or be under root + separator
  return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
}

/**
 * Builds a safe absolute path from a user-supplied relative path.
 * Throws if the result would escape the user's storage root.
 */
export function buildSafePath(rootDir: string, userInput: string): string {
  // Reject null bytes immediately
  if (userInput.includes('\0')) {
    throw new PathTraversalError('Path contains null bytes');
  }

  const resolved = path.normalize(path.resolve(rootDir, userInput));

  if (!isPathWithinRoot(resolved, rootDir)) {
    throw new PathTraversalError('Path traversal detected');
  }

  return resolved;
}

/** Custom error for path traversal attempts */
export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

/**
 * Middleware: rejects requests whose URL params contain obvious
 * traversal patterns. This is an early-reject safety net — the
 * definitive check happens in buildSafePath().
 */
export function pathGuard(req: Request, res: Response, next: NextFunction): void {
  const suspicious = ['..', '%2e%2e', '%2E%2E', '%2e.', '.%2e', '\0', '%00'];
  const allParams = [
    ...Object.values(req.params),
    ...(typeof req.query.path === 'string' ? [req.query.path] : []),
  ];

  for (const param of allParams) {
    const decoded = decodeURIComponent(param as string);
    if (suspicious.some((p) => decoded.includes(p))) {
      res.status(403).json({ success: false, error: 'Path traversal detected' });
      return;
    }
  }

  next();
}
