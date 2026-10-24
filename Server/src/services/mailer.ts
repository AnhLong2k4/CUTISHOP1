import nodemailer from 'nodemailer';
import { isSmtpConfigured, loadEnv } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * Mail delivery sits behind this adapter so the rest of the system
 * never depends on a concrete provider. Implementations:
 * - SmtpMailer: real delivery through the configured SMTP account.
 * - ConsoleMailer: development only, prints the reset link to the
 *   server console (never to an API response, never in production).
 */
export interface Mailer {
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
}

class SmtpMailer implements Mailer {
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const env = loadEnv();
    const transporter = nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_PORT === 465,
      auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
    });
    await transporter.sendMail({
      from: env.MAIL_FROM || env.MAIL_USER,
      to: email,
      subject: 'CUTISHOP1 — Đặt lại mật khẩu',
      text: `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu CUTISHOP1.\n\nMở liên kết sau trong vòng 15 phút để đặt mật khẩu mới:\n${resetUrl}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    });
  }
}

class ConsoleMailer implements Mailer {
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    console.log(
      `[dev-mail] Password reset for ${email}: ${resetUrl} (development console mailer — no email was sent)`,
    );
  }
}

class UnconfiguredMailer implements Mailer {
  async sendPasswordReset(): Promise<void> {
    throw new ApiError(
      503,
      'EMAIL_NOT_CONFIGURED',
      'Chức năng gửi email chưa được cấu hình trên máy chủ',
    );
  }
}

export function createMailer(): Mailer {
  const env = loadEnv();
  if (isSmtpConfigured(env)) return new SmtpMailer();
  if (env.NODE_ENV === 'production') return new UnconfiguredMailer();
  return new ConsoleMailer();
}
