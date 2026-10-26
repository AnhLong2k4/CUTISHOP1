import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { clearTestDb, closeTestDb, connectTestDb } from './mongo.js';

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearTestDb);

async function makeCategory() {
  return Category.create({ name: 'Áo', slug: 'ao' });
}

describe('model constraints', () => {
  it('enforces unique email', async () => {
    await User.create({ name: 'A B', email: 'a@test.local', passwordHash: 'x'.repeat(20) });
    await expect(
      User.create({ name: 'C D', email: 'a@test.local', passwordHash: 'y'.repeat(20) }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('enforces unique variant SKU across products', async () => {
    const category = await makeCategory();
    await Product.create({
      title: 'Áo một',
      slug: 'ao-mot',
      category: category._id,
      price: 100000,
      variants: [{ sku: 'SKU-1', quantity: 1 }],
    });
    await expect(
      Product.create({
        title: 'Áo hai',
        slug: 'ao-hai',
        category: category._id,
        price: 100000,
        variants: [{ sku: 'SKU-1', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects salePrice >= price', async () => {
    const category = await makeCategory();
    await expect(
      Product.create({
        title: 'Áo ba',
        slug: 'ao-ba',
        category: category._id,
        price: 100000,
        salePrice: 100000,
        variants: [{ sku: 'SKU-3', quantity: 1 }],
      }),
    ).rejects.toThrowError(/Sale price must be lower/);
  });

  it('rejects negative quantity and non-integer prices', async () => {
    const category = await makeCategory();
    await expect(
      Product.create({
        title: 'Áo bốn',
        slug: 'ao-bon',
        category: category._id,
        price: 100000,
        variants: [{ sku: 'SKU-4', quantity: -1 }],
      }),
    ).rejects.toThrowError();
    await expect(
      Product.create({
        title: 'Áo năm',
        slug: 'ao-nam',
        category: category._id,
        price: 100000.5,
        variants: [{ sku: 'SKU-5', quantity: 1 }],
      }),
    ).rejects.toThrowError(/integer/);
  });
});
