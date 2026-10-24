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
