import { formatVND, type Product } from '@cutishop1/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProduct(id);
      setProduct(data);
      const firstInStock = data.variants.find((v) => v.inStock) ?? data.variants[0];
      setSelectedSku(firstInStock?.sku ?? null);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 404
          ? 'Sản phẩm không tồn tại hoặc đã ngừng bán.'
          : 'Không tải được chi tiết sản phẩm. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const selectedVariant = useMemo(
    () => product?.variants.find((v) => v.sku === selectedSku) ?? null,
    [product, selectedSku],
  );

  if (loading) return <LoadingState label="Đang tải chi tiết sản phẩm…" />;
  if (error || !product) {
    return (
      <div className="flex flex-col items-center gap-4">
        <ErrorState message={error ?? 'Không tìm thấy sản phẩm.'} onRetry={() => setReloadKey((k) => k + 1)} />
        <Link to="/products" className="text-sm font-medium text-brand-600 hover:underline">
          ← Quay lại danh sách sản phẩm
        </Link>
      </div>
    );
  }

  const brandName = typeof product.brand === 'object' ? product.brand?.name : undefined;
  const categoryName =
    typeof product.category === 'object' ? product.category.name : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-brand-50">
          {product.images[0] ? (
            <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-400">Chưa có ảnh</div>
          )}
        </div>
        {product.images.length > 1 && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {product.images.slice(1).map((src) => (
              <img key={src} src={src} alt="" className="aspect-square rounded-lg object-cover" loading="lazy" />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">{product.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {categoryName}
            {brandName && <> · Thương hiệu: {brandName}</>}
          </p>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-extrabold text-brand-600">
            {formatVND(selectedVariant?.effectivePrice ?? product.priceRange.min)}
          </span>
          {product.onSale && !selectedVariant?.price && (
            <span className="text-base text-neutral-400 line-through">
              {formatVND(product.price)}
            </span>
          )}
          {product.onSale && (
            <span className="rounded-md bg-coral-500 px-2 py-0.5 text-xs font-bold text-white">
              ĐANG GIẢM GIÁ
            </span>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            Chọn biến thể{selectedVariant && `: ${selectedVariant.color ?? ''} ${selectedVariant.size ?? ''}`.trim()}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Biến thể sản phẩm">
            {product.variants.map((variant) => {
              const isSelected = variant.sku === selectedSku;
              return (
                <button
                  key={variant.sku}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!variant.inStock}
                  onClick={() => setSelectedSku(variant.sku)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                      : 'border-neutral-300'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="block">
                    {[variant.color, variant.size].filter(Boolean).join(' · ') || variant.sku}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {formatVND(variant.effectivePrice)} ·{' '}
                    {variant.inStock ? `Còn ${variant.quantity}` : 'Hết hàng'}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {selectedVariant && (
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-50 p-4 text-sm">
            <dt className="text-neutral-500">SKU</dt>
            <dd className="font-medium">{selectedVariant.sku}</dd>
            <dt className="text-neutral-500">Tình trạng</dt>
            <dd className="font-medium">
              {selectedVariant.inStock
                ? `Còn hàng (${selectedVariant.quantity} sản phẩm)`
                : 'Hết hàng'}
            </dd>
            <dt className="text-neutral-500">Tổng tồn kho</dt>
            <dd className="font-medium">{product.totalStock} sản phẩm</dd>
          </dl>
        )}

        <p className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Giỏ hàng và đặt hàng (COD) sẽ mở ở Phase 2. Giá và tồn kho trên trang này là
          dữ liệu thật từ hệ thống.
        </p>

        {product.description && (
          <div>
            <h2 className="mb-1 text-sm font-semibold">Mô tả sản phẩm</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">
              {product.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
