import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(ql)?:/.test(value)),
  JWT_SECRET: z.string().min(32).refine((value) => !value.startsWith('replace-')),
  CORS_ORIGIN: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DB_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  trustProxyHops: number;
  poolMax: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  const env = result.data;
  const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  if (corsOrigins.some((origin) => {
    try {
      const url = new URL(origin);
      return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin;
    } catch {
      return true;
    }
  })) {
    throw new Error('CORS_ORIGIN must contain exact HTTP/HTTPS origins separated by commas');
  }
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    corsOrigins,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    poolMax: env.DB_POOL_MAX,
  };
}
