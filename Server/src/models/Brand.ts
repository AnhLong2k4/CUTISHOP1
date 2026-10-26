import { Schema, model, type Document, type Types } from 'mongoose';

export interface BrandDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<BrandDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

brandSchema.index({ slug: 1 }, { unique: true });

export function toPublicBrand(brand: BrandDoc, productCount?: number) {
  return {
    id: brand._id.toString(),
    name: brand.name,
    slug: brand.slug,
    isActive: brand.isActive,
    ...(productCount !== undefined ? { productCount } : {}),
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

export const Brand = model<BrandDoc>('Brand', brandSchema);
