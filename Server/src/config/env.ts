import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(8081),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
  CORS_ORIGINS: z
    .string()
    .default(
      'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174',
    ),
  APP_URL: z.url().default('http://127.0.0.1:5173'),
  MAIL_HOST: z.string().optional().default(''),
  MAIL_PORT: z.coerce.number().int().default(587),
  MAIL_USER: z.string().optional().default(''),
  MAIL_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  CLOUDINARY_NAME: z.string().optional().default(''),
  CLOUDINARY_KEY: z.string().optional().default(''),
  CLOUDINARY_SECRET: z.string().optional().default(''),
});

export type AppEnv = z.infer<typeof envSchema> & { corsOrigins: string[] };

let cached: AppEnv | null = null;

/**
 * Validate environment at startup. On failure, print the offending
 * variable NAMES (never values) and exit, so the process refuses to
 * run with an incomplete configuration.
 */
export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  const env = parsed.data;
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    console.error(
      'Invalid environment configuration:\nJWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ',
    );
    process.exit(1);
  }
  cached = {
    ...env,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
  return cached;
}

export function isSmtpConfigured(env: AppEnv): boolean {
  return Boolean(env.MAIL_HOST && env.MAIL_USER && env.MAIL_PASSWORD);
}

export function isCloudinaryConfigured(env: AppEnv): boolean {
  return Boolean(env.CLOUDINARY_NAME && env.CLOUDINARY_KEY && env.CLOUDINARY_SECRET);
}
