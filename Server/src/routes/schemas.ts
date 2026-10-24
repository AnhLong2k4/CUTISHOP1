import { z } from 'zod';

const email = z.string().trim().email('Email không hợp lệ').max(160);
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
    saleStartsAt: z.string().datetime().optional(),
    saleEndsAt: z.string().datetime().optional(),
    images: z.array(z.string().url()).max(10).optional(),
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
