import { Schema, model, type Document, type SchemaTypeOptions, type Types } from 'mongoose';
import { effectivePrice, isSaleActive, priceRange, totalStock } from '../utils/pricing.js';

export interface ProductVariant {
  sku: string;
  color?: string;
  size?: string;
  /** Variant price override, integer VND. Undefined = inherit product price. */
  price?: number;
  quantity: number;
}

export interface ProductDoc extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  category: Types.ObjectId;
  brand?: Types.ObjectId | null;
  /** Base price, integer VND. */
  price: number;
  salePrice?: number | null;
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
  images: string[];
  isActive: boolean;
  variants: ProductVariant[];
  createdAt: Date;
  updatedAt: Date;
}

const integerVND = (field: string): SchemaTypeOptions<number> => ({
  type: Number,
  min: [0, `${field} must be >= 0`],
  validate: {
    validator: (value: number | null | undefined) =>
      value === null || value === undefined || Number.isInteger(value),
    message: `${field} must be an integer VND amount`,
  },
});

const variantSchema = new Schema<ProductVariant>(
  {
    sku: { type: String, required: true, trim: true, minlength: 1, maxlength: 64 },
    color: { type: String, trim: true, maxlength: 40 },
    size: { type: String, trim: true, maxlength: 20 },
    price: { ...integerVND('Variant price') },
    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Variant quantity must be >= 0'],
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'Variant quantity must be an integer',
      },
    },
  },
  { _id: false },
);

const productSchema = new Schema<ProductDoc>(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 5000 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', default: null },
    price: { ...integerVND('Product price'), required: true },
    salePrice: { ...integerVND('Sale price'), default: null },
    saleStartsAt: { type: Date, default: null },
    saleEndsAt: { type: Date, default: null },
    images: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    variants: { type: [variantSchema], default: [] },
  },
  { timestamps: true },
);

productSchema.index({ slug: 1 }, { unique: true });
// SKUs are unique across the whole catalog (multikey unique index).
productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ brand: 1, createdAt: -1 });
productSchema.index({ createdAt: -1 });

productSchema.pre('validate', function validateSale(this: ProductDoc, next) {
  if (
    this.salePrice !== undefined &&
    this.salePrice !== null &&
    this.salePrice >= this.price
  ) {
    this.invalidate('salePrice', 'Sale price must be lower than the base price');
  }
  if (this.saleStartsAt && this.saleEndsAt && this.saleStartsAt > this.saleEndsAt) {
    this.invalidate('saleEndsAt', 'Sale end must be after sale start');
  }
  next();
});

interface PopulatedRef {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  isActive?: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

function refView(ref: unknown): unknown {
  if (!ref || typeof ref !== 'object') return ref;
  const value = ref as PopulatedRef & { toPublic?: unknown };
  if (value._id && value.name) {
    return {
      id: value._id.toString(),
      name: value.name,
      slug: value.slug,
      ...(value.description !== undefined ? { description: value.description } : {}),
      isActive: value.isActive ?? true,
      createdAt: value.createdAt?.toISOString?.() ?? value.createdAt,
      updatedAt: value.updatedAt?.toISOString?.() ?? value.updatedAt,
    };
  }
  return String(value);
}

/**
 * Public/admin product view: computed prices and stock are added here
 * so clients never re-derive (or mis-derive) the pricing rules.
 */
export function toPublicProduct(product: ProductDoc, now: Date = new Date()) {
  const plain = {
    price: product.price,
    salePrice: product.salePrice ?? undefined,
    saleStartsAt: product.saleStartsAt,
    saleEndsAt: product.saleEndsAt,
    variants: product.variants.map((v) => ({
      price: v.price,
      quantity: v.quantity,
    })),
  };
  return {
    id: product._id.toString(),
    title: product.title,
    slug: product.slug,
    description: product.description,
    category: refView(product.category),
    brand: product.brand ? refView(product.brand) : undefined,
    price: product.price,
    salePrice: product.salePrice ?? undefined,
    saleStartsAt: product.saleStartsAt?.toISOString(),
    saleEndsAt: product.saleEndsAt?.toISOString(),
    images: product.images,
    isActive: product.isActive,
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      price: variant.price,
      quantity: variant.quantity,
      effectivePrice: effectivePrice(plain, variant, now),
      inStock: variant.quantity > 0,
    })),
    priceRange: priceRange(plain, now),
    onSale: isSaleActive(plain, now),
    totalStock: totalStock(plain),
    inStock: totalStock(plain) > 0,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const Product = model<ProductDoc>('Product', productSchema);
