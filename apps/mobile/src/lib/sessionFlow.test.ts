import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  type AsyncTokenStorage,
} from './session';
import {
  completeLogout,
  persistLoginSession,
  restoreSession,
} from './sessionFlow';

function memoryStorage(
  initial: Record<string, string> = {},
): AsyncTokenStorage & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    deleteItem: async (key) => {
      map.delete(key);
    },
  };
}

function authError() {
  return Object.assign(new Error('401'), { status: 401 });
}

function networkError() {
  return Object.assign(new Error('network'), { status: 0, code: 'NETWORK_ERROR' });
}

const USER = {
  id: 'u1',
  name: 'Khách',
  email: 'khach@test.local',
  role: 'user' as const,
  createdAt: '2026-10-28T00:00:00.000Z',
};

describe('restoreSession', () => {
  it('no tokens: anonymous, no API call', async () => {
    const storage = memoryStorage();
    let meCalls = 0;
    const result = await restoreSession({
      storage,
      setMemoryToken: () => {},
      me: async () => {
        meCalls += 1;
        return USER;
      },
      refreshSession: async () => null,
      isAuthError: (e) => (e as { status?: number }).status === 401,
    });
    expect(result.status).toBe('anonymous');
    expect(meCalls).toBe(0);
  });

  it('valid access token: authenticated, tokens kept', async () => {
    const storage = memoryStorage({
      [ACCESS_TOKEN_KEY]: 'valid-access',
      [REFRESH_TOKEN_KEY]: 'valid-refresh',
    });
    const result = await restoreSession({
      storage,
      setMemoryToken: () => {},
      me: async () => USER,
      refreshSession: async () => null,
      isAuthError: (e) => (e as { status?: number }).status === 401,
    });
    expect(result.status).toBe('authenticated');
    expect(storage.map.get(ACCESS_TOKEN_KEY)).toBe('valid-access');
    expect(storage.map.get(REFRESH_TOKEN_KEY)).toBe('valid-refresh');
  });

  it('expired access token with unrecoverable refresh: anonymous, both tokens deleted', async () => {
    const storage = memoryStorage({
      [ACCESS_TOKEN_KEY]: 'expired-access',
      [REFRESH_TOKEN_KEY]: 'stale-refresh',
    });
    let memory: string | null = 'expired-access';
    const result = await restoreSession({
      storage,
      setMemoryToken: (token) => {
        memory = token;
      },
      me: async () => {
        throw authError();
      },
      refreshSession: async () => null,
      isAuthError: (e) => (e as { status?: number }).status === 401,
    });
    expect(result.status).toBe('anonymous');
    expect(storage.map.has(ACCESS_TOKEN_KEY)).toBe(false);
    expect(storage.map.has(REFRESH_TOKEN_KEY)).toBe(false);
    expect(memory).toBeNull();
  });

  it('only a refresh token: one refresh, then me() succeeds', async () => {
    const storage = memoryStorage({ [REFRESH_TOKEN_KEY]: 'valid-refresh' });
    let memory: string | null = null;
    const result = await restoreSession({
      storage,
      setMemoryToken: (token) => {
        memory = token;
      },
      me: async () => {
        if (memory !== 'rotated-access') throw authError();
        return USER;
      },
      refreshSession: async () => {
        memory = 'rotated-access';
        return 'rotated-access';
      },
      isAuthError: (e) => (e as { status?: number }).status === 401,
    });
    expect(result.status).toBe('authenticated');
  });

  it('network error on me(): unavailable, tokens NOT deleted', async () => {
    const storage = memoryStorage({
      [ACCESS_TOKEN_KEY]: 'valid-access',
      [REFRESH_TOKEN_KEY]: 'valid-refresh',
    });
    const result = await restoreSession({
      storage,
      setMemoryToken: () => {},
      me: async () => {
        throw networkError();
      },
      refreshSession: async () => null,
      isAuthError: (e) => (e as { status?: number }).status === 401,
    });
    expect(result.status).toBe('unavailable');
    expect(storage.map.get(ACCESS_TOKEN_KEY)).toBe('valid-access');
    expect(storage.map.get(REFRESH_TOKEN_KEY)).toBe('valid-refresh');
  });
});

describe('completeLogout', () => {
  it('online logout: server called, both tokens deleted', async () => {
    const storage = memoryStorage({
      [ACCESS_TOKEN_KEY]: 'valid-access',
      [REFRESH_TOKEN_KEY]: 'valid-refresh',
    });
    let serverCalls = 0;
    let memory: string | null = 'valid-access';
    const result = await completeLogout({
      storage,
      setMemoryToken: (token) => {
        memory = token;
      },
      logoutServer: async () => {
        serverCalls += 1;
      },
    });
    expect(result.serverError).toBeNull();
    expect(serverCalls).toBe(1);
    expect(storage.map.size).toBe(0);
    expect(memory).toBeNull();
  });

  it('offline logout: server error is reported but local logout still completes', async () => {
    const storage = memoryStorage({
      [ACCESS_TOKEN_KEY]: 'valid-access',
      [REFRESH_TOKEN_KEY]: 'valid-refresh',
    });
    let memory: string | null = 'valid-access';
    const result = await completeLogout({
      storage,
      setMemoryToken: (token) => {
        memory = token;
      },
      logoutServer: async () => {
        throw networkError();
      },
    });
    expect(result.serverError).not.toBeNull();
    expect(storage.map.size).toBe(0);
    expect(memory).toBeNull();
  });
});

describe('persistLoginSession', () => {
  it('stores both tokens', async () => {
    const storage = memoryStorage();
    await persistLoginSession(storage, 'access-1', 'refresh-1');
    expect(storage.map.get(ACCESS_TOKEN_KEY)).toBe('access-1');
    expect(storage.map.get(REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });
});
