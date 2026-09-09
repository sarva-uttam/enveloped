import { Pool } from "pg";
import { getLocalSupabaseEnv } from "./local-env";

/**
 * A pg.Pool bound to the LOCAL database only — getLocalSupabaseEnv()
 * throws before this ever resolves a connection string if the target
 * isn't loopback-only. Used for direct information_schema/pg_catalog
 * introspection (schema.test.ts) — the same kind of read-only queries
 * used to verify the live project's schema during Stage 0, now run
 * against the local, freshly-migrated database instead.
 *
 * Connects as the `postgres` superuser (the DB_URL Supabase's CLI
 * prints), which bypasses RLS entirely — appropriate for structural
 * introspection, never used to test what an anon/authenticated caller
 * can see (that's rls.test.ts, via supabase-clients.ts instead).
 */
let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (pool) return pool;
  const { dbUrl } = getLocalSupabaseEnv();
  pool = new Pool({ connectionString: dbUrl, max: 4 });
  return pool;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
