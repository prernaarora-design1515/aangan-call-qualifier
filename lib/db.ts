import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/** Works with Neon (sslmode=require in DATABASE_URL) and with a local Postgres for development. */
export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: /sslmode=require|neon\.tech/.test(process.env.DATABASE_URL ?? "")
      ? { rejectUnauthorized: false }
      : undefined,
  });
if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
