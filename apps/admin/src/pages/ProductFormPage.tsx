import { ApiError } from '@cutishop1/api-client';
import type { Brand, Category, ProductInput } from '@cutishop1/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState, inputClass, labelClass, LoadingState, primaryButton } from '../components/ui';
import { api } from '../lib/api';

interface VariantRow {
  sku: string;
  color: string;
  size: string;
  price: string;
  quantity: string;
}

const emptyVariant = (): VariantRow => ({ sku: '', color: '', size: 'M', price: '', quantity: '0' });

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [imagesText, setImagesText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant()]);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [cats, brs] = await Promise.all([api.getCategories(), api.getBrands()]);
        setCategories(cats);
        setBrands(brs);
        if (id) {
          const product = await api.adminGetProduct(id);
          setTitle(product.title);
          setDescription(product.description ?? '');
          setCategory(typeof product.category === 'object' ? product.category.id : product.category);
          setBrand(
            product.brand
              ? typeof product.brand === 'object'
                ? product.brand.id
                : product.brand
              : '',
          );
          setPrice(String(product.price));
          setSalePrice(product.salePrice ? String(product.salePrice) : '');
          setImagesText(product.images.join('\n'));
          setIsActive(product.isActive);
          setVariants(
            product.variants.map((v) => ({
              sku: v.sku,
              color: v.color ?? '',
              size: v.size ?? '',
              price: v.price ? String(v.price) : '',
              quantity: String(v.quantity),
            })),
          );
        }
      } catch {
        setLoadError('Không tải được dữ liệu cho form. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const updateVariant = (index: number, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const input: ProductInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      brand: brand || undefined,
      price: Number(price),
      salePrice: salePrice ? Number(salePrice) : undefined,
      images: imagesText.split('\n').map((s) => s.trim()).filter(Boolean),
      isActive,
      variants: variants.map((v) => ({
        sku: v.sku.trim(),
        color: v.color.trim() || undefined,
        size: v.size.trim() || undefined,
        price: v.price ? Number(v.price) : undefined,
        quantity: Number(v.quantity),
      })),
    };
    if (input.variants.some((v) => !v.sku)) {
      setError('Mỗi biến thể phải có SKU.');
      return;
    }
    setBusy(true);
    try {
      const saved = editing && id
        ? await api.adminUpdateProduct(id, input)
        : await api.adminCreateProduct(input);
      if (uploadFiles.length > 0) {
        await api.adminUploadProductImages(saved.id, uploadFiles);
      }
      navigate('/products');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lưu sản phẩm thất bại.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const fieldClass = inputClass;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-bold">{editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
        <div>
          <label className={labelClass} htmlFor="pf-title">Tên sản phẩm *</label>
          <input id="pf-title" required minLength={2} className={fieldClass} value={title}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="pf-desc">Mô tả</label>
          <textarea id="pf-desc" rows={3} className={fieldClass} value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="pf-category">Danh mục *</label>
            <select id="pf-category" required className={fieldClass} value={category}
              onChange={(e) => setCategory(e.target.value)}>
              <option value="">— Chọn danh mục —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="pf-brand">Thương hiệu</label>
            <select id="pf-brand" className={fieldClass} value={brand}
              onChange={(e) => setBrand(e.target.value)}>
              <option value="">— Không chọn —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="pf-price">Giá gốc (VND, số nguyên) *</label>
            <input id="pf-price" type="number" required min={0} step={1} className={fieldClass}
              value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pf-sale">Giá khuyến mãi (thấp hơn giá gốc)</label>
            <input id="pf-sale" type="number" min={0} step={1} className={fieldClass}
              value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="pf-images">URL ảnh (mỗi dòng một URL)</label>
          <textarea id="pf-images" rows={2} className={fieldClass} value={imagesText}
            onChange={(e) => setImagesText(e.target.value)} />
        </div>
        {editing && (
          <div>
            <label className={labelClass} htmlFor="pf-upload">Tải thêm ảnh từ máy (cần Cloudinary)</label>
            <input id="pf-upload" type="file" accept="image/*" multiple className={fieldClass}
              onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Đang bán (hiển thị ở storefront)
        </label>

        <fieldset className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 text-sm font-semibold">Biến thể / SKU</legend>
          <div className="flex flex-col gap-3">
            {variants.map((variant, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-5">
                <input aria-label="SKU" placeholder="SKU *" required className={fieldClass}
                  value={variant.sku} onChange={(e) => updateVariant(index, { sku: e.target.value })} />
                <input aria-label="Màu" placeholder="Màu" className={fieldClass}
                  value={variant.color} onChange={(e) => updateVariant(index, { color: e.target.value })} />
                <input aria-label="Kích cỡ" placeholder="Size" className={fieldClass}
                  value={variant.size} onChange={(e) => updateVariant(index, { size: e.target.value })} />
                <input aria-label="Giá riêng" placeholder="Giá riêng" type="number" min={0} step={1} className={fieldClass}
                  value={variant.price} onChange={(e) => updateVariant(index, { price: e.target.value })} />
                <div className="flex gap-2">
                  <input aria-label="Tồn kho" placeholder="Kho" type="number" min={0} step={1} required className={fieldClass}
                    value={variant.quantity} onChange={(e) => updateVariant(index, { quantity: e.target.value })} />
                  {variants.length > 1 && (
                    <button type="button" className="text-sm text-red-600"
                      onClick={() => setVariants((rows) => rows.filter((_, i) => i !== index))}>
                      Xóa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="mt-3 text-sm font-medium text-brand-600 hover:underline"
            onClick={() => setVariants((rows) => [...rows, emptyVariant()])}>
            + Thêm biến thể
          </button>
          <p className="mt-2 text-xs text-neutral-400">
            Giá để trống = dùng giá sản phẩm (kèm khuyến mãi nếu có). Điền giá riêng = biến thể
            dùng đúng giá đó, khuyến mãi không cộng thêm.
          </p>
        </fieldset>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
          </button>
          <button type="button" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
            onClick={() => navigate('/products')}>
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
