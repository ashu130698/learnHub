import { z } from 'zod';
import dotenv from 'dotenv';

//Load .env file into process.env before anything else runs
dotenv.config();

// Define exactly what environment variables we expect and their types
// If anything is missing or wrong, the app crashes HERE at startup
// Much better than a cryptic error 10 minutes later inside a resolver
const envSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  ACCESS_TOKEN_SECRET: z.string().min(8),
  REFRESH_TOKEN_SECRET: z.string().min(8),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("❌ Missing or invalid environment variables:");
    console.error(parsed.error.format())
    process.exit(1) //Hard stop - never run with broken config
}

export const env = parsed.data