import { z } from 'zod';

const email = z.string().trim().pipe(z.email('Email không hợp lệ').max(160));
const password = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(128, 'Mật khẩu quá dài');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Tên phải có ít nhất 2 ký tự').max(80),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Mật khẩu là bắt buộc').max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, 'Token không hợp lệ'),
  password,
});

const objectIdString = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ');

const optionalBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional(),
  category: objectIdString.optional(),
  brand: objectIdString.optional(),
  size: z.string().trim().max(20).optional(),
  color: z.string().trim().max(40).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: optionalBoolean,
  sale: optionalBoolean,
  sort: z
    .enum(['newest', 'oldest', 'priceAsc', 'priceDesc', 'nameAsc', 'nameDesc'])
    .optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const categoryPatchSchema = categoryInputSchema.partial();

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});

export const brandPatchSchema = brandInputSchema.partial();

const orderItemSchema = z.object({
  productId: objectIdString,
  sku: z.string().trim().min(1, 'SKU là bắt buộc').max(64),
  quantity: z.number().int('Số lượng phải là số nguyên').min(1).max(999),
});

const shippingAddressSchema = z.object({
  name: z.string().trim().min(2, 'Tên người nhận là bắt buộc').max(80),
  phone: z.string().trim().min(6, 'Số điện thoại là bắt buộc').max(20),
  address: z.string().trim().min(5, 'Địa chỉ giao hàng là bắt buộc').max(500),
  note: z.string().trim().max(500).optional(),
});

export const cartItemSchema = z.object({
  productId: objectIdString,
  sku: z.string().trim().min(1, 'SKU là bắt buộc').max(64),
  quantity: z.number().int('Số lượng phải là số nguyên').min(1).max(999),
});

export const cartUpdateSchema = z.object({
  productId: objectIdString,
  sku: z.string().trim().min(1, 'SKU là bắt buộc').max(64),
  quantity: z.number().int('Số lượng phải là số nguyên').min(0).max(999),
});

export const cartRemoveSchema = z.object({
  productId: objectIdString,
  sku: z.string().trim().min(1, 'SKU là bắt buộc').max(64),
});

export const quoteSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Cần ít nhất một sản phẩm').max(50),
  couponCode: z.string().trim().max(50).optional(),
});

export const orderCreateSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Cần ít nhất một sản phẩm').max(50),
  shippingAddress: shippingAddressSchema,
  couponCode: z.string().trim().max(50).optional(),
  // Idempotency-Key may also arrive as a header; the controller merges
  // the two sources. Client-sent money fields are intentionally NOT in
  // this schema: zod's default strip behaviour drops unknown keys, so a
  // client subtotal, discount, shipping or total can never reach the
  // pricing logic. The order is always priced from the catalog.
  idempotencyKey: z.string().trim().min(1).max(100).optional(),
});

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .enum([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPING',
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
      'DELIVERY_FAILED',
      'RETURN_REQUESTED',
      'RETURNED',
      'REFUNDED',
    ])
    .optional(),
});

export const orderReasonSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const couponInputSchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.number().int().min(0).max(100000000),
    maxDiscount: z.number().int().min(0).nullable().optional(),
    minOrderAmount: z.number().int().min(0).optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    usageLimitTotal: z.number().int().min(0).nullable().optional(),
    usageLimitPerUser: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (data) => data.type !== 'PERCENT' || (data.value >= 1 && data.value <= 100),
    { message: 'Coupon PERCENT phải có value từ 1 đến 100', path: ['value'] },
  )
  .refine(
    (data) => data.type !== 'PERCENT' || data.maxDiscount !== null,
    { message: 'Coupon PERCENT bắt buộc có maxDiscount', path: ['maxDiscount'] },
  );

export const couponPatchSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  type: z.enum(['PERCENT', 'FIXED']).optional(),
  value: z.number().int().min(0).max(100000000).optional(),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  minOrderAmount: z.number().int().min(0).optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  usageLimitTotal: z.number().int().min(0).nullable().optional(),
  usageLimitPerUser: z.number().int().min(0).nullable().optional(),
});

export const adminOrderStatusSchema = z.object({
  status: z.enum([
    'CONFIRMED',
    'PROCESSING',
    'SHIPPING',
    'DELIVERED',
    'CANCELLED',
    'DELIVERY_FAILED',
    'RETURNED',
    'REFUNDED',
  ]),
  reason: z.string().trim().max(500).optional(),
  restock: z.boolean().optional(),
});

const variantSchema = z.object({
  sku: z.string().trim().min(1, 'SKU là bắt buộc').max(64),
  color: z.string().trim().max(40).optional(),
  size: z.string().trim().max(20).optional(),
  price: z.number().int('Giá biến thể phải là số nguyên VND').min(0).optional(),
  quantity: z.number().int('Tồn kho phải là số nguyên').min(0),
});

export const productInputSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).optional(),
    category: objectIdString,
    brand: objectIdString.optional(),
    price: z.number().int('Giá phải là số nguyên VND').min(0),
    salePrice: z.number().int('Giá khuyến mãi phải là số nguyên VND').min(0).optional(),
    saleStartsAt: z.iso.datetime().optional(),
    saleEndsAt: z.iso.datetime().optional(),
    images: z.array(z.url()).max(10).optional(),
    isActive: z.boolean().optional(),
    variants: z.array(variantSchema).min(1, 'Sản phẩm cần ít nhất một biến thể').max(50),
  })
  .refine(
    (data) => data.salePrice === undefined || data.salePrice < data.price,
    { message: 'Giá khuyến mãi phải thấp hơn giá gốc', path: ['salePrice'] },
  )
  .refine(
    (data) =>
      !data.saleStartsAt ||
      !data.saleEndsAt ||
      new Date(data.saleStartsAt) <= new Date(data.saleEndsAt),
    { message: 'Thời gian khuyến mãi không hợp lệ', path: ['saleEndsAt'] },
  );
