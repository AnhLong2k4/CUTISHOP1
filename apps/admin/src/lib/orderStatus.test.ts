import { describe, expect, it } from 'vitest';
import { NEXT_STATUSES, orderStatusLabel } from './orderStatus';

describe('admin order transitions', () => {
  it('only offers documented next states (the backend still enforces them)', () => {
    expect(NEXT_STATUSES.PENDING).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(NEXT_STATUSES.SHIPPING).toEqual(['DELIVERED', 'DELIVERY_FAILED']);
    expect(NEXT_STATUSES.SHIPPING).not.toContain('CANCELLED');
    expect(NEXT_STATUSES.COMPLETED).toEqual([]);
    expect(orderStatusLabel('RETURN_REQUESTED')).toBe('Đã yêu cầu trả hàng');
  });
});
