import type { CartItemInput } from '@cutishop1/contracts';

/**
 * Pure cart helpers for the mobile app (Phase 2A). These mirror the
 * server's cart rules without duplicating its authority: the server
 * remains the source of truth for prices, availability and the cart
 * contents (GET /cart + POST /checkout/quote). Prices and totals are
 * never computed from client-side product data for checkout; the
 * quote endpoint returns them.
 *
 * Server rules these helpers mirror (Server/src/services/cartService.ts
 * and Server/src/routes/schemas.ts):
 * - A cart line is identified by (productId, sku), not by product
 *   alone: the same product with a different variant is a different
 *   line; the same variant added twice accumulates quantity.
 * - Quantity for a single add/update is an integer in [1, 999]
 *   (update with 0 removes the line server-side).
 * - Availability is per variant: available = quantity - reserved,
 *   returned by the quote. Adding beyond available is not blocked by
 *   the add endpoint, but the quote flags canOrder=false; the UI
 *   therefore clamps the +/- controls to available and warns instead
 *   of silently changing the quantity.
 */

export const MAX_CART_QUANTITY = 999;

export function cartKey(productId: string, sku: string): string {
  return `${productId}:${sku}`;
}

/** Merge a new line into a cart: same (productId, sku) accumulates. */
export function mergeCartItems(
  items: CartItemInput[],
  next: CartItemInput,
): CartItemInput[] {
  const key = cartKey(next.productId, next.sku);
  let merged = false;
  const out = items.map((item) => {
    if (cartKey(item.productId, item.sku) === key) {
      merged = true;
      return { ...item, quantity: item.quantity + next.quantity };
    }
    return item;
  });
  if (!merged) out.push({ ...next });
  return out;
}

/** True when quantity is a valid single add/update amount (1..999). */
export function isValidQuantity(quantity: unknown): quantity is number {
  return (
    typeof quantity === 'number' &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_CART_QUANTITY
  );
}

/**
 * Clamp a desired quantity for the +/- controls: at least 1, at most
 * the variant's available stock, and at most 999. Returns 0 when the
 * variant has no available stock, meaning "cannot add".
 */
export function clampQuantity(desired: number, available: number): number {
  if (available <= 0) return 0;
  return Math.max(1, Math.min(desired, available, MAX_CART_QUANTITY));
}

/** Validate untrusted cart data (e.g. a stored or server payload). */
export function parseCartItems(input: unknown): {
  valid: CartItemInput[];
  invalidCount: number;
} {
  if (!Array.isArray(input)) return { valid: [], invalidCount: 0 };
  const valid: CartItemInput[] = [];
  let invalidCount = 0;
  for (const raw of input) {
    const item = raw as Partial<CartItemInput> | null;
    if (
      item &&
      typeof item.productId === 'string' &&
      item.productId.length > 0 &&
      typeof item.sku === 'string' &&
      item.sku.length > 0 &&
      isValidQuantity(item.quantity)
    ) {
      valid.push({
        productId: item.productId,
        sku: item.sku,
        quantity: item.quantity,
      });
    } else {
      invalidCount += 1;
    }
  }
  return { valid, invalidCount };
}

/**
 * True when the cart state must be reset because the account changed.
 * The server cart is per user (Cart has a unique index on user), so
 * the client must never show one account's cart to another: any
 * change of user id — including login, logout and account switch —
 * resets the local cart state, which is then reloaded from the
 * server for the new account (or left empty when anonymous).
 */
export function shouldResetCart(
  prevUserId: string | null,
  nextUserId: string | null,
): boolean {
  return prevUserId !== nextUserId;
}

export function cartItemCount(items: CartItemInput[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
