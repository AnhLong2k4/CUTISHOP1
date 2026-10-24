import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdminAuthProvider } from '../auth/AdminAuthContext';
import { LoginPage } from './LoginPage';

describe('Admin LoginPage', () => {
  it('renders the admin login form with labelled fields', () => {
    render(
      <MemoryRouter>
        <AdminAuthProvider>
          <LoginPage />
        </AdminAuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng nhập quản trị' })).toBeTruthy();
    expect(screen.getByText(/không có quyền quản trị|Chỉ tài khoản quản trị/)).toBeTruthy();
  });
});
