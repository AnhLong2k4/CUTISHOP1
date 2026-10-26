import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

function handler(_req: Request, res: Response) {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
    },
  });
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  legacyHeaders: false,
  handler,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  legacyHeaders: false,
  handler,
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  legacyHeaders: false,
  handler,
});
