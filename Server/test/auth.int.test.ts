import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import type { Mailer } from '../src/services/mailer.js';
import { hashPassword } from '../src/utils/password.js';
import { clearTestDb, closeTestDb, connectTestDb } from './mongo.js';

class CapturingMailer implements Mailer {
  messages: Array<{ email: string; resetUrl: string }> = [];
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    this.messages.push({ email, resetUrl });
  }
}

const mailer = new CapturingMailer();
const app = createApp({ mailer });
const CUSTOM = { 'X-Requested-With': 'XMLHttpRequest' };

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await clearTestDb();
  mailer.messages = [];
});

function refreshCookieOf(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const found = cookies?.find((c) => c.startsWith('cutishop1_refresh='));
  if (!found) throw new Error('refresh cookie missing');
  return found.split(';')[0];
}

async function register(email = 'khach@test.local', password = 'password-123') {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Khách Test', email, password });
}

describe('auth lifecycle', () => {
  it('registers with 201, public user shape, httpOnly refresh cookie', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('khach@test.local');
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('HttpOnly');
  });

  it('rejects duplicate email with 409 EMAIL_ALREADY_EXISTS (not 500)', async () => {
    await register();
    const res = await register();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects short password with 400 VALIDATION_ERROR', async () => {
    const res = await register('short@test.local', 'abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('login: wrong password and unknown email both give generic 401', async () => {
    await register();
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khach@test.local', password: 'sai-mat-khau' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khong-co@test.local', password: 'password-123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khach@test.local', password: 'password-123' });
    expect(ok.status).toBe(200);
  });

  it('me requires a valid, unexpired access token', async () => {
    const reg = await register();
    const token = reg.body.data.accessToken as string;
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('khach@test.local');

    const anon = await request(app).get('/api/v1/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('TOKEN_MISSING');

    const expired = jwt.sign(
      { sub: reg.body.data.user.id, role: 'user', type: 'access' },
      loadEnv().JWT_ACCESS_SECRET,
      { expiresIn: -10 },
    );
    const expiredRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('refresh rotates, detects reuse of the old token and revokes all sessions', async () => {
    await register();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khach@test.local', password: 'password-123' });
    expect(loginRes.status).toBe(200);
    const cookie1 = refreshCookieOf(loginRes);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CUSTOM)
      .set('Cookie', cookie1);
    expect(refreshed.status).toBe(200);
    const cookie2 = refreshCookieOf(refreshed);
    expect(cookie2).not.toBe(cookie1);

    // Reusing the rotated-out cookie is treated as token theft.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CUSTOM)
      .set('Cookie', cookie1);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('SESSION_REVOKED');

    // After reuse detection, even the newest session is revoked.
    const after = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CUSTOM)
      .set('Cookie', cookie2);
    expect(after.status).toBe(401);
  });

  it('refresh without the custom header is refused (CSRF guard)', async () => {
    await register();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khach@test.local', password: 'password-123' });
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookieOf(loginRes));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('logout revokes the session; later refresh fails', async () => {
    await register();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khach@test.local', password: 'password-123' });
    const cookie = refreshCookieOf(loginRes);
    const token = loginRes.body.data.accessToken as string;
    const out = await request(app)
      .post('/api/v1/auth/logout')
      .set(CUSTOM)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie);
    expect(out.status).toBe(200);
    const after = await request(app)
      .post('/api/v1/auth/refresh')
      .set(CUSTOM)
      .set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});

describe('password reset', () => {
  it('forgot-password never reveals whether the email exists', async () => {
    await register();
    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'khach@test.local' });
    expect(known.status).toBe(200);
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'khong-co@test.local' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.message).toBe(known.body.data.message);
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0].email).toBe('khach@test.local');
  });

  it('reset works once, then the token is dead; sessions are revoked', async () => {
    await register();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'khach@test.local' });
    const url = mailer.messages[0].resetUrl;
    const token = url.split('/password/reset/')[1];
    expect(token).toBeTruthy();

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'new-password-456' });
    expect(reset.status).toBe(200);

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'khach@test.local', password: 'new-password-456' });
    expect(loginNew.status).toBe(200);

    const reuse = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'another-pass-789' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('expired reset token is rejected', async () => {
    await register();
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'khach@test.local' });
    const token = mailer.messages[0].resetUrl.split('/password/reset/')[1];
    await User.updateOne(
      { email: 'khach@test.local' },
      { $set: { passwordResetExpires: new Date(Date.now() - 1000) } },
    );
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'new-password-456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');
  });
});

describe('admin authorization', () => {
  async function createAdminToken(): Promise<string> {
    const env = loadEnv();
    await User.create({
      name: 'Quản Trị',
      email: 'admin@test.local',
      passwordHash: await hashPassword('admin-pass-123', env.BCRYPT_COST),
      role: 'admin',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.local', password: 'admin-pass-123' });
    return res.body.data.accessToken as string;
  }

  it('anonymous gets 401, normal user gets 403, admin succeeds', async () => {
    const anon = await request(app).post('/api/v1/admin/categories').send({ name: 'Áo' });
    expect(anon.status).toBe(401);

    const reg = await register('thuong@test.local');
    const userToken = reg.body.data.accessToken as string;
    const asUser = await request(app)
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Áo' });
    expect(asUser.status).toBe(403);
    expect(asUser.body.error.code).toBe('FORBIDDEN');

    const adminToken = await createAdminToken();
    const asAdmin = await request(app)
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Áo' });
    expect(asAdmin.status).toBe(201);
    expect(asAdmin.body.data.slug).toBe('ao');
  });

  it('there is no endpoint to self-promote to admin', async () => {
    const reg = await register('leo@test.local');
    const token = reg.body.data.accessToken as string;
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(404);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.data.role).toBe('user');
  });
});
