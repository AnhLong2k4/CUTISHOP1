import type {
  CartItemInput,
  Quote,
} from '@cutishop1/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import {
  apiCode,
  apiErrorMessage,
  apiStatus,
  isNetworkError,
} from '../lib/apiError';
import { cartItemCount, shouldResetCart } from '../lib/cart';

/**
 * Cart state for the mobile app (Phase 2A). The server is the source
 * of truth: the cart itself comes from GET /cart and all display
 * prices/totals come from POST /checkout/quote — never from a
 * client-side total. The cart stores only (productId, sku, quantity);
 * product images are fetched separately from the catalog for display
 * and are never used for pricing.
 *
 * Auth rules:
 * - Cart endpoints require auth (Server checkout.routes uses
 *   requireAuth), so an anonymous user cannot have a server cart.
 *   addItem returns 'login-required' instead of calling the API.
 * - The cart is per account on the server (unique index on user).
 *   Locally, any change of user id resets the cart state, so one
 *   account's cart is never shown to another account.
 * - A 401 that survives the api-client's mobile refresh means the
 *   session is unrecoverable: the session is expired (via
 *   handleSessionExpired) and the cart screen shows the login prompt.
 * - Invalid lines (product inactive, variant gone) make the quote
 *   fail as a whole. In that case the cart items are still shown
 *   (from GET /cart) with remove buttons and no prices, so the user
 *   can recover by removing the bad lines — the storefront has the
 *   same quote-failure behaviour, but only an error screen.
 */

export type AddCartResult =
  | { ok: true }
  | { ok: false; reason: 'login-required' | 'error'; message?: string };

const INVALID_LINE_CODES = new Set([
  'PRODUCT_NOT_FOUND',
  'VARIANT_NOT_FOUND',
  'PRODUCT_INACTIVE',
]);

interface CartContextValue {
  items: CartItemInput[];
  quote: Quote | null;
  imagesByProduct: Record<string, string>;
  count: number;
  subtotal: number | null;
  canOrder: boolean;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  notice: string | null;
  sessionExpired: boolean;
  /** Set when the quote failed because a line is no longer valid. */
  quoteErrorCode: string | null;
  refresh: () => Promise<void>;
  addItem: (
    productId: string,
    sku: string,
    quantity: number,
  ) => Promise<AddCartResult>;
  updateQuantity: (
    productId: string,
    sku: string,
    quantity: number,
  ) => Promise<void>;
  removeItem: (productId: string, sku: string) => Promise<void>;
  clearCart: () => Promise<void>;
  clearNotice: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, status, handleSessionExpired } = useAuth();
  const [items, setItems] = useState<CartItemInput[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [imagesByProduct, setImagesByProduct] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [quoteErrorCode, setQuoteErrorCode] = useState<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setItems([]);
    setQuote(null);
    setImagesByProduct({});
    setError(null);
    setNotice(null);
    setSessionExpired(false);
    setQuoteErrorCode(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    setQuoteErrorCode(null);
    try {
      const cart = await api.getCart();
      setItems(cart.items);
      if (cart.items.length === 0) {
        setQuote(null);
        setImagesByProduct({});
        return;
      }
      try {
        const data = await api.quote({ items: cart.items });
        setQuote(data);
        // Images are display-only: fetch them from the catalog in
        // parallel; a failed image fetch must not fail the cart.
        const uniqueIds = [...new Set(cart.items.map((i) => i.productId))];
        const settled = await Promise.allSettled(
          uniqueIds.map((id) => api.getProduct(id)),
        );
        const images: Record<string, string> = {};
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.images?.[0]) {
            images[uniqueIds[index]] = result.value.images[0];
          }
        });
        setImagesByProduct(images);
      } catch (quoteErr) {
        const code = apiCode(quoteErr);
        if (code && INVALID_LINE_CODES.has(code)) {
          // Keep the cart items so the user can remove the bad lines;
          // show no prices/subtotal until the quote succeeds again.
          setQuote(null);
          setQuoteErrorCode(code);
        } else {
          throw quoteErr;
        }
      }
    } catch (err) {
      if (apiStatus(err) === 401) {
        await handleSessionExpired();
        setSessionExpired(true);
        setItems([]);
        setQuote(null);
      } else {
        setError(apiErrorMessage(err, 'Không tải được giỏ hàng.'));
      }
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpired]);

  // Reset + reload whenever the account changes; never carry one
  // account's cart into another account's session.
  useEffect(() => {
    if (status === 'loading') return;
    const nextUserId = status === 'authenticated' && user ? user.id : null;
    if (shouldResetCart(prevUserIdRef.current, nextUserId)) {
      prevUserIdRef.current = nextUserId;
      reset();
      if (nextUserId) void load();
    }
  }, [status, user, load, reset]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>, failureMessage: string) => {
      setNotice(null);
      setMutating(true);
      try {
        await fn();
        await load();
      } catch (err) {
        if (apiStatus(err) === 401) {
          await handleSessionExpired();
          setSessionExpired(true);
        } else {
          setNotice(
            isNetworkError(err)
              ? 'Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.'
              : failureMessage,
          );
        }
      } finally {
        setMutating(false);
      }
    },
    [handleSessionExpired, load],
  );

  const addItem = useCallback(
    async (
      productId: string,
      sku: string,
      quantity: number,
    ): Promise<AddCartResult> => {
      if (status !== 'authenticated') {
        return { ok: false, reason: 'login-required' };
      }
      setNotice(null);
      setMutating(true);
      try {
        await api.addCartItem({ productId, sku, quantity });
        await load();
        return { ok: true };
      } catch (err) {
        if (apiStatus(err) === 401) {
          await handleSessionExpired();
          setSessionExpired(true);
          return { ok: false, reason: 'error', message: 'Phiên đăng nhập đã hết hạn.' };
        }
        return {
          ok: false,
          reason: 'error',
          message: apiErrorMessage(err, 'Không thêm được vào giỏ hàng.'),
        };
      } finally {
        setMutating(false);
      }
    },
    [status, handleSessionExpired, load],
  );

  const updateQuantity = useCallback(
    async (productId: string, sku: string, quantity: number) => {
      if (quantity <= 0) {
        await mutate(
          () => api.removeCartItem({ productId, sku }),
          'Không xóa được dòng này.',
        );
        return;
      }
      await mutate(
        () => api.updateCartItem({ productId, sku, quantity }),
        'Không cập nhật được số lượng.',
      );
    },
    [mutate],
  );

  const removeItem = useCallback(
    async (productId: string, sku: string) => {
      await mutate(
        () => api.removeCartItem({ productId, sku }),
        'Không xóa được dòng này.',
      );
    },
    [mutate],
  );

  const clearCart = useCallback(async () => {
    await mutate(() => api.clearCart(), 'Không xóa được giỏ hàng.');
  }, [mutate]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      quote,
      imagesByProduct,
      count: cartItemCount(items),
      subtotal: quote ? quote.subtotal : null,
      canOrder: quote ? quote.canOrder : false,
      loading,
      mutating,
      error,
      notice,
      sessionExpired,
      quoteErrorCode,
      refresh: load,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      clearNotice: () => setNotice(null),
    }),
    [
      items,
      quote,
      imagesByProduct,
      loading,
      mutating,
      error,
      notice,
      sessionExpired,
      quoteErrorCode,
      load,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    ],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
