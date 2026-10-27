import type { OrderStatus } from '@cutishop1/contracts';

/** Vietnamese labels and allowed next states, mirroring the backend map. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
  DELIVERY_FAILED: 'Giao thất bại',
  RETURN_REQUESTED: 'Đã yêu cầu trả hàng',
  RETURNED: 'Đã trả hàng',
  REFUNDED: 'Đã hoàn tiền',
};

export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  DELIVERY_FAILED: ['SHIPPING', 'CANCELLED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
