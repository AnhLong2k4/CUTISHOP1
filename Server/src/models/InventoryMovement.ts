import { Schema, model, type Document, type Types } from 'mongoose';

export type MovementType = 'RESERVE' | 'RELEASE' | 'SALE' | 'RESTOCK' | 'ADJUST';

export interface InventoryMovementDoc extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  sku: string;
  orderId?: Types.ObjectId | null;
  type: MovementType;
  deltaReserved: number;
  deltaQuantity: number;
  idempotencyKey: string;
  reason: string;
  actor?: Types.ObjectId | null;
  actorRole?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const movementSchema = new Schema<InventoryMovementDoc>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true, trim: true, maxlength: 64 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    type: {
      type: String,
      enum: ['RESERVE', 'RELEASE', 'SALE', 'RESTOCK', 'ADJUST'],
      required: true,
    },
    deltaReserved: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'deltaReserved must be an integer',
      },
    },
    deltaQuantity: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'deltaQuantity must be an integer',
      },
    },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null, maxlength: 50 },
  },
  { timestamps: true },
);

movementSchema.index({ idempotencyKey: 1 }, { unique: true });
movementSchema.index({ productId: 1, sku: 1, createdAt: -1 });

export const InventoryMovement = model<InventoryMovementDoc>(
  'InventoryMovement',
  movementSchema,
);
