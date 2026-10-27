import { describe, expect, it } from 'vitest';
import { ApiError } from '@cutishop1/api-client';
import { apiCode, apiStatus, isNetworkError, isSessionExpired } from './apiError';

describe('api error helpers', () => {
  it('distinguishes 401, network failure and generic server errors', () => {
    expect(isSessionExpired(new ApiError(401, 'UNAUTHORIZED', 'x'))).toBe(true);
    expect(isSessionExpired(new ApiError(403, 'FORBIDDEN', 'x'))).toBe(false);
    expect(isNetworkError(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(true);
    expect(isNetworkError(new ApiError(503, 'TRANSACTION_NOT_SUPPORTED', 'x'))).toBe(false);
    expect(apiStatus(new ApiError(404, 'NOT_FOUND', 'x'))).toBe(404);
    expect(apiCode(new ApiError(409, 'INSUFFICIENT_STOCK', 'x'))).toBe('INSUFFICIENT_STOCK');
  });
});
