import { createHash } from 'node:crypto';

export interface FingerprintItem {
  productId: string;
  sku: string;
  quantity: number;
}

export interface FingerprintAddress {
  name: string;
  phone: string;
  address: string;
  note?: string;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Canonical payload fingerprint for idempotency (ADR section 5).
 * Items are merged and sorted by (productId, sku) before hashing, so
 * item order does not change the fingerprint. Shipping and totals are
 * NOT part of the fingerprint because the server recomputes them.
 */
export function buildOrderFingerprint(input: {
  items: FingerprintItem[];
  address: FingerprintAddress;
  couponCode?: string | null;
  paymentMethod: string;
}): string {
  const merged = new Map<string, FingerprintItem>();
  for (const item of input.items) {
    const key = `${item.productId}:${item.sku}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += item.quantity;
    else merged.set(key, { ...item });
  }
  const sorted = [...merged.values()].sort((a, b) =>
    `${a.productId}:${a.sku}`.localeCompare(`${b.productId}:${b.sku}`),
  );
  const canonical = JSON.stringify({
    items: sorted,
    address: {
      name: normalizeText(input.address.name),
      phone: normalizeText(input.address.phone),
      address: normalizeText(input.address.address),
      note: input.address.note ? normalizeText(input.address.note) : '',
    },
    couponCode: input.couponCode ? input.couponCode.trim().toUpperCase() : null,
    paymentMethod: input.paymentMethod,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
