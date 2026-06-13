import { Request, Response, NextFunction } from 'express';
import { PathTraversalError } from './pathGuard';

/**
 * Typed operational error with an HTTP status code.
 * Throw this from any route/service to return a clean JSON error.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Wraps an async Express handler so that rejected promises are
 * automatically forwarded to the global error handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Global Express error handler — must be registered LAST in the
 * middleware chain (4-argument signature).
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Path traversal errors
  if (err instanceof PathTraversalError) {
    res.status(403).json({
      success: false,
      error: 'Access denied',
    });
    return;
  }

  // Unexpected errors
  console.error('[UNHANDLED ERROR]', err);

  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
}
