import type { Order, OrderStatus } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, ghostButton, LoadingState, primaryButton } from '../components/ui';
import { api } from '../lib/api';
import { apiStatus, isNetworkError, isSessionExpired } from '../lib/apiError';
import { NEXT_STATUSES, orderStatusLabel } from '../lib/orderStatus';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<OrderStatus | ''>('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await api.adminGetOrder(id));
    } catch (err) {
      setError(
        isSessionExpired(err)
          ? 'Phiên quản trị đã hết hạn. Hãy đăng xuất và đăng nhập lại.'
          : apiStatus(err) === 403
            ? 'Tài khoản này không có quyền quản trị.'
            : apiStatus(err) === 404
              ? 'Không tìm thấy đơn hàng.'
              : isNetworkError(err)
                ? 'Không kết nối được máy chủ. Hãy kiểm tra kết nối mạng và thử lại.'
                : 'Không tải được chi tiết đơn hàng.',
      );
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
          ← Quay lại danh sách đơn hàng
        </Link>
      </div>
    );
  }

  const next = NEXT_STATUSES[order.status] ?? [];
  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.adminUpdateOrderStatus(order.id, {
        status: target,
        reason: reason || undefined,
        restock: target === 'RETURNED' ? restock : undefined,
      });
      setTarget('');
      setReason('');
      setRestock(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setNotice(
        isSessionExpired(err)
          ? 'Phiên quản trị đã hết hạn. Hãy đăng nhập lại rồi thử lại.'
          : isNetworkError(err)
            ? 'Không kết nối được máy chủ. Hãy thử lại.'
            : code === 'ORDER_TRANSITION_INVALID'
          ? 'Không thể chuyển sang trạng thái này từ trạng thái hiện tại.'
          : code === 'RESERVATION_EXPIRED'
            ? 'Đơn đã hết hạn giữ kho, không thể xác nhận.'
            : code === 'REFUND_NOT_ALLOWED'
              ? 'Chỉ hoàn tiền khi đơn đã thu tiền lúc giao hàng.'
              : 'Chuyển trạng thái thất bại. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/orders" className="text-sm font-medium text-brand-600 hover:underline">
        ← Danh sách đơn hàng
      </Link>
      <h1 className="mt-2 text-xl font-bold">Đơn #{order.id.slice(-8).toUpperCase()}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Đặt lúc {new Date(order.createdAt).toLocaleString('vi-VN')} · {orderStatusLabel(order.status)} ·{' '}
        {order.paymentStatus} · COD · Khách: {order.user}
      </p>

      <div className="mt-4 space-y-3">
        {order.items.map((item) => (
          <div key={`${item.productId}:${item.sku}`} className="flex justify-between gap-3 rounded-xl border border-neutral-200 p-4 text-sm">
            <span>
              <span className="block font-medium">{item.productTitle}</span>
              <span className="text-neutral-500">
                SKU {item.sku}
                {[item.color, item.size].filter(Boolean).length > 0 &&
                  ` · ${[item.color, item.size].filter(Boolean).join(' · ')}`}{' '}
                × {item.quantity} · {formatVND(item.unitPrice)} / sản phẩm
              </span>
            </span>
            <span className="font-medium">{formatVND(item.lineTotal)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1 rounded-xl bg-neutral-50 p-4 text-sm">
        <p className="flex justify-between"><span>Người nhận</span><span className="text-right">{order.shippingAddress.name} · {order.shippingAddress.phone}</span></p>
        <p className="flex justify-between"><span>Địa chỉ</span><span className="text-right">{order.shippingAddress.address}</span></p>
        <p className="flex justify-between border-t border-neutral-200 pt-2"><span>Tạm tính</span><span>{formatVND(order.subtotal)}</span></p>
        {order.discount > 0 && <p className="flex justify-between"><span>Giảm giá{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>−{formatVND(order.discount)}</span></p>}
        <p className="flex justify-between"><span>Phí vận chuyển</span><span>{formatVND(order.shipping)}</span></p>
        <p className="flex justify-between text-base font-bold"><span>Tổng tiền</span><span>{formatVND(order.total)}</span></p>
      </div>

      {next.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-xl border border-neutral-200 p-4">
          <h2 className="font-semibold">Chuyển trạng thái</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as OrderStatus)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              aria-label="Trạng thái mới"
            >
              <option value="">Chọn trạng thái mới…</option>
              {next.map((s) => (
                <option key={s} value={s}>{orderStatusLabel(s)}</option>
              ))}
            </select>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lý do (hủy, giao thất bại, trả hàng…)"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <button type="button" disabled={!target || busy} onClick={() => void submit()} className={primaryButton}>
              Cập nhật
            </button>
          </div>
          {target === 'RETURNED' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              Nhập lại kho (chỉ tick khi đã kiểm hàng và xác nhận còn bán được)
            </label>
          )}
          <p className="text-xs text-neutral-500">
            Gửi lại cùng trạng thái hiện tại là an toàn (no-op). Hủy từ PROCESSING trở đi chỉ admin mới được
            hủy trước khi giao; giao thành công mới chuyển giữ kho sang đã bán và thu tiền COD.
          </p>
          {notice && <p role="status" className="text-sm text-red-700">{notice}</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">Đơn đã ở trạng thái cuối, không còn chuyển đổi hợp lệ.</p>
      )}

      <div className="mt-6">
        <h2 className="mb-2 font-semibold">Lịch sử trạng thái</h2>
        <ol className="space-y-2 text-sm">
          {order.statusHistory.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="rounded-lg border border-neutral-200 px-3 py-2">
              <span className="font-medium">{orderStatusLabel(entry.to as OrderStatus)}</span>
              <span className="text-neutral-500"> · {new Date(entry.at).toLocaleString('vi-VN')}</span>
              {entry.reason && <span className="block text-neutral-600">Lý do: {entry.reason}</span>}
            </li>
          ))}
        </ol>
      </div>
      <Link to="/orders" className={`${ghostButton} mt-6 inline-block`}>Quay lại danh sách</Link>
    </div>
  );
}
