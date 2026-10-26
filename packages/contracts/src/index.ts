// Shared types and pure helpers for CUTISHOP1 frontends and API client.
// These mirror the backend API response shapes (API version v1).

export type Role = 'user' | 'admin';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  sku: string;
  color?: string;
  size?: string;
  /** Variant price override in integer VND; undefined = inherit product price. */
  price?: number;
  quantity: number;
  /** Computed by the API: final price for this variant in integer VND. */
  effectivePrice: number;
  inStock: boolean;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description?: string;
  category: Category | string;
  brand?: Brand | string;
  /** Base price in integer VND. */
  price: number;
  /** Sale price in integer VND when a valid sale is configured. */
  salePrice?: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
  images: string[];
  isActive: boolean;
  variants: ProductVariant[];
  /** Computed by the API. */
  priceRange: { min: number; max: number };
  /** Computed by the API: true while a valid sale applies. */
  onSale: boolean;
  /** Computed by the API: sum of variant quantities. */
  totalStock: number;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ProductSort =
  | 'newest'
  | 'oldest'
  | 'priceAsc'
  | 'priceDesc'
  | 'nameAsc'
  | 'nameDesc';

export interface ProductQuery {
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
  sort?: ProductSort;
}

export interface ProductInput {
  title: string;
  description?: string;
  category: string;
  brand?: string;
  price: number;
  salePrice?: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
  images?: string[];
  isActive?: boolean;
  variants: Array<{
    sku: string;
    color?: string;
    size?: string;
    price?: number;
    quantity: number;
  }>;
}

/** Format an integer VND amount for display, e.g. 199000 -> "199.000 ₫". */
export function formatVND(amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new Error('formatVND expects an integer VND amount');
  }
  return `${amount.toLocaleString('vi-VN')} ₫`;
}
