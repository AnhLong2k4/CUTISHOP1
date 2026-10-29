import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { User } from '../src/models/User.js';
import type { Mailer } from '../src/services/mailer.js';
import { sha256Hex } from '../src/utils/tokens.js';
import {
  clearTestReplicaDb,
  closeTestReplicaDb,
  connectTestReplicaDb,
} from './mongoReplica.js';

class CapturingMailer implements Mailer {
  messages: Array<{ email: string; resetUrl: string }> = [];
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    this.messages.push({ email, resetUrl });
  }
}

const app = createApp({ mailer: new CapturingMailer() });
const CUSTOM = { 'X-Requested-With': 'XMLHttpRequest' };

beforeAll(connectTestReplicaDb, 180000);
afterAll(closeTestReplicaDb);
beforeEach(clearTestReplicaDb);

async function register(email = 'khach@test.local', password = 'password-123') {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Khách Test', email, password });
}

async function loginMobile(
  email = 'khach@test.local',
  password = 'password-123',
) {
  return request(app)
    .post('/api/v1/auth/login-mobile')
    .send({ email, password });
}

function setCookieOf(response: request.Response): string[] | undefined {
  return response.headers['set-cookie'] as unknown as string[] | undefined;
}

describe('mobile auth (option C, body refresh token)', () => {
  it('login-mobile returns access + refresh in the body and sets NO cookie', async () => {
    await register();
    const res = await loginMobile();
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('khach@test.local');
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.refreshToken).toBeTypeOf('string');
    expect(setCookieOf(res)).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    // Register already created one session; a single mobile login adds
    // exactly one more (no duplicate session for that one login), and
    // its stored hash matches the refresh token returned in the body.
    const user = await User.findOne({ email: 'khach@test.local' });
    const sessions = await RefreshSession.find({ user: user!._id });
    expect(sessions).toHaveLength(2);
    const loginSession = sessions.find(
      (s) => s.tokenHash === sha256Hex(res.body.data.refreshToken as string),
    );
    expect(loginSession).toBeDefined();
  });

  it('login-mobile shares the login rate limit behaviour (wrong password is generic 401)', async () => {
    await register();
    const wrong = await loginMobile('khach@test.local', 'sai-mat-khau');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refresh-mobile rotates and reusing the old token revokes all sessions', async () => {
    await register();
    const login = await loginMobile();
    const oldRefresh = login.body.data.refreshToken as string;

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: oldRefresh });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTypeOf('string');
    expect(refreshed.body.data.refreshToken).toBeTypeOf('string');
    expect(refreshed.body.data.refreshToken).not.toBe(oldRefresh);
    expect(setCookieOf(refreshed)).toBeUndefined();
    const newRefresh = refreshed.body.data.refreshToken as string;

    // Reusing the rotated-out token is treated as token theft.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('SESSION_REVOKED');

    // After reuse detection, even the newest session is revoked.
    const after = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: newRefresh });
    expect(after.status).toBe(401);
  });

  it('refresh-mobile with an expired session returns SESSION_EXPIRED', async () => {
    await register();
    const login = await loginMobile();
    const refresh = login.body.data.refreshToken as string;
    // Expire the stored session while its JWT is still valid, so the
    // DB expiry branch (not the JWT expiry branch) is exercised.
    await RefreshSession.updateOne(
      { tokenHash: sha256Hex(refresh) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const res = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: refresh });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('refresh-mobile without the custom header is refused (CSRF guard)', async () => {
    await register();
    const login = await loginMobile();
    const res = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .send({ refreshToken: login.body.data.refreshToken });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('refresh-mobile without a token is a 400 validation error, not 500', async () => {
    await register();
    const res = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('an access token cannot be used as a refresh token, and vice versa', async () => {
    await register();
    const login = await loginMobile();
    const access = login.body.data.accessToken as string;
    const refresh = login.body.data.refreshToken as string;

    const asRefresh = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: access });
    expect(asRefresh.status).toBe(401);
    expect(asRefresh.body.error.code).toBe('SESSION_INVALID');

    const asAccess = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refresh}`);
    expect(asAccess.status).toBe(401);
    expect(asAccess.body.error.code).toBe('TOKEN_INVALID');
  });

  it('logout-mobile revokes only that session; another session still refreshes', async () => {
    await register();
    const first = await loginMobile();
    const second = await loginMobile();
    const firstRefresh = first.body.data.refreshToken as string;
    const secondRefresh = second.body.data.refreshToken as string;

    const out = await request(app)
      .post('/api/v1/auth/logout-mobile')
      .set(CUSTOM)
      .send({ refreshToken: firstRefresh });
    expect(out.status).toBe(200);
    expect(setCookieOf(out)).toBeUndefined();

    // Logout itself is per-session: check the DB, do NOT present the
    // logged-out token again here (see the next test: presenting a
    // revoked token triggers the shared reuse rule and revokes all).
    const firstSession = await RefreshSession.findOne({
      tokenHash: sha256Hex(firstRefresh),
    });
    const secondSession = await RefreshSession.findOne({
      tokenHash: sha256Hex(secondRefresh),
    });
    expect(firstSession?.revokedAt).not.toBeNull();
    expect(secondSession?.revokedAt).toBeNull();

    const secondAfter = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: secondRefresh });
    expect(secondAfter.status).toBe(200);
  });

  it('presenting a logged-out token triggers reuse detection and revokes all sessions', async () => {
    await register();
    const first = await loginMobile();
    const second = await loginMobile();
    const firstRefresh = first.body.data.refreshToken as string;
    const secondRefresh = second.body.data.refreshToken as string;

    await request(app)
      .post('/api/v1/auth/logout-mobile')
      .set(CUSTOM)
      .send({ refreshToken: firstRefresh });

    // The mobile client must never do this (it clears both tokens on
    // logout); if it did, the shared service treats a revoked token
    // presentation as reuse and revokes every session of the user.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('SESSION_REVOKED');

    const secondAfter = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: secondRefresh });
    expect(secondAfter.status).toBe(401);
  });

  it('logout-mobile without the custom header is refused, and is idempotent without a token', async () => {
    await register();
    const noHeader = await request(app)
      .post('/api/v1/auth/logout-mobile')
      .send({ refreshToken: 'anything' });
    expect(noHeader.status).toBe(403);
    const idempotent = await request(app)
      .post('/api/v1/auth/logout-mobile')
      .set(CUSTOM)
      .send({});
    expect(idempotent.status).toBe(200);
  });

  it('a forged refresh JWT with the right type but unknown sid is SESSION_INVALID', async () => {
    await register();
    const forged = jwt.sign(
      {
        sub: '000000000000000000000000',
        sid: '000000000000000000000000',
        type: 'refresh',
      },
      loadEnv().JWT_REFRESH_SECRET,
      { expiresIn: '7d' },
    );
    const res = await request(app)
      .post('/api/v1/auth/refresh-mobile')
      .set(CUSTOM)
      .send({ refreshToken: forged });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_INVALID');
  });
});
