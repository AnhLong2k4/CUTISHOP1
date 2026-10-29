import { Types } from 'mongoose';
import { Coupon, toPublicCoupon } from '../models/Coupon.js';
import { CouponRedemption } from '../models/CouponRedemption.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { buildPageMeta, parsePagination } from '../utils/pagination.js';

export interface CouponInput {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: number | null;
  minOrderAmount?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number | null;
}

function assertObjectId(value: string) {
  if (!Types.ObjectId.isValid(value)) throw badRequest('ID mã giảm giá không hợp lệ', 'INVALID_ID');
}

export async function createCoupon(input: CouponInput) {
  const doc = await Coupon.create({
    code: input.code.trim().toUpperCase(),
    type: input.type,
    value: input.value,
    maxDiscount: input.maxDiscount ?? null,
    minOrderAmount: input.minOrderAmount ?? 0,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    isActive: input.isActive ?? true,
    usageLimitTotal: input.usageLimitTotal ?? null,
    usageLimitPerUser: input.usageLimitPerUser ?? null,
  });
  return toPublicCoupon(doc);
}

export async function listCoupons(query: { page?: number; limit?: number }) {
  const pagination = parsePagination(query);
  const total = await Coupon.countDocuments({});
  const docs = await Coupon.find({}).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit);
  return { items: docs.map(toPublicCoupon), pagination: buildPageMeta(total, pagination) };
}

export async function getCoupon(id: string) {
  assertObjectId(id);
  const doc = await Coupon.findById(id);
  if (!doc) throw notFound('Không tìm thấy mã giảm giá');
  return toPublicCoupon(doc);
}

export async function updateCoupon(id: string, input: Partial<CouponInput>) {
  assertObjectId(id);
  const doc = await Coupon.findById(id);
  if (!doc) throw notFound('Không tìm thấy mã giảm giá');
  if (input.code !== undefined) doc.code = input.code.trim().toUpperCase();
  if (input.type !== undefined) doc.type = input.type;
  if (input.value !== undefined) doc.value = input.value;
  if (input.maxDiscount !== undefined) doc.maxDiscount = input.maxDiscount;
  if (input.minOrderAmount !== undefined) doc.minOrderAmount = input.minOrderAmount;
  if (input.startsAt !== undefined) doc.startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (input.endsAt !== undefined) doc.endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.isActive !== undefined) doc.isActive = input.isActive;
  if (input.usageLimitTotal !== undefined) doc.usageLimitTotal = input.usageLimitTotal;
  if (input.usageLimitPerUser !== undefined) doc.usageLimitPerUser = input.usageLimitPerUser;
  await doc.save();
  return toPublicCoupon(doc);
}

export async function deleteCoupon(id: string) {
  assertObjectId(id);
  const doc = await Coupon.findById(id);
  if (!doc) throw notFound('Không tìm thấy mã giảm giá');
  const used = await CouponRedemption.countDocuments({ coupon: doc._id });
  if (doc.usedCount > 0 || used > 0) {
    throw conflict('Mã đã được sử dụng, không thể xóa. Hãy vô hiệu hóa thay vì xóa.', 'COUPON_IN_USE');
  }
  await doc.deleteOne();
  return { id };
}
