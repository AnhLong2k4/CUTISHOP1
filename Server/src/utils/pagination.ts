export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Clamp pagination input: page >= 1, 1 <= limit <= 100 (default 20). */
export function parsePagination(input: {
  page?: number;
  limit?: number;
}): PaginationParams {
  const rawPage = Number.isFinite(input.page) ? Math.floor(input.page as number) : 1;
  const rawLimit = Number.isFinite(input.limit)
    ? Math.floor(input.limit as number)
    : DEFAULT_LIMIT;
  const page = Math.max(1, rawPage);
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPageMeta(total: number, params: PaginationParams) {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  };
}
