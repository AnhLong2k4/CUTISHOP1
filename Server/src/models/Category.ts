import { Schema, model, type Document, type Types } from 'mongoose';

export interface CategoryDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

categorySchema.index({ slug: 1 }, { unique: true });

export function toPublicCategory(category: CategoryDoc, productCount?: number) {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: category.isActive,
    ...(productCount !== undefined ? { productCount } : {}),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export const Category = model<CategoryDoc>('Category', categorySchema);
