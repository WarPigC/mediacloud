export type UserRole = 'admin' | 'user';

/** Public user profile returned by GET /api/auth/me */
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  usedStorageBytes: number;
  storageQuotaBytes: number;
  createdAt: string;
}
