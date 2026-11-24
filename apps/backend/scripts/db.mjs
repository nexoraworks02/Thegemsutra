/**
 * Local development database (PostgreSQL 17, via the `embedded-postgres` npm package).
 *
 * Why: the official Windows installer downloads are blocked on our network, and this
 * needs no admin install. Data is kept in apps/backend/.pgdata between runs.
 * Production uses a normal managed PostgreSQL - only DATABASE_URL changes.
 *
 *   npm run db        start the database (leave this terminal open; Ctrl+C to stop)
 *
 * Connection: postgres://postgres:postgres@localhost:5432/jemsutra (see .env)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
// Optional separate data folder (the isolated M2 test database uses ".pgdata-m2test").
// Only ".pgdata" or ".pgdata-<name>" inside apps/backend is accepted.
const dataDirName = process.env.PG_DATA_DIR ?? ".pgdata";
if (!/^\.pgdata(-[a-z0-9]+)?$/.test(dataDirName)) {
  console.error(`Refusing PG_DATA_DIR="${dataDirName}": use ".pgdata" or ".pgdata-<name>".`);
  process.exit(1);
}
const databaseDir = path.resolve(here, "..", dataDirName);
const port = Number(process.env.PGPORT ?? 5432);
const dbName = process.env.DB_NAME ?? "jemsutra";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  // UTF-8 is required: currency symbols, Urdu names/addresses, engraving text.
  // (Without this, initdb on Windows picks the system code page, e.g. WIN1252.)
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-collate=C", "--lc-ctype=C"],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

const firstRun = !existsSync(path.join(databaseDir, "PG_VERSION"));
if (firstRun) {
  console.log(`Initialising new database cluster in ${databaseDir} ...`);
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase(dbName);
  console.log(`Created database "${dbName}".`);
} catch {
  // already exists
}
console.log(`PostgreSQL 17 ready on port ${port} (database "${dbName}"). Press Ctrl+C to stop.`);

const shutdown = async () => {
  console.log("Stopping PostgreSQL ...");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// keep the process alive
setInterval(() => {}, 1 << 30);
