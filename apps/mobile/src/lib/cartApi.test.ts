import { describe, expect, it, vi } from 'vitest';
import { ApiClient, createMemoryTokenStore } from '@cutishop1/api-client';

/**
 * ApiClient cart methods with fetch fully mocked. The server contract
 * simulated here is the real one (Server/src/services/cartService.ts):
 * - GET /cart -> { user, items }
 * - POST /cart/items merges the same (productId, sku) line
 * - PATCH /cart/items with quantity 0 removes the line
 * - POST /checkout/quote -> server-calculated lines, subtotal, total
 *   and canOrder (false when a line exceeds available stock)
 * Server integration for these endpoints already exists in
 * Server/test/order.int.test.ts and authMobile tests; these tests
 * pin the mobile client's use of them.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const envelope = (data: unknown) => ({ success: true, data });

function makeClient(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const tokenStore = createMemoryTokenStore();
  tokenStore.set('valid-access');
  const fetchImpl = vi.fn(
    async (url: unknown, init?: RequestInit) => handler(String(url), init ?? {}),
  ) as unknown as typeof fetch;
  return new ApiClient({
    baseUrl: 'http://test.local/api/v1',
    tokenStore,
    fetchImpl,
  });
}

async function bodyOf(init: RequestInit): Promise<Record<string, unknown>> {
  return typeof init.body === 'string' ? JSON.parse(init.body) : {};
}

const QUOTE = {
  items: [
    {
      productId: 'p1',
      productTitle: 'Áo thun',
      sku: 'AT-WHT-M',
      color: 'Trắng',
      size: 'M',
      unitPrice: 149000,
      quantity: 2,
      lineTotal: 298000,
      available: 5,
    },
  ],
  couponCode: null,
  subtotal: 298000,
  discount: 0,
  subtotalAfterDiscount: 298000,
  shipping: 0,
  total: 298000,
  canOrder: true,
};

describe('ApiClient cart methods', () => {
  it('getCart returns the server cart, empty when the server has none', async () => {
    const api = makeClient(async (url) => {
      if (url.endsWith('/cart')) {
        return jsonResponse(envelope({ user: 'u1', items: [] }), 200);
      }
      throw new Error(`unexpected ${url}`);
    });
    await expect(api.getCart()).resolves.toEqual({ user: 'u1', items: [] });
  });

  it('addCartItem sends productId, sku and quantity to POST /cart/items', async () => {
    let sent: Record<string, unknown> | null = null;
    const api = makeClient(async (url, init) => {
      if (url.endsWith('/cart/items') && init.method === 'POST') {
        sent = await bodyOf(init);
        return jsonResponse(
          envelope({
            user: 'u1',
            items: [{ productId: 'p1', sku: 'AT-WHT-M', quantity: 2 }],
          }),
          200,
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    const cart = await api.addCartItem({
      productId: 'p1',
      sku: 'AT-WHT-M',
      quantity: 2,
    });
    expect(sent).toEqual({ productId: 'p1', sku: 'AT-WHT-M', quantity: 2 });
    expect(cart.items).toHaveLength(1);
  });

  it('updateCartItem and removeCartItem hit the right methods', async () => {
    const calls: string[] = [];
    const api = makeClient(async (url, init) => {
      if (url.endsWith('/cart/items')) {
        calls.push(init.method ?? 'GET');
        return jsonResponse(envelope({ user: 'u1', items: [] }), 200);
      }
      throw new Error(`unexpected ${url}`);
    });
    await api.updateCartItem({ productId: 'p1', sku: 'AT-WHT-M', quantity: 3 });
    await api.removeCartItem({ productId: 'p1', sku: 'AT-WHT-M' });
    expect(calls).toEqual(['PATCH', 'DELETE']);
  });

  it('quote returns server-calculated lines and totals, never a client total', async () => {
    const api = makeClient(async (url) => {
      if (url.endsWith('/checkout/quote')) {
        return jsonResponse(envelope(QUOTE), 200);
      }
      throw new Error(`unexpected ${url}`);
    });
    const quote = await api.quote({
      items: [{ productId: 'p1', sku: 'AT-WHT-M', quantity: 2 }],
    });
    expect(quote.subtotal).toBe(298000);
    expect(quote.total).toBe(298000);
    expect(quote.canOrder).toBe(true);
    expect(quote.items[0].unitPrice).toBe(149000);
  });

  it('quote flags canOrder=false when a line exceeds available stock', async () => {
    const api = makeClient(async (url) => {
      if (url.endsWith('/checkout/quote')) {
        return jsonResponse(
          envelope({
            ...QUOTE,
            items: [{ ...QUOTE.items[0], quantity: 9, lineTotal: 1341000 }],
            subtotal: 1341000,
            total: 1341000,
            canOrder: false,
          }),
          200,
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    const quote = await api.quote({
      items: [{ productId: 'p1', sku: 'AT-WHT-M', quantity: 9 }],
    });
    expect(quote.canOrder).toBe(false);
    expect(quote.items[0].quantity).toBeGreaterThan(quote.items[0].available);
  });

  it('clearCart sends DELETE /cart', async () => {
    let method = '';
    const api = makeClient(async (url, init) => {
      if (url.endsWith('/cart')) {
        method = init.method ?? '';
        return jsonResponse(envelope({ user: 'u1', items: [] }), 200);
      }
      throw new Error(`unexpected ${url}`);
    });
    await api.clearCart();
    expect(method).toBe('DELETE');
  });
});
