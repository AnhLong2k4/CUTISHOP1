import type { PublicUser } from '@cutishop1/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, secureTokenStorage, tokenStore } from '../lib/api';
import {
  clearPersistedToken,
  loadPersistedToken,
  persistToken,
} from '../lib/session';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: PublicUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Clear local session after a 401 that refresh could not recover. */
  handleSessionExpired: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Restore: load the persisted access token into memory, then validate
  // it with /auth/me. A stale or expired token is deleted, never kept.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = await loadPersistedToken(secureTokenStorage);
      if (persisted) {
        tokenStore.set(persisted);
        try {
          const me = await api.me();
          if (cancelled) return;
          setUser(me);
          setStatus('authenticated');
          return;
        } catch {
          await clearPersistedToken(secureTokenStorage);
          tokenStore.set(null);
        }
      }
      if (!cancelled) setStatus('anonymous');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login({ email, password });
    await persistToken(secureTokenStorage, data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    // Best-effort server logout (revokes the cookie session if the
    // native stack sent one); local session is always cleared.
    await api.logout();
    await clearPersistedToken(secureTokenStorage);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const handleSessionExpired = useCallback(async () => {
    tokenStore.set(null);
    await clearPersistedToken(secureTokenStorage);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, handleSessionExpired }),
    [user, status, login, logout, handleSessionExpired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
