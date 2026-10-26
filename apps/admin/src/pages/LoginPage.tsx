import { ApiError } from '@cutishop1/api-client';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { inputClass, labelClass, primaryButton } from '../components/ui';

export function LoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/products');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Đăng nhập thất bại.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-md px-4">
      <h1 className="mb-1 text-center text-2xl font-extrabold text-brand-600">
        CUTISHOP1 <span className="text-neutral-700">Admin</span>
      </h1>
      <p className="mb-6 text-center text-sm text-neutral-500">
        Chỉ tài khoản quản trị mới truy cập được khu vực này.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
        <div>
          <label className={labelClass} htmlFor="admin-email">Email</label>
          <input id="admin-email" type="email" required className={inputClass} value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label className={labelClass} htmlFor="admin-password">Mật khẩu</label>
          <input id="admin-password" type="password" required className={inputClass} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập quản trị'}
        </button>
      </form>
    </div>
  );
}
