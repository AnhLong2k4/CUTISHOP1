import { ApiClient, createMemoryTokenStore } from '@cutishop1/api-client';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://127.0.0.1:8081/api/v1';

export const tokenStore = createMemoryTokenStore();
export const api = new ApiClient({ baseUrl, tokenStore });
