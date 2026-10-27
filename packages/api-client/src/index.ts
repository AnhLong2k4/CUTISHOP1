import type {
  Brand,
  Cart,
  CartItemInput,
  Category,
  Order,
  OrderStatus,
  Page,
  Product,
  ProductInput,
  ProductQuery,
  PublicUser,
  Quote,
  ShippingAddress,
} from '@cutishop1/contracts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** In-memory access token holder supplied by the host app. */
export interface TokenStore {
  get(): string | null;
  set(token: string | null): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetchImpl?: typeof fetch;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenStore: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.tokenStore = options.tokenStore;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  // ---------- low level ----------

  private async rawRequest<T>(
    path: string,
    init: RequestInit & { auth?: boolean } = {},
  ): Promise<T> {
    const { auth = true, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    // Custom header marks cookie-authenticated requests as non-simple,
    // which together with the CORS allowlist mitigates CSRF.
    headers.set('X-Requested-With', 'XMLHttpRequest');
    const token = auth ? this.tokenStore.get() : null;
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...rest,
      headers,
      credentials: 'include',
    });
    const text = await response.text();
    let body: Envelope<T> | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as Envelope<T>;
      } catch {
        body = null;
      }
    }
    if (!response.ok || !body || body.success !== true) {
      const err = body?.error;
      throw new ApiError(
        response.status,
        err?.code ?? 'HTTP_ERROR',
        err?.message ?? `Request failed with status ${response.status}`,
        err?.details,
      );
    }
    return body.data as T;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { auth?: boolean } = {},
    allowRefreshRetry = true,
  ): Promise<T> {
    try {
      return await this.rawRequest<T>(path, init);
    } catch (error) {
      if (
        allowRefreshRetry &&
        error instanceof ApiError &&
        error.status === 401 &&
        this.tokenStore.get()
      ) {
        const newToken = await this.refreshSession();
        if (newToken) {
          return this.rawRequest<T>(path, init);
        }
      }
      throw error;
    }
  }

  // ---------- auth ----------

  async register(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; accessToken: string }> {
    const data = await this.request<{
      user: PublicUser;
      accessToken: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      auth: false,
    });
    this.tokenStore.set(data.accessToken);
    return data;
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; accessToken: string }> {
    const data = await this.request<{ user: PublicUser; accessToken: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify(input), auth: false },
    );
    this.tokenStore.set(data.accessToken);
    return data;
  }

  /** Rotate the refresh cookie and store the new access token. */
  async refreshSession(): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        try {
          const data = await this.rawRequest<{ accessToken: string }>(
            '/auth/refresh',
            { method: 'POST', auth: false },
          );
          this.tokenStore.set(data.accessToken);
          return data.accessToken;
        } catch {
          this.tokenStore.set(null);
          return null;
        } finally {
          this.refreshInFlight = null;
        }
      })();
    }
    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    try {
      await this.rawRequest('/auth/logout', { method: 'POST' });
    } finally {
      this.tokenStore.set(null);
    }
  }

  async me(): Promise<PublicUser> {
    return this.request<PublicUser>('/auth/me');
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      auth: false,
    });
  }

  async resetPassword(input: {
    token: string;
    password: string;
  }): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
      auth: false,
    });
  }

  // ---------- public catalog ----------

  async getProducts(query: ProductQuery = {}): Promise<Page<Product>> {
    return this.request<Page<Product>>(
      `/products${toQueryString(query as Record<string, unknown>)}`,
      { auth: false },
    );
  }

  async getProduct(id: string): Promise<Product> {
    return this.request<Product>(`/products/${encodeURIComponent(id)}`, {
      auth: false,
    });
  }

  async getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/categories', { auth: false });
  }

  async getBrands(): Promise<Brand[]> {
    return this.request<Brand[]>('/brands', { auth: false });
  }

  // ---------- cart, quote and orders ----------

  async getCart(): Promise<Cart> {
    return this.request<Cart>('/cart');
  }

  async addCartItem(input: CartItemInput): Promise<Cart> {
    return this.request<Cart>('/cart/items', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateCartItem(input: CartItemInput): Promise<Cart> {
    return this.request<Cart>('/cart/items', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async removeCartItem(input: { productId: string; sku: string }): Promise<Cart> {
    return this.request<Cart>('/cart/items', {
      method: 'DELETE',
      body: JSON.stringify(input),
    });
  }

  async clearCart(): Promise<Cart> {
    return this.request<Cart>('/cart', { method: 'DELETE' });
  }

  async quote(input: {
    items: CartItemInput[];
    couponCode?: string;
  }): Promise<Quote> {
    return this.request<Quote>('/checkout/quote', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async createOrder(
    input: {
      items: CartItemInput[];
      shippingAddress: ShippingAddress;
      couponCode?: string;
    },
    idempotencyKey: string,
  ): Promise<Order> {
    return this.request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  async listMyOrders(query: { page?: number; limit?: number; status?: OrderStatus } = {}): Promise<Page<Order>> {
    return this.request<Page<Order>>(
      `/orders/my${toQueryString(query as Record<string, unknown>)}`,
    );
  }

  async getMyOrder(id: string): Promise<Order> {
    return this.request<Order>(`/orders/${encodeURIComponent(id)}`);
  }

  async cancelMyOrder(id: string, reason?: string): Promise<Order> {
    return this.request<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async completeMyOrder(id: string): Promise<Order> {
    return this.request<Order>(`/orders/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
    });
  }

  async requestReturnMyOrder(id: string, reason?: string): Promise<Order> {
    return this.request<Order>(`/orders/${encodeURIComponent(id)}/return-request`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async adminListOrders(
    query: { page?: number; limit?: number; status?: OrderStatus } = {},
  ): Promise<Page<Order>> {
    return this.request<Page<Order>>(
      `/admin/orders${toQueryString(query as Record<string, unknown>)}`,
    );
  }

  async adminGetOrder(id: string): Promise<Order> {
    return this.request<Order>(`/admin/orders/${encodeURIComponent(id)}`);
  }

  async adminUpdateOrderStatus(
    id: string,
    input: { status: OrderStatus; reason?: string; restock?: boolean },
  ): Promise<Order> {
    return this.request<Order>(`/admin/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  // ---------- admin coupons ----------

  async adminCreateCoupon(input: {
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    maxDiscount?: number | null;
    minOrderAmount?: number;
    startsAt?: string | null;
    endsAt?: string | null;
    isActive?: boolean;
    usageLimitTotal?: number | null;
    usageLimitPerUser?: number | null;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async adminListCoupons(
    query: { page?: number; limit?: number } = {},
  ): Promise<Page<Record<string, unknown>>> {
    return this.request<Page<Record<string, unknown>>>(
      `/admin/coupons${toQueryString(query as Record<string, unknown>)}`,
    );
  }

  async adminGetCoupon(id: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/admin/coupons/${encodeURIComponent(id)}`);
  }

  async adminUpdateCoupon(
    id: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async adminDeleteCoupon(id: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ---------- admin catalog ----------

  async adminGetProducts(query: ProductQuery = {}): Promise<Page<Product>> {
    return this.request<Page<Product>>(
      `/admin/products${toQueryString(query as Record<string, unknown>)}`,
    );
  }

  async adminGetProduct(id: string): Promise<Product> {
    return this.request<Product>(`/admin/products/${encodeURIComponent(id)}`);
  }

  async adminCreateProduct(input: ProductInput): Promise<Product> {
    return this.request<Product>('/admin/products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async adminUpdateProduct(id: string, input: ProductInput): Promise<Product> {
    return this.request<Product>(`/admin/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async adminDeleteProduct(id: string): Promise<{ id: string; isActive: boolean }> {
    return this.request(`/admin/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async adminUploadProductImages(
    id: string,
    files: File[],
  ): Promise<Product> {
    const form = new FormData();
    for (const file of files) form.append('images', file);
    return this.request<Product>(
      `/admin/products/${encodeURIComponent(id)}/images`,
      { method: 'PUT', body: form },
    );
  }

  async adminCreateCategory(input: {
    name: string;
    description?: string;
    isActive?: boolean;
  }): Promise<Category> {
    return this.request<Category>('/admin/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async adminUpdateCategory(
    id: string,
    input: { name?: string; description?: string; isActive?: boolean },
  ): Promise<Category> {
    return this.request<Category>(`/admin/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async adminDeleteCategory(id: string): Promise<{ id: string }> {
    return this.request(`/admin/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async adminCreateBrand(input: {
    name: string;
    isActive?: boolean;
  }): Promise<Brand> {
    return this.request<Brand>('/admin/brands', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async adminUpdateBrand(
    id: string,
    input: { name?: string; isActive?: boolean },
  ): Promise<Brand> {
    return this.request<Brand>(`/admin/brands/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async adminDeleteBrand(id: string): Promise<{ id: string }> {
    return this.request(`/admin/brands/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
}

/** Simple in-memory token store for the host app. */
export function createMemoryTokenStore(): TokenStore & { clear(): void } {
  let token: string | null = null;
  return {
    get: () => token,
    set: (value) => {
      token = value;
    },
    clear: () => {
      token = null;
    },
  };
}
