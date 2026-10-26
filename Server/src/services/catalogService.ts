import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { isCloudinaryConfigured, loadEnv } from '../config/env.js';
import { Brand, toPublicBrand, type BrandDoc } from '../models/Brand.js';
import { Category, toPublicCategory, type CategoryDoc } from '../models/Category.js';
import { Product, toPublicProduct, type ProductDoc } from '../models/Product.js';
import {
  buildProductFilter,
  buildProductSort,
  type ProductQueryInput,
} from '../utils/catalogQuery.js';
import { ApiError, badRequest, conflict, notFound } from '../utils/errors.js';
import { buildPageMeta, parsePagination } from '../utils/pagination.js';
import { slugify } from '../utils/slug.js';

function assertObjectId(value: string, message: string): void {
  if (!Types.ObjectId.isValid(value)) throw badRequest(message, 'INVALID_ID');
}

// ---------------- public catalog ----------------

export async function listPublicProducts(query: ProductQueryInput) {
  const pagination = parsePagination(query);
  const filter = buildProductFilter(query);
  const sort = buildProductSort(query.sort);
  const total = await Product.countDocuments(filter);
  const docs = await Product.find(filter)
    .sort(sort)
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate('category')
    .populate('brand');
  return {
    items: docs.map((doc) => toPublicProduct(doc)),
    pagination: buildPageMeta(total, pagination),
  };
}

export async function getPublicProduct(id: string) {
  assertObjectId(id, 'ID sản phẩm không hợp lệ');
  const doc = await Product.findOne({ _id: id, isActive: true })
    .populate('category')
    .populate('brand');
  if (!doc) throw notFound('Không tìm thấy sản phẩm');
  return toPublicProduct(doc);
}

export async function listPublicCategories() {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 });
  return withProductCounts<CategoryDoc>(categories, toPublicCategory, 'category');
}

export async function listPublicBrands() {
  const brands = await Brand.find({ isActive: true }).sort({ name: 1 });
  return withProductCounts<BrandDoc>(brands, toPublicBrand, 'brand');
}

async function withProductCounts<T extends { _id: Types.ObjectId }>(
  docs: T[],
  toPublic: (doc: T, productCount?: number) => unknown,
  field: 'category' | 'brand',
) {
  const counts = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { isActive: true, [field]: { $in: docs.map((d) => d._id) } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return docs.map((doc) => toPublic(doc, byId.get(doc._id.toString()) ?? 0));
}

// ---------------- admin: product reads ----------------

export async function listAdminProducts(query: ProductQueryInput) {
  const pagination = parsePagination(query);
  const filter = buildProductFilter(query);
  // Admins manage the whole catalog, including deactivated products.
  delete filter.isActive;
  const sort = buildProductSort(query.sort);
  const total = await Product.countDocuments(filter);
  const docs = await Product.find(filter)
    .sort(sort)
    .skip(pagination.skip)
    .limit(pagination.limit)
    .populate('category')
    .populate('brand');
  return {
    items: docs.map((doc) => toPublicProduct(doc)),
    pagination: buildPageMeta(total, pagination),
  };
}

export async function getAdminProduct(id: string) {
  assertObjectId(id, 'ID sản phẩm không hợp lệ');
  const doc = await Product.findById(id).populate('category').populate('brand');
  if (!doc) throw notFound('Không tìm thấy sản phẩm');
  return toPublicProduct(doc);
}

// ---------------- admin: categories & brands ----------------

interface ExistsCapable {
  exists(query: Record<string, unknown>): Promise<unknown>;
}

async function uniqueSlug(
  base: string,
  model: ExistsCapable,
  excludeId?: string,
): Promise<string> {
  let candidate = base || 'item';
  let suffix = 2;
  for (;;) {
    const query: Record<string, unknown> = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await model.exists(query);
    if (!exists) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export async function createCategory(input: {
  name: string;
  description?: string;
  isActive?: boolean;
}) {
  const slug = await uniqueSlug(slugify(input.name), Category);
  const doc = await Category.create({ ...input, slug });
  return toPublicCategory(doc, 0);
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string; isActive?: boolean },
) {
  assertObjectId(id, 'ID danh mục không hợp lệ');
  const doc = await Category.findById(id);
  if (!doc) throw notFound('Không tìm thấy danh mục');
  if (input.name && input.name !== doc.name) {
    doc.slug = await uniqueSlug(slugify(input.name), Category, id);
    doc.name = input.name;
  }
  if (input.description !== undefined) doc.description = input.description;
  if (input.isActive !== undefined) doc.isActive = input.isActive;
  await doc.save();
  return toPublicCategory(doc);
}

export async function deleteCategory(id: string) {
  assertObjectId(id, 'ID danh mục không hợp lệ');
  const doc = await Category.findById(id);
  if (!doc) throw notFound('Không tìm thấy danh mục');
  const referenced = await Product.countDocuments({ category: doc._id });
  if (referenced > 0) {
    throw conflict(
      'Danh mục đang được sản phẩm sử dụng, không thể xóa. Hãy vô hiệu hóa thay vì xóa.',
      'CATEGORY_IN_USE',
    );
  }
  await doc.deleteOne();
  return { id };
}

export async function createBrand(input: { name: string; isActive?: boolean }) {
  const slug = await uniqueSlug(slugify(input.name), Brand);
  const doc = await Brand.create({ ...input, slug });
  return toPublicBrand(doc, 0);
}

export async function updateBrand(
  id: string,
  input: { name?: string; isActive?: boolean },
) {
  assertObjectId(id, 'ID thương hiệu không hợp lệ');
  const doc = await Brand.findById(id);
  if (!doc) throw notFound('Không tìm thấy thương hiệu');
  if (input.name && input.name !== doc.name) {
    doc.slug = await uniqueSlug(slugify(input.name), Brand, id);
    doc.name = input.name;
  }
  if (input.isActive !== undefined) doc.isActive = input.isActive;
  await doc.save();
  return toPublicBrand(doc);
}

export async function deleteBrand(id: string) {
  assertObjectId(id, 'ID thương hiệu không hợp lệ');
  const doc = await Brand.findById(id);
  if (!doc) throw notFound('Không tìm thấy thương hiệu');
  const referenced = await Product.countDocuments({ brand: doc._id });
  if (referenced > 0) {
    throw conflict(
      'Thương hiệu đang được sản phẩm sử dụng, không thể xóa. Hãy vô hiệu hóa thay vì xóa.',
      'BRAND_IN_USE',
    );
  }
  await doc.deleteOne();
  return { id };
}

// ---------------- admin: products ----------------

export interface ProductInputData {
  title: string;
  description?: string;
  category: string;
  brand?: string;
  price: number;
  salePrice?: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
  images?: string[];
  isActive?: boolean;
  variants: Array<{
    sku: string;
    color?: string;
    size?: string;
    price?: number;
    quantity: number;
  }>;
}

async function assertCatalogRefs(input: ProductInputData): Promise<void> {
  assertObjectId(input.category, 'ID danh mục không hợp lệ');
  const category = await Category.findById(input.category);
  if (!category) throw badRequest('Danh mục không tồn tại', 'INVALID_CATEGORY');
  if (input.brand) {
    assertObjectId(input.brand, 'ID thương hiệu không hợp lệ');
    const brand = await Brand.findById(input.brand);
    if (!brand) throw badRequest('Thương hiệu không tồn tại', 'INVALID_BRAND');
  }
}

async function assertSkusAvailable(
  variants: ProductInputData['variants'],
  excludeProductId?: string,
): Promise<void> {
  const skus = variants.map((v) => v.sku.trim());
  if (new Set(skus).size !== skus.length) {
    throw badRequest('SKU bị trùng trong cùng một sản phẩm', 'DUPLICATE_SKU');
  }
  const query: Record<string, unknown> = { 'variants.sku': { $in: skus } };
  if (excludeProductId) query._id = { $ne: excludeProductId };
  const clash = await Product.findOne(query).select('variants.sku');
  if (clash) {
    const used = clash.variants.map((v) => v.sku).filter((sku) => skus.includes(sku));
    throw conflict(`SKU đã tồn tại: ${used.join(', ')}`, 'SKU_ALREADY_EXISTS');
  }
}

export async function createProduct(input: ProductInputData) {
  await assertCatalogRefs(input);
  await assertSkusAvailable(input.variants);
  const slug = await uniqueSlug(slugify(input.title), Product);
  const doc = await Product.create({
    ...input,
    slug,
    brand: input.brand ?? null,
    salePrice: input.salePrice ?? null,
    saleStartsAt: input.saleStartsAt ? new Date(input.saleStartsAt) : null,
    saleEndsAt: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
  });
  await doc.populate(['category', 'brand']);
  return toPublicProduct(doc);
}

export async function updateProduct(id: string, input: ProductInputData) {
  assertObjectId(id, 'ID sản phẩm không hợp lệ');
  const doc = await Product.findById(id);
  if (!doc) throw notFound('Không tìm thấy sản phẩm');
  await assertCatalogRefs(input);
  await assertSkusAvailable(input.variants, id);
  if (input.title !== doc.title) {
    doc.slug = await uniqueSlug(slugify(input.title), Product, id);
  }
  doc.title = input.title;
  doc.description = input.description;
  doc.category = new Types.ObjectId(input.category);
  doc.brand = input.brand ? new Types.ObjectId(input.brand) : null;
  doc.price = input.price;
  doc.salePrice = input.salePrice ?? null;
  doc.saleStartsAt = input.saleStartsAt ? new Date(input.saleStartsAt) : null;
  doc.saleEndsAt = input.saleEndsAt ? new Date(input.saleEndsAt) : null;
  doc.images = input.images ?? doc.images;
  if (input.isActive !== undefined) doc.isActive = input.isActive;
  doc.variants = input.variants as ProductDoc['variants'];
  await doc.save();
  await doc.populate(['category', 'brand']);
  return toPublicProduct(doc);
}

/** DELETE is a soft delete: the product is deactivated, never destroyed. */
export async function deactivateProduct(id: string) {
  assertObjectId(id, 'ID sản phẩm không hợp lệ');
  const doc = await Product.findById(id);
  if (!doc) throw notFound('Không tìm thấy sản phẩm');
  doc.isActive = false;
  await doc.save();
  return { id, isActive: false };
}

export async function uploadProductImages(
  id: string,
  files: Express.Multer.File[],
) {
  assertObjectId(id, 'ID sản phẩm không hợp lệ');
  const env = loadEnv();
  if (!isCloudinaryConfigured(env)) {
    throw new ApiError(
      503,
      'MEDIA_NOT_CONFIGURED',
      'Tính năng tải ảnh chưa được cấu hình trên máy chủ',
    );
  }
  const doc = await Product.findById(id);
  if (!doc) throw notFound('Không tìm thấy sản phẩm');
  if (doc.images.length + files.length > 10) {
    throw badRequest('Mỗi sản phẩm tối đa 10 ảnh', 'TOO_MANY_IMAGES');
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_NAME,
    api_key: env.CLOUDINARY_KEY,
    api_secret: env.CLOUDINARY_SECRET,
  });
  for (const file of files) {
    const url = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'cutishop1/products' },
        (error, result) => {
          if (error || !result) reject(error ?? new Error('Upload failed'));
          else resolve(result.secure_url);
        },
      );
      stream.end(file.buffer);
    });
    doc.images.push(url);
  }
  await doc.save();
  await doc.populate(['category', 'brand']);
  return toPublicProduct(doc);
}
