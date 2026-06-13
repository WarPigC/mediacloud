/** Standard API response envelope */
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** POST /api/auth/login */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /api/auth/register */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}
