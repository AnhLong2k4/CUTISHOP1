import type { Order } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';
import { orderStatusLabel, paymentStatusLabel } from '../lib/orderStatus';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await api.getMyOrder(id));
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 404 ? 'Không tìm thấy đơn hàng.' : 'Không tải được chi tiết đơn hàng.');
    } finally {
      setLoading(false);
    }
  }, [id, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Đang tải đơn hàng…" />;
  if (error || !order) {
    return (
      <div className="flex flex-col items-center gap-4">
        <ErrorState message={error ?? 'Không tìm thấy đơn hàng.'} onRetry={() => setReloadKey((k) => k + 1)} />
        <Link to="/orders" className="text-sm font-medium text-brand-600 hover:underline">
          ← Quay lại lịch sử đơn hàng
        </Link>
      </div>
    );
  }

  const act = async (action: 'cancel' | 'complete' | 'return') => {
    setBusy(true);
    setNotice(null);
    try {
      if (action === 'cancel') await api.cancelMyOrder(order.id, reason || undefined);
      else if (action === 'complete') await api.completeMyOrder(order.id);
      else await api.requestReturnMyOrder(order.id, reason || undefined);
      setReloadKey((k) => k + 1);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setNotice(
        code === 'ORDER_TRANSITION_INVALID'
          ? 'Không thể thực hiện thao tác này với trạng thái hiện tại.'
          : code === 'RETURN_WINDOW_EXPIRED'
            ? 'Đã quá 7 ngày kể từ khi giao hàng, không thể yêu cầu trả hàng.'
            : 'Thao tác thất bại. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/orders" className="text-sm font-medium text-brand-600 hover:underline">
        ← Lịch sử đơn hàng
      </Link>
      <h1 className="mt-2 text-xl font-bold">Đơn #{order.id.slice(-8).toUpperCase()}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Đặt lúc {new Date(order.createdAt).toLocaleString('vi-VN')} · {orderStatusLabel(order.status)} ·{' '}
        {paymentStatusLabel(order.paymentStatus)} · COD
      </p>
      {order.status === 'PENDING' && (
        <p className="mt-2 text-sm text-neutral-600">
          Giữ kho đến {new Date(order.reservationExpiresAt).toLocaleString('vi-VN')}. Nếu quá hạn mà chưa
          được xác nhận, đơn sẽ tự hủy và giải phóng kho.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {order.items.map((item) => (
          <div key={`${item.productId}:${item.sku}`} className="flex justify-between gap-3 rounded-xl border border-neutral-200 p-4 text-sm">
            <span>
              <span className="block font-medium">{item.productTitle}</span>
              <span className="text-neutral-500">
                SKU {item.sku}
                {[item.color, item.size].filter(Boolean).length > 0 &&
                  ` · ${[item.color, item.size].filter(Boolean).join(' · ')}`}{' '}
                × {item.quantity}
              </span>
            </span>
            <span className="font-medium">{formatVND(item.lineTotal)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1 rounded-xl bg-neutral-50 p-4 text-sm">
        <p className="flex justify-between"><span>Người nhận</span><span className="text-right">{order.shippingAddress.name} · {order.shippingAddress.phone}</span></p>
        <p className="flex justify-between"><span>Địa chỉ</span><span className="text-right">{order.shippingAddress.address}</span></p>
        {order.shippingAddress.note && <p className="flex justify-between"><span>Ghi chú</span><span className="text-right">{order.shippingAddress.note}</span></p>}
        <p className="flex justify-between border-t border-neutral-200 pt-2"><span>Tạm tính</span><span>{formatVND(order.subtotal)}</span></p>
        {order.discount > 0 && <p className="flex justify-between text-green-700"><span>Giảm giá{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>−{formatVND(order.discount)}</span></p>}
        <p className="flex justify-between"><span>Phí vận chuyển</span><span>{formatVND(order.shipping)}</span></p>
        <p className="flex justify-between text-base font-bold"><span>Tổng tiền</span><span>{formatVND(order.total)}</span></p>
      </div>

      {(order.status === 'PENDING' || order.status === 'CONFIRMED' || order.status === 'DELIVERED') && (
        <div className="mt-4 space-y-3 rounded-xl border border-neutral-200 p-4">
          <h2 className="font-semibold">Thao tác</h2>
          {(order.status === 'PENDING' || order.status === 'CONFIRMED') && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Lý do hủy (tùy chọn)"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <button type="button" disabled={busy} onClick={() => void act('cancel')} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50">
                Hủy đơn
              </button>
            </div>
          )}
          {order.status === 'DELIVERED' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void act('complete')} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Xác nhận đã nhận hàng
              </button>
              <button type="button" disabled={busy} onClick={() => void act('return')} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
                Yêu cầu trả hàng (trong 7 ngày)
              </button>
            </div>
          )}
          {notice && <p role="status" className="text-sm text-red-700">{notice}</p>}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 font-semibold">Lịch sử trạng thái</h2>
        <ol className="space-y-2 text-sm">
          {order.statusHistory.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="rounded-lg border border-neutral-200 px-3 py-2">
              <span className="font-medium">{orderStatusLabel(entry.to as never)}</span>
              <span className="text-neutral-500"> · {new Date(entry.at).toLocaleString('vi-VN')}</span>
              {entry.reason && <span className="block text-neutral-600">Lý do: {entry.reason}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
