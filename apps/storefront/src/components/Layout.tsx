import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useState } from 'react';

export function Layout() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('search', keyword.trim());
    navigate(`/products?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-brand-600">
            CUTI<span className="text-coral-500">SHOP1</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium" aria-label="Chính">
            <NavLink to="/" className={({ isActive }) => (isActive ? 'text-brand-600' : 'text-neutral-600')}>
              Trang chủ
            </NavLink>
            <NavLink
              to="/products"
              className={({ isActive }) => (isActive ? 'text-brand-600' : 'text-neutral-600')}
            >
              Sản phẩm
            </NavLink>
            <NavLink
              to="/cart"
              className={({ isActive }) => (isActive ? 'text-brand-600' : 'text-neutral-600')}
            >
              Giỏ hàng
            </NavLink>
            {status === 'authenticated' && (
              <NavLink
                to="/orders"
                className={({ isActive }) => (isActive ? 'text-brand-600' : 'text-neutral-600')}
              >
                Đơn hàng
              </NavLink>
            )}
          </nav>
          <form onSubmit={submitSearch} className="order-3 flex w-full gap-2 sm:order-none sm:w-auto sm:flex-1">
            <label className="sr-only" htmlFor="site-search">Tìm kiếm sản phẩm</label>
            <input
              id="site-search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm áo, quần, váy…"
              className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">
              Tìm
            </button>
          </form>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {status === 'authenticated' && user ? (
              <>
                <span className="hidden text-neutral-600 sm:inline">Xin chào, {user.name}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="font-medium text-brand-600 hover:underline"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="font-medium text-neutral-600 hover:text-brand-600">
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-brand-500 px-3 py-1.5 font-semibold text-white hover:bg-brand-600"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-neutral-500">
          CUTISHOP1 — Đồ án tốt nghiệp CNTT. Thanh toán khi nhận hàng (COD); giá, mã giảm giá và tồn kho do máy chủ kiểm tra.
        </div>
      </footer>
    </div>
  );
}
