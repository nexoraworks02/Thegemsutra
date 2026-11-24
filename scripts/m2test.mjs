#!/usr/bin/env node
/**
 * THEGEMSUTRA - isolated M2 commerce TEST environment launcher (local only).
 *
 *   npm run m2test -- init         create apps/backend/.env.m2test + apps/storefront/.env.m2test (new secrets)
 *   npm run m2test -- db           start the separate PostgreSQL instance (port 5433, .pgdata-m2test)
 *   npm run m2test -- mark         one-time: label the fresh test database (sentinel comment)
 *   npm run m2test -- preflight    run every isolation check, change nothing
 *   npm run m2test -- migrate      Medusa migrations on the TEST database only
 *   npm run m2test -- seed         minimal seed (region, delivery, code-catalog designs) on the TEST database only
 *   npm run m2test -- designs      copy the JS0001-JS0003 design definitions (JSON only) from the dev database
 *   npm run m2test -- backend      test backend on 127.0.0.1:9001
 *   npm run m2test -- storefront   test storefront on 127.0.0.1:3001
 *   npm run m2test -- verify       read-only comparison of the original and the test database
 *
 * Isolation is FAIL-CLOSED. Before anything touches a database:
 * - the test settings must name 127.0.0.1/localhost, port 5433, database "jemsutra_m2test", and
 *   must define every key of apps/backend/.env (Medusa loads .env and would otherwise fill gaps
 *   from the original environment); secrets must differ from the original ones;
 * - the server itself must report port 5433, database "jemsutra_m2test", data directory
 *   apps/backend/.pgdata-m2test, and carry the sentinel comment set by `mark`;
 * - child processes get a rebuilt environment: every original database / secret / storefront
 *   variable is removed first, then only the test values are set.
 * Any failed check stops the command before it runs.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "apps", "backend");
const STOREFRONT = path.join(ROOT, "apps", "storefront");
const FILES = {
  backendTest: path.join(BACKEND, ".env.m2test"),
  backendTemplate: path.join(BACKEND, "env.m2test.example"),
  backendMain: path.join(BACKEND, ".env"),
  storefrontTest: path.join(STOREFRONT, ".env.m2test"),
  storefrontTemplate: path.join(STOREFRONT, "env.m2test.example"),
  storefrontMain: path.join(STOREFRONT, ".env.local"),
};
const EXPECT = {
  hosts: new Set(["127.0.0.1", "localhost", "::1", "[::1]"]),
  port: 5433,
  database: "jemsutra_m2test",
  dataDirName: ".pgdata-m2test",
  dataDir: path.join(BACKEND, ".pgdata-m2test"),
  backendPort: 9001,
  storefrontPort: 3001,
  outbox: ".outbox-m2test",
  nextDist: ".next-m2test",
};
const ORIGINAL = { port: 5432, database: "jemsutra" };
const SENTINEL = "thegemsutra:m2-commerce-test:isolated";
/** Secrets that must never be shared between the original and the test environment. */
const SECRET_KEYS = ["JWT_SECRET", "COOKIE_SECRET", "INTERNAL_API_KEY", "REVALIDATE_SECRET", "ADMIN_PASSWORD"];

const require = createRequire(path.join(BACKEND, "package.json"));
const { Client } = require("pg");

// ---------------------------------------------------------------- helpers

function parseEnv(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

class Check {
  constructor(title) {
    this.title = title;
    this.rows = [];
  }
  ok(label, detail = "") {
    this.rows.push({ pass: true, label, detail });
  }
  fail(label, detail = "") {
    this.rows.push({ pass: false, label, detail });
  }
  expect(cond, label, detail = "") {
    (cond ? this.ok : this.fail).call(this, label, detail);
    return cond;
  }
  get passed() {
    return this.rows.every((r) => r.pass);
  }
  print() {
    console.log(`\n${this.title}`);
    for (const r of this.rows) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.label}${r.detail ? ` - ${r.detail}` : ""}`);
  }
  orExit() {
    this.print();
    if (!this.passed) {
      console.error("\nREFUSED: isolation checks failed. Nothing was run.");
      process.exit(1);
    }
  }
}

const samePath = (a, b) => {
  const norm = (p) => {
    let r = p;
    try {
      r = realpathSync(p);
    } catch {
      /* not created yet */
    }
    return path.resolve(r).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  };
  return norm(a) === norm(b);
};

function loadSettings() {
  const test = parseEnv(FILES.backendTest);
  const main = parseEnv(FILES.backendMain) ?? {};
  const sfTest = parseEnv(FILES.storefrontTest);
  const sfMain = parseEnv(FILES.storefrontMain) ?? {};
  if (!test || !sfTest) {
    console.error("Test settings missing. Run: npm run m2test -- init");
    process.exit(1);
  }
  return { test, main, sfTest, sfMain };
}

/** Static checks on the settings files (no connections). */
function configChecks({ test, main }) {
  const c = new Check("Test backend settings (apps/backend/.env.m2test)");
  const missing = Object.keys(main).filter((k) => !(k in test));
  c.expect(missing.length === 0, "defines every key of apps/backend/.env (no inheritance through Medusa's loadEnv)", missing.length ? `missing: ${missing.join(", ")}` : `${Object.keys(main).length} keys`);
  const placeholders = Object.entries(test).filter(([, v]) => /__[A-Z_]+__/.test(v)).map(([k]) => k);
  c.expect(placeholders.length === 0, "no unfilled placeholders", placeholders.join(", "));
  let url = null;
  try {
    url = new URL(test.DATABASE_URL);
  } catch {
    /* reported below */
  }
  c.expect(!!url && /^postgres(ql)?:$/.test(url.protocol), "DATABASE_URL is a PostgreSQL URL");
  if (url) {
    c.expect(EXPECT.hosts.has(url.hostname), "DATABASE_URL host is loopback", url.hostname);
    c.expect(Number(url.port) === EXPECT.port, `DATABASE_URL port is ${EXPECT.port}`, url.port || "(default 5432)");
    c.expect(url.pathname === `/${EXPECT.database}`, `DATABASE_URL database is ${EXPECT.database}`, url.pathname.slice(1));
  }
  c.expect(test.DATABASE_URL !== main.DATABASE_URL, "DATABASE_URL differs from the original");
  c.expect(test.DB_NAME === EXPECT.database, `DB_NAME is ${EXPECT.database}`, test.DB_NAME);
  for (const k of SECRET_KEYS) {
    if (k in test) c.expect(!!test[k] && test[k] !== main[k], `${k} is set and differs from the original`);
  }
  let store = null;
  try {
    store = new URL(test.STORE_URL);
  } catch {
    /* reported below */
  }
  c.expect(!!store && EXPECT.hosts.has(store.hostname) && Number(store.port) === EXPECT.storefrontPort, `STORE_URL is the test storefront (:${EXPECT.storefrontPort})`, test.STORE_URL);
  c.expect(test.OUTBOX_DIR === EXPECT.outbox, `OUTBOX_DIR is ${EXPECT.outbox}`, test.OUTBOX_DIR);
  return c;
}

/** Live checks against the server the URL points to (read-only transaction). */
async function databaseChecks(databaseUrl, { requireSentinel = true } = {}) {
  const c = new Check("Database server identity (read-only)");
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
  } catch (e) {
    c.fail("connect to the test database", e.message);
    return { check: c, info: null };
  }
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const { rows } = await client.query(`SELECT current_database() AS db, current_setting('port') AS port,
      current_setting('data_directory') AS data_dir, coalesce(host(inet_server_addr()), 'local') AS addr,
      shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') AS label,
      (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public')::int AS tables`);
    await client.query("ROLLBACK");
    const info = rows[0];
    c.expect(info.db === EXPECT.database, `server reports database ${EXPECT.database}`, info.db);
    c.expect(Number(info.port) === EXPECT.port, `server reports port ${EXPECT.port}`, info.port);
    c.expect(Number(info.port) !== ORIGINAL.port && info.db !== ORIGINAL.database, "not the original database (jemsutra on 5432)");
    c.expect(samePath(info.data_dir, EXPECT.dataDir), `server data directory is apps/backend/${EXPECT.dataDirName}`, info.data_dir);
    c.expect(["127.0.0.1", "::1", "local"].includes(info.addr), "connection is to a loopback address", info.addr);
    if (requireSentinel) c.expect(info.label === SENTINEL, "database carries the M2 test sentinel", info.label ?? "(none - run `mark` once)");
    return { check: c, info };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Environment for child processes: original variables removed, test variables set. */
function childEnv(vars, extraStrip = []) {
  const { main, sfMain } = loadSettings();
  const env = { ...process.env };
  const strip = new Set([
    ...Object.keys(main),
    ...Object.keys(sfMain),
    ...extraStrip,
    "DATABASE_URL", "DB_NAME", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGDATA", "PG_DATA_DIR",
    "REDIS_URL", "HOST", "PORT", "OUTBOX_DIR", "NEXT_DIST_DIR", "HMR_PORT", "HMR_BIND_HOST", "ENABLE_DEMO_CATALOG", "DEMO_CATALOG_DIR",
  ]);
  for (const k of Object.keys(env)) {
    if (strip.has(k) || k.startsWith("NEXT_PUBLIC_") || k.startsWith("MEDUSA_")) delete env[k];
  }
  return { ...env, ...vars };
}

function run(cmd, args, cwd, env) {
  console.log(`\n> ${cmd} ${args.join(" ")}   (in ${path.relative(ROOT, cwd) || "."})`);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
    const stop = () => child.kill("SIGINT");
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function readOnly(url, sql) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const r = await client.query(sql);
    await client.query("ROLLBACK");
    return r.rows;
  } finally {
    await client.end().catch(() => {});
  }
}

async function guardedDatabase(opts) {
  const s = loadSettings();
  configChecks(s).orExit();
  const { check, info } = await databaseChecks(s.test.DATABASE_URL, opts);
  check.orExit();
  return { ...s, info };
}

// ---------------------------------------------------------------- commands

const commands = {
  async init() {
    for (const f of [FILES.backendTest, FILES.storefrontTest]) {
      if (existsSync(f)) {
        console.error(`${path.relative(ROOT, f)} already exists; not overwriting it.`);
        process.exit(1);
      }
    }
    const secret = () => randomBytes(32).toString("hex");
    const revalidate = secret();
    const backend = readFileSync(FILES.backendTemplate, "utf8")
      .replace(/^REVALIDATE_SECRET=__GENERATED__$/m, `REVALIDATE_SECRET=${revalidate}`)
      .replace(/__GENERATED__/g, () => secret());
    const storefront = readFileSync(FILES.storefrontTemplate, "utf8").replace("__SAME_AS_TEST_BACKEND__", revalidate);
    writeFileSync(FILES.backendTest, backend, { flag: "wx" });
    writeFileSync(FILES.storefrontTest, storefront, { flag: "wx" });
    console.log("Created apps/backend/.env.m2test and apps/storefront/.env.m2test with new secrets (git-ignored; values not printed).");
    configChecks(loadSettings()).print();
  },

  async db() {
    const s = loadSettings();
    configChecks(s).orExit();
    const url = new URL(s.test.DATABASE_URL);
    const env = childEnv({ PGPORT: url.port, DB_NAME: EXPECT.database, PG_DATA_DIR: EXPECT.dataDirName });
    process.exit(await run("node", ["scripts/db.mjs"], BACKEND, env));
  },

  async mark() {
    const s = loadSettings();
    configChecks(s).orExit();
    const { check, info } = await databaseChecks(s.test.DATABASE_URL, { requireSentinel: false });
    if (info && info.label !== SENTINEL) check.expect(info.tables === 0, "database is fresh (no tables yet) before it is labelled", `${info.tables} tables`);
    check.orExit();
    if (info.label === SENTINEL) return console.log("\nAlready labelled; nothing to do.");
    const client = new Client({ connectionString: s.test.DATABASE_URL });
    await client.connect();
    await client.query(`COMMENT ON DATABASE ${EXPECT.database} IS '${SENTINEL}'`);
    await client.end();
    console.log(`\nLabelled ${EXPECT.database} on port ${EXPECT.port} with the M2 test sentinel.`);
  },

  async preflight() {
    const s = await guardedDatabase();
    const sf = storefrontChecks(s);
    sf.print();
    console.log(sf.passed ? "\nAll isolation checks passed." : "\nStorefront settings incomplete (run `seed` first).");
  },

  async migrate() {
    const { test } = await guardedDatabase();
    process.exit(await run("npx", ["medusa", "db:migrate"], BACKEND, childEnv(test)));
  },

  async seed() {
    const { test } = await guardedDatabase();
    const [{ regions }] = await readOnly(test.DATABASE_URL, "SELECT count(*)::int AS regions FROM region WHERE deleted_at IS NULL");
    if (regions > 0) {
      console.error("\nREFUSED: the test database is already seeded (a region exists). Seeding twice would duplicate records.");
      process.exit(1);
    }
    const code = await run("npx", ["medusa", "exec", "./src/scripts/seed.ts"], BACKEND, childEnv(test));
    if (code !== 0) process.exit(code);
    const keys = await readOnly(test.DATABASE_URL, "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL ORDER BY created_at LIMIT 1");
    if (!keys[0]) {
      console.error("No publishable key found after seeding.");
      process.exit(1);
    }
    const sf = readFileSync(FILES.storefrontTest, "utf8").replace(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*$/m, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${keys[0].token}`);
    writeFileSync(FILES.storefrontTest, sf);
    console.log("\nSeed complete. The test publishable key was written to apps/storefront/.env.m2test (not printed).");
  },

  /** Copy the development database's design definitions (definition JSON only) into the test database. */
  async designs() {
    const { test, main } = await guardedDatabase();
    const rows = await readOnly(main.DATABASE_URL, "SELECT status, definition FROM design WHERE deleted_at IS NULL AND style_code IN ('JS0001','JS0002','JS0003') ORDER BY style_code");
    if (rows.length !== 3) {
      console.error(`Expected JS0001-JS0003 in the development database, found ${rows.length}.`);
      process.exit(1);
    }
    const file = path.join(os.tmpdir(), `m2test-designs-${process.pid}.json`);
    writeFileSync(file, JSON.stringify(rows), { flag: "wx" });
    try {
      const code = await run("npx", ["medusa", "exec", "./src/scripts/m2test-sync-designs.ts"], BACKEND, childEnv({ ...test, M2TEST_DESIGNS_FILE: file }));
      if (code !== 0) process.exit(code);
    } finally {
      rmSync(file, { force: true });
    }
    // Confirm the definitions now match exactly (order-insensitive comparison).
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
    const after = await readOnly(test.DATABASE_URL, "SELECT style_code, status, definition FROM design WHERE deleted_at IS NULL ORDER BY style_code");
    const c = new Check("Design definitions: development vs test");
    for (const r of rows) {
      const t = after.find((a) => a.style_code === r.definition.styleCode);
      c.expect(!!t && t.status === r.status && JSON.stringify(canon(t.definition)) === JSON.stringify(canon(r.definition)), `${r.definition.styleCode} identical (${r.status})`);
    }
    c.orExit();
  },

  async backend() {
    const { test } = await guardedDatabase();
    const env = childEnv(test);
    process.exit(await run("npx", ["medusa", "develop", "--host", "127.0.0.1", "--port", String(EXPECT.backendPort)], BACKEND, env));
  },

  async storefront() {
    const s = await guardedDatabase();
    const c = storefrontChecks(s);
    const rows = await readOnly(s.test.DATABASE_URL, "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL");
    c.expect(rows.some((r) => r.token === s.sfTest.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY), "publishable key belongs to the TEST database");
    c.orExit();
    const env = childEnv({ ...s.sfTest });
    process.exit(await run("npx", ["next", "dev", "-H", "127.0.0.1", "-p", String(EXPECT.storefrontPort)], STOREFRONT, env));
  },

  async verify() {
    const s = loadSettings();
    const cfg = configChecks(s);
    const { check, info } = await databaseChecks(s.test.DATABASE_URL);
    cfg.print();
    check.print();
    const sql = `SELECT
      current_database() AS database, current_setting('port') AS port, current_setting('data_directory') AS data_directory,
      shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') AS label,
      (SELECT count(*) FROM product WHERE deleted_at IS NULL)::int AS products,
      (SELECT string_agg(handle, ', ' ORDER BY handle) FROM product WHERE deleted_at IS NULL) AS handles,
      (SELECT count(*) FROM product_variant WHERE deleted_at IS NULL)::int AS variants,
      (SELECT string_agg(sku, ', ' ORDER BY sku) FROM product_variant WHERE deleted_at IS NULL) AS skus,
      (SELECT count(*) FROM design WHERE deleted_at IS NULL)::int AS designs,
      (SELECT count(*) FROM product WHERE deleted_at IS NULL AND (metadata->>'demo' = 'true' OR handle LIKE 'demo-%'))::int AS demo_products,
      (SELECT count(*) FROM customer WHERE deleted_at IS NULL)::int AS customers,
      (SELECT count(*) FROM "order" WHERE deleted_at IS NULL)::int AS orders,
      (SELECT count(*) FROM cart WHERE deleted_at IS NULL)::int AS carts,
      (SELECT count(*) FROM "user" WHERE deleted_at IS NULL)::int AS admin_users,
      (SELECT count(*) FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL)::int AS publishable_keys,
      (SELECT string_agg(name || ' ' || currency_code, ', ') FROM region WHERE deleted_at IS NULL) AS regions,
      (SELECT string_agg(name, ', ') FROM shipping_option WHERE deleted_at IS NULL) AS shipping_options,
      (SELECT string_agg(id, ', ') FROM payment_provider) AS payment_providers`;
    const mainUrl = s.main.DATABASE_URL;
    const [orig] = await readOnly(mainUrl, sql);
    const [test] = info ? await readOnly(s.test.DATABASE_URL, sql) : [{}];
    console.log("\nRead-only comparison                ORIGINAL (5432)                       TEST (5433)");
    for (const k of Object.keys(orig)) console.log(`  ${k.padEnd(20)} ${String(orig[k] ?? "").padEnd(38).slice(0, 38)} ${String(test[k] ?? "")}`);
    const iso = new Check("Isolation results");
    iso.expect(orig.database === ORIGINAL.database && Number(orig.port) === ORIGINAL.port, "original database still answers as jemsutra on 5432");
    iso.expect(!samePath(orig.data_directory, test.data_directory ?? ""), "the two servers use different data directories");
    iso.expect(orig.label !== SENTINEL, "the original database does NOT carry the test sentinel");
    iso.expect(test.customers === 0 && test.orders === 0 && test.carts === 0, "test database has no customers, orders or carts", `${test.customers}/${test.orders}/${test.carts}`);
    iso.expect(test.demo_products === 0, "no demo catalog products imported", String(test.demo_products));
    iso.expect(test.admin_users === 0, "no admin users in the test database", String(test.admin_users));
    const sfMainKey = s.sfMain.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
    const testKeys = await readOnly(s.test.DATABASE_URL, "SELECT token FROM api_key WHERE type = 'publishable'");
    const origKeys = await readOnly(mainUrl, "SELECT token FROM api_key WHERE type = 'publishable'");
    iso.expect(!testKeys.some((k) => origKeys.some((o) => o.token === k.token)), "publishable keys are different in the two databases");
    iso.expect(!testKeys.some((k) => k.token === sfMainKey), "the normal storefront's key is not a test key");
    iso.print();
    process.exit(cfg.passed && check.passed && iso.passed ? 0 : 1);
  },
};

function storefrontChecks({ sfTest, sfMain, test }) {
  const c = new Check("Test storefront settings (apps/storefront/.env.m2test)");
  let u = null;
  try {
    u = new URL(sfTest.NEXT_PUBLIC_MEDUSA_URL);
  } catch {
    /* reported below */
  }
  c.expect(!!u && EXPECT.hosts.has(u.hostname) && Number(u.port) === EXPECT.backendPort, `NEXT_PUBLIC_MEDUSA_URL is the test backend (:${EXPECT.backendPort})`, sfTest.NEXT_PUBLIC_MEDUSA_URL);
  const key = sfTest.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";
  c.expect(!!key && !/__[A-Z_]+__/.test(key), "publishable key filled in by the test seed");
  c.expect(key !== sfMain.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, "publishable key differs from the normal storefront's");
  c.expect(sfTest.REVALIDATE_SECRET === test.REVALIDATE_SECRET && sfTest.REVALIDATE_SECRET !== sfMain.REVALIDATE_SECRET, "revalidate secret pairs only with the test backend");
  c.expect(sfTest.NEXT_DIST_DIR === EXPECT.nextDist, `NEXT_DIST_DIR is ${EXPECT.nextDist}`, sfTest.NEXT_DIST_DIR);
  return c;
}

const cmd = process.argv[2];
if (!cmd || !commands[cmd]) {
  console.error(`Usage: npm run m2test -- <${Object.keys(commands).join(" | ")}>`);
  process.exit(2);
}
await commands[cmd]();
