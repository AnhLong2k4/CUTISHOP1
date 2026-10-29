/**
 * Pricing rules (single source of truth for the whole project):
 * - All prices are integer VND amounts; floats are never valid prices.
 * - A variant price override wins over the product price.
 * - A product sale applies only when salePrice is set, lower than the
 *   base price, and the current time is inside the optional sale window.
 * - A sale NEVER stacks on top of a variant price override.
 */

export interface PriceCarrier {
  price: number;
  salePrice?: number | null;
  saleStartsAt?: Date | string | null;
  saleEndsAt?: Date | string | null;
}

export interface VariantCarrier {
  price?: number | null;
  quantity: number;
}

export function assertIntegerVND(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer VND amount`);
  }
}

export function isSaleActive(product: PriceCarrier, now: Date = new Date()): boolean {
  if (product.salePrice === undefined || product.salePrice === null) return false;
  if (product.salePrice >= product.price) return false;
  if (product.saleStartsAt && now < new Date(product.saleStartsAt)) return false;
  if (product.saleEndsAt && now > new Date(product.saleEndsAt)) return false;
  return true;
}

/** Final price of one variant (or of the product itself when no variant). */
export function effectivePrice(
  product: PriceCarrier,
  variant?: VariantCarrier | null,
  now: Date = new Date(),
): number {
  if (variant && variant.price !== undefined && variant.price !== null) {
    return variant.price;
  }
  return isSaleActive(product, now) ? (product.salePrice as number) : product.price;
}

export function priceRange(
  product: PriceCarrier & { variants: VariantCarrier[] },
  now: Date = new Date(),
): { min: number; max: number } {
  if (!product.variants || product.variants.length === 0) {
    const single = effectivePrice(product, null, now);
    return { min: single, max: single };
  }
  const prices = product.variants.map((variant) => effectivePrice(product, variant, now));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function totalStock(product: { variants: VariantCarrier[] }): number {
  return (product.variants ?? []).reduce((sum, variant) => sum + (variant.quantity || 0), 0);
}

export interface ShippingConfig {
  shippingFeeVnd: number;
  shippingFreeThresholdVnd?: number | null;
}

export interface CouponForPricing {
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount?: number | null;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  subtotalAfterDiscount: number;
  shipping: number;
  total: number;
}

/**
 * Server-only shipping rule (ADR section 4.3). The client never supplies
 * a shipping amount. Demo default config is fee 0, so shipping is 0.
 */
export function calculateShipping(
  subtotalAfterDiscount: number,
  config: ShippingConfig,
): number {
  assertIntegerVND(subtotalAfterDiscount, 'Subtotal after discount');
  assertIntegerVND(config.shippingFeeVnd, 'Shipping fee');
  if (
    config.shippingFreeThresholdVnd !== undefined &&
    config.shippingFreeThresholdVnd !== null &&
    config.shippingFreeThresholdVnd > 0 &&
    subtotalAfterDiscount >= config.shippingFreeThresholdVnd
  ) {
    return 0;
  }
  return config.shippingFeeVnd;
}

/**
 * Order totals in the exact ADR order: subtotal -> discount -> shipping
 * -> total. All integer VND. Percent discount uses integer floor
 * division, never floating point, so the result is deterministic and
 * has no fractional dong.
 */
export function calculateOrderTotals(
  lines: Array<{ unitPrice: number; quantity: number }>,
  coupon: CouponForPricing | null,
  shippingConfig: ShippingConfig,
): OrderTotals {
  for (const line of lines) {
    assertIntegerVND(line.unitPrice, 'Unit price');
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      throw new Error('Quantity must be a non-negative integer');
    }
  }
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  let discount = 0;
  if (coupon) {
    if (coupon.type === 'PERCENT') {
      discount = Math.floor((subtotal * coupon.value) / 100);
      if (coupon.maxDiscount !== undefined && coupon.maxDiscount !== null) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = coupon.value;
    }
    discount = Math.min(Math.max(0, discount), subtotal);
  }
  const subtotalAfterDiscount = subtotal - discount;
  const shipping = calculateShipping(subtotalAfterDiscount, shippingConfig);
  const total = subtotalAfterDiscount + shipping;
  return { subtotal, discount, subtotalAfterDiscount, shipping, total };
}
