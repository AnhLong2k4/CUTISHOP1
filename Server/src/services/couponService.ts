import type { ClientSession, Types } from 'mongoose';
import { Coupon, type CouponDoc } from '../models/Coupon.js';
import { CouponRedemption } from '../models/CouponRedemption.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

export function normalizeCouponCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return normalized ? normalized : null;
}

/**
 * Validate a coupon against a subtotal, without consuming it.
 * Used by quote (no consumption) and again inside the order transaction.
 */
export async function validateCoupon(
  code: string | null,
  subtotal: number,
  session?: ClientSession,
): Promise<CouponDoc | null> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  const query = Coupon.findOne({ code: normalized });
  if (session) query.session(session);
  const coupon = await query;
  if (!coupon) throw notFound('Mã giảm giá không tồn tại', 'COUPON_NOT_FOUND');
  if (!coupon.isActive) throw badRequest('Mã giảm giá đã ngừng hoạt động', 'COUPON_INACTIVE');
  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    throw badRequest('Mã giảm giá chưa đến thời gian áp dụng', 'COUPON_NOT_STARTED');
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    throw badRequest('Mã giảm giá đã hết hạn', 'COUPON_EXPIRED');
  }
  if (subtotal < coupon.minOrderAmount) {
    throw badRequest('Đơn hàng chưa đạt giá trị tối thiểu của mã', 'COUPON_MIN_ORDER');
  }
  return coupon;
}

function couponLimitError(): Error {
  return conflict('Mã giảm giá đã hết lượt sử dụng', 'COUPON_EXHAUSTED');
}

/**
 * Consume one use of a coupon inside the order transaction. The caller
 * must already be inside a transaction; the conditional increment and
 * the redemption record together keep concurrent orders from exceeding
 * the total and per-user limits.
 */
export async function consumeCoupon(
  session: ClientSession,
  coupon: CouponDoc,
  userId: Types.ObjectId | string,
  orderId: Types.ObjectId | string,
): Promise<void> {
  if (coupon.usageLimitTotal !== null && coupon.usageLimitTotal !== undefined) {
    const updated = await Coupon.updateOne(
      { _id: coupon._id, usedCount: { $lt: coupon.usageLimitTotal } },
      { $inc: { usedCount: 1 } },
      { session },
    );
    if (updated.modifiedCount !== 1) throw couponLimitError();
  } else {
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } }, { session });
  }
  if (coupon.usageLimitPerUser !== null && coupon.usageLimitPerUser !== undefined) {
    const usedByUser = await CouponRedemption.countDocuments({
      coupon: coupon._id,
      user: userId,
      status: 'USED',
    }).session(session);
    if (usedByUser >= coupon.usageLimitPerUser) {
      throw couponLimitError();
    }
  }
  await CouponRedemption.create(
    [{ coupon: coupon._id, user: userId, order: orderId, status: 'USED' }],
    { session },
  );
}

/**
 * Release a coupon use exactly once. Only a USED redemption for this
 * order can transition to VOIDED, and usedCount is decremented only
 * when that transition happens. A second cancel is a no-op before
 * this function is reached, and this guard is the second layer.
 */
export async function releaseCoupon(
  session: ClientSession,
  orderId: Types.ObjectId | string,
): Promise<boolean> {
  const redemption = await CouponRedemption.findOne({ order: orderId }).session(session);
  if (!redemption || redemption.status !== 'USED') return false;
  redemption.status = 'VOIDED';
  await redemption.save({ session });
  await Coupon.updateOne(
    { _id: redemption.coupon, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    { session },
  );
  return true;
}
