import { ApiClient, createMemoryTokenStore } from '@cutishop1/api-client';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';
import {
  clearPersistedToken,
  persistToken,
  REFRESH_TOKEN_KEY,
  type AsyncTokenStorage,
} from './session';

/** In-memory token holder used by the shared ApiClient. */
export const tokenStore = createMemoryTokenStore();

/** SecureStore adapter for session persistence (see src/lib/session.ts). */
export const secureTokenStorage: AsyncTokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

/**
 * Mobile ApiClient (Phase 1.1, approved option C): authMode 'mobile'
 * with the refresh token in SecureStore. Web apps keep the default
 * cookie mode and are unaffected. onAccessTokenChanged persists a
 * refreshed access token back to SecureStore, so the next app start
 * does not reload the old, expired one.
 */
export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  tokenStore,
  authMode: 'mobile',
  refreshTokenStore: {
    get: async () => {
      try {
        return await secureTokenStorage.getItem(REFRESH_TOKEN_KEY);
      } catch {
        return null;
      }
    },
    set: async (token) => {
      await secureTokenStorage.setItem(REFRESH_TOKEN_KEY, token);
    },
    delete: async () => {
      await secureTokenStorage.deleteItem(REFRESH_TOKEN_KEY);
    },
  },
  onAccessTokenChanged: async (token) => {
    if (token) {
      await persistToken(secureTokenStorage, token);
    } else {
      await clearPersistedToken(secureTokenStorage);
    }
  },
});
