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
import { apiStatus } from '../lib/apiError';
import { clearPersistedSession } from '../lib/session';
import {
  persistLoginSession,
  completeLogout,
  restoreSession,
} from '../lib/sessionFlow';

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

  // Restore via the testable session flow: no tokens -> anonymous;
  // access token -> validate with /auth/me (api-client refreshes once
  // via refresh-mobile on 401 before failing); only a refresh token ->
  // one refresh, then me(). Auth failures delete both tokens; network,
  // 403 and 500 errors do not delete them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await restoreSession({
        storage: secureTokenStorage,
        setMemoryToken: (token) => tokenStore.set(token),
        me: () => api.me(),
        refreshSession: () => api.refreshSession(),
        isAuthError: (error) => apiStatus(error) === 401,
      });
      if (cancelled) return;
      if (result.status === 'authenticated') {
        setUser(result.user);
        setStatus('authenticated');
      } else {
        // 'anonymous' and 'unavailable' both leave the UI logged out;
        // 'unavailable' keeps the tokens so a later retry can succeed.
        setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.loginMobile({ email, password });
    await persistLoginSession(
      secureTokenStorage,
      data.accessToken,
      data.refreshToken,
    );
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    // Local logout ALWAYS completes, even when the server call fails
    // (offline, 500): completeLogout clears both tokens in a finally
    // block and never throws. This fixes the Phase 1 bug where an
    // offline logout never reached SecureStore clearing or the UI
    // state change. Limit: an offline logout cannot revoke the server
    // session until a network round trip succeeds.
    await completeLogout({
      storage: secureTokenStorage,
      setMemoryToken: (token) => tokenStore.set(token),
      logoutServer: () => api.logoutMobile(),
    });
    setUser(null);
    setStatus('anonymous');
  }, []);

  const handleSessionExpired = useCallback(async () => {
    tokenStore.set(null);
    await clearPersistedSession(secureTokenStorage);
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
