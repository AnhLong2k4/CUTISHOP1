import type { Brand, Category, Product, ProductSort } from '@cutishop1/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pagination } from '../components/Pagination';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { api } from '../lib/api';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '28', '29', '30', '31', '32'];
const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'priceAsc', label: 'Giá tăng dần' },
  { value: 'priceDesc', label: 'Giá giảm dần' },
  { value: 'nameAsc', label: 'Tên A–Z' },
  { value: 'nameDesc', label: 'Tên Z–A' },
];

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Product[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const query = useMemo(() => {
    const get = (key: string) => searchParams.get(key) ?? undefined;
    const num = (key: string) => {
      const raw = searchParams.get(key);
      const value = raw ? Number(raw) : NaN;
      return Number.isFinite(value) ? value : undefined;
    };
    return {
      page: num('page') ?? 1,
      limit: 12,
      search: get('search'),
      category: get('category'),
      brand: get('brand'),
      size: get('size'),
      color: get('color'),
      minPrice: num('minPrice'),
      maxPrice: num('maxPrice'),
      inStock: searchParams.get('inStock') === 'true' ? true : undefined,
      sale: searchParams.get('sale') === 'true' ? true : undefined,
      sort: (get('sort') as ProductSort | undefined) ?? 'newest',
    };
  }, [searchParams]);

  const setParam = useCallback(
    (key: string, value: string | undefined, resetPage = true) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, value);
        if (resetPage && key !== 'page') next.delete('page');
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [cats, brs] = await Promise.all([api.getCategories(), api.getBrands()]);
        setCategories(cats);
        setBrands(brs);
      } catch {
        // Filter data is best-effort; the product list itself reports errors.
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getProducts(query);
      setItems(page.items);
      setTotalPages(page.pagination.totalPages);
      setTotal(page.pagination.total);
    } catch {
      setError('Không tải được danh sách sản phẩm. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const inputClass = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm';
  const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500';

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-60" aria-label="Bộ lọc sản phẩm">
        <form
          className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div>
            <label className={labelClass} htmlFor="f-search">Từ khóa</label>
            <input
              id="f-search"
              className={inputClass}
              defaultValue={query.search ?? ''}
              onBlur={(e) => setParam('search', e.target.value || undefined)}
              placeholder="Tên sản phẩm…"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="f-category">Danh mục</label>
            <select
              id="f-category"
              className={inputClass}
              value={query.category ?? ''}
              onChange={(e) => setParam('category', e.target.value || undefined)}
            >
              <option value="">Tất cả</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="f-brand">Thương hiệu</label>
            <select
              id="f-brand"
              className={inputClass}
              value={query.brand ?? ''}
              onChange={(e) => setParam('brand', e.target.value || undefined)}
            >
              <option value="">Tất cả</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="f-size">Kích cỡ</label>
              <select
                id="f-size"
                className={inputClass}
                value={query.size ?? ''}
                onChange={(e) => setParam('size', e.target.value || undefined)}
              >
                <option value="">Tất cả</option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="f-color">Màu sắc</label>
              <input
                id="f-color"
                className={inputClass}
                defaultValue={query.color ?? ''}
                onBlur={(e) => setParam('color', e.target.value || undefined)}
                placeholder="Đen, Trắng…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="f-min">Giá từ</label>
              <input
                id="f-min"
                type="number"
                min={0}
                className={inputClass}
                defaultValue={query.minPrice ?? ''}
                onBlur={(e) => setParam('minPrice', e.target.value || undefined)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="f-max">Giá đến</label>
              <input
                id="f-max"
                type="number"
                min={0}
                className={inputClass}
                defaultValue={query.maxPrice ?? ''}
                onBlur={(e) => setParam('maxPrice', e.target.value || undefined)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={query.inStock === true}
              onChange={(e) => setParam('inStock', e.target.checked ? 'true' : undefined)}
            />
            Chỉ còn hàng
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={query.sale === true}
              onChange={(e) => setParam('sale', e.target.checked ? 'true' : undefined)}
            />
            Đang giảm giá
          </label>
          <div>
            <label className={labelClass} htmlFor="f-sort">Sắp xếp</label>
            <select
              id="f-sort"
              className={inputClass}
              value={query.sort}
              onChange={(e) => setParam('sort', e.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setSearchParams(new URLSearchParams())}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:border-brand-400 hover:text-brand-600"
          >
            Xóa bộ lọc
          </button>
        </form>
      </aside>

      <section className="flex-1" aria-label="Kết quả sản phẩm">
        {loading ? (
          <LoadingState label="Đang tải sản phẩm…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : items.length === 0 ? (
          <EmptyState message="Không tìm thấy sản phẩm phù hợp. Hãy thử nới lỏng bộ lọc." />
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-500">{total} sản phẩm</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <Pagination
              page={query.page}
              totalPages={totalPages}
              onChange={(page) => setParam('page', String(page), false)}
            />
          </>
        )}
      </section>
    </div>
  );
}
