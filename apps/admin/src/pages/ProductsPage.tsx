import { formatVND, type Product } from '@cutishop1/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, ghostButton, LoadingState, primaryButton } from '../components/ui';
import { api } from '../lib/api';

export function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.adminGetProducts({ limit: 100, sort: 'newest' });
      setItems(page.items);
    } catch {
      setError('Không tải được danh sách sản phẩm.');
    } finally {
      setLoading(false);
    }
  }, [reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const deactivate = async (product: Product) => {
    setNotice(null);
    try {
      await api.adminDeleteProduct(product.id);
      setNotice(`Đã ngừng bán "${product.title}" (xóa mềm — dữ liệu vẫn được giữ).`);
      setReloadKey((k) => k + 1);
    } catch {
      setNotice('Thao tác thất bại.');
    }
  };

  if (loading) return <LoadingState label="Đang tải sản phẩm…" />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Sản phẩm</h1>
        <Link to="/products/new" className={primaryButton}>+ Thêm sản phẩm</Link>
      </div>
      {notice && <p role="status" className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Chưa có sản phẩm nào. Hãy thêm sản phẩm đầu tiên.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">Giá hiệu lực</th>
                <th className="px-4 py-3">Tồn kho</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-3 font-medium">{product.title}</td>
                  <td className="px-4 py-3">
                    {formatVND(product.priceRange.min)}
                    {product.priceRange.max !== product.priceRange.min &&
                      ` – ${formatVND(product.priceRange.max)}`}
                  </td>
                  <td className="px-4 py-3">{product.totalStock}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${product.isActive ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'}`}>
                      {product.isActive ? 'Đang bán' : 'Ngừng bán'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex justify-end gap-2">
                      <Link to={`/products/${product.id}/edit`} className={ghostButton}>Sửa</Link>
                      {product.isActive && (
                        <button type="button" className={ghostButton} onClick={() => void deactivate(product)}>
                          Ngừng bán
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
