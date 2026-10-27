import type { Product, ProductVariant } from '@cutishop1/contracts';

/**
 * Variant selection, mirroring the storefront detail page: a variant is
 * identified by its SKU, and colour/size pickers narrow it down. Returns
 * null when the combination does not exist (e.g. a sold-out colour/size
 * pair was removed from the product).
 */
export function selectVariant(
  product: Product,
  color: string | undefined,
  size: string | undefined,
): ProductVariant | null {
  const variants = product.variants ?? [];
  if (color !== undefined && size !== undefined) {
    return (
      variants.find((v) => v.color === color && v.size === size) ?? null
    );
  }
  if (color !== undefined) {
    return variants.find((v) => v.color === color) ?? null;
  }
  if (size !== undefined) {
    return variants.find((v) => v.size === size) ?? null;
  }
  return variants[0] ?? null;
}

export function uniqueValues(
  variants: ProductVariant[],
  key: 'color' | 'size',
): string[] {
  const seen = new Set<string>();
  for (const variant of variants) {
    const value = variant[key];
    if (value) seen.add(value);
  }
  return [...seen];
}
