import type { OrderStatus } from '@cutishop1/contracts';

/** Vietnamese labels for backend order statuses, in one place only. */
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

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PAID_ON_DELIVERY: 'Đã thu tiền khi giao',
  REFUNDED: 'Đã hoàn tiền',
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}
