import { ApiError } from '@cutishop1/api-client';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

const inputClass = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm';
const labelClass = 'mb-1 block text-sm font-medium';
const submitClass =
  'w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50';

function FormShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-center text-2xl font-bold">{title}</h1>
      <div className="rounded-2xl border border-neutral-200 p-6">{children}</div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export function LoginPage() {
  const { login } = useAuth();
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
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormShell title="Đăng nhập">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate={false}>
        <div>
          <label className={labelClass} htmlFor="login-email">Email</label>
          <input id="login-email" type="email" required className={inputClass} value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className={labelClass} htmlFor="login-password">Mật khẩu</label>
          <input id="login-password" type="password" required className={inputClass} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" className={submitClass} disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">Quên mật khẩu?</Link>
          <Link to="/register" className="text-brand-600 hover:underline">Chưa có tài khoản? Đăng ký</Link>
        </div>
      </form>
    </FormShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    setBusy(true);
    try {
      await register(name, email, password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormShell title="Đăng ký tài khoản">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass} htmlFor="reg-name">Họ và tên</label>
          <input id="reg-name" required minLength={2} className={inputClass} value={name}
            onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className={labelClass} htmlFor="reg-email">Email</label>
          <input id="reg-email" type="email" required className={inputClass} value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className={labelClass} htmlFor="reg-password">Mật khẩu (ít nhất 8 ký tự)</label>
          <input id="reg-password" type="password" required minLength={8} className={inputClass}
            value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className={labelClass} htmlFor="reg-confirm">Nhập lại mật khẩu</label>
          <input id="reg-confirm" type="password" required className={inputClass}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" className={submitClass} disabled={busy}>
          {busy ? 'Đang đăng ký…' : 'Đăng ký'}
        </button>
        <p className="text-center text-sm">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-brand-600 hover:underline">Đăng nhập</Link>
        </p>
      </form>
    </FormShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <FormShell title="Quên mật khẩu">
        <p className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800" role="status">
          Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.
          Vui lòng kiểm tra hộp thư (kể cả mục spam) và mở liên kết trong vòng 15 phút.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-brand-600 hover:underline">Quay lại đăng nhập</Link>
        </p>
      </FormShell>
    );
  }

  return (
    <FormShell title="Quên mật khẩu">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass} htmlFor="forgot-email">Email đã đăng ký</label>
          <input id="forgot-email" type="email" required className={inputClass} value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" className={submitClass} disabled={busy}>
          {busy ? 'Đang gửi…' : 'Gửi hướng dẫn đặt lại'}
        </button>
      </form>
    </FormShell>
  );
}

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ.');
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <FormShell title="Đặt lại mật khẩu">
        <p className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800" role="status">
          Đặt lại mật khẩu thành công. Mọi phiên đăng nhập cũ đã bị đăng xuất vì an toàn.
        </p>
        <button type="button" className={`${submitClass} mt-4`} onClick={() => navigate('/login')}>
          Đăng nhập bằng mật khẩu mới
        </button>
      </FormShell>
    );
  }

  return (
    <FormShell title="Đặt mật khẩu mới">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass} htmlFor="reset-password">Mật khẩu mới (ít nhất 8 ký tự)</label>
          <input id="reset-password" type="password" required minLength={8} className={inputClass}
            value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className={labelClass} htmlFor="reset-confirm">Nhập lại mật khẩu mới</label>
          <input id="reset-confirm" type="password" required className={inputClass}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" className={submitClass} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
        </button>
      </form>
    </FormShell>
  );
}

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-5xl font-extrabold text-brand-500">404</p>
      <h1 className="mt-2 text-xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-sm text-neutral-500">Trang bạn tìm không tồn tại hoặc đã được di chuyển.</p>
      <Link to="/" className="mt-4 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
        Về trang chủ
      </Link>
    </div>
  );
}
