import type { Quote } from '@cutishop1/contracts';
import { formatVND } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';

export function CartPage() {
  const { status } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cart = await api.getCart();
      if (cart.items.length === 0) {
        setQuote(null);
        return;
      }
      // The cart stores only productId/sku/quantity. Display prices and
      // totals come from the server quote, never from a client-side total.
      const data = await api.quote({ items: cart.items });
      setQuote(data);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'PRODUCT_NOT_FOUND' || code === 'VARIANT_NOT_FOUND'
          ? 'Có sản phẩm trong giỏ đã ngừng bán hoặc không còn biến thể này. Hãy xóa dòng đó và thử lại.'
          : 'Không tải được giỏ hàng. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }, [reloadKey]);

  useEffect(() => {
    if (status === 'authenticated') void load();
    else if (status === 'anonymous') setLoading(false);
  }, [status, load]);

  if (status === 'loading' || loading) return <LoadingState label="Đang tải giỏ hàng…" />;
  if (status === 'anonymous') {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-sm text-neutral-600">Đăng nhập để xem giỏ hàng của bạn.</p>
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
        <h1 className="mb-4 text-xl font-bold">Giỏ hàng</h1>
        <EmptyState message="Giỏ hàng trống. Hãy chọn một sản phẩm để bắt đầu." />
        <Link to="/products" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  const changeQty = async (productId: string, sku: string, quantity: number) => {
    setNotice(null);
    try {
      await api.updateCartItem({ productId, sku, quantity });
      setReloadKey((k) => k + 1);
    } catch {
      setNotice('Không cập nhật được số lượng.');
    }
  };

  const remove = async (productId: string, sku: string) => {
    setNotice(null);
    try {
      await api.removeCartItem({ productId, sku });
      setReloadKey((k) => k + 1);
    } catch {
      setNotice('Không xóa được dòng này.');
    }
  };

  const clear = async () => {
    setNotice(null);
    try {
      await api.clearCart();
      setReloadKey((k) => k + 1);
    } catch {
      setNotice('Không xóa được giỏ hàng.');
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Giỏ hàng</h1>
        <button type="button" onClick={() => void clear()} className="text-sm font-medium text-neutral-500 hover:text-red-600">
          Xóa toàn bộ
        </button>
      </div>
      {notice && <p role="status" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}
      <div className="space-y-3">
        {quote.items.map((line) => (
          <div key={`${line.productId}:${line.sku}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 p-4">
            <div className="flex-1">
              <p className="font-medium">{line.productTitle}</p>
              <p className="text-sm text-neutral-500">
                SKU {line.sku}
                {[line.color, line.size].filter(Boolean).length > 0 &&
                  ` · ${[line.color, line.size].filter(Boolean).join(' · ')}`}
              </p>
              <p className="text-sm text-neutral-500">
                {formatVND(line.unitPrice)} / sản phẩm · Còn {line.available} có thể đặt
              </p>
              {line.quantity > line.available && (
                <p className="text-sm font-medium text-red-600">
                  Số lượng vượt tồn kho có thể đặt. Hãy giảm số lượng trước khi thanh toán.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Giảm số lượng"
                disabled={line.quantity <= 1}
                onClick={() => void changeQty(line.productId, line.sku, line.quantity - 1)}
                className="rounded-lg border border-neutral-300 px-3 py-1 disabled:opacity-40"
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{line.quantity}</span>
              <button
                type="button"
                aria-label="Tăng số lượng"
                onClick={() => void changeQty(line.productId, line.sku, line.quantity + 1)}
                className="rounded-lg border border-neutral-300 px-3 py-1"
              >
                +
              </button>
            </div>
            <p className="w-28 text-right font-semibold">{formatVND(line.lineTotal)}</p>
            <button
              type="button"
              onClick={() => void remove(line.productId, line.sku)}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              Xóa
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 ml-auto w-full max-w-sm space-y-1 rounded-xl bg-neutral-50 p-4 text-sm">
        <p className="flex justify-between"><span>Tạm tính</span><span>{formatVND(quote.subtotal)}</span></p>
        <p className="flex justify-between"><span>Phí vận chuyển</span><span>{formatVND(quote.shipping)}</span></p>
        <p className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold">
          <span>Tổng tiền</span><span>{formatVND(quote.total)}</span>
        </p>
        <p className="text-xs text-neutral-500">
          Tổng tiền do máy chủ tính. Giỏ hàng chưa giữ kho; kho chỉ được giữ khi đơn được tạo thành công.
        </p>
        <Link
          to="/checkout"
          className="mt-3 block rounded-lg bg-brand-500 px-4 py-2 text-center font-semibold text-white hover:bg-brand-600"
        >
          Thanh toán (COD)
        </Link>
      </div>
    </div>
  );
}
