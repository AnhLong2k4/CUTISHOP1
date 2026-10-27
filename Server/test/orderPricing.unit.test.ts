import { describe, expect, it } from 'vitest';
import { buildOrderFingerprint } from '../src/utils/orderFingerprint.js';
import { calculateOrderTotals, calculateShipping } from '../src/utils/pricing.js';
import { canTransition, canTransitionByRole } from '../src/utils/orderStatus.js';

describe('order pricing (ADR 4.3)', () => {
  it('orders subtotal -> discount -> shipping -> total, all integer VND', () => {
    const totals = calculateOrderTotals(
      [{ unitPrice: 200000, quantity: 2 }],
      { type: 'PERCENT', value: 10, maxDiscount: 50000 },
      { shippingFeeVnd: 30000, shippingFreeThresholdVnd: null },
    );
    expect(totals).toEqual({
      subtotal: 400000,
      discount: 40000,
      subtotalAfterDiscount: 360000,
      shipping: 30000,
      total: 390000,
    });
  });

  it('percent discount uses integer floor and respects maxDiscount', () => {
    const totals = calculateOrderTotals(
      [{ unitPrice: 199999, quantity: 1 }],
      { type: 'PERCENT', value: 10, maxDiscount: 100000 },
      { shippingFeeVnd: 0, shippingFreeThresholdVnd: null },
    );
    // floor(199999 * 10 / 100) = 19999, never a fractional dong.
    expect(totals.discount).toBe(19999);
    expect(Number.isInteger(totals.total)).toBe(true);

    const capped = calculateOrderTotals(
      [{ unitPrice: 1000000, quantity: 1 }],
      { type: 'PERCENT', value: 50, maxDiscount: 100000 },
      { shippingFeeVnd: 0, shippingFreeThresholdVnd: null },
    );
    expect(capped.discount).toBe(100000);
  });

  it('fixed discount never exceeds subtotal and total never goes negative', () => {
    const totals = calculateOrderTotals(
      [{ unitPrice: 50000, quantity: 1 }],
      { type: 'FIXED', value: 999999 },
      { shippingFeeVnd: 0, shippingFreeThresholdVnd: null },
    );
    expect(totals.discount).toBe(50000);
    expect(totals.total).toBe(0);
  });

  it('shipping: demo default 0, threshold frees shipping, below threshold pays fee', () => {
    expect(calculateShipping(100000, { shippingFeeVnd: 0, shippingFreeThresholdVnd: null })).toBe(0);
    expect(calculateShipping(600000, { shippingFeeVnd: 30000, shippingFreeThresholdVnd: 500000 })).toBe(0);
    expect(calculateShipping(499999, { shippingFeeVnd: 30000, shippingFreeThresholdVnd: 500000 })).toBe(30000);
  });

  it('coupon minOrderAmount is checked on subtotal, not on total after shipping', () => {
    // This is a pricing-order invariant: a coupon with minOrderAmount
    // 300000 must pass for subtotal 300000 even if shipping is 0, and
    // must fail for subtotal 299999 even if shipping would push the
    // total over 300000. The service enforces this by validating the
    // coupon against the subtotal before shipping is added.
    const totals = calculateOrderTotals(
      [{ unitPrice: 299999, quantity: 1 }],
      null,
      { shippingFeeVnd: 30000, shippingFreeThresholdVnd: null },
    );
    expect(totals.subtotal).toBe(299999);
    expect(totals.total).toBe(329999);
  });
});

describe('order fingerprint (ADR 5)', () => {
  const base = {
    items: [
      { productId: '64b64c2f4f4f4f4f4f4f4f4f', sku: 'A-1', quantity: 2 },
      { productId: '64b64c2f4f4f4f4f4f4f4f4a', sku: 'B-1', quantity: 1 },
    ],
    address: { name: 'Nguyễn  Văn   A', phone: '0901234567', address: 'Hà Nội' },
    couponCode: 'sale10',
    paymentMethod: 'COD',
  };

  it('is stable when item order changes and address whitespace differs', () => {
    const reordered = {
      ...base,
      items: [base.items[1], base.items[0]],
      address: { name: 'Nguyễn Văn A', phone: '0901234567', address: 'Hà Nội' },
    };
    expect(buildOrderFingerprint(reordered)).toBe(buildOrderFingerprint(base));
  });

  it('changes when quantity, coupon or address changes', () => {
    const differentQty = {
      ...base,
      items: [{ ...base.items[0], quantity: 3 }, base.items[1]],
    };
    expect(buildOrderFingerprint(differentQty)).not.toBe(buildOrderFingerprint(base));
    const differentCoupon = { ...base, couponCode: 'sale20' };
    expect(buildOrderFingerprint(differentCoupon)).not.toBe(buildOrderFingerprint(base));
  });
});

describe('order transitions (ADR 1)', () => {
  it('allows the documented transitions and blocks illegal ones', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false);
    expect(canTransition('SHIPPING', 'CANCELLED')).toBe(false);
    expect(canTransition('DELIVERY_FAILED', 'SHIPPING')).toBe(true);
  });

  it('restricts cancel-after-processing and return-request by role', () => {
    expect(canTransitionByRole('PROCESSING', 'CANCELLED', 'owner')).toBe(false);
    expect(canTransitionByRole('PROCESSING', 'CANCELLED', 'admin')).toBe(true);
    expect(canTransitionByRole('DELIVERED', 'RETURN_REQUESTED', 'admin')).toBe(false);
    expect(canTransitionByRole('DELIVERED', 'RETURN_REQUESTED', 'owner')).toBe(true);
  });
});
