import { formatVND, type Product } from '@cutishop1/contracts';
import { Link } from 'react-router-dom';

export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-[4/5] bg-brand-50">
        {image ? (
          <img
            src={image}
            alt={product.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Chưa có ảnh
          </div>
        )}
        {product.onSale && (
          <span className="absolute left-2 top-2 rounded-md bg-coral-500 px-2 py-0.5 text-xs font-bold text-white">
            GIẢM GIÁ
          </span>
        )}
        {!product.inStock && (
          <span className="absolute bottom-2 left-2 rounded-md bg-neutral-800/85 px-2 py-0.5 text-xs font-semibold text-white">
            Hết hàng
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-neutral-800 group-hover:text-brand-600">
          {product.title}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-base font-bold text-brand-600">
            {formatVND(product.priceRange.min)}
            {product.priceRange.max !== product.priceRange.min &&
              ` – ${formatVND(product.priceRange.max)}`}
          </span>
        </div>
        {product.onSale && (
          <span className="text-xs text-neutral-400 line-through">
            {formatVND(product.price)}
          </span>
        )}
      </div>
    </Link>
  );
}
