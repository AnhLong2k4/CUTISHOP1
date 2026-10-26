import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal request log: method, path, status, duration.
 * Bodies, cookies and authorization headers are never logged.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`,
    );
  });
  next();
}
