import { describe, expect, it } from 'vitest';
import { API_BASE_URL } from './config';
import { selectVariant, uniqueValues } from './products';
import type { Product } from '@cutishop1/contracts';
import { ACCESS_TOKEN_KEY, clearPersistedToken, loadPersistedToken, persistToken } from './session';
import type { AsyncTokenStorage } from './session';

function memoryStorage(): AsyncTokenStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
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

const product: Product = {
  id: 'p1',
  title: 'Áo thun',
  slug: 'ao-thun',
  category: 'cat',
  price: 200000,
  images: [],
  isActive: true,
  variants: [
    { sku: 'AT-WHT-M', color: 'Trắng', size: 'M', quantity: 5, available: 5, effectivePrice: 149000, inStock: true },
    { sku: 'AT-BLK-M', color: 'Đen', size: 'M', quantity: 0, available: 0, effectivePrice: 200000, inStock: false },
    { sku: 'AT-WHT-L', color: 'Trắng', size: 'L', quantity: 3, available: 3, effectivePrice: 200000, inStock: true },
  ],
  priceRange: { min: 149000, max: 200000 },
  onSale: true,
  totalStock: 8,
  inStock: true,
  createdAt: '',
  updatedAt: '',
};

describe('variant selection', () => {
  it('narrows by colour and size, and returns null for missing combinations', () => {
    expect(selectVariant(product, 'Trắng', 'M')?.sku).toBe('AT-WHT-M');
    expect(selectVariant(product, 'Trắng', 'L')?.sku).toBe('AT-WHT-L');
    expect(selectVariant(product, 'Đen', 'L')).toBeNull();
    expect(uniqueValues(product.variants, 'color')).toEqual(['Trắng', 'Đen']);
    expect(uniqueValues(product.variants, 'size')).toEqual(['M', 'L']);
  });
});

describe('session persistence (in-memory adapter, same contract as SecureStore)', () => {
  it('persists, loads and clears the access token under a single key', async () => {
    const storage = memoryStorage();
    expect(await loadPersistedToken(storage)).toBeNull();
    await persistToken(storage, 'token-123');
    expect(storage.map.get(ACCESS_TOKEN_KEY)).toBe('token-123');
    expect(await loadPersistedToken(storage)).toBe('token-123');
    await clearPersistedToken(storage);
    expect(await loadPersistedToken(storage)).toBeNull();
  });
});

describe('mobile API config', () => {
  it('defaults to the Android emulator host alias, not localhost', () => {
    // In the test runner EXPO_PUBLIC_API_BASE_URL is unset, so the
    // default must be the emulator alias. A physical device needs the
    // env var set to its LAN IP (see src/lib/config.ts).
    expect(API_BASE_URL).toBe('http://10.0.2.2:8081/api/v1');
  });
});
