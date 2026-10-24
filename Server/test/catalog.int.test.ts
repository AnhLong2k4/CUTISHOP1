import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { Brand } from '../src/models/Brand.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/utils/password.js';
import { clearTestDb, closeTestDb, connectTestDb } from './mongo.js';

const app = createApp();
let adminToken = '';
let categoryId = '';
let brandId = '';

beforeAll(connectTestDb);
afterAll(closeTestDb);

beforeEach(async () => {
  await clearTestDb();
  const env = loadEnv();
  await User.create({
    name: 'Quản Trị',
    email: 'admin@test.local',
    passwordHash: await hashPassword('admin-pass-123', env.BCRYPT_COST),
    role: 'admin',
  });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.local', password: 'admin-pass-123' });
  adminToken = login.body.data.accessToken as string;

  const category = await Category.create({ name: 'Áo', slug: 'ao' });
  categoryId = category._id.toString();
  const brand = await Brand.create({ name: 'Cuti Basic', slug: 'cuti-basic' });
  brandId = brand._id.toString();
});

function productInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Áo thun cơ bản',
    category: categoryId,
    brand: brandId,
    price: 200000,
    variants: [{ sku: 'AT-BASE-M', color: 'Trắng', size: 'M', quantity: 5 }],
    ...overrides,
  };
}

async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(productInput(overrides));
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('admin catalog writes', () => {
  it('creates a product preserving variant SKU and variant price', async () => {
    const data = await createProduct({
      variants: [{ sku: 'AT-OVR-M', color: 'Đen', size: 'M', price: 210000, quantity: 3 }],
    });
    expect(data.variants[0].sku).toBe('AT-OVR-M');
    expect(data.variants[0].price).toBe(210000);
    expect(data.variants[0].effectivePrice).toBe(210000);
    expect(data.category.name).toBe('Áo');
    expect(data.brand.name).toBe('Cuti Basic');
  });

  it('rejects a duplicate SKU with 409', async () => {
    await createProduct();
    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productInput({ title: 'Áo khác hẳn' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SKU_ALREADY_EXISTS');
  });

  it('rejects an unknown category with 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productInput({ category: '64b64c2f4f4f4f4f4f4f4f4f' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CATEGORY');
  });

  it('blocks deleting a referenced category, allows an unreferenced one', async () => {
    await createProduct();
    const blocked = await request(app)
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');

    const other = await Category.create({ name: 'Phụ kiện', slug: 'phu-kien' });
    const ok = await request(app)
      .delete(`/api/v1/admin/categories/${other._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
  });

  it('DELETE product is a soft delete: hidden from the public API', async () => {
    const created = await createProduct();
    const del = await request(app)
      .delete(`/api/v1/admin/products/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.isActive).toBe(false);
    const detail = await request(app).get(`/api/v1/products/${created.id}`);
    expect(detail.status).toBe(404);
    const stored = await Product.findById(created.id);
    expect(stored).not.toBeNull();
    expect(stored!.isActive).toBe(false);
  });

  it('admin list/detail include deactivated products, public ones do not', async () => {
    const created = await createProduct();
    await request(app)
      .delete(`/api/v1/admin/products/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const adminList = await request(app)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.pagination.total).toBe(1);
    expect(adminList.body.data.items[0].isActive).toBe(false);

    const adminDetail = await request(app)
      .get(`/api/v1/admin/products/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDetail.status).toBe(200);

    const publicList = await request(app).get('/api/v1/products');
    expect(publicList.body.data.pagination.total).toBe(0);
  });

  it('upload reports 503 when media is not configured', async () => {
    const created = await createProduct();
    const res = await request(app)
      .put(`/api/v1/admin/products/${created.id}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'a.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MEDIA_NOT_CONFIGURED');
  });
});

describe('public catalog reads', () => {
  it('paginates on the server with consistent metadata', async () => {
    for (let i = 1; i <= 13; i++) {
      await Product.create({
        title: `Sản phẩm ${String(i).padStart(2, '0')}`,
        slug: `san-pham-${i}`,
        category: categoryId,
        price: 100000 + i * 1000,
        variants: [{ sku: `SP-${i}`, size: 'M', quantity: 1 }],
      });
    }
    const page1 = await request(app).get('/api/v1/products?limit=12');
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(12);
    expect(page1.body.data.pagination).toEqual({
      page: 1,
      limit: 12,
      total: 13,
      totalPages: 2,
    });
    const page2 = await request(app).get('/api/v1/products?limit=12&page=2');
    expect(page2.body.data.items).toHaveLength(1);
  });

  it('searches, filters and sorts', async () => {
    await createProduct();
    await createProduct({
      title: 'Quần jean xanh',
      variants: [{ sku: 'QJ-1', color: 'Xanh', size: '30', quantity: 0 }],
    });

    const search = await request(app).get('/api/v1/products?search=jean');
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].title).toContain('jean');

    const byCategory = await request(app).get(`/api/v1/products?category=${categoryId}`);
    expect(byCategory.body.data.pagination.total).toBe(2);

    const bySize = await request(app).get('/api/v1/products?size=30');
    expect(bySize.body.data.items).toHaveLength(1);

    const inStock = await request(app).get('/api/v1/products?inStock=true');
    expect(inStock.body.data.items).toHaveLength(1);
    expect(inStock.body.data.items[0].title).toBe('Áo thun cơ bản');

    // Name sorting uses MongoDB's default binary collation in Phase 1:
    // 'Q' (0x51) sorts before 'Á' (0xC3...), so the jeans come first.
    const sorted = await request(app).get('/api/v1/products?sort=nameAsc');
    expect(sorted.body.data.items[0].title).toBe('Quần jean xanh');
    const sortedDesc = await request(app).get('/api/v1/products?sort=nameDesc');
    expect(sortedDesc.body.data.items[0].title).toBe('Áo thun cơ bản');
  });

  it('rejects invalid query params with 400', async () => {
    const badSort = await request(app).get('/api/v1/products?sort=$where');
    expect(badSort.status).toBe(400);
    const badCategory = await request(app).get('/api/v1/products?category=abc');
    expect(badCategory.status).toBe(400);
    const badPrice = await request(app).get('/api/v1/products?minPrice=-5');
    expect(badPrice.status).toBe(400);
  });

  it('applies pricing rules in detail responses', async () => {
    const created = await createProduct({
      salePrice: 150000,
      variants: [
        { sku: 'P-OVR', size: 'M', price: 180000, quantity: 2 },
        { sku: 'P-INH', size: 'L', quantity: 2 },
      ],
    });
    const detail = await request(app).get(`/api/v1/products/${created.id}`);
    expect(detail.status).toBe(200);
    const bySize = Object.fromEntries(
      detail.body.data.variants.map((v: { size: string; effectivePrice: number }) => [
        v.size,
        v.effectivePrice,
      ]),
    );
    // Override wins; the sale never stacks on top of the override.
    expect(bySize.M).toBe(180000);
    // No override: the active sale price applies.
    expect(bySize.L).toBe(150000);
    expect(detail.body.data.onSale).toBe(true);
    expect(detail.body.data.priceRange).toEqual({ min: 150000, max: 180000 });
    expect(detail.body.data.totalStock).toBe(4);
  });

  it('detail: inactive product 404, malformed id 400', async () => {
    const created = await createProduct();
    await Product.updateOne({ _id: created.id }, { $set: { isActive: false } });
    const inactive = await request(app).get(`/api/v1/products/${created.id}`);
    expect(inactive.status).toBe(404);
    const malformed = await request(app).get('/api/v1/products/khong-phai-id');
    expect(malformed.status).toBe(400);
  });

  it('categories include product counts', async () => {
    await createProduct();
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    const ao = res.body.data.find((c: { slug: string }) => c.slug === 'ao');
    expect(ao.productCount).toBe(1);
  });
});
