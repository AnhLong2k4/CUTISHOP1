import { describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  ApiError,
  createMemoryTokenStore,
  type AsyncRefreshTokenStore,
} from '@cutishop1/api-client';

/**
 * ApiClient in mobile mode, with fetch fully mocked. No network, no
 * React Native, no SecureStore: refresh tokens live in an in-memory
 * async store with the same contract as the SecureStore adapter.
 *
 * Server contract simulated here (verified for real in
 * Server/test/authMobile.int.test.ts):
 * - POST /auth/login-mobile -> { user, accessToken, refreshToken }
 * - GET /auth/me with a valid access token -> user
 * - GET /auth/me with 'expired-access' -> 401 TOKEN_EXPIRED
 * - POST /auth/refresh-mobile with 'valid-refresh' -> rotated pair
 * - POST /auth/refresh-mobile with anything else -> 401 SESSION_INVALID
 * - POST /auth/logout-mobile -> 200
 */

function memoryRefreshStore(): AsyncRefreshTokenStore & {
  value: string | null;
} {
  let value: string | null = null;
  return {
    get value() {
      return value;
    },
    get: async () => value,
    set: async (token) => {
      value = token;
    },
    delete: async () => {
      value = null;
    },
  };
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function envelope(data: unknown) {
  return { success: true, data };
}

function errorEnvelope(code: string, message: string) {
  return { success: false, error: { code, message } };
}

function makeClient(
  handler: Handler,
  opts: { persistedAccess?: string | null; persistedRefresh?: string | null } = {},
) {
  const tokenStore = createMemoryTokenStore();
  if (opts.persistedAccess) tokenStore.set(opts.persistedAccess);
  const refreshStore = memoryRefreshStore();
  const accessChanges: Array<string | null> = [];
  let refreshCalls = 0;
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/auth/refresh-mobile')) refreshCalls += 1;
    return handler(u, init ?? {});
  }) as unknown as typeof fetch;
  const api = new ApiClient({
    baseUrl: 'http://test.local/api/v1',
    tokenStore,
    fetchImpl,
    authMode: 'mobile',
    refreshTokenStore: refreshStore,
    onAccessTokenChanged: async (token) => {
      accessChanges.push(token);
    },
  });
  return {
    api,
    tokenStore,
    refreshStore,
    accessChanges,
    fetchImpl,
    get refreshCalls() {
      return refreshCalls;
    },
  };
}

async function bodyOf(init: RequestInit): Promise<Record<string, unknown>> {
  if (typeof init.body === 'string') return JSON.parse(init.body);
  return {};
}

const USER = { id: 'u1', name: 'Khách', email: 'khach@test.local', role: 'user' };

function meHandler(url: string, init: RequestInit): Response {
  const auth = new Headers(init.headers).get('Authorization');
  if (url.endsWith('/auth/me')) {
    if (auth === 'Bearer valid-access' || auth === 'Bearer rotated-access') {
      return jsonResponse(envelope(USER), 200);
    }
    if (auth === 'Bearer expired-access') {
      return jsonResponse(errorEnvelope('TOKEN_EXPIRED', 'Access token đã hết hạn'), 401);
    }
    return jsonResponse(errorEnvelope('TOKEN_MISSING', 'Thiếu access token'), 401);
  }
  if (url.endsWith('/auth/refresh-mobile')) {
    return jsonResponse(
      envelope({ user: USER, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }),
      200,
    );
  }
  throw new Error(`unexpected url ${url}`);
}

describe('ApiClient mobile mode', () => {
  it('loginMobile stores the access token in memory and the refresh token in the async store', async () => {
    const client = makeClient(async (url, init) => {
      if (url.endsWith('/auth/login-mobile')) {
        const body = await bodyOf(init);
        expect(body.email).toBe('khach@test.local');
        return jsonResponse(
          envelope({ user: USER, accessToken: 'access-1', refreshToken: 'refresh-1' }),
          200,
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    const data = await client.api.loginMobile({
      email: 'khach@test.local',
      password: 'password-123',
    });
    expect(data.accessToken).toBe('access-1');
    expect(data.refreshToken).toBe('refresh-1');
    expect(client.tokenStore.get()).toBe('access-1');
    expect(await client.refreshStore.get()).toBe('refresh-1');
    expect(client.accessChanges).toContain('access-1');
  });

  it('an expired access token refreshes once, stores the rotated pair, and retries the request once', async () => {
    let refreshCount = 0;
    const client = makeClient(
      async (url, init) => {
        if (url.endsWith('/auth/refresh-mobile')) {
          refreshCount += 1;
          const body = await bodyOf(init);
          expect(body.refreshToken).toBe('valid-refresh');
          return jsonResponse(
            envelope({ user: USER, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }),
            200,
          );
        }
        return meHandler(url, init);
      },
      { persistedAccess: 'expired-access', persistedRefresh: 'valid-refresh' },
    );
    // Seed the async refresh store (makeClient only seeds the memory token).
    await client.refreshStore.set('valid-refresh');
    const me = await client.api.me();
    expect(me.email).toBe('khach@test.local');
    expect(refreshCount).toBe(1);
    expect(client.tokenStore.get()).toBe('rotated-access');
    expect(await client.refreshStore.get()).toBe('rotated-refresh');
    expect(client.accessChanges).toContain('rotated-access');
  });

  it('refresh failure clears both tokens and throws the original 401, with no retry loop', async () => {
    let refreshCount = 0;
    let meCount = 0;
    const client = makeClient(
      async (url, _init) => {
        if (url.endsWith('/auth/me')) {
          meCount += 1;
          return jsonResponse(errorEnvelope('TOKEN_EXPIRED', 'Access token đã hết hạn'), 401);
        }
        if (url.endsWith('/auth/refresh-mobile')) {
          refreshCount += 1;
          return jsonResponse(errorEnvelope('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn'), 401);
        }
        throw new Error(`unexpected ${url}`);
      },
      { persistedAccess: 'expired-access', persistedRefresh: 'stale-refresh' },
    );
    await client.refreshStore.set('stale-refresh');
    await expect(client.api.me()).rejects.toMatchObject({ status: 401 });
    expect(refreshCount).toBe(1);
    expect(meCount).toBe(1); // no second retry after a failed refresh
    expect(client.tokenStore.get()).toBeNull();
    expect(await client.refreshStore.get()).toBeNull();
    expect(client.accessChanges).toContain(null);
  });

  it('5 concurrent requests hitting 401 trigger exactly one refresh', async () => {
    let refreshCount = 0;
    const client = makeClient(
      async (url, init) => {
        if (url.endsWith('/auth/refresh-mobile')) {
          refreshCount += 1;
          // Small delay so all 5 callers are waiting on the same promise.
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
          return jsonResponse(
            envelope({ user: USER, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }),
            200,
          );
        }
        return meHandler(url, init);
      },
      { persistedAccess: 'expired-access', persistedRefresh: 'valid-refresh' },
    );
    await client.refreshStore.set('valid-refresh');
    const results = await Promise.all([
      client.api.me(),
      client.api.me(),
      client.api.me(),
      client.api.me(),
      client.api.me(),
    ]);
    expect(results).toHaveLength(5);
    expect(results.every((u) => u.email === 'khach@test.local')).toBe(true);
    expect(refreshCount).toBe(1);
    expect(client.tokenStore.get()).toBe('rotated-access');
    expect(await client.refreshStore.get()).toBe('rotated-refresh');
  });

  it('logoutMobile revokes on the server and clears both tokens', async () => {
    let logoutBody: Record<string, unknown> | null = null;
    const client = makeClient(
      async (url, init) => {
        if (url.endsWith('/auth/logout-mobile')) {
          logoutBody = await bodyOf(init);
          return jsonResponse(envelope({ message: 'Đã đăng xuất' }), 200);
        }
        throw new Error(`unexpected ${url}`);
      },
      { persistedAccess: 'valid-access', persistedRefresh: 'valid-refresh' },
    );
    await client.refreshStore.set('valid-refresh');
    await client.api.logoutMobile();
    expect(logoutBody).toEqual({ refreshToken: 'valid-refresh' });
    expect(client.tokenStore.get()).toBeNull();
    expect(await client.refreshStore.get()).toBeNull();
  });

  it('logoutMobile clears both tokens even when the server is unreachable', async () => {
    const client = makeClient(
      async () => {
        throw new TypeError('network down');
      },
      { persistedAccess: 'valid-access', persistedRefresh: 'valid-refresh' },
    );
    await client.refreshStore.set('valid-refresh');
    // Server error propagates, but local tokens are already cleared.
    await expect(client.api.logoutMobile()).rejects.toBeInstanceOf(ApiError);
    expect(client.tokenStore.get()).toBeNull();
    expect(await client.refreshStore.get()).toBeNull();
  });

  it('403, 500 and network errors do not clear the tokens and are not treated as expiry', async () => {
    for (const failure of ['forbidden', 'server', 'network'] as const) {
      const client = makeClient(
        async (_url) => {
          if (failure === 'forbidden') {
            return jsonResponse(errorEnvelope('FORBIDDEN', 'Không có quyền'), 403);
          }
          if (failure === 'server') {
            return jsonResponse(errorEnvelope('INTERNAL_ERROR', 'Đã xảy ra lỗi máy chủ'), 500);
          }
          throw new TypeError('network down');
        },
        { persistedAccess: 'valid-access', persistedRefresh: 'valid-refresh' },
      );
      await client.refreshStore.set('valid-refresh');
      await expect(client.api.me()).rejects.toBeInstanceOf(ApiError);
      expect(client.refreshCalls).toBe(0);
      expect(client.tokenStore.get()).toBe('valid-access');
      expect(await client.refreshStore.get()).toBe('valid-refresh');
    }
  });

  it('cookie mode is unchanged: refresh still uses the cookie endpoint', async () => {
    const tokenStore = createMemoryTokenStore();
    tokenStore.set('expired-access');
    let refreshPath = '';
    const api = new ApiClient({
      baseUrl: 'http://test.local/api/v1',
      tokenStore,
      fetchImpl: (async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/auth/me')) {
          const auth = new Headers(init?.headers).get('Authorization');
          if (auth === 'Bearer rotated-access') {
            return jsonResponse(envelope(USER), 200);
          }
          return jsonResponse(errorEnvelope('TOKEN_EXPIRED', 'hết hạn'), 401);
        }
        if (u.endsWith('/auth/refresh')) {
          refreshPath = u;
          return jsonResponse(envelope({ accessToken: 'rotated-access' }), 200);
        }
        throw new Error(`unexpected ${u}`);
      }) as unknown as typeof fetch,
    });
    const me = await api.me();
    expect(me.email).toBe('khach@test.local');
    expect(refreshPath).toContain('/auth/refresh');
    expect(refreshPath).not.toContain('refresh-mobile');
  });
});
