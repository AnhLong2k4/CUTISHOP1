/**
 * Order lifecycle (ADR sections 1 and 2). Backend enum is English;
 * Vietnamese labels live in the frontend, in one place only.
 * This map is the single source of truth for allowed transitions.
 * Role checks and the 7-day return window are enforced in the service,
 * not by the map alone.
 */

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'REFUNDED';

export type PaymentStatus = 'UNPAID' | 'PAID_ON_DELIVERY' | 'REFUNDED';

export const NON_TERMINAL_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPING',
  'DELIVERY_FAILED',
  'RETURN_REQUESTED',
];

export const TERMINAL_STATUSES: OrderStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'RETURNED',
  'REFUNDED',
];

/** Allowed next states, before role checks. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: ['COMPLETED', 'RETURN_REQUESTED'],
  COMPLETED: [],
  CANCELLED: [],
  DELIVERY_FAILED: ['SHIPPING', 'CANCELLED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // no-op, handled by the service
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Who may perform a transition. 'owner' means the customer who owns the
 * order; 'admin' means role admin. Returns false for transitions that
 * are not in the map at all, and for role mismatches.
 */
export function canTransitionByRole(
  from: OrderStatus,
  to: OrderStatus,
  role: 'owner' | 'admin',
): boolean {
  if (from === to) return true;
  if (!canTransition(from, to)) return false;
  if (to === 'CANCELLED') {
    if (from === 'PROCESSING' || from === 'DELIVERY_FAILED') return role === 'admin';
    return true; // PENDING / CONFIRMED: owner or admin
  }
  if (to === 'COMPLETED') return true; // DELIVERED -> COMPLETED: owner or admin
  if (to === 'RETURN_REQUESTED') return role === 'owner';
  return role === 'admin';
}
