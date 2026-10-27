import { Types } from 'mongoose';
import { Cart, toPublicCart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { loadEnv } from '../config/env.js';
import { calculateOrderTotals, effectivePrice } from '../utils/pricing.js';
import { badRequest, notFound } from '../utils/errors.js';
import { normalizeCouponCode, validateCoupon } from './couponService.js';

export interface CartLineInput {
  productId: string;
  sku: string;
  quantity: number;
}

export interface ResolvedLine {
  productId: string;
  productTitle: string;
  sku: string;
  color?: string;
  size?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: number;
}

function assertObjectId(value: string) {
  if (!Types.ObjectId.isValid(value)) throw badRequest('ID sản phẩm không hợp lệ', 'INVALID_ID');
}

/** Merge duplicate (productId, sku) lines and sort for determinism. */
export function normalizeLines(lines: CartLineInput[]): CartLineInput[] {
  const merged = new Map<string, CartLineInput>();
  for (const line of lines) {
    const key = `${line.productId}:${line.sku}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, { ...line });
  }
  return [...merged.values()].sort((a, b) =>
    `${a.productId}:${a.sku}`.localeCompare(`${b.productId}:${b.sku}`),
  );
}

export async function resolveLines(
  lines: CartLineInput[],
  session?: import('mongoose').ClientSession,
): Promise<ResolvedLine[]> {
  const normalized = normalizeLines(lines);
  const resolved: ResolvedLine[] = [];
  for (const line of normalized) {
    assertObjectId(line.productId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw badRequest('Số lượng phải là số nguyên >= 1', 'INVALID_QUANTITY');
    }
    const query = Product.findById(line.productId);
    if (session) query.session(session);
    const product = await query;
    if (!product) throw notFound('Không tìm thấy sản phẩm', 'PRODUCT_NOT_FOUND');
    if (!product.isActive) throw badRequest('Sản phẩm đã ngừng bán', 'PRODUCT_INACTIVE');
    const variant = product.variants.find((v) => v.sku === line.sku);
    if (!variant) throw notFound('Không tìm thấy biến thể', 'VARIANT_NOT_FOUND');
    const unitPrice = effectivePrice(
      {
        price: product.price,
        salePrice: product.salePrice ?? undefined,
        saleStartsAt: product.saleStartsAt,
        saleEndsAt: product.saleEndsAt,
      },
      variant,
      new Date(),
    );
    const available = Math.max(0, (variant.quantity || 0) - (variant.reserved || 0));
    resolved.push({
      productId: product._id.toString(),
      productTitle: product.title,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      unitPrice,
      quantity: line.quantity,
      lineTotal: unitPrice * line.quantity,
      available,
    });
  }
  return resolved;
}

export async function quote(
  lines: CartLineInput[],
  couponCode: string | null | undefined,
) {
  const resolved = await resolveLines(lines);
  const subtotal = resolved.reduce((sum, line) => sum + line.lineTotal, 0);
  const coupon = await validateCoupon(couponCode ?? null, subtotal);
  const env = loadEnv();
  const totals = calculateOrderTotals(
    resolved.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    coupon
      ? {
          type: coupon.type,
          value: coupon.value,
          maxDiscount: coupon.maxDiscount ?? undefined,
        }
      : null,
    {
      shippingFeeVnd: env.SHIPPING_FEE_VND,
      shippingFreeThresholdVnd: env.SHIPPING_FREE_THRESHOLD_VND ?? null,
    },
  );
  return {
    items: resolved,
    couponCode: normalizeCouponCode(couponCode),
    ...totals,
    canOrder: resolved.every((line) => line.quantity <= line.available),
  };
}

export async function getCart(userId: string) {
  const cart = await Cart.findOne({ user: userId });
  return toPublicCart(cart, userId);
}

export async function addToCart(userId: string, input: CartLineInput) {
  // Validate against the catalog (product active, variant exists) but
  // do NOT reserve stock here. Reservation happens only on order creation.
  await resolveLines([input]);
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({
      user: userId,
      items: [{ productId: new Types.ObjectId(input.productId), sku: input.sku, quantity: input.quantity }],
    });
    return toPublicCart(cart, userId);
  }
  const existing = cart.items.find(
    (item) => item.productId.toString() === input.productId && item.sku === input.sku,
  );
  if (existing) existing.quantity += input.quantity;
  else {
    cart.items.push({
      productId: new Types.ObjectId(input.productId),
      sku: input.sku,
      quantity: input.quantity,
    });
  }
  await cart.save();
  return toPublicCart(cart, userId);
}

export async function updateCartItem(userId: string, input: CartLineInput) {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return toPublicCart(null, userId);
  if (input.quantity === 0) {
    cart.items = cart.items.filter(
      (item) => !(item.productId.toString() === input.productId && item.sku === input.sku),
    );
  } else {
    await resolveLines([input]);
    const existing = cart.items.find(
      (item) => item.productId.toString() === input.productId && item.sku === input.sku,
    );
    if (existing) existing.quantity = input.quantity;
    else {
      cart.items.push({
        productId: new Types.ObjectId(input.productId),
        sku: input.sku,
        quantity: input.quantity,
      });
    }
  }
  await cart.save();
  return toPublicCart(cart, userId);
}

export async function removeCartItem(userId: string, productId: string, sku: string) {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return toPublicCart(null, userId);
  cart.items = cart.items.filter(
    (item) => !(item.productId.toString() === productId && item.sku === sku),
  );
  await cart.save();
  return toPublicCart(cart, userId);
}

export async function clearCart(userId: string) {
  await Cart.deleteOne({ user: userId });
  return toPublicCart(null, userId);
}
