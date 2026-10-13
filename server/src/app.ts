import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import type { AppConfig } from './config.js';
import { ApiError, errorHandler } from './errors.js';
import { createRoutes } from './routes.js';

export function createApp(pool: Pool, config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use('/api', (_request, response, next) => {
    // Tokens and role-specific data must not be stored by browsers or intermediary caches.
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new ApiError(403, 'ORIGIN_FORBIDDEN', 'This origin is not allowed.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (request) => request.path === '/health',
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again later.' } },
  }));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use('/api', createRoutes(pool, config.jwtSecret));
  app.use((_request, _response, next) => next(new ApiError(404, 'NOT_FOUND', 'The endpoint does not exist.')));
  app.use(errorHandler);
  return app;
}
