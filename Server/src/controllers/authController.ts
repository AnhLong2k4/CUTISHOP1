import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../config/env.js';
import { toPublicUser } from '../models/User.js';
import * as authService from '../services/authService.js';
import type { Mailer } from '../services/mailer.js';

const REFRESH_COOKIE = 'cutishop1_refresh';

function refreshCookieOptions() {
  const env = loadEnv();
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000,
  };
}

function sendSession(
  res: Response,
  session: authService.IssuedSession,
  status = 200,
) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
  res.status(status).json({
    success: true,
    data: { user: session.user, accessToken: session.accessToken },
  });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await authService.registerUser(
      req.validatedBody as { name: string; email: string; password: string },
    );
    sendSession(res, session, 201);
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await authService.loginUser(
      req.validatedBody as { email: string; password: string },
    );
    sendSession(res, session);
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'SESSION_INVALID', message: 'Phiên đăng nhập không hợp lệ' },
      });
      return;
    }
    const session = await authService.refreshSession(token);
    sendSession(res, session);
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await authService.logoutSession(token);
    const { maxAge: _maxAge, ...clearOptions } = refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    res.json({ success: true, data: { message: 'Đã đăng xuất' } });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: toPublicUser(req.user!) });
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.validatedBody as { email: string };
    const mailer = req.app.get('mailer') as Mailer;
    const result = await authService.requestPasswordReset(email, mailer);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.resetPassword(
      req.validatedBody as { token: string; password: string },
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
