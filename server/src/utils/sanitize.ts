import path from 'path';
import { MAX_FILENAME_LENGTH } from '../config/constants';

/**
 * Strips path traversal components, dangerous characters, and null bytes
 * from a user-supplied filename. Returns a safe, filesystem-friendly name.
 */
export function sanitizeFilename(raw: string): string {
  // 1. Reject null bytes
  if (raw.includes('\0')) {
    throw new Error('Filename contains null bytes');
  }

  // 2. Strip any directory components — take only the basename
  let name = path.basename(raw);

  // 3. Remove traversal patterns that survived basename extraction
  name = name.replace(/\.\./g, '');

  // 4. Replace anything that isn't alphanumeric, dot, dash, or underscore
  name = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 5. Collapse consecutive underscores
  name = name.replace(/_{2,}/g, '_');

  // 6. Remove leading dots (prevents hidden files on Linux)
  name = name.replace(/^\.+/, '');

  // 7. Truncate to max length, preserving extension
  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(name);
    const stem = name.slice(0, MAX_FILENAME_LENGTH - ext.length);
    name = stem + ext;
  }

  // 8. Fallback if the name was entirely stripped
  if (!name || name === '') {
    name = 'unnamed_file';
  }

  return name;
}

/**
 * Generates a collision-safe filename by appending _1, _2, etc.
 * `existsCheck` should return true if a file already exists at the given path.
 */
export async function deduplicateFilename(
  dir: string,
  filename: string,
  existsCheck: (fullPath: string) => Promise<boolean>,
): Promise<string> {
  let candidate = filename;
  let counter = 1;
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);

  while (await existsCheck(path.join(dir, candidate))) {
    candidate = `${stem}_${counter}${ext}`;
    counter++;
    if (counter > 1000) {
      throw new Error('Too many filename collisions');
    }
  }

  return candidate;
}
