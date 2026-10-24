import { Types } from 'mongoose';
import { badRequest } from './errors.js';

export interface ProductQueryInput {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  size?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sale?: boolean;
  sort?: string;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  priceAsc: { price: 1 },
  priceDesc: { price: -1 },
  nameAsc: { title: 1 },
  nameDesc: { title: -1 },
};

export const PRODUCT_SORT_NAMES = Object.keys(SORTS);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function objectId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw badRequest(`${field} không hợp lệ`, 'INVALID_QUERY');
  }
  return new Types.ObjectId(value);
}

/**
 * Build a safe MongoDB filter + sort for the public product list.
 * Only active products are ever returned. Variant conditions that
 * must hold for the SAME variant are combined in one $elemMatch.
 */
export function buildProductFilter(query: ProductQueryInput): Record<string, unknown> {
  const filter: Record<string, unknown> = { isActive: true };

  if (query.search) {
    filter.title = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
  }
  if (query.category) filter.category = objectId(query.category, 'category');
  if (query.brand) filter.brand = objectId(query.brand, 'brand');

  const variantMatch: Record<string, unknown> = {};
  if (query.size) variantMatch.size = query.size;
  if (query.color) variantMatch.color = { $regex: `^${escapeRegex(query.color)}$`, $options: 'i' };
  if (query.inStock) variantMatch.quantity = { $gt: 0 };
  if (Object.keys(variantMatch).length > 0) {
    filter.variants = { $elemMatch: variantMatch };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (query.minPrice !== undefined) range.$gte = query.minPrice;
    if (query.maxPrice !== undefined) range.$lte = query.maxPrice;
    // A product matches when its base price, sale price, or any
    // variant override falls inside the requested range.
    filter.$or = [
      { price: range },
      { salePrice: range },
      { 'variants.price': range },
    ];
  }

  if (query.sale) {
    // Match isSaleActive() exactly: sale price set, below base price,
    // and the current time inside the optional sale window.
    const now = new Date();
    filter.$expr = {
      $and: [
        { $lt: ['$salePrice', '$price'] },
        {
          $or: [
            { $eq: ['$saleStartsAt', null] },
            { $lte: ['$saleStartsAt', now] },
          ],
        },
        {
          $or: [
            { $eq: ['$saleEndsAt', null] },
            { $gte: ['$saleEndsAt', now] },
          ],
        },
      ],
    };
  }

  return filter;
}

export function buildProductSort(sort?: string): Record<string, 1 | -1> {
  if (!sort) return SORTS.newest;
  const resolved = SORTS[sort];
  if (!resolved) {
    throw badRequest(
      `sort phải là một trong: ${PRODUCT_SORT_NAMES.join(', ')}`,
      'INVALID_QUERY',
    );
  }
  return resolved;
}
