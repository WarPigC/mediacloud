import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { TEMP_DIR_NAME } from '../config/constants';
import { resolveUserStorageRoot, isPathWithinRoot, buildSafePath } from '../middleware/pathGuard';

export { resolveUserStorageRoot, isPathWithinRoot, buildSafePath };

/**
 * Creates the user's isolated storage directory under the ext4 mount.
 * Called during user registration. Also creates the shared _tmp dir.
 */
export async function createUserDirectory(userId: string): Promise<void> {
  const userRoot = resolveUserStorageRoot(userId, 'user');
  await fs.mkdir(userRoot, { recursive: true });
}

/**
 * Ensures the global temp directory for chunk assembly exists.
 */
export async function ensureTempDirectory(): Promise<void> {
  const tmpDir = path.resolve(env.EXT4_MOUNT_PATH, TEMP_DIR_NAME);
  await fs.mkdir(tmpDir, { recursive: true });
}

/**
 * Returns the absolute path to the temp assembly directory.
 */
export function getTempDirectory(): string {
  return path.resolve(env.EXT4_MOUNT_PATH, TEMP_DIR_NAME);
}

/**
 * Checks whether a file exists at the given path.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes a user's entire storage directory.
 * Called when an admin deletes a user account.
 */
export async function removeUserDirectory(userId: string): Promise<void> {
  const userRoot = resolveUserStorageRoot(userId, 'user');
  try {
    await fs.rm(userRoot, { recursive: true, force: true });
  } catch {
    // Directory might not exist — that's fine
  }
}

/**
 * Ensures the storage mount points exist at startup.
 * In development, creates the directories if they don't exist.
 */
export async function ensureStorageMounts(): Promise<void> {
  await fs.mkdir(env.EXT4_MOUNT_PATH, { recursive: true });
  await fs.mkdir(env.NTFS_MOUNT_PATH, { recursive: true });
  await ensureTempDirectory();
  console.log(`✅ Storage mounts verified:`);
  console.log(`   ext4  → ${env.EXT4_MOUNT_PATH}`);
  console.log(`   ntfs  → ${env.NTFS_MOUNT_PATH}`);
}
