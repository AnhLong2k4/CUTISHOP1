import { Schema, model, type Document, type Types } from 'mongoose';

export interface CouponDoc extends Document {
  _id: Types.ObjectId;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: number | null;
  minOrderAmount: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
  usageLimitTotal?: number | null;
  usageLimitPerUser?: number | null;
  usedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<CouponDoc>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
    type: { type: String, enum: ['PERCENT', 'FIXED'], required: true },
    value: {
      type: Number,
      required: true,
      min: [0, 'Coupon value must be >= 0'],
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'Coupon value must be an integer',
      },
    },
    maxDiscount: {
      type: Number,
      default: null,
      min: [0, 'maxDiscount must be >= 0'],
      validate: {
        validator: (v: number | null | undefined) =>
          v === null || v === undefined || Number.isInteger(v),
        message: 'maxDiscount must be an integer VND amount',
      },
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'minOrderAmount must be >= 0'],
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'minOrderAmount must be an integer VND amount',
      },
    },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    usageLimitTotal: {
      type: Number,
      default: null,
      min: [0, 'usageLimitTotal must be >= 0'],
      validate: {
        validator: (v: number | null | undefined) =>
          v === null || v === undefined || Number.isInteger(v),
        message: 'usageLimitTotal must be an integer',
      },
    },
    usageLimitPerUser: {
      type: Number,
      default: null,
      min: [0, 'usageLimitPerUser must be >= 0'],
      validate: {
        validator: (v: number | null | undefined) =>
          v === null || v === undefined || Number.isInteger(v),
        message: 'usageLimitPerUser must be an integer',
      },
    },
    usedCount: {
      type: Number,
      default: 0,
      min: [0, 'usedCount must be >= 0'],
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'usedCount must be an integer',
      },
    },
  },
  { timestamps: true },
);

couponSchema.index({ code: 1 }, { unique: true });

couponSchema.pre('validate', function validateCoupon(this: CouponDoc, next) {
  if (this.type === 'PERCENT') {
    if (this.value < 1 || this.value > 100) {
      this.invalidate('value', 'PERCENT coupon value must be between 1 and 100');
    }
    if (this.maxDiscount === null || this.maxDiscount === undefined) {
      this.invalidate('maxDiscount', 'PERCENT coupon requires maxDiscount');
    }
  }
  if (this.startsAt && this.endsAt && this.startsAt > this.endsAt) {
    this.invalidate('endsAt', 'Coupon end must be after coupon start');
  }
  next();
});

export function toPublicCoupon(coupon: CouponDoc) {
  return {
    id: coupon._id.toString(),
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    maxDiscount: coupon.maxDiscount ?? undefined,
    minOrderAmount: coupon.minOrderAmount,
    startsAt: coupon.startsAt?.toISOString(),
    endsAt: coupon.endsAt?.toISOString(),
    isActive: coupon.isActive,
    usageLimitTotal: coupon.usageLimitTotal ?? undefined,
    usageLimitPerUser: coupon.usageLimitPerUser ?? undefined,
    usedCount: coupon.usedCount,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

export const Coupon = model<CouponDoc>('Coupon', couponSchema);
