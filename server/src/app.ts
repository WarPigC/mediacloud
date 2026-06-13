import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { globalLimiter } from './middleware/rateLimiter';
import { globalErrorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import fileRoutes from './routes/file.routes';
import publicRoutes from './routes/public.routes';
import adminRoutes from './routes/admin.routes';
import { ZodError } from 'zod';

// ─── Prototype Pollution Defense ───
Object.freeze(Object.prototype);

const app = express();

// ─── Security Headers ───
app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  }),
);

// ─── CORS ───
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // Required for cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Chunk-Index'],
  }),
);

// ─── Body Parsing ───
// Small limit for JSON endpoints — uploads use streaming, not body parsing
app.use(express.json({ limit: '1kb' }));
app.use(cookieParser());

// ─── Global Rate Limiter ───
app.use(globalLimiter);

// ─── Health Check ───
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

// ─── API Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

// ─── Zod Validation Error Handler ───
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    next(err);
  },
);

// ─── Global Error Handler (must be last) ───
app.use(globalErrorHandler);

export default app;
