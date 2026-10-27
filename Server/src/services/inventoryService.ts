import type { ClientSession, Types } from 'mongoose';
import { InventoryMovement } from '../models/InventoryMovement.js';
import { Product } from '../models/Product.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

export interface InventoryLine {
  productId: Types.ObjectId | string;
  sku: string;
  quantity: number;
}

async function findVariant(
  productId: Types.ObjectId | string,
  sku: string,
  session: ClientSession,
) {
  const product = await Product.findById(productId).session(session);
  if (!product) throw notFound('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
  if (!product.isActive) throw conflict('Sản phẩm đã ngừng bán', 'PRODUCT_INACTIVE');
  const variant = product.variants.find((v) => v.sku === sku);
  if (!variant) throw notFound('Không tìm thấy biến thể', 'VARIANT_NOT_FOUND');
  return { product, variant };
}

async function recordMovement(
  session: ClientSession,
  input: {
    productId: Types.ObjectId | string;
    sku: string;
    orderId: Types.ObjectId | string | null;
    type: 'RESERVE' | 'RELEASE' | 'SALE' | 'RESTOCK' | 'ADJUST';
    deltaReserved: number;
    deltaQuantity: number;
    idempotencyKey: string;
    reason: string;
    actor: Types.ObjectId | string | null;
    actorRole: string | null;
  },
) {
  // Unique index on idempotencyKey is the second layer of exactly-once
  // protection. The primary layer is the order status transition itself
  // (a second cancel/deliver is a no-op before inventory is touched).
  await InventoryMovement.create(
    [
      {
        productId: input.productId,
        sku: input.sku,
        orderId: input.orderId,
        type: input.type,
        deltaReserved: input.deltaReserved,
        deltaQuantity: input.deltaQuantity,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        actor: input.actor,
        actorRole: input.actorRole,
      },
    ],
    { session },
  );
}

/**
 * Reserve stock for a new order. Runs inside the order transaction.
 * Stock is checked from the transactional read; a concurrent transaction
 * touching the same product aborts with a write conflict and is retried
 * by the caller, at which point this check sees the new reserved count.
 */
export async function reserveInventory(
  session: ClientSession,
  orderId: Types.ObjectId | string,
  lines: InventoryLine[],
  actor: Types.ObjectId | string | null,
) {
  const insufficient: string[] = [];
  const resolved: Array<{ productId: Types.ObjectId; sku: string; quantity: number }> = [];
  for (const line of lines) {
    const { product, variant } = await findVariant(line.productId, line.sku, session);
    const available = (variant.quantity || 0) - (variant.reserved || 0);
    if (available < line.quantity) {
      insufficient.push(line.sku);
    } else {
      resolved.push({ productId: product._id, sku: line.sku, quantity: line.quantity });
    }
  }
  if (insufficient.length > 0) {
    throw conflict(
      `Không đủ tồn kho cho SKU: ${insufficient.join(', ')}`,
      'INSUFFICIENT_STOCK',
    );
  }
  for (const line of resolved) {
    await Product.updateOne(
      { _id: line.productId },
      { $inc: { 'variants.$[v].reserved': line.quantity } },
      { arrayFilters: [{ 'v.sku': line.sku }], session },
    );
    await recordMovement(session, {
      productId: line.productId,
      sku: line.sku,
      orderId,
      type: 'RESERVE',
      deltaReserved: line.quantity,
      deltaQuantity: 0,
      idempotencyKey: `order:${orderId}:reserve:${line.sku}`,
      reason: 'Giữ kho khi tạo đơn',
      actor,
      actorRole: 'user',
    });
  }
}

export async function releaseInventory(
  session: ClientSession,
  orderId: Types.ObjectId | string,
  lines: InventoryLine[],
  actor: Types.ObjectId | string | null,
  actorRole: string,
  reason: string,
) {
  for (const line of lines) {
    await Product.updateOne(
      { _id: line.productId },
      { $inc: { 'variants.$[v].reserved': -line.quantity } },
      { arrayFilters: [{ 'v.sku': line.sku }], session },
    );
    await recordMovement(session, {
      productId: line.productId,
      sku: line.sku,
      orderId,
      type: 'RELEASE',
      deltaReserved: -line.quantity,
      deltaQuantity: 0,
      idempotencyKey: `order:${orderId}:release:${line.sku}`,
      reason,
      actor,
      actorRole,
    });
  }
}

export async function saleInventory(
  session: ClientSession,
  orderId: Types.ObjectId | string,
  lines: InventoryLine[],
  actor: Types.ObjectId | string | null,
) {
  for (const line of lines) {
    await Product.updateOne(
      { _id: line.productId },
      {
        $inc: {
          'variants.$[v].reserved': -line.quantity,
          'variants.$[v].quantity': -line.quantity,
        },
      },
      { arrayFilters: [{ 'v.sku': line.sku }], session },
    );
    await recordMovement(session, {
      productId: line.productId,
      sku: line.sku,
      orderId,
      type: 'SALE',
      deltaReserved: -line.quantity,
      deltaQuantity: -line.quantity,
      idempotencyKey: `order:${orderId}:sale:${line.sku}`,
      reason: 'Giao hàng thành công, chuyển giữ sang đã bán',
      actor,
      actorRole: 'admin',
    });
  }
}

export async function restockInventory(
  session: ClientSession,
  orderId: Types.ObjectId | string,
  lines: InventoryLine[],
  actor: Types.ObjectId | string | null,
) {
  for (const line of lines) {
    await Product.updateOne(
      { _id: line.productId },
      { $inc: { 'variants.$[v].quantity': line.quantity } },
      { arrayFilters: [{ 'v.sku': line.sku }], session },
    );
    await recordMovement(session, {
      productId: line.productId,
      sku: line.sku,
      orderId,
      type: 'RESTOCK',
      deltaReserved: 0,
      deltaQuantity: line.quantity,
      idempotencyKey: `order:${orderId}:restock:${line.sku}`,
      reason: 'Trả hàng được duyệt và xác nhận còn bán được',
      actor,
      actorRole: 'admin',
    });
  }
}

export function assertValidLine(line: { quantity: number }) {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw badRequest('Số lượng phải là số nguyên >= 1', 'INVALID_QUANTITY');
  }
}
