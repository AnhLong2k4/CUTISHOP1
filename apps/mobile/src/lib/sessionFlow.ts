import type { PublicUser } from '@cutishop1/contracts';
import {
  clearPersistedSession,
  loadPersistedRefreshToken,
  loadPersistedToken,
  persistRefreshToken,
  persistToken,
  type AsyncTokenStorage,
} from './session';

/**
 * Pure session flow for the mobile app, kept out of AuthContext so it
 * can be unit-tested without React Native. AuthContext only supplies
 * the real dependencies; tests supply fakes.
 *
 * Rules encoded here:
 * - Restore with no tokens: anonymous, no API call.
 * - Restore with an access token: validate with me(). A 401 triggers
 *   the api-client's mobile refresh (single-flight) before me() throws;
 *   if validation still fails, both tokens are deleted and the user is
 *   anonymous. A network/403/500 error from me() must NOT delete the
 *   tokens — it is not a session expiry — so restore reports
 *   'unavailable' and the UI keeps the previous state (anonymous with
 *   a retryable error, never silently logged in).
 * - Restore with only a refresh token (access token lost): try one
 *   refresh, then me(). If either fails with an auth error, delete
 *   both tokens and go anonymous.
 * - Logout: always delete both tokens and report anonymous, even when
 *   the server call fails. The server error is returned to the caller
 *   (for diagnostics) but must never block the local logout.
 */

export type RestoreResult =
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'anonymous' }
  | { status: 'unavailable'; error: unknown };

export interface RestoreDeps {
  storage: AsyncTokenStorage;
  /** In-memory access token holder, mirroring the api-client store. */
  setMemoryToken: (token: string | null) => void;
  me: () => Promise<PublicUser>;
  refreshSession: () => Promise<string | null>;
  /** True when the error is an auth (401) failure, not 403/500/network. */
  isAuthError: (error: unknown) => boolean;
}

export async function restoreSession(
  deps: RestoreDeps,
): Promise<RestoreResult> {
  const access = await loadPersistedToken(deps.storage);
  const refresh = await loadPersistedRefreshToken(deps.storage);
  if (!access && !refresh) return { status: 'anonymous' };

  if (access) deps.setMemoryToken(access);
  else {
    // No access token, but a refresh token exists: recover once.
    const recovered = await deps.refreshSession();
    if (!recovered) {
      await clearPersistedSession(deps.storage);
      deps.setMemoryToken(null);
      return { status: 'anonymous' };
    }
  }

  try {
    const user = await deps.me();
    return { status: 'authenticated', user };
  } catch (error) {
    if (!deps.isAuthError(error)) {
      // Network, 403, 500: not a session expiry. Keep the tokens so a
      // later retry can succeed; do not log the user out for a
      // transient server or network failure.
      return { status: 'unavailable', error };
    }
    await clearPersistedSession(deps.storage);
    deps.setMemoryToken(null);
    return { status: 'anonymous' };
  }
}

export interface LogoutDeps {
  storage: AsyncTokenStorage;
  setMemoryToken: (token: string | null) => void;
  /** Server logout; may throw (offline, 500) — never blocks local logout. */
  logoutServer: () => Promise<void>;
}

export async function completeLogout(deps: LogoutDeps): Promise<{
  serverError: unknown | null;
}> {
  let serverError: unknown | null = null;
  try {
    await deps.logoutServer();
  } catch (error) {
    serverError = error;
  } finally {
    await clearPersistedSession(deps.storage);
    deps.setMemoryToken(null);
  }
  return { serverError };
}

export async function persistLoginSession(
  storage: AsyncTokenStorage,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await persistToken(storage, accessToken);
  await persistRefreshToken(storage, refreshToken);
}
