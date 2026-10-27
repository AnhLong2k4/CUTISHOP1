import { ApiClient, createMemoryTokenStore } from '@cutishop1/api-client';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';
import type { AsyncTokenStorage } from './session';

/** In-memory token holder used by the shared ApiClient. */
export const tokenStore = createMemoryTokenStore();

export const api = new ApiClient({ baseUrl: API_BASE_URL, tokenStore });

/** SecureStore adapter for session persistence (see src/lib/session.ts). */
export const secureTokenStorage: AsyncTokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};
