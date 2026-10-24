import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../config/env.js';
import { User, type UserDoc } from '../models/User.js';
import { isTokenExpiredError, verifyAccessToken } from '../utils/tokens.js';
import { ApiError, forbidden, unauthorized } from '../utils/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserDoc;
  }
}

/** Authenticate the Bearer access token and load the current user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw unauthorized('Thiếu access token', 'TOKEN_MISSING');
    }
    const token = header.slice('Bearer '.length).trim();
    let payload;
    try {
      payload = verifyAccessToken(token, loadEnv().JWT_ACCESS_SECRET);
    } catch (error) {
      if (isTokenExpiredError(error)) {
        throw unauthorized('Access token đã hết hạn', 'TOKEN_EXPIRED');
      }
      throw unauthorized('Access token không hợp lệ', 'TOKEN_INVALID');
    }
    const user = await User.findById(payload.sub);
    if (!user) throw unauthorized('Tài khoản không còn tồn tại', 'TOKEN_INVALID');
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden());
  return next();
}

/**
 * Cookie-authenticated endpoints (refresh/logout) must carry the
 * custom header set by our own client. Cross-site forms cannot set
 * it, which blocks classic CSRF against these endpoints.
 */
export function requireCustomHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return next(
      new ApiError(403, 'CSRF_CHECK_FAILED', 'Yêu cầu thiếu header bắt buộc'),
    );
  }
  return next();
}
