import bcrypt from 'bcryptjs';

/** bcrypt wrapper so the hashing library can be swapped in one place. */
export async function hashPassword(plain: string, cost: number): Promise<string> {
  return bcrypt.hash(plain, cost);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
