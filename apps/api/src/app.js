// Application Express (sans écoute réseau).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { loadUser } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { apiNotFound, errorHandler, maintenanceGuard } from './middleware/errors.js';
import { sessionMiddleware } from './middleware/session.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { publicRouter } from './routes/public.js';
import { studioRouter } from './routes/studio.js';
import { ensureStorageDirs } from './services/images.js';

export function createApp() {
  ensureStorageDirs();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());

  if (!config.isTest) {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
      });
      next();
    });
  }

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(sessionMiddleware());
  api.use(loadUser);
  api.use(csrfProtection);
  api.use(maintenanceGuard);
  api.get('/health', (req, res) => res.json({ ok: true, https: req.secure }));
  api.use('/auth', authRouter);
  api.use('/me/exhibitions', studioRouter);
  api.use('/me', meRouter);
  api.use('/admin', adminRouter);
  api.use(publicRouter);
  api.use(apiNotFound);
  app.use('/api', api);

  if (config.webDistDir && existsSync(config.webDistDir)) {
    app.use(express.static(config.webDistDir, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(config.webDistDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
