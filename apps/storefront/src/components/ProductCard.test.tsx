import type { Product } from '@cutishop1/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProductCard } from './ProductCard';

const base: Product = {
  id: 'p1',
  title: 'Áo thun nữ',
  slug: 'ao-thun-nu',
  category: 'c1',
  price: 200000,
  images: [],
  isActive: true,
  variants: [
    { sku: 'AT-M', size: 'M', quantity: 3, effectivePrice: 150000, inStock: true },
  ],
  priceRange: { min: 150000, max: 150000 },
  onSale: true,
  salePrice: 150000,
  totalStock: 3,
  inStock: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderCard(product: Product) {
  return render(
    <MemoryRouter>
      <ProductCard product={product} />
    </MemoryRouter>,
  );
}

describe('ProductCard', () => {
  it('shows the effective price range and a sale badge', () => {
    renderCard(base);
    expect(screen.getByText('150.000 ₫')).toBeTruthy();
    expect(screen.getByText('GIẢM GIÁ')).toBeTruthy();
    expect(screen.getByText('200.000 ₫')).toBeTruthy();
  });

  it('shows an out-of-stock badge when nothing is in stock', () => {
    renderCard({
      ...base,
      inStock: false,
      totalStock: 0,
      variants: [{ sku: 'AT-M', size: 'M', quantity: 0, effectivePrice: 150000, inStock: false }],
    });
    expect(screen.getByText('Hết hàng')).toBeTruthy();
  });
});
