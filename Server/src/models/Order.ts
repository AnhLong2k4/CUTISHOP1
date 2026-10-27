import { Schema, model, type Document, type SchemaTypeOptions, type Types } from 'mongoose';
import type { OrderStatus, PaymentStatus } from '../utils/orderStatus.js';

export interface OrderItem {
  productId: Types.ObjectId;
  productTitle: string;
  sku: string;
  color?: string;
  size?: string;
  unitPrice: number;
  quantity: number;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  note?: string;
}

export interface StatusHistoryEntry {
  from: string | null;
  to: string;
  by: Types.ObjectId | null;
  role: string | null;
  reason?: string;
  at: Date;
}

export interface OrderDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  couponCode?: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: 'COD';
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  idempotencyKey: string;
  idempotencyFingerprint: string;
  reservationExpiresAt: Date;
  deliveredAt?: Date | null;
  statusHistory: StatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const integerVND: SchemaTypeOptions<number> = {
  type: Number,
  min: [0, 'Amount must be >= 0'],
  validate: {
    validator: (v: number) => Number.isInteger(v),
    message: 'Amount must be an integer VND amount',
  },
};

const orderItemSchema = new Schema<OrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productTitle: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, maxlength: 64 },
    color: { type: String, trim: true, maxlength: 40 },
    size: { type: String, trim: true, maxlength: 20 },
    unitPrice: { ...integerVND, required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Order quantity must be >= 1'],
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'Order quantity must be an integer',
      },
    },
  },
  { _id: false },
);

const statusHistorySchema = new Schema<StatusHistoryEntry>(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, default: null },
    reason: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      address: { type: String, required: true, trim: true, maxlength: 500 },
      note: { type: String, trim: true, maxlength: 500 },
    },
    couponCode: { type: String, trim: true, uppercase: true, default: null, maxlength: 50 },
    subtotal: { ...integerVND, required: true },
    discount: { ...integerVND, required: true },
    shipping: { ...integerVND, required: true },
    total: { ...integerVND, required: true },
    paymentMethod: { type: String, enum: ['COD'], default: 'COD' },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID_ON_DELIVERY', 'REFUNDED'],
      default: 'UNPAID',
      index: true,
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'SHIPPING',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'DELIVERY_FAILED',
        'RETURN_REQUESTED',
        'RETURNED',
        'REFUNDED',
      ],
      default: 'PENDING',
      index: true,
    },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 100 },
    idempotencyFingerprint: { type: String, required: true, trim: true, maxlength: 100 },
    reservationExpiresAt: { type: Date, required: true, index: true },
    deliveredAt: { type: Date, default: null },
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'items.sku': 1 });

export function toPublicOrder(order: OrderDoc) {
  return {
    id: order._id.toString(),
    user: order.user.toString(),
    items: order.items.map((item) => ({
      productId: item.productId.toString(),
      productTitle: item.productTitle,
      sku: item.sku,
      color: item.color,
      size: item.size,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.unitPrice * item.quantity,
    })),
    shippingAddress: order.shippingAddress,
    couponCode: order.couponCode ?? undefined,
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    reservationExpiresAt: order.reservationExpiresAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    statusHistory: order.statusHistory.map((h) => ({
      from: h.from,
      to: h.to,
      by: h.by?.toString() ?? null,
      role: h.role,
      reason: h.reason,
      at: h.at.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export const Order = model<OrderDoc>('Order', orderSchema);
