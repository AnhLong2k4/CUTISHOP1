import { describe, expect, it } from 'vitest';
import { buildProductFilter, buildProductSort } from '../src/utils/catalogQuery.js';
import { parsePagination, buildPageMeta } from '../src/utils/pagination.js';
import { effectivePrice, isSaleActive, priceRange, totalStock } from '../src/utils/pricing.js';
import { slugify } from '../src/utils/slug.js';

describe('slugify', () => {
  it('removes Vietnamese diacritics', () => {
    expect(slugify('Áo Thun Nữ')).toBe('ao-thun-nu');
    expect(slugify('Đầm dạ hội 2026!')).toBe('dam-da-hoi-2026');
  });
});

describe('pagination', () => {
  it('defaults to page 1, limit 20', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });
  it('clamps limit to 100 and page to >= 1', () => {
    expect(parsePagination({ page: 0, limit: 500 })).toEqual({ page: 1, limit: 100, skip: 0 });
    expect(parsePagination({ page: 3, limit: 10 }).skip).toBe(20);
  });
  it('builds meta with at least one page', () => {
    expect(buildPageMeta(0, parsePagination({})).totalPages).toBe(1);
    expect(buildPageMeta(13, parsePagination({ limit: 12 })).totalPages).toBe(2);
  });
});

describe('pricing rules', () => {
  const product = { price: 200000, salePrice: 150000 };
  it('sale applies when configured below base price', () => {
    expect(isSaleActive(product)).toBe(true);
    expect(effectivePrice(product)).toBe(150000);
  });
  it('sale does not apply when salePrice >= price', () => {
    expect(isSaleActive({ price: 200000, salePrice: 200000 })).toBe(false);
  });
  it('sale respects the time window', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const future = { price: 200000, salePrice: 150000, saleStartsAt: new Date('2026-07-01') };
    expect(isSaleActive(future, now)).toBe(false);
    const past = { price: 200000, salePrice: 150000, saleEndsAt: new Date('2026-05-01') };
    expect(isSaleActive(past, now)).toBe(false);
  });
  it('variant override wins and sale never stacks on it', () => {
    expect(effectivePrice(product, { price: 180000, quantity: 1 })).toBe(180000);
    expect(effectivePrice(product, { quantity: 1 })).toBe(150000);
  });
  it('computes range and stock', () => {
    const p = {
      price: 200000,
      salePrice: 150000,
      variants: [
        { price: 180000, quantity: 2 },
        { quantity: 3 },
      ],
    };
    expect(priceRange(p)).toEqual({ min: 150000, max: 180000 });
    expect(totalStock(p)).toBe(5);
  });
});

describe('catalogQuery', () => {
  it('escapes search regex and targets title', () => {
    const filter = buildProductFilter({ search: 'a.b(c)' });
    expect(filter.isActive).toBe(true);
    expect((filter.title as { $regex: string }).$regex).toBe('a\\.b\\(c\\)');
  });
  it('combines variant conditions in one $elemMatch', () => {
    const filter = buildProductFilter({ size: 'M', color: 'Đen', inStock: true });
    const elem = (filter.variants as { $elemMatch: Record<string, unknown> }).$elemMatch;
    expect(elem.size).toBe('M');
    expect(elem.quantity).toEqual({ $gt: 0 });
  });
  it('rejects an invalid category id', () => {
    expect(() => buildProductFilter({ category: 'not-an-id' })).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });
  it('whitelists sort fields', () => {
    expect(buildProductSort('priceAsc')).toEqual({ price: 1 });
    expect(() => buildProductSort('$where')).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });
  it('sale filter uses an $expr comparing salePrice and price', () => {
    const filter = buildProductFilter({ sale: true });
    expect(filter.$expr).toBeDefined();
  });
});
