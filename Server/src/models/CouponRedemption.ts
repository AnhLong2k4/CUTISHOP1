import { Schema, model, type Document, type Types } from 'mongoose';

export interface CouponRedemptionDoc extends Document {
  _id: Types.ObjectId;
  coupon: Types.ObjectId;
  user: Types.ObjectId;
  order: Types.ObjectId;
  status: 'USED' | 'VOIDED';
  createdAt: Date;
  updatedAt: Date;
}

const redemptionSchema = new Schema<CouponRedemptionDoc>(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    status: { type: String, enum: ['USED', 'VOIDED'], default: 'USED', index: true },
  },
  { timestamps: true },
);

redemptionSchema.index({ order: 1 }, { unique: true });
redemptionSchema.index({ coupon: 1, user: 1, status: 1 });

export const CouponRedemption = model<CouponRedemptionDoc>(
  'CouponRedemption',
  redemptionSchema,
);
