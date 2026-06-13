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
 * Verifies (production) or creates (development) storage directories.
 * In production/Docker, mount points must already exist.
 * In development, creates local fallback directories.
 */
export async function ensureStorageMounts(): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';

  for (const mount of [env.EXT4_MOUNT_PATH, env.NTFS_MOUNT_PATH]) {
    try {
      await fs.access(mount);
    } catch {
      if (isDev) {
        await fs.mkdir(mount, { recursive: true });
      } else {
        throw new Error(
          `Mount not found at ${mount}. ` +
          `Ensure the drive is mounted or the Docker volume is mapped.`,
        );
      }
    }
  }

  // Create the _tmp directory for chunk assembly (under ext4)
  await ensureTempDirectory();

  console.log(`✅ Storage mounts verified:`);
  console.log(`   ext4  → ${env.EXT4_MOUNT_PATH}`);
  console.log(`   ntfs  → ${env.NTFS_MOUNT_PATH}`);
}
