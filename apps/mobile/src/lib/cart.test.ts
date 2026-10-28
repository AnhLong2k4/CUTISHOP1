import { describe, expect, it } from 'vitest';
import {
  cartItemCount,
  cartKey,
  clampQuantity,
  isValidQuantity,
  mergeCartItems,
  parseCartItems,
  shouldResetCart,
} from './cart';

describe('cartKey', () => {
  it('identifies a line by product + sku, not by product alone', () => {
    expect(cartKey('p1', 'SKU-A')).not.toBe(cartKey('p1', 'SKU-B'));
    expect(cartKey('p1', 'SKU-A')).toBe(cartKey('p1', 'SKU-A'));
    expect(cartKey('p1', 'SKU-A')).not.toBe(cartKey('p2', 'SKU-A'));
  });
});

describe('mergeCartItems', () => {
  it('adding the same variant accumulates quantity', () => {
    const items = [{ productId: 'p1', sku: 'SKU-A', quantity: 2 }];
    const out = mergeCartItems(items, { productId: 'p1', sku: 'SKU-A', quantity: 3 });
    expect(out).toEqual([{ productId: 'p1', sku: 'SKU-A', quantity: 5 }]);
    // Does not mutate the input.
    expect(items).toEqual([{ productId: 'p1', sku: 'SKU-A', quantity: 2 }]);
  });

  it('the same product with a different variant is a separate line', () => {
    const items = [{ productId: 'p1', sku: 'SKU-A', quantity: 1 }];
    const out = mergeCartItems(items, { productId: 'p1', sku: 'SKU-B', quantity: 2 });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ productId: 'p1', sku: 'SKU-B', quantity: 2 });
  });

  it('adding to an empty cart creates one line', () => {
    expect(
      mergeCartItems([], { productId: 'p1', sku: 'SKU-A', quantity: 1 }),
    ).toEqual([{ productId: 'p1', sku: 'SKU-A', quantity: 1 }]);
  });
});

describe('isValidQuantity and clampQuantity', () => {
  it('accepts integers 1..999 only', () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(999)).toBe(true);
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(1000)).toBe(false);
    expect(isValidQuantity(1.5)).toBe(false);
    expect(isValidQuantity('2')).toBe(false);
    expect(isValidQuantity(NaN)).toBe(false);
  });

  it('clamps to available stock and to 999, and returns 0 when out of stock', () => {
    expect(clampQuantity(5, 3)).toBe(3);
    expect(clampQuantity(2, 10)).toBe(2);
    expect(clampQuantity(0, 10)).toBe(1);
    expect(clampQuantity(2000, 5000)).toBe(999);
    expect(clampQuantity(1, 0)).toBe(0);
    expect(clampQuantity(3, -1)).toBe(0);
  });
});

describe('parseCartItems', () => {
  it('keeps valid lines and counts invalid ones', () => {
    const { valid, invalidCount } = parseCartItems([
      { productId: 'p1', sku: 'SKU-A', quantity: 2 },
      { productId: '', sku: 'SKU-B', quantity: 1 },
      { productId: 'p1', sku: '', quantity: 1 },
      { productId: 'p2', sku: 'SKU-C', quantity: 0 },
      { productId: 'p2', sku: 'SKU-D', quantity: 1.5 },
      { productId: 'p3', sku: 'SKU-E', quantity: 1000 },
      null,
      'not-an-item',
    ]);
    expect(valid).toEqual([{ productId: 'p1', sku: 'SKU-A', quantity: 2 }]);
    expect(invalidCount).toBe(7);
  });

  it('an empty cart parses to empty, and non-array input is not a crash', () => {
    expect(parseCartItems([])).toEqual({ valid: [], invalidCount: 0 });
    expect(parseCartItems(null)).toEqual({ valid: [], invalidCount: 0 });
    expect(parseCartItems(undefined)).toEqual({ valid: [], invalidCount: 0 });
  });
});

describe('shouldResetCart (per-account separation)', () => {
  it('resets on login, logout and account switch, but not on the same account', () => {
    expect(shouldResetCart(null, 'u1')).toBe(true); // login
    expect(shouldResetCart('u1', null)).toBe(true); // logout
    expect(shouldResetCart('u1', 'u2')).toBe(true); // account switch
    expect(shouldResetCart('u1', 'u1')).toBe(false);
    expect(shouldResetCart(null, null)).toBe(false);
  });
});

describe('cartItemCount', () => {
  it('sums quantities across lines', () => {
    expect(
      cartItemCount([
        { productId: 'p1', sku: 'SKU-A', quantity: 2 },
        { productId: 'p1', sku: 'SKU-B', quantity: 3 },
      ]),
    ).toBe(5);
    expect(cartItemCount([])).toBe(0);
  });
});
