/**
 * Session persistence for the mobile app.
 *
 * Backend auth, as implemented (Server/src/controllers/authController.ts):
 * - Login/register return an access token in the response body (15 min).
 * - The refresh token is ONLY sent as an HttpOnly cookie
 *   (cutishop1_refresh, path /api/v1/auth). JavaScript cannot read it,
 *   and React Native's fetch does not reliably persist cookies across
 *   app restarts, so the mobile app must NOT rely on cookie refresh.
 *
 * Phase 1 decision (no backend change):
 * - Only the access token is stored, and only in expo-secure-store
 *   (Android Keystore-encrypted SharedPreferences, iOS Keychain).
 *   It is NEVER stored in AsyncStorage, a plain file, or app state that
 *   survives longer than the in-memory token store.
 * - On app start the persisted token is loaded into the in-memory
 *   token store and validated with /auth/me. If validation fails the
 *   persisted token is deleted and the user is sent to login.
 * - When the access token expires (15 min), the next request fails with
 *   401 after the api-client's cookie refresh attempt fails, and the
 *   app clears the persisted token and asks the user to log in again.
 *   Silent refresh on mobile is a Phase 2 item that needs a separate
 *   security decision (e.g. a mobile refresh endpoint with a body
 *   token), not a silent workaround in Phase 1.
 * - Logout calls /auth/logout best-effort (it revokes the cookie
 *   session if the native stack sent one) and always clears the local
 *   token, in memory and in SecureStore.
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

export async function loadPersistedToken(
  storage: AsyncTokenStorage,
): Promise<string | null> {
  try {
    return await storage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function persistToken(
  storage: AsyncTokenStorage,
  token: string | null,
): Promise<void> {
  try {
    if (token) {
      await storage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      await storage.deleteItem(ACCESS_TOKEN_KEY);
    }
  } catch {
    // Persistence failure must not crash login/logout; the in-memory
    // token still works for this app session, and the next app start
    // will simply ask the user to log in again.
  }
}

export async function clearPersistedToken(
  storage: AsyncTokenStorage,
): Promise<void> {
  await persistToken(storage, null);
}
