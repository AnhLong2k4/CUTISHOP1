/** Small helpers so pages can distinguish HTTP and network failures. */
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
