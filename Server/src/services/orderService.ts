import mongoose, { Types } from 'mongoose';
import { loadEnv } from '../config/env.js';
import { Order, toPublicOrder, type OrderDoc } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { buildPageMeta, parsePagination } from '../utils/pagination.js';
import { calculateOrderTotals } from '../utils/pricing.js';
import { buildOrderFingerprint } from '../utils/orderFingerprint.js';
import {
  canTransition,
  canTransitionByRole,
  type OrderStatus,
} from '../utils/orderStatus.js';
import { normalizeLines, resolveLines } from './cartService.js';
import { consumeCoupon, normalizeCouponCode, releaseCoupon, validateCoupon } from './couponService.js';
import {
  releaseInventory,
  reserveInventory,
  restockInventory,
  saleInventory,
} from './inventoryService.js';

export interface OrderCreateInput {
  items: Array<{ productId: string; sku: string; quantity: number }>;
  shippingAddress: { name: string; phone: string; address: string; note?: string };
  couponCode?: string | null;
  idempotencyKey: string;
}

function isReplicaSetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('replica set') ||
    message.includes('Transaction numbers are only allowed')
  );
}

function isTransientTransactionError(error: unknown): boolean {
  const err = error as { code?: number; errorLabels?: string[]; message?: string };
  return (
    err?.errorLabels?.includes('TransientTransactionError') === true ||
    err?.code === 112 || // WriteConflict
    (typeof err?.message === 'string' && err.message.includes('WriteConflict'))
  );
}

function shippingConfig() {
  const env = loadEnv();
  return {
    shippingFeeVnd: env.SHIPPING_FEE_VND,
    shippingFreeThresholdVnd: env.SHIPPING_FREE_THRESHOLD_VND ?? null,
  };
}

function toInventoryLines(order: OrderDoc) {
  return order.items.map((item) => ({
    productId: item.productId,
    sku: item.sku,
    quantity: item.quantity,
  }));
}

async function findOwnedOrder(
  userId: string,
  orderId: string,
  session?: mongoose.ClientSession,
): Promise<OrderDoc> {
  if (!Types.ObjectId.isValid(orderId)) throw badRequest('ID đơn hàng không hợp lệ', 'INVALID_ID');
  const query = Order.findById(orderId);
  if (session) query.session(session);
  const order = await query;
  // Ownership is checked by scoping to the user; a missing or foreign
  // order is reported as 404 so one user cannot probe another's orders.
  if (!order || order.user.toString() !== userId) throw notFound('Không tìm thấy đơn hàng');
  return order;
}

export async function createOrder(
  userId: string,
  input: OrderCreateInput,
): Promise<{ order: ReturnType<typeof toPublicOrder>; created: boolean }> {
  const normalized = normalizeLines(input.items);
  if (normalized.length === 0) throw badRequest('Đơn hàng cần ít nhất một sản phẩm', 'EMPTY_ORDER');
  const couponCode = normalizeCouponCode(input.couponCode);
  const fingerprint = buildOrderFingerprint({
    items: normalized,
    address: input.shippingAddress,
    couponCode,
    paymentMethod: 'COD',
  });

  // Fast path outside the transaction: return the original order on retry.
  const existing = await Order.findOne({ user: userId, idempotencyKey: input.idempotencyKey });
  if (existing) {
    if (existing.idempotencyFingerprint !== fingerprint) {
      throw conflict(
        'Idempotency-Key đã được dùng cho một đơn hàng khác',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    return { order: toPublicOrder(existing), created: false };
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const session = await mongoose.startSession();
    try {
      let createdOrder: OrderDoc | null = null;
      let isNew = false;
      await session.withTransaction(async () => {
        // Re-check inside the transaction: two concurrent requests with
        // the same key can both pass the fast path; the unique index
        // makes only one insert win, and the loser re-reads here.
        const inside = await Order.findOne({
          user: userId,
          idempotencyKey: input.idempotencyKey,
        }).session(session);
        if (inside) {
          if (inside.idempotencyFingerprint !== fingerprint) {
            throw conflict(
              'Idempotency-Key đã được dùng cho một đơn hàng khác',
              'IDEMPOTENCY_KEY_REUSED',
            );
          }
          createdOrder = inside;
          isNew = false;
          return;
        }

        const resolved = await resolveLines(normalized, session);
        // resolveLines does not use the session; prices are re-derived
        // from the catalog inside the transaction by re-reading products
        // below for stock, and the resolved prices are the catalog
        // prices at creation time. Stock is checked again in reserve.
        const subtotal = resolved.reduce((sum, line) => sum + line.lineTotal, 0);
        const coupon = await validateCoupon(couponCode, subtotal, session);
        const totals = calculateOrderTotals(
          resolved.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
          coupon
            ? { type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount ?? undefined }
            : null,
          shippingConfig(),
        );

        const env = loadEnv();
        const now = new Date();
        const orderId = new Types.ObjectId();
        const order = new Order({
          _id: orderId,
          user: userId,
          items: resolved.map((line) => ({
            productId: new Types.ObjectId(line.productId),
            productTitle: line.productTitle,
            sku: line.sku,
            color: line.color,
            size: line.size,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
          })),
          shippingAddress: input.shippingAddress,
          couponCode,
          subtotal: totals.subtotal,
          discount: totals.discount,
          shipping: totals.shipping,
          total: totals.total,
          paymentMethod: 'COD',
          paymentStatus: 'UNPAID',
          status: 'PENDING',
          idempotencyKey: input.idempotencyKey,
          idempotencyFingerprint: fingerprint,
          reservationExpiresAt: new Date(now.getTime() + env.RESERVATION_HOLD_HOURS * 3600 * 1000),
          statusHistory: [
            { from: null, to: 'PENDING', by: new Types.ObjectId(userId), role: 'user', at: now },
          ],
        });
        await order.save({ session });

        await reserveInventory(
          session,
          orderId,
          order.items.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            quantity: item.quantity,
          })),
          new Types.ObjectId(userId),
        );

        if (coupon) {
          await consumeCoupon(session, coupon, userId, orderId);
        }
        createdOrder = order;
        isNew = true;
      });
      if (!createdOrder) throw new Error('Order creation produced no order');
      return { order: toPublicOrder(createdOrder), created: isNew };
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError) {
        // Business errors (stock, coupon, idempotency conflict) are not
        // retried: retrying them cannot change the outcome.
        throw error;
      }
      if (isReplicaSetError(error)) {
        throw new ApiError(
          503,
          'TRANSACTION_NOT_SUPPORTED',
          'Tạo đơn yêu cầu MongoDB replica set. Không có đường lùi ghi không có transaction.',
        );
      }
      if (isTransientTransactionError(error) && attempt < 3) {
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

export async function listMyOrders(
  userId: string,
  query: { page?: number; limit?: number; status?: string },
) {
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = { user: userId };
  if (query.status) filter.status = query.status;
  const total = await Order.countDocuments(filter);
  const docs = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit);
  return { items: docs.map(toPublicOrder), pagination: buildPageMeta(total, pagination) };
}

export async function getMyOrder(userId: string, orderId: string) {
  const order = await findOwnedOrder(userId, orderId);
  return toPublicOrder(order);
}

async function transitionInTransaction(
  order: OrderDoc,
  to: OrderStatus,
  actorId: string | null,
  actorRole: string,
  reason: string | undefined,
  restock: boolean,
  session: mongoose.ClientSession,
): Promise<OrderDoc> {
  const from = order.status;
  if (from === to) return order; // no-op, safe for retries
  order.status = to;
  if (to === 'DELIVERED') {
    order.deliveredAt = new Date();
    order.paymentStatus = 'PAID_ON_DELIVERY';
  }
  if (to === 'REFUNDED') {
    order.paymentStatus = 'REFUNDED';
  }
  order.statusHistory.push({
    from,
    to,
    by: actorId ? new Types.ObjectId(actorId) : null,
    role: actorRole,
    reason,
    at: new Date(),
  });
  await order.save({ session });

  const lines = toInventoryLines(order);
  if (to === 'CANCELLED') {
    await releaseInventory(session, order._id, lines, actorId ? new Types.ObjectId(actorId) : null, actorRole, reason ?? 'Hủy đơn');
    if (from === 'PENDING' || from === 'CONFIRMED') {
      await releaseCoupon(session, order._id);
    }
  } else if (to === 'DELIVERED') {
    await saleInventory(session, order._id, lines, actorId ? new Types.ObjectId(actorId) : null);
  } else if (to === 'RETURNED' && restock) {
    await restockInventory(session, order._id, lines, actorId ? new Types.ObjectId(actorId) : null);
  }
  return order;
}

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: { id: string | null; role: 'owner' | 'admin'; userIdForOwnership?: string },
  reason?: string,
  restock = false,
  options?: { expectedFrom?: OrderStatus },
) {
  if (!Types.ObjectId.isValid(orderId)) throw badRequest('ID đơn hàng không hợp lệ', 'INVALID_ID');
  const session = await mongoose.startSession();
  try {
    let result: OrderDoc | null = null;
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw notFound('Không tìm thấy đơn hàng');
      if (actor.role === 'owner') {
        if (!actor.userIdForOwnership || order.user.toString() !== actor.userIdForOwnership) {
          throw notFound('Không tìm thấy đơn hàng');
        }
      }
      if (order.status === to) {
        result = order;
        return;
      }
      // Expiry (and similar jobs) must only act when the order is still
      // in the expected state at transaction time. Without this, a job
      // that found a PENDING order could cancel it after it was confirmed.
      if (options?.expectedFrom && order.status !== options.expectedFrom) {
        throw conflict(
          `Đơn không còn ở trạng thái ${options.expectedFrom}`,
          'ORDER_TRANSITION_INVALID',
        );
      }
      if (!canTransition(order.status, to)) {
        throw conflict(
          `Không thể chuyển đơn từ ${order.status} sang ${to}`,
          'ORDER_TRANSITION_INVALID',
        );
      }
      if (!canTransitionByRole(order.status, to, actor.role)) {
        throw forbidden('Bạn không có quyền thực hiện chuyển đổi này');
      }
      if (to === 'RETURN_REQUESTED' && order.deliveredAt) {
        const days = (Date.now() - order.deliveredAt.getTime()) / (24 * 3600 * 1000);
        if (days > 7) {
          throw conflict('Đã quá 7 ngày kể từ khi giao hàng, không thể yêu cầu trả hàng', 'RETURN_WINDOW_EXPIRED');
        }
      }
      if (to === 'REFUNDED' && order.paymentStatus !== 'PAID_ON_DELIVERY') {
        throw conflict('Chỉ hoàn tiền khi đơn đã thu tiền lúc giao hàng', 'REFUND_NOT_ALLOWED');
      }
      if (to === 'CONFIRMED' && order.status === 'PENDING') {
        // An expired PENDING order must never be revived (ADR 2.3).
        if (order.reservationExpiresAt.getTime() <= Date.now()) {
          throw conflict('Đơn đã hết hạn giữ kho, không thể xác nhận', 'RESERVATION_EXPIRED');
        }
      }
      result = await transitionInTransaction(
        order,
        to,
        actor.id,
        actor.role,
        reason,
        restock,
        session,
      );
    });
    if (!result) throw new Error('Order transition produced no order');
    return toPublicOrder(result);
  } finally {
    await session.endSession();
  }
}

export async function cancelMyOrder(userId: string, orderId: string, reason?: string) {
  return transitionOrder(
    orderId,
    'CANCELLED',
    { id: userId, role: 'owner', userIdForOwnership: userId },
    reason,
  );
}

export async function completeMyOrder(userId: string, orderId: string) {
  return transitionOrder(
    orderId,
    'COMPLETED',
    { id: userId, role: 'owner', userIdForOwnership: userId },
  );
}

export async function requestReturnMyOrder(userId: string, orderId: string, reason?: string) {
  return transitionOrder(
    orderId,
    'RETURN_REQUESTED',
    { id: userId, role: 'owner', userIdForOwnership: userId },
    reason,
  );
}

/** Expire PENDING orders whose reservation has lapsed. Idempotent. */
export async function expireReservations(now = new Date()): Promise<string[]> {
  const expired = await Order.find({
    status: 'PENDING',
    reservationExpiresAt: { $lte: now },
  }).select('_id');
  const expiredIds: string[] = [];
  for (const doc of expired) {
    try {
      // Re-check status inside the transition transaction; a concurrent
      // confirm/cancel wins and this call becomes a no-op or 409, which
      // we skip rather than failing the whole job.
      await transitionOrder(
        doc._id.toString(),
        'CANCELLED',
        { id: null, role: 'admin' },
        'RESERVATION_EXPIRED',
        false,
        { expectedFrom: 'PENDING' },
      );
      expiredIds.push(doc._id.toString());
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ORDER_TRANSITION_INVALID') {
        continue;
      }
      throw error;
    }
  }
  return expiredIds;
}

export async function listAdminOrders(query: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  const total = await Order.countDocuments(filter);
  const docs = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit);
  return { items: docs.map(toPublicOrder), pagination: buildPageMeta(total, pagination) };
}

export async function getAdminOrder(orderId: string) {
  if (!Types.ObjectId.isValid(orderId)) throw badRequest('ID đơn hàng không hợp lệ', 'INVALID_ID');
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  return toPublicOrder(order);
}

export async function adminTransitionOrder(
  adminId: string,
  orderId: string,
  to: OrderStatus,
  reason?: string,
  restock = false,
) {
  return transitionOrder(
    orderId,
    to,
    { id: adminId, role: 'admin' },
    reason,
    restock,
  );
}

// Re-export for callers that need the raw model in tests without a cycle.
export { Order, Product };
