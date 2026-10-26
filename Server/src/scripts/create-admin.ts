/**
 * Create the first admin account. Run locally by the project owner:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run create-admin
 * Credentials come from the environment only; nothing is printed
 * except the outcome. If the account already exists, nothing changes.
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { loadEnv } from '../config/env.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';

async function main() {
  const env = loadEnv();
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = (process.env.ADMIN_NAME ?? 'Admin').trim();
  if (!email || password.length < 8) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD (>= 8 chars) are required');
    process.exit(1);
  }
  await connectDB(env.MONGO_URI);
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Account ${email} already exists with role "${existing.role}". No changes made.`);
    await disconnectDB();
    return;
  }
  await User.create({
    name,
    email,
    passwordHash: await hashPassword(password, env.BCRYPT_COST),
    role: 'admin',
  });
  console.log(`Admin account created for ${email}.`);
  await disconnectDB();
}

main().catch(async (error) => {
  console.error('create-admin failed:', error instanceof Error ? error.message : error);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
