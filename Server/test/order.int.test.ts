import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { Brand } from '../src/models/Brand.js';
import { Category } from '../src/models/Category.js';
import { Coupon } from '../src/models/Coupon.js';
import { InventoryMovement } from '../src/models/InventoryMovement.js';
import { Order } from '../src/models/Order.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { expireReservations } from '../src/services/orderService.js';
import { hashPassword } from '../src/utils/password.js';
import { signAccessToken } from '../src/utils/tokens.js';
import {
  clearTestReplicaDb,
  closeTestReplicaDb,
  connectTestReplicaDb,
} from './mongoReplica.js';

const app = createApp();
let adminToken = '';
let userToken = '';
let user2Token = '';
let categoryId = '';
let brandId = '';
let productId = '';
let lastItemProductId = '';

beforeAll(connectTestReplicaDb, 180000);
afterAll(closeTestReplicaDb);

beforeEach(async () => {
  await clearTestReplicaDb();
  const env = loadEnv();
  async function makeUser(email: string, role: 'user' | 'admin') {
    // Sign the access token directly instead of logging in over HTTP:
    // the login rate limiter (20 / 15 min per IP) would otherwise block
    // the later tests in this file. Auth itself is covered by the
    // auth test file; these tests exercise order authorization, not login.
    const user = await User.create({
      name: role === 'admin' ? 'Quản Trị' : 'Khách',
      email,
      passwordHash: await hashPassword('password-123', env.BCRYPT_COST),
      role,
    });
    return signAccessToken(
      { sub: user._id.toString(), role, type: 'access' },
      env.JWT_ACCESS_SECRET,
      env.ACCESS_TOKEN_TTL_MINUTES,
    );
  }
  adminToken = await makeUser('admin@test.local', 'admin');
  userToken = await makeUser('khach@test.local', 'user');
  user2Token = await makeUser('khach2@test.local', 'user');

  const category = await Category.create({ name: 'Áo', slug: 'ao' });
  categoryId = category._id.toString();
  const brand = await Brand.create({ name: 'Cuti Basic', slug: 'cuti-basic' });
  brandId = brand._id.toString();

  async function makeProduct(title: string, sku: string, quantity: number, price = 200000) {
    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        category: categoryId,
        brand: brandId,
        price,
        variants: [{ sku, color: 'Trắng', size: 'M', quantity }],
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }
  productId = await makeProduct('Áo thun cơ bản', 'AT-BASE-M', 10);
  lastItemProductId = await makeProduct('Áo thun cuối', 'AT-LAST-M', 1);
});

function address() {
  return { name: 'Nguyễn Văn A', phone: '0901234567', address: '123 Đường Test, Hà Nội' };
}

async function createOrder(
  token: string,
  overrides: Record<string, unknown> = {},
  key = randomUUID(),
) {
  return request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({
      items: [{ productId, sku: 'AT-BASE-M', quantity: 2 }],
      shippingAddress: address(),
      ...overrides,
    });
}

async function adminStatus(orderId: string, status: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .patch(`/api/v1/admin/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status, ...extra });
}

describe('cart and quote', () => {
  it('quote is calculated by the server and does not reserve stock', async () => {
    const res = await request(app)
      .post('/api/v1/checkout/quote')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [{ productId, sku: 'AT-BASE-M', quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(400000);
    expect(res.body.data.total).toBe(400000); // demo shipping default 0
    expect(res.body.data.canOrder).toBe(true);
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].reserved).toBe(0);
  });

  it('cart CRUD merges the same SKU and validates against the catalog', async () => {
    const added = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, sku: 'AT-BASE-M', quantity: 1 });
    expect(added.status).toBe(200);
    const addedAgain = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, sku: 'AT-BASE-M', quantity: 2 });
    expect(addedAgain.body.data.items[0].quantity).toBe(3);
    const bad = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, sku: 'SKU-KHONG-CO', quantity: 1 });
    expect(bad.status).toBe(404);
  });
});

describe('COD order creation, idempotency and stock', () => {
  it('creates a PENDING order, reserves stock and writes a RESERVE movement', async () => {
    const res = await createOrder(userToken);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.total).toBe(400000);
    expect(res.body.data.reservationExpiresAt).toBeTruthy();
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].quantity).toBe(10);
    expect(stored!.variants[0].reserved).toBe(2);
    const movements = await InventoryMovement.find({ orderId: res.body.data.id });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('RESERVE');
    expect(movements[0].deltaReserved).toBe(2);
  });

  it('ignores client-sent subtotal, discount, shipping and total', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, sku: 'AT-BASE-M', quantity: 1 }],
        shippingAddress: address(),
        subtotal: 1,
        discount: 999999,
        shipping: 999999,
        total: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(200000);
    expect(res.body.data.discount).toBe(0);
    expect(res.body.data.shipping).toBe(0);
    expect(res.body.data.total).toBe(200000);
  });

  it('retry with the same key and payload returns the old order, no second reservation', async () => {
    const key = randomUUID();
    const first = await createOrder(userToken, {}, key);
    expect(first.status).toBe(201);
    const second = await createOrder(userToken, {}, key);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const count = await Order.countDocuments({});
    expect(count).toBe(1);
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].reserved).toBe(2);
  });

  it('same key with a different payload returns 409 and does not change the old order', async () => {
    const key = randomUUID();
    const first = await createOrder(userToken, {}, key);
    expect(first.status).toBe(201);
    const different = await createOrder(
      userToken,
      { items: [{ productId, sku: 'AT-BASE-M', quantity: 3 }] },
      key,
    );
    expect(different.status).toBe(409);
    expect(different.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const count = await Order.countDocuments({});
    expect(count).toBe(1);
  });

  it('missing idempotency key returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ items: [{ productId, sku: 'AT-BASE-M', quantity: 1 }], shippingAddress: address() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('two customers racing for the last item cannot both succeed', async () => {
    const payload = {
      items: [{ productId: lastItemProductId, sku: 'AT-LAST-M', quantity: 1 }],
      shippingAddress: address(),
    };
    const [a, b] = await Promise.all([
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', randomUUID())
        .send(payload),
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user2Token}`)
        .set('Idempotency-Key', randomUUID())
        .send(payload),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = a.status === 409 ? a : b;
    expect(failed.body.error.code).toBe('INSUFFICIENT_STOCK');
    const stored = await Product.findById(lastItemProductId);
    expect(stored!.variants[0].reserved).toBe(1);
    expect(stored!.variants[0].quantity).toBe(1);
    const count = await Order.countDocuments({ 'items.sku': 'AT-LAST-M' });
    expect(count).toBe(1);
  });

  it('order over available stock returns 409 and reserves nothing', async () => {
    const res = await createOrder(userToken, {
      items: [{ productId, sku: 'AT-BASE-M', quantity: 99 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].reserved).toBe(0);
  });
});

describe('order lifecycle, coupon and ownership', () => {
  it('cancel releases stock exactly once, even when cancelled twice', async () => {
    const created = await createOrder(userToken);
    const id = created.body.data.id as string;
    const first = await request(app)
      .post(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('CANCELLED');
    const second = await request(app)
      .post(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('CANCELLED');
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].reserved).toBe(0);
    const releases = await InventoryMovement.find({ orderId: id, type: 'RELEASE' });
    expect(releases).toHaveLength(1);
  });

  it('expiry releases stock exactly once and does not revive an expired PENDING order', async () => {
    const created = await createOrder(userToken);
    const id = created.body.data.id as string;
    await Order.updateOne(
      { _id: id },
      { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await expireReservations();
    expect(expired).toContain(id);
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].reserved).toBe(0);
    const again = await expireReservations();
    expect(again).not.toContain(id);
    const confirm = await adminStatus(id, 'CONFIRMED');
    expect(confirm.status).toBe(409);
  });

  it('delivery moves held stock to sold exactly once and marks paid on delivery', async () => {
    const created = await createOrder(userToken);
    const id = created.body.data.id as string;
    expect((await adminStatus(id, 'CONFIRMED')).status).toBe(200);
    expect((await adminStatus(id, 'PROCESSING')).status).toBe(200);
    expect((await adminStatus(id, 'SHIPPING')).status).toBe(200);
    const first = await adminStatus(id, 'DELIVERED');
    expect(first.status).toBe(200);
    expect(first.body.data.paymentStatus).toBe('PAID_ON_DELIVERY');
    const second = await adminStatus(id, 'DELIVERED');
    expect(second.status).toBe(200);
    const stored = await Product.findById(productId);
    expect(stored!.variants[0].quantity).toBe(8);
    expect(stored!.variants[0].reserved).toBe(0);
    const sales = await InventoryMovement.find({ orderId: id, type: 'SALE' });
    expect(sales).toHaveLength(1);
  });

  it('illegal transitions return 409', async () => {
    const created = await createOrder(userToken);
    const id = created.body.data.id as string;
    const res = await adminStatus(id, 'DELIVERED');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_TRANSITION_INVALID');
  });

  it('a user cannot view another user\'s order', async () => {
    const created = await createOrder(userToken);
    const id = created.body.data.id as string;
    const res = await request(app)
      .get(`/api/v1/orders/${id}`)
      .set('Authorization', `Bearer ${user2Token}`);
    expect(res.status).toBe(404);
    const mine = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${user2Token}`);
    expect(mine.body.data.items).toHaveLength(0);
  });

  it('coupon is consumed in the transaction and concurrent orders cannot exceed its limit', async () => {
    await Coupon.create({
      code: 'SALE10',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 50000,
      usageLimitTotal: 1,
      usageLimitPerUser: 1,
    });
    const payload = {
      items: [{ productId, sku: 'AT-BASE-M', quantity: 1 }],
      shippingAddress: address(),
      couponCode: 'SALE10',
    };
    const [a, b] = await Promise.all([
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', randomUUID())
        .send(payload),
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user2Token}`)
        .set('Idempotency-Key', randomUUID())
        .send(payload),
    ]);
    const successes = [a, b].filter((r) => r.status === 201);
    expect(successes).toHaveLength(1);
    expect(successes[0].body.data.discount).toBe(20000);
    const coupon = await Coupon.findOne({ code: 'SALE10' });
    expect(coupon!.usedCount).toBe(1);
  });

  it('cancelling a PENDING coupon order refunds the coupon exactly once', async () => {
    await Coupon.create({
      code: 'SALE10',
      type: 'PERCENT',
      value: 10,
      maxDiscount: 50000,
    });
    const created = await createOrder(userToken, { couponCode: 'SALE10' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    await request(app)
      .post(`/api/v1/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    const coupon = await Coupon.findOne({ code: 'SALE10' });
    expect(coupon!.usedCount).toBe(0);
  });

  it('admin cannot silently delete a SKU referenced by an unfinished order', async () => {
    const created = await createOrder(userToken);
    expect(created.status).toBe(201);
    const product = await Product.findById(productId);
    const res = await request(app)
      .patch(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: product!.title,
        category: categoryId,
        brand: brandId,
        price: 200000,
        variants: [{ sku: 'AT-KHAC-M', color: 'Đen', size: 'M', quantity: 5 }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SKU_IN_USE_BY_ORDER');
  });
});
