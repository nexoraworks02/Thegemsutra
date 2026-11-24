/**
 * Guard for M2 TEST-ENVIRONMENT-ONLY scripts (fixtures, design sync).
 * Refuses unless DATABASE_URL is the isolated test database AND the connected server reports
 * port 5433, database "jemsutra_m2test" and carries the M2 sentinel label.
 */
import { Client } from "pg";

export const M2TEST_SENTINEL = "thegemsutra:m2-commerce-test:isolated";

export async function assertM2TestDatabase(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.port !== "5433" || url.pathname !== "/jemsutra_m2test") {
    throw new Error("REFUSED: DATABASE_URL is not the isolated M2 test database (127.0.0.1:5433/jemsutra_m2test).");
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN TRANSACTION READ ONLY");
    const { rows } = await c.query(`SELECT current_database() AS db, current_setting('port') AS port,
      shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') AS label`);
    await c.query("ROLLBACK");
    const r = rows[0];
    if (r.db !== "jemsutra_m2test" || r.port !== "5433" || r.label !== M2TEST_SENTINEL) {
      throw new Error("REFUSED: the connected server is not the labelled M2 test database.");
    }
  } finally {
    await c.end();
  }
}
