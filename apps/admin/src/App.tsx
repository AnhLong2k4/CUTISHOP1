import { BrowserRouter, Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './auth/AdminAuthContext';
import { LoadingState } from './components/ui';
import { api } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { ProductsPage } from './pages/ProductsPage';
import { TaxonomyPage, type TaxonomyItem } from './pages/TaxonomyPage';

function AdminShell() {
  const { user, status, logout } = useAdminAuth();

  if (status === 'loading') return <LoadingState label="Đang kiểm tra phiên đăng nhập…" />;
  if (status !== 'authenticated') {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-100'}`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/products" className="text-lg font-extrabold text-brand-600">
          CUTISHOP1 <span className="text-neutral-700">Admin</span>
        </Link>
        <nav className="flex gap-1" aria-label="Quản trị">
          <NavLink to="/products" className={navClass}>Sản phẩm</NavLink>
          <NavLink to="/categories" className={navClass}>Danh mục</NavLink>
          <NavLink to="/brands" className={navClass}>Thương hiệu</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-neutral-500">{user?.name} (admin)</span>
          <button type="button" onClick={() => void logout()} className="font-medium text-brand-600 hover:underline">
            Đăng xuất
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Routes>
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id/edit" element={<ProductFormPage />} />
          <Route
            path="categories"
            element={
              <TaxonomyPage
                title="Danh mục"
                adapter={{
                  list: async () => (await api.getCategories()) as TaxonomyItem[],
                  create: (name) => api.adminCreateCategory({ name }),
                  update: (id, patch) => api.adminUpdateCategory(id, patch),
                  remove: (id) => api.adminDeleteCategory(id),
                }}
              />
            }
          />
          <Route
            path="brands"
            element={
              <TaxonomyPage
                title="Thương hiệu"
                adapter={{
                  list: async () => (await api.getBrands()) as TaxonomyItem[],
                  create: (name) => api.adminCreateBrand({ name }),
                  update: (id, patch) => api.adminUpdateBrand(id, patch),
                  remove: (id) => api.adminDeleteBrand(id),
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/products" replace />} />
        </Routes>
      </main>
      <footer className="py-4 text-center text-xs text-neutral-400">
        Khu vực quản trị tối thiểu của Phase 1 — dashboard, đơn hàng và người dùng thuộc Phase 4.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <AdminShell />
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
