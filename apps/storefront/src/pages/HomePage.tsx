import type { Brand, Category, Product } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newest, setNewest] = useState<Product[]>([]);
  const [onSale, setOnSale] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, brs, newestPage, salePage] = await Promise.all([
        api.getCategories(),
        api.getBrands(),
        api.getProducts({ limit: 8, sort: 'newest' }),
        api.getProducts({ limit: 4, sale: true }),
      ]);
      setCategories(cats);
      setBrands(brs);
      setNewest(newestPage.items);
      setOnSale(salePage.items);
    } catch {
      setError('Không tải được dữ liệu. Kiểm tra kết nối tới máy chủ rồi thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (loading) return <LoadingState label="Đang tải trang chủ…" />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-2xl bg-gradient-to-r from-brand-500 to-coral-500 px-6 py-10 text-white">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Thời trang nữ, xinh mỗi ngày</h1>
        <p className="mt-2 max-w-lg text-sm text-white/90">
          CUTISHOP1 — bộ sưu tập áo, quần và váy được cập nhật liên tục. Giá hiển thị là
          giá thật từ hệ thống, tồn kho theo thời gian thực.
        </p>
        <Link
          to="/products"
          className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-bold text-brand-600"
        >
          Xem tất cả sản phẩm
        </Link>
      </section>

      <section aria-label="Danh mục">
        <h2 className="mb-3 text-lg font-bold">Danh mục</h2>
        {categories.length === 0 ? (
          <EmptyState message="Chưa có danh mục nào." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/products?category=${category.id}`}
                className="rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                {category.name}
                {typeof category.productCount === 'number' && (
                  <span className="text-neutral-500"> ({category.productCount})</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {brands.length > 0 && (
        <section aria-label="Thương hiệu">
          <h2 className="mb-3 text-lg font-bold">Thương hiệu</h2>
          <div className="flex flex-wrap gap-2">
            {brands.map((brand) => (
              <Link
                key={brand.id}
                to={`/products?brand=${brand.id}`}
                className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 hover:border-brand-400 hover:text-brand-600"
              >
                {brand.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Sản phẩm mới nhất">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Sản phẩm mới nhất</h2>
          <Link to="/products" className="text-sm font-medium text-brand-600 hover:underline">
            Xem tất cả →
          </Link>
        </div>
        {newest.length === 0 ? (
          <EmptyState message="Chưa có sản phẩm nào được đăng bán." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {newest.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {onSale.length > 0 && (
        <section aria-label="Đang giảm giá">
          <h2 className="mb-3 text-lg font-bold text-coral-500">Đang giảm giá</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {onSale.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
