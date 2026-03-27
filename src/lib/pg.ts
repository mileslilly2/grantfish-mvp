import { Pool } from "pg";

const globalForPg = globalThis as unknown as {
  pool?: Pool;
};

export function getPool(): Pool {
  if (!globalForPg.pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    globalForPg.pool = new Pool({ connectionString });
  }

  return globalForPg.pool;
}
