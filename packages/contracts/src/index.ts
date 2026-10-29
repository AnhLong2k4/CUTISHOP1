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
  /** Quantity held for non-terminal orders; 0 for products without orders. */
  reserved?: number;
  /** Computed by the API: quantity - reserved. */
  available?: number;
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
  /** Computed by the API: sum of (quantity - reserved). */
  totalAvailable?: number;
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

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'REFUNDED';

export type PaymentStatus = 'UNPAID' | 'PAID_ON_DELIVERY' | 'REFUNDED';

export interface CartItemInput {
  productId: string;
  sku: string;
  quantity: number;
}

export interface Cart {
  user: string;
  items: CartItemInput[];
}

export interface QuoteLine {
  productId: string;
  productTitle: string;
  sku: string;
  color?: string;
  size?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: number;
}

export interface Quote {
  items: QuoteLine[];
  couponCode?: string | null;
  subtotal: number;
  discount: number;
  subtotalAfterDiscount: number;
  shipping: number;
  total: number;
  canOrder: boolean;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  note?: string;
}

export interface OrderItem {
  productId: string;
  productTitle: string;
  sku: string;
  color?: string;
  size?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderStatusHistoryEntry {
  from: string | null;
  to: string;
  by: string | null;
  role: string | null;
  reason?: string;
  at: string;
}

export interface Order {
  id: string;
  user: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  couponCode?: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: 'COD';
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  reservationExpiresAt: string;
  deliveredAt?: string;
  statusHistory: OrderStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
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
