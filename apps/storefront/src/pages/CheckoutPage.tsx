import type { Quote } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';

export function CheckoutPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadQuote = useCallback(async (coupon: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const cart = await api.getCart();
      if (cart.items.length === 0) {
        setQuote(null);
        return;
      }
      const data = await api.quote({ items: cart.items, couponCode: coupon ?? undefined });
      setQuote(data);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'COUPON_NOT_FOUND'
          ? 'Mã giảm giá không tồn tại.'
          : code === 'COUPON_EXPIRED'
            ? 'Mã giảm giá đã hết hạn.'
            : code === 'COUPON_MIN_ORDER'
              ? 'Đơn hàng chưa đạt giá trị tối thiểu của mã.'
              : code === 'COUPON_EXHAUSTED'
                ? 'Mã giảm giá đã hết lượt sử dụng.'
                : 'Không tải được báo giá. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }, [reloadKey]);

  useEffect(() => {
    if (status === 'authenticated') void loadQuote(appliedCoupon);
    else if (status === 'anonymous') setLoading(false);
  }, [status, loadQuote, appliedCoupon]);

  if (status === 'loading' || loading) return <LoadingState label="Đang tải báo giá…" />;
  if (status === 'anonymous') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-sm text-neutral-600">Đăng nhập để thanh toán.</p>
        <Link to="/login" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          Đăng nhập
        </Link>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!quote || quote.items.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold">Thanh toán</h1>
        <EmptyState message="Giỏ hàng trống. Hãy thêm sản phẩm trước khi thanh toán." />
        <Link to="/products" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  const applyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setAppliedCoupon(code);
    setSubmitError(null);
  };

  const placeOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quote.canOrder) {
      setSubmitError('Có dòng vượt tồn kho có thể đặt. Hãy giảm số lượng trong giỏ hàng trước khi đặt.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // One idempotency key per checkout attempt. If the user retries
      // this same attempt (for example after a network error), the
      // server returns the original order instead of creating a second one.
      const idempotencyKey = crypto.randomUUID();
      const order = await api.createOrder(
        {
          items: quote.items.map((line) => ({
            productId: line.productId,
            sku: line.sku,
            quantity: line.quantity,
          })),
          shippingAddress: { name: name.trim(), phone: phone.trim(), address: address.trim(), note: note.trim() || undefined },
          couponCode: appliedCoupon ?? undefined,
        },
        idempotencyKey,
      );
      // Best effort: the order already exists even if clearing the cart fails.
      try {
        await api.clearCart();
      } catch {
        // Keep the order page as the source of truth; the cart can be cleared manually.
      }
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code;
      setSubmitError(
        code === 'INSUFFICIENT_STOCK'
          ? 'Không đủ tồn kho cho một hoặc nhiều sản phẩm. Hãy kiểm tra lại giỏ hàng.'
          : code === 'COUPON_EXHAUSTED'
            ? 'Mã giảm giá đã hết lượt sử dụng. Hãy bỏ mã và đặt lại.'
            : code === 'IDEMPOTENCY_KEY_REUSED'
              ? 'Đơn này đã được tạo. Hãy kiểm tra lịch sử đơn hàng.'
              : 'Không tạo được đơn hàng. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={(e) => void placeOrder(e)} className="space-y-4">
        <h1 className="text-xl font-bold">Thanh toán — COD</h1>
        <p className="text-sm text-neutral-600">
          Thanh toán khi nhận hàng. Bạn chưa phải trả tiền khi đặt đơn.
        </p>
        <div>
          <label htmlFor="checkout-name" className="mb-1 block text-sm font-medium">Họ tên người nhận</label>
          <input id="checkout-name" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="checkout-phone" className="mb-1 block text-sm font-medium">Số điện thoại</label>
          <input id="checkout-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="checkout-address" className="mb-1 block text-sm font-medium">Địa chỉ giao hàng</label>
          <textarea id="checkout-address" required value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="checkout-note" className="mb-1 block text-sm font-medium">Ghi chú (tùy chọn)</label>
          <input id="checkout-note" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="checkout-coupon" className="mb-1 block text-sm font-medium">Mã giảm giá (tùy chọn)</label>
          <div className="flex gap-2">
            <input id="checkout-coupon" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            <button type="button" onClick={applyCoupon} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium">
              Áp dụng
            </button>
          </div>
          {appliedCoupon && (
            <p className="mt-1 text-sm text-green-700">
              Đang áp dụng mã {appliedCoupon}.
              <button type="button" onClick={() => { setAppliedCoupon(null); setCouponCode(''); }} className="ml-2 font-medium text-neutral-600 underline">
                Bỏ mã
              </button>
            </p>
          )}
        </div>
        {submitError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {submitting ? 'Đang tạo đơn…' : `Đặt hàng — ${formatVND(quote.total)}`}
        </button>
        <p className="text-xs text-neutral-500">
          Tổng tiền hiển thị do máy chủ tính từ giỏ hàng và mã giảm giá. Đơn được tạo sẽ giữ kho 48 giờ
          trong khi chờ xác nhận.
        </p>
      </form>

      <aside className="space-y-3 rounded-xl bg-neutral-50 p-4">
        <h2 className="font-semibold">Tóm tắt đơn hàng</h2>
        {quote.items.map((line) => (
          <div key={`${line.productId}:${line.sku}`} className="flex justify-between gap-3 text-sm">
            <span>
              {line.productTitle} × {line.quantity}
              <span className="block text-xs text-neutral-500">SKU {line.sku}</span>
            </span>
            <span className="font-medium">{formatVND(line.lineTotal)}</span>
          </div>
        ))}
        <div className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
          <p className="flex justify-between"><span>Tạm tính</span><span>{formatVND(quote.subtotal)}</span></p>
          {quote.discount > 0 && <p className="flex justify-between text-green-700"><span>Giảm giá</span><span>−{formatVND(quote.discount)}</span></p>}
          <p className="flex justify-between"><span>Phí vận chuyển</span><span>{formatVND(quote.shipping)}</span></p>
          <p className="flex justify-between text-base font-bold"><span>Tổng tiền</span><span>{formatVND(quote.total)}</span></p>
        </div>
        {!quote.canOrder && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Có dòng vượt tồn kho có thể đặt. Hãy quay lại giỏ hàng và giảm số lượng.
          </p>
        )}
      </aside>
    </div>
  );
}
