/**
 * Session persistence for the mobile app.
 *
 * Backend auth, as implemented (Server/src/controllers/authController.ts):
 * - Web: login/register return an access token in the body (15 min) and
 *   a refresh token ONLY as an HttpOnly cookie (cutishop1_refresh,
 *   path /api/v1/auth). JavaScript cannot read it, and React Native's
 *   fetch does not reliably persist cookies across app restarts, so
 *   the mobile app must NOT rely on cookie refresh.
 * - Mobile (Phase 1.1, approved option C): login-mobile / refresh-mobile
 *   / logout-mobile reuse the same authService (rotation, hash check,
 *   reuse detection, per-session revocation) but transport the refresh
 *   token in the response/request body and set NO cookie.
 *
 * Storage rule (both phases): tokens are stored ONLY in expo-secure-store
 * (Android Keystore-encrypted SharedPreferences, iOS Keychain). They are
 * NEVER stored in AsyncStorage, a plain file, or logged. No token value
 * is ever written to a log, a bundle, or an error message.
 * - On app start the persisted access token is loaded into the in-memory
 *   token store and validated with /auth/me. If validation fails — even
 *   after a mobile refresh attempt — both persisted tokens are deleted
 *   and the user is sent to login.
 * - When the access token expires (15 min), the api-client refreshes
 *   once (single-flight) via refresh-mobile, stores the rotated pair,
 *   and retries the original request once. Refresh failure (expired,
 *   revoked, or reuse) deletes both persisted tokens and logs out.
 * - Logout calls /auth/logout-mobile best-effort and ALWAYS clears the
 *   local tokens, in memory and in SecureStore, even when the server
 *   call fails (offline, 500). Note the limit of offline logout: the
 *   server session cannot be revoked without a network round trip, so
 *   it remains valid until it expires or is revoked by a later
 *   online logout, password change, or reuse detection.
 *
 * This module is storage-agnostic so it can be unit-tested without
 * native modules: the real app passes the SecureStore adapter, tests
 * pass an in-memory adapter.
 */
export interface AsyncTokenStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export const ACCESS_TOKEN_KEY = 'cutishop1_access_token';
export const REFRESH_TOKEN_KEY = 'cutishop1_refresh_token';

async function loadKey(
  storage: AsyncTokenStorage,
  key: string,
): Promise<string | null> {
  try {
    return await storage.getItem(key);
  } catch {
    return null;
  }
}

async function persistKey(
  storage: AsyncTokenStorage,
  key: string,
  token: string | null,
): Promise<void> {
  try {
    if (token) {
      await storage.setItem(key, token);
    } else {
      await storage.deleteItem(key);
    }
  } catch {
    // Persistence failure must not crash login/logout/refresh; the
    // in-memory token still works for this app session, and the next
    // app start will simply ask the user to log in again.
  }
}

export async function loadPersistedToken(
  storage: AsyncTokenStorage,
): Promise<string | null> {
  return loadKey(storage, ACCESS_TOKEN_KEY);
}

export async function persistToken(
  storage: AsyncTokenStorage,
  token: string | null,
): Promise<void> {
  await persistKey(storage, ACCESS_TOKEN_KEY, token);
}

export async function clearPersistedToken(
  storage: AsyncTokenStorage,
): Promise<void> {
  await persistToken(storage, null);
}

export async function loadPersistedRefreshToken(
  storage: AsyncTokenStorage,
): Promise<string | null> {
  return loadKey(storage, REFRESH_TOKEN_KEY);
}

export async function persistRefreshToken(
  storage: AsyncTokenStorage,
  token: string | null,
): Promise<void> {
  await persistKey(storage, REFRESH_TOKEN_KEY, token);
}

export async function clearPersistedRefreshToken(
  storage: AsyncTokenStorage,
): Promise<void> {
  await persistRefreshToken(storage, null);
}

export async function clearPersistedSession(
  storage: AsyncTokenStorage,
): Promise<void> {
  await clearPersistedToken(storage);
  await clearPersistedRefreshToken(storage);
}
