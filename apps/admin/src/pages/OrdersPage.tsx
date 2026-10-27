import type { Order, OrderStatus } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/ui';
import { api } from '../lib/api';
import { orderStatusLabel } from '../lib/orderStatus';

const FILTERS: Array<{ value: '' | OrderStatus; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Đã xác nhận' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'DELIVERY_FAILED', label: 'Giao thất bại' },
  { value: 'RETURN_REQUESTED', label: 'Yêu cầu trả hàng' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function OrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<'' | OrderStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.adminListOrders({ page, limit: 20, status: filter || undefined });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch {
      setError('Không tải được danh sách đơn hàng.');
    } finally {
      setLoading(false);
    }
  }, [page, filter, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Đang tải đơn hàng…" />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Đơn hàng</h1>
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
        <p className="text-sm text-neutral-500">Chưa có đơn hàng nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <th className="px-4 py-3">Đơn</th>
                <th className="px-4 py-3">Ngày đặt</th>
                <th className="px-4 py-3">Mặt hàng</th>
                <th className="px-4 py-3">Tổng tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium">#{order.id.slice(-8).toUpperCase()}</td>
                  <td className="px-4 py-3">{new Date(order.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3">{order.items.length}</td>
                  <td className="px-4 py-3">{formatVND(order.total)}</td>
                  <td className="px-4 py-3">{orderStatusLabel(order.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                      Xem
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
