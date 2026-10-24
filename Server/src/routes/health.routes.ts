import { Router } from 'express';
import { isDBConnected } from '../config/db.js';

const router = Router();

// Minimal health view: no environment, infrastructure or error details.
router.get('/health', (_req, res) => {
  const dbConnected = isDBConnected();
  res.status(dbConnected ? 200 : 503).json({
    success: true,
    data: { status: 'ok', database: dbConnected ? 'connected' : 'disconnected' },
  });
});

export default router;
