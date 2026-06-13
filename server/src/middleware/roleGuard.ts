import { Request, Response, NextFunction } from 'express';

/**
 * Factory: creates middleware that restricts access to the given roles.
 * Must be used AFTER the `authenticate` middleware.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/** Shorthand: admin only */
export const requireAdmin = requireRole('admin');

/** Shorthand: any authenticated user (including admin) */
export const requireUser = requireRole('user', 'admin');
