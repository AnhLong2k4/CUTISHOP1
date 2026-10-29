/** Small helpers so screens can distinguish HTTP and network failures. */
export function apiStatus(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

export function apiCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export function isNetworkError(error: unknown): boolean {
  return apiCode(error) === 'NETWORK_ERROR' || apiStatus(error) === 0;
}

export function isSessionExpired(error: unknown): boolean {
  return apiStatus(error) === 401;
}

/** User-facing message for a catalog/auth API failure. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isNetworkError(error)) {
    return 'Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ API, rồi thử lại.';
  }
  if (isSessionExpired(error)) {
    return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  }
  const message = (error as { message?: string } | null)?.message;
  return message ? message : fallback;
}
