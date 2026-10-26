import { Types } from 'mongoose';
import { loadEnv } from '../config/env.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { User, toPublicUser, type UserDoc } from '../models/User.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import {
  generateOneTimeToken,
  sha256Hex,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';
import type { Mailer } from './mailer.js';

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: ReturnType<typeof toPublicUser>;
}

async function issueSession(user: UserDoc): Promise<IssuedSession> {
  const env = loadEnv();
  const sessionId = new Types.ObjectId();
  const refreshToken = signRefreshToken(
    { sub: user._id.toString(), sid: sessionId.toString(), type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    env.REFRESH_TOKEN_TTL_DAYS,
  );
  await RefreshSession.create({
    _id: sessionId,
    user: user._id,
    tokenHash: sha256Hex(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000),
  });
  const accessToken = signAccessToken(
    { sub: user._id.toString(), role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL_MINUTES,
  );
  return { accessToken, refreshToken, user: toPublicUser(user) };
}

async function revokeAllSessions(userId: Types.ObjectId): Promise<void> {
  await RefreshSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<IssuedSession> {
  const env = loadEnv();
  const email = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    throw conflict('Email đã được đăng ký', 'EMAIL_ALREADY_EXISTS');
  }
  const passwordHash = await hashPassword(input.password, env.BCRYPT_COST);
  const user = await User.create({
    name: input.name.trim(),
    email,
    passwordHash,
    role: 'user',
  });
  return issueSession(user);
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<IssuedSession> {
  const email = input.email.trim().toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same generic error for unknown email and wrong password.
  if (!user) throw unauthorized('Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
  const matches = await comparePassword(input.password, user.passwordHash);
  if (!matches) {
    throw unauthorized('Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
  }
  return issueSession(user);
}

export async function refreshSession(refreshToken: string): Promise<IssuedSession> {
  const env = loadEnv();
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw unauthorized('Phiên đăng nhập không hợp lệ', 'SESSION_INVALID');
  }
  const session = await RefreshSession.findById(payload.sid);
  if (!session || session.user.toString() !== payload.sub) {
    throw unauthorized('Phiên đăng nhập không hợp lệ', 'SESSION_INVALID');
  }
  const presentedHash = sha256Hex(refreshToken);
  if (session.revokedAt || session.tokenHash !== presentedHash) {
    // A revoked or superseded refresh token was presented again:
    // treat as token reuse and revoke every session of the user.
    await revokeAllSessions(session.user);
    throw unauthorized(
      'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
      'SESSION_REVOKED',
    );
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Phiên đăng nhập đã hết hạn', 'SESSION_EXPIRED');
  }
  const user = await User.findById(session.user);
  if (!user) throw unauthorized('Tài khoản không còn tồn tại', 'SESSION_INVALID');

  const issued = await issueSession(user);
  session.revokedAt = new Date();
  session.replacedByTokenHash = sha256Hex(issued.refreshToken);
  await session.save();
  return issued;
}

export async function logoutSession(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken, loadEnv().JWT_REFRESH_SECRET);
    await RefreshSession.updateOne(
      { _id: payload.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  } catch {
    // Logout is idempotent: an invalid cookie still ends as logged out.
  }
}

const GENERIC_FORGOT_MESSAGE =
  'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.';

export async function requestPasswordReset(
  emailInput: string,
  mailer: Mailer,
): Promise<{ message: string }> {
  const env = loadEnv();
  const email = emailInput.trim().toLowerCase();
  const user = await User.findOne({ email });
  if (user) {
    const { token, tokenHash } = generateOneTimeToken();
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();
    const resetUrl = `${env.APP_URL}/password/reset/${token}`;
    await mailer.sendPasswordReset(user.email, resetUrl);
  }
  // The response never reveals whether the email exists.
  return { message: GENERIC_FORGOT_MESSAGE };
}

export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  const env = loadEnv();
  const tokenHash = sha256Hex(input.token);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordHash');
  if (!user) {
    throw badRequest(
      'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      'RESET_TOKEN_INVALID',
    );
  }
  user.passwordHash = await hashPassword(input.password, env.BCRYPT_COST);
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  await user.save();
  // A password change ends every existing session of the account.
  await revokeAllSessions(user._id);
  return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
}
