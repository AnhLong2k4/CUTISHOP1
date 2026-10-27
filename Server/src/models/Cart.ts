import { Schema, model, type Document, type Types } from 'mongoose';

export interface CartItem {
  productId: Types.ObjectId;
  sku: string;
  quantity: number;
}

export interface CartDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<CartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true, trim: true, maxlength: 64 },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Cart quantity must be >= 1'],
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'Cart quantity must be an integer',
      },
    },
  },
  { _id: false },
);

const cartSchema = new Schema<CartDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true },
);

cartSchema.index({ user: 1 }, { unique: true });

export function toPublicCart(cart: CartDoc | null, userId: string) {
  return {
    user: userId,
    items: (cart?.items ?? []).map((item) => ({
      productId: item.productId.toString(),
      sku: item.sku,
      quantity: item.quantity,
    })),
  };
}

export const Cart = model<CartDoc>('Cart', cartSchema);
