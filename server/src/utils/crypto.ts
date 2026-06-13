import crypto from 'crypto';
import { SHARE_HASH_LENGTH } from '../config/constants';

/**
 * Generates a cryptographically secure, URL-safe share hash.
 * Uses base64url encoding for maximum URL compatibility.
 *
 * 6 random bytes → base64url → slice to 8 chars
 * Collision space: ~281 trillion possibilities.
 */
export function generateShareHash(): string {
  return crypto
    .randomBytes(6)
    .toString('base64url')
    .slice(0, SHARE_HASH_LENGTH);
}
