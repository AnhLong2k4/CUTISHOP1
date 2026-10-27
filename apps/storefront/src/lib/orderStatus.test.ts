import { describe, expect, it } from 'vitest';
import { orderStatusLabel, paymentStatusLabel } from './orderStatus';

describe('order status labels', () => {
  it('maps backend statuses to Vietnamese labels in one place', () => {
    expect(orderStatusLabel('PENDING')).toBe('Chờ xác nhận');
    expect(orderStatusLabel('DELIVERY_FAILED')).toBe('Giao thất bại');
    expect(orderStatusLabel('REFUNDED')).toBe('Đã hoàn tiền');
    expect(paymentStatusLabel('PAID_ON_DELIVERY')).toBe('Đã thu tiền khi giao');
    expect(paymentStatusLabel('UNPAID')).toBe('Chưa thanh toán');
  });
});
