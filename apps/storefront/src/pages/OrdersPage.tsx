import type { Order, OrderStatus } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';
import { isNetworkError, isSessionExpired } from '../lib/apiError';
import { orderStatusLabel } from '../lib/orderStatus';

const FILTERS: Array<{ value: '' | OrderStatus; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'COMPLETED', label: 'Đã hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function OrdersPage() {
  const { status } = useAuth();
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<'' | OrderStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const data = await api.listMyOrders({ page, limit: 20, status: filter || undefined });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      if (isSessionExpired(err)) {
        setSessionExpired(true);
        return;
      }
      setError(
        isNetworkError(err)
          ? 'Không kết nối được máy chủ. Hãy kiểm tra kết nối mạng và thử lại.'
          : 'Không tải được lịch sử đơn hàng.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, filter, reloadKey]);

  useEffect(() => {
    if (status === 'authenticated') void load();
    else if (status === 'anonymous') setLoading(false);
  }, [status, load]);

  if (status === 'loading' || loading) return <LoadingState label="Đang tải đơn hàng…" />;
  if (status === 'anonymous' || sessionExpired) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-sm text-neutral-600">
          {sessionExpired
            ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem lịch sử đơn hàng.'
            : 'Đăng nhập để xem lịch sử đơn hàng.'}
        </p>
        <Link to="/login" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          Đăng nhập
        </Link>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Đơn hàng của tôi</h1>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => { setFilter(f.value); setPage(1); }}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f.value ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-neutral-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState message="Chưa có đơn hàng nào." />
      ) : (
        <div className="space-y-3">
          {items.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="block rounded-xl border border-neutral-200 p-4 hover:border-brand-400">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium">Đơn #{order.id.slice(-8).toUpperCase()}</p>
                <p className="text-sm font-medium text-brand-700">{orderStatusLabel(order.status)}</p>
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                {new Date(order.createdAt).toLocaleString('vi-VN')} · {order.items.length} mặt hàng · COD
              </p>
              <p className="mt-1 font-semibold">{formatVND(order.total)}</p>
            </Link>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-40">
            ← Trang trước
          </button>
          <span>Trang {page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-40">
            Trang sau →
          </button>
        </div>
      )}
    </div>
  );
}
