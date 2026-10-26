import { ApiError } from '@cutishop1/api-client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ErrorState, ghostButton, inputClass, LoadingState, primaryButton } from '../components/ui';

export interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount?: number;
}

interface TaxonomyAdapter {
  list: () => Promise<TaxonomyItem[]>;
  create: (name: string) => Promise<unknown>;
  update: (id: string, patch: { name?: string; isActive?: boolean }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

/** Shared minimal CRUD screen for categories and brands. */
export function TaxonomyPage({
  title,
  adapter,
}: {
  title: string;
  adapter: TaxonomyAdapter;
}) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await adapter.list());
    } catch {
      setError('Không tải được danh sách. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
    // The adapter is recreated by the parent on each render; reloading
    // is intentionally driven only by reloadKey.
  }, [reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const showError = (err: unknown) =>
    setNotice(err instanceof ApiError ? err.message : 'Thao tác thất bại.');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    try {
      await adapter.create(newName.trim());
      setNewName('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError(err);
    }
  };

  const toggleActive = async (item: TaxonomyItem) => {
    setNotice(null);
    try {
      await adapter.update(item.id, { isActive: !item.isActive });
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError(err);
    }
  };

  const remove = async (item: TaxonomyItem) => {
    setNotice(null);
    try {
      await adapter.remove(item.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError(err);
    }
  };

  const rename = async (item: TaxonomyItem) => {
    const name = window.prompt(`Đổi tên "${item.name}" thành:`, item.name);
    if (!name || name.trim() === item.name) return;
    setNotice(null);
    try {
      await adapter.update(item.id, { name: name.trim() });
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError(err);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{title}</h1>
      <form onSubmit={create} className="mb-4 flex gap-2">
        <label className="sr-only" htmlFor="tax-new">Tên mới</label>
        <input id="tax-new" className={inputClass} value={newName} required minLength={1}
          onChange={(e) => setNewName(e.target.value)} placeholder={`Tên ${title.toLowerCase()} mới…`} />
        <button type="submit" className={primaryButton}>Thêm</button>
      </form>
      {notice && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Chưa có mục nào.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="font-medium">{item.name}</span>
              <span className="text-xs text-neutral-400">/{item.slug}</span>
              {typeof item.productCount === 'number' && (
                <span className="text-xs text-neutral-500">{item.productCount} sản phẩm</span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'}`}>
                {item.isActive ? 'Đang hiện' : 'Đã ẩn'}
              </span>
              <span className="ml-auto flex gap-2">
                <button type="button" className={ghostButton} onClick={() => void rename(item)}>Đổi tên</button>
                <button type="button" className={ghostButton} onClick={() => void toggleActive(item)}>
                  {item.isActive ? 'Ẩn' : 'Hiện'}
                </button>
                <button type="button" className={ghostButton} onClick={() => void remove(item)}>Xóa</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-neutral-400">
        Mục đang được sản phẩm sử dụng sẽ không xóa được (máy chủ trả lỗi 409) — hãy ẩn thay vì xóa.
      </p>
    </div>
  );
}
