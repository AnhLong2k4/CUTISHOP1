import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { loadEnv } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import adminRoutes from './routes/admin.routes.js';
import adminCouponRoutes from './routes/adminCoupon.routes.js';
import adminOrderRoutes from './routes/adminOrder.routes.js';
import authRoutes from './routes/auth.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import checkoutRoutes from './routes/checkout.routes.js';
import healthRoutes from './routes/health.routes.js';
import orderRoutes from './routes/order.routes.js';
import { createMailer, type Mailer } from './services/mailer.js';

export function createApp(options: { mailer?: Mailer } = {}) {
  const env = loadEnv();
  const app = express();

  app.set('mailer', options.mailer ?? createMailer());
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Non-browser clients send no Origin; browsers must be allowlisted.
        if (!origin || env.corsOrigins.includes(origin)) callback(null, true);
        else callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.use('/api/v1', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1', catalogRoutes);
  app.use('/api/v1', checkoutRoutes);
  app.use('/api/v1', orderRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/admin', adminOrderRoutes);
  app.use('/api/v1/admin', adminCouponRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
