/**
 * Development/test seed for CUTISHOP1.
 *
 * Safety properties:
 * - Insert-missing-only: records are matched by slug and never updated,
 *   so re-running cannot overwrite real data.
 * - Supports --dry-run (prints the plan, connects to nothing).
 * - Creates NO user by default. A non-admin demo customer is created
 *   only when SEED_DEMO_USER=1 and SEED_DEMO_PASSWORD (>= 8 chars)
 *   are set. It never creates an admin.
 * - Refuses to run when NODE_ENV=production.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { loadEnv } from '../config/env.js';
import { Brand } from '../models/Brand.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { slugify } from '../utils/slug.js';

interface SeedProduct {
  title: string;
  category: string;
  brand: string;
  price: number;
  salePrice?: number;
  variants: Array<{ sku: string; color?: string; size?: string; price?: number; quantity: number }>;
}

export const SEED_CATEGORIES = ['Áo', 'Quần', 'Váy'];
export const SEED_BRANDS = ['Cuti Basic', 'Cuti Studio'];
export const SEED_PRODUCTS: SeedProduct[] = [
  {
    title: 'Áo thun nữ form rộng',
    category: 'Áo',
    brand: 'Cuti Basic',
    price: 199000,
    salePrice: 149000,
    variants: [
      { sku: 'ATN-WHT-M', color: 'Trắng', size: 'M', quantity: 12 },
      { sku: 'ATN-BLK-M', color: 'Đen', size: 'M', quantity: 0 },
    ],
  },
  {
    title: 'Áo sơ mi lụa nữ',
    category: 'Áo',
    brand: 'Cuti Studio',
    price: 349000,
    variants: [{ sku: 'ASM-CRM-S', color: 'Kem', size: 'S', price: 359000, quantity: 5 }],
  },
  {
    title: 'Quần jean ống đứng',
    category: 'Quần',
    brand: 'Cuti Basic',
    price: 399000,
    variants: [
      { sku: 'QJ-BLU-28', color: 'Xanh', size: '28', quantity: 7 },
      { sku: 'QJ-BLU-30', color: 'Xanh', size: '30', quantity: 3 },
    ],
  },
  {
    title: 'Quần tây nữ cạp cao',
    category: 'Quần',
    brand: 'Cuti Studio',
    price: 429000,
    variants: [{ sku: 'QT-BLK-M', color: 'Đen', size: 'M', quantity: 0 }],
  },
  {
    title: 'Váy hoa nhí dáng dài',
    category: 'Váy',
    brand: 'Cuti Studio',
    price: 459000,
    salePrice: 399000,
    variants: [{ sku: 'VH-PNK-S', color: 'Hồng', size: 'S', quantity: 9 }],
  },
  {
    title: 'Váy len cổ lọ',
    category: 'Váy',
    brand: 'Cuti Basic',
    price: 379000,
    variants: [{ sku: 'VL-GRY-M', color: 'Xám', size: 'M', quantity: 4 }],
  },
];

function imageFor(title: string): string {
  const text = encodeURIComponent(title);
  return `https://placehold.co/600x750/png?text=${text}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const plan = {
    categories: SEED_CATEGORIES.length,
    brands: SEED_BRANDS.length,
    products: SEED_PRODUCTS.length,
  };
  if (dryRun) {
    console.log('Seed plan (dry-run, no database connection):', plan);
    return;
  }
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to seed when NODE_ENV=production');
    process.exit(1);
  }
  await connectDB(env.MONGO_URI);
  const created = { categories: 0, brands: 0, products: 0, users: 0 };
  const skipped = { categories: 0, brands: 0, products: 0, users: 0 };

  const categoryIds = new Map<string, string>();
  for (const name of SEED_CATEGORIES) {
    const slug = slugify(name);
    const existing = await Category.findOne({ slug });
    if (existing) {
      skipped.categories++;
      categoryIds.set(name, existing._id.toString());
    } else {
      const doc = await Category.create({ name, slug });
      created.categories++;
      categoryIds.set(name, doc._id.toString());
    }
  }
  const brandIds = new Map<string, string>();
  for (const name of SEED_BRANDS) {
    const slug = slugify(name);
    const existing = await Brand.findOne({ slug });
    if (existing) {
      skipped.brands++;
      brandIds.set(name, existing._id.toString());
    } else {
      const doc = await Brand.create({ name, slug });
      created.brands++;
      brandIds.set(name, doc._id.toString());
    }
  }
  for (const product of SEED_PRODUCTS) {
    const slug = slugify(product.title);
    const existing = await Product.findOne({ slug });
    if (existing) {
      skipped.products++;
      continue;
    }
    await Product.create({
      title: product.title,
      slug,
      category: categoryIds.get(product.category),
      brand: brandIds.get(product.brand),
      price: product.price,
      salePrice: product.salePrice ?? null,
      images: [imageFor(product.title)],
      variants: product.variants,
    });
    created.products++;
  }

  if (process.env.SEED_DEMO_USER === '1') {
    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? '';
    if (demoPassword.length < 8) {
      console.error('SEED_DEMO_PASSWORD must be at least 8 characters; demo user skipped.');
    } else {
      const email = 'demo@cutishop1.local';
      const existing = await User.findOne({ email });
      if (existing) skipped.users++;
      else {
        await User.create({
          name: 'Khách Demo',
          email,
          passwordHash: await hashPassword(demoPassword, env.BCRYPT_COST),
          role: 'user',
        });
        created.users++;
      }
    }
  }

  console.log('Seed finished. Created:', created, 'Skipped (already present):', skipped);
  await disconnectDB();
}

const isMain = process.argv[1]?.endsWith('seed-dev.ts');
if (isMain) {
  main().catch(async (error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    await disconnectDB().catch(() => undefined);
    process.exit(1);
  });
}
