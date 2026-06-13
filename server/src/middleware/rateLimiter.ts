import rateLimit from 'express-rate-limit';

const message = (msg: string) => ({ success: false, error: msg });

/** Global fallback: 100 req/min per IP */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many requests, please try again later'),
});

/** Login: 5 req/min per IP */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many login attempts, please try again later'),
});

/** Registration: 3 req/hour per IP */
export const registerLimiter = rateLimit({
  windowMs: 3_600_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many registration attempts, please try again later'),
});

/** Upload endpoints: 30 req/min per user */
export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many upload requests, please try again later'),
});

/** Public download pages: 60 req/min per IP */
export const publicDownloadLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: message('Too many download requests, please try again later'),
});
