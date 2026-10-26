import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Generate a random one-time token; only its hash may be stored. */
export function generateOneTimeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: sha256Hex(token) };
}

export interface AccessTokenPayload {
  sub: string;
  role: 'user' | 'admin';
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlMinutes: number,
): string {
  return jwt.sign(payload, secret, { expiresIn: `${ttlMinutes}m` });
}

export function signRefreshToken(
  payload: RefreshTokenPayload,
  secret: string,
  ttlDays: number,
): string {
  return jwt.sign(payload, secret, { expiresIn: `${ttlDays}d` });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret) as AccessTokenPayload;
  if (decoded.type !== 'access') throw new Error('Wrong token type');
  return decoded;
}

export function verifyRefreshToken(token: string, secret: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, secret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') throw new Error('Wrong token type');
  return decoded;
}

export function isTokenExpiredError(error: unknown): boolean {
  return error instanceof jwt.TokenExpiredError;
}
