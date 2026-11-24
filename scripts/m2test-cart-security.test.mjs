/**
 * THEGEMSUTRA M2.2 - cart & pricing security tests. ISOLATED TEST ENVIRONMENT ONLY.
 *
 * Run through the launcher (it verifies the environment first):  npm run m2test -- security
 *
 * Every assertion describes the SECURE behaviour; a failure means a bypass works.
 * Safety:
 * - requests go only to http://127.0.0.1:9001 (the test backend); the run aborts unless the test
 *   publishable key is REJECTED by the original backend (:9000) and ACCEPTED by :9001;
 * - database access goes only to jemsutra_m2test on :5433 and re-checks port, name and sentinel
 *   on every connection; the few direct writes (to simulate corrupted data) are test-DB only;
 * - identities are synthetic (m2test+...@example.test); no real customer data is used.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "apps", "backend", "package.json"));
const { Client } = require("pg");

const BASE = "http://127.0.0.1:9001";
const ORIGINAL_BASE = "http://localhost:9000";
const KEY = process.env.M2TEST_PUBLISHABLE_KEY ?? "";
const DB_URL = process.env.M2TEST_DATABASE_URL ?? "";
const SENTINEL = "thegemsutra:m2-commerce-test:isolated";
const RUN = Date.now().toString(36);
let seq = 0;

// ------------------------------------------------------------------ guards + helpers

async function db(fn) {
  const u = new URL(DB_URL);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "5433" || u.pathname !== "/jemsutra_m2test") throw new Error("REFUSED: not the test database URL");
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const { rows } = await c.query(`SELECT current_database() AS db, current_setting('port') AS port,
      shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') AS label`);
    if (rows[0].db !== "jemsutra_m2test" || rows[0].port !== "5433" || rows[0].label !== SENTINEL) throw new Error("REFUSED: connected server is not the labelled test database");
    return await fn(c);
  } finally {
    await c.end();
  }
}
const sql = (text, params = []) => db(async (c) => (await c.query(text, params)).rows);

async function call(method, p, body, base = BASE, key = KEY) {
  const r = await fetch(base + p, {
    method,
    headers: { "content-type": "application/json", "x-publishable-api-key": key },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* empty body */
  }
  return { status: r.status, json };
}
const post = (p, b) => call("POST", p, b ?? {});
const get = (p) => call("GET", p);
const del = (p) => call("DELETE", p);

let regionId;
let shippingOptionId;
const variants = {}; // sku -> variant id

async function newCart(extra = {}) {
  const r = await post("/store/carts", { region_id: regionId, ...extra });
  assert.equal(r.status, 200, `create cart: ${JSON.stringify(r.json)}`);
  return r.json.cart.id;
}
async function lines(cartId) {
  return sql("SELECT id, variant_id, quantity, unit_price::numeric AS unit_price, metadata FROM cart_line_item WHERE cart_id = $1 AND deleted_at IS NULL ORDER BY created_at", [cartId]);
}
async function designAdd(style, cartId, config, extra = {}) {
  return post(`/store/designs/${style}/cart-items`, { cart_id: cartId, config, ...extra });
}
// Same configuration as the existing ring price baseline (Rs 139,800).
const VALID_JS0001 = { metal: "14KR", stones: { s1: "RUBY" }, engravings: { e1: "Ayesha", e2: "Hamza" }, font: "script", size: 7 };
const SILVER_JS0001 = { metal: "SS", stones: { s1: "S-RUBY" }, size: 8 };

async function readyForCheckout(cartId) {
  const n = ++seq;
  const address = { first_name: "M2", last_name: `Tester${n}`, address_1: "1 Test Street", city: "Lahore", province: "Punjab", postal_code: "54000", country_code: "pk", phone: "+920000000000" };
  let r = await post(`/store/carts/${cartId}`, { email: `m2test+${RUN}-${n}@example.test`, shipping_address: address, billing_address: address });
  assert.equal(r.status, 200, `address: ${JSON.stringify(r.json)}`);
  r = await post(`/store/carts/${cartId}/shipping-methods`, { option_id: shippingOptionId });
  assert.equal(r.status, 200, `shipping: ${JSON.stringify(r.json)}`);
  r = await post("/store/payment-collections", { cart_id: cartId });
  assert.equal(r.status, 200, `payment collection: ${JSON.stringify(r.json)}`);
  r = await post(`/store/payment-collections/${r.json.payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" });
  assert.equal(r.status, 200, `payment session: ${JSON.stringify(r.json)}`);
}
async function complete(cartId) {
  return post(`/store/carts/${cartId}/complete`);
}
const orderFor = async (cartId) => (await sql("SELECT order_id FROM order_cart WHERE cart_id = $1 AND deleted_at IS NULL", [cartId]))[0]?.order_id ?? null;
const cartCompleted = async (cartId) => !!(await sql("SELECT completed_at FROM cart WHERE id = $1", [cartId]))[0]?.completed_at;
const isRejected = (status) => status >= 400 && status < 500;

// ------------------------------------------------------------------ setup

before(async () => {
  assert.ok(KEY && DB_URL, "launcher must provide M2TEST_PUBLISHABLE_KEY and M2TEST_DATABASE_URL");
  const original = await call("GET", "/store/regions", undefined, ORIGINAL_BASE, KEY);
  assert.ok(original.status === 401 || original.status === 400, `SAFETY: the test key must be rejected by the original backend (got ${original.status})`);
  const regions = await get("/store/regions");
  assert.equal(regions.status, 200, "SAFETY: the test key must work on the test backend");
  regionId = regions.json.regions[0].id;
  const [{ n }] = await sql("SELECT count(*)::int AS n FROM customer WHERE email NOT LIKE '%@example.test'");
  assert.equal(n, 0, "SAFETY: test database must contain no non-synthetic customers");
  for (const v of await sql("SELECT id, sku FROM product_variant WHERE deleted_at IS NULL")) variants[v.sku] = v.id;
  for (const sku of ["JS0001", "JS0002", "JS0003", "JS0001-14KR", "M2TEST-STD-A", "M2TEST-STD-B"]) assert.ok(variants[sku], `fixture/variant ${sku} missing (run seed, designs, fixtures)`);
  const probe = await newCart();
  const so = await get(`/store/shipping-options?cart_id=${probe}`);
  shippingOptionId = so.json.shipping_options.sort((a, b) => a.amount - b.amount)[0].id;
});

after(async () => {
  const [{ n }] = await sql("SELECT count(*)::int AS n FROM customer WHERE email NOT LIKE '%@example.test'");
  assert.equal(n, 0, "test run created only synthetic customers");
});

// ------------------------------------------------------------------ tests

describe("legitimate personalised flow (must keep working)", () => {
  test("valid personalised ring: server price, trusted metadata, order created", async () => {
    const cart = await newCart();
    const r = await designAdd("JS0001", cart, VALID_JS0001);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const [l] = await lines(cart);
    assert.equal(Number(l.unit_price), 139800);
    assert.equal(l.quantity, 1);
    assert.equal(l.metadata.style_code, "JS0001");
    assert.deepEqual(l.metadata.engraving_lines.map((x) => x[1]), ["Ayesha", "Hamza"]);
    await readyForCheckout(cart);
    const c = await complete(cart);
    assert.equal(c.json?.type, "order", JSON.stringify(c.json));
    assert.equal(Number(c.json.order.items[0].unit_price), 139800);
  });

  test("missing ring size is refused by the designer route", async () => {
    const cart = await newCart();
    const r = await designAdd("JS0001", cart, { metal: "SS" });
    assert.equal(r.status, 400);
    assert.equal((await lines(cart)).length, 0);
  });

  test("invalid option values are normalised and priced by the server", async () => {
    const cart = await newCart();
    const r = await designAdd("JS0001", cart, { metal: "XX-FAKE", stones: { s1: "NOT-A-STONE" }, size: 7, font: "nope" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const [l] = await lines(cart);
    assert.notEqual(l.metadata.design.metal, "XX-FAKE");
    assert.notEqual(l.metadata.design.stones?.s1, "NOT-A-STONE");
    const priced = await post("/store/designs/JS0001/price", l.metadata.design);
    assert.equal(Number(l.unit_price), priced.json.total);
  });

  test("modify item: replace_line_id within the same cart replaces the line", async () => {
    const cart = await newCart();
    await designAdd("JS0001", cart, SILVER_JS0001);
    const [old] = await lines(cart);
    const r = await designAdd("JS0001", cart, VALID_JS0001, { replace_line_id: old.id });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const now = await lines(cart);
    assert.equal(now.length, 1);
    assert.notEqual(now[0].id, old.id);
    assert.equal(Number(now[0].unit_price), 139800);
  });

  test("the same design added twice gives two lines of quantity 1 that check out", async () => {
    const cart = await newCart();
    assert.equal((await designAdd("JS0001", cart, SILVER_JS0001)).status, 200);
    assert.equal((await designAdd("JS0001", cart, SILVER_JS0001)).status, 200);
    const ls = await lines(cart);
    assert.equal(ls.length, 2, "two separate lines");
    assert.deepEqual(ls.map((l) => l.quantity), [1, 1]);
    await readyForCheckout(cart);
    const c = await complete(cart);
    assert.equal(c.json?.type, "order", JSON.stringify(c.json));
  });

  test("removing a personalised line with DELETE in its own cart works", async () => {
    const cart = await newCart();
    await designAdd("JS0001", cart, SILVER_JS0001);
    const [l] = await lines(cart);
    assert.equal((await del(`/store/carts/${cart}/line-items/${l.id}`)).status, 200);
    assert.equal((await lines(cart)).length, 0);
  });

  test("browser-supplied price is ignored by the designer route", async () => {
    const cart = await newCart();
    const r = await designAdd("JS0001", cart, { ...SILVER_JS0001, unit_price: 1 }, { unit_price: 1 });
    assert.equal(r.status, 200);
    assert.equal(Number((await lines(cart))[0].unit_price), 12900);
  });
});

describe("standard cart routes must not accept personalised products", () => {
  test("POST /store/carts with a personalised variant in items is refused", async () => {
    const before = (await sql("SELECT count(*)::int AS n FROM cart"))[0].n;
    const r = await post("/store/carts", { region_id: regionId, items: [{ variant_id: variants.JS0003, quantity: 1 }] });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    const afterN = (await sql("SELECT count(*)::int AS n FROM cart"))[0].n;
    assert.equal(afterN, before, "no cart left behind");
  });

  test("POST /line-items with a personalised variant is refused", async () => {
    const cart = await newCart();
    const r = await post(`/store/carts/${cart}/line-items`, { variant_id: variants.JS0003, quantity: 1 });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    assert.equal((await lines(cart)).length, 0);
  });

  test("POST /line-items with a legacy-style per-metal variant (JS0001-14KR fixture) is refused", async () => {
    const cart = await newCart();
    const r = await post(`/store/carts/${cart}/line-items`, { variant_id: variants["JS0001-14KR"], quantity: 1 });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    assert.equal((await lines(cart)).length, 0);
  });

  test("POST /line-items with forged design metadata is refused", async () => {
    const cart = await newCart();
    const forged = { style_code: "JS0001", design: VALID_JS0001, design_summary: [["Metal", "14K Rose Gold"]], engraving_lines: [["Name 1", "Forged"]], price_lines: [], image_url: "http://x" };
    const r = await post(`/store/carts/${cart}/line-items`, { variant_id: variants.JS0001, quantity: 1, metadata: forged });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    assert.equal((await lines(cart)).length, 0);
  });
});

describe("designer-created lines must not be changed through standard routes", () => {
  async function silverLine() {
    const cart = await newCart();
    const r = await designAdd("JS0001", cart, SILVER_JS0001);
    assert.equal(r.status, 200);
    const [l] = await lines(cart);
    return { cart, line: l };
  }

  test("forged engraving metadata on update is refused and nothing changes", async () => {
    const { cart, line } = await silverLine();
    const r = await post(`/store/carts/${cart}/line-items/${line.id}`, { quantity: 1, metadata: { ...line.metadata, engraving_lines: [["Name 1", "FORGED"]] } });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    const [now] = await lines(cart);
    assert.deepEqual(now.metadata, line.metadata);
  });

  test("changing the metal in metadata without repricing is refused", async () => {
    const { cart, line } = await silverLine();
    const forgedDesign = { ...line.metadata.design, metal: "14KY" };
    const r = await post(`/store/carts/${cart}/line-items/${line.id}`, { quantity: 1, metadata: { ...line.metadata, design: forgedDesign, design_summary: [["Metal", "14K Yellow Gold"]] } });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    const [now] = await lines(cart);
    assert.equal(now.metadata.design.metal, "SS");
    assert.equal(Number(now.unit_price), 12900);
  });

  test("quantity change on a personalised line is refused (removal with 0 is allowed)", async () => {
    const { cart, line } = await silverLine();
    const r = await post(`/store/carts/${cart}/line-items/${line.id}`, { quantity: 3 });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    assert.equal((await lines(cart))[0].quantity, 1);
    const removed = await post(`/store/carts/${cart}/line-items/${line.id}`, { quantity: 0 });
    assert.equal(removed.status, 200, JSON.stringify(removed.json));
    assert.equal((await lines(cart)).length, 0);
  });

  test("updating a line through another cart's URL is refused", async () => {
    const victim = await silverLine();
    const attacker = await newCart();
    const r = await post(`/store/carts/${attacker}/line-items/${victim.line.id}`, { quantity: 0 });
    assert.ok(r.status >= 400, `status ${r.status}`);
    assert.equal((await lines(victim.cart)).length, 1);
  });

  test("deleting a line through another cart's URL is refused", async () => {
    const victim = await silverLine();
    const attacker = await newCart();
    const r = await del(`/store/carts/${attacker}/line-items/${victim.line.id}`);
    assert.ok(r.status >= 400, `status ${r.status}`);
    assert.equal((await lines(victim.cart)).length, 1, "victim's line must still exist");
  });

  test("cross-cart replace_line_id is refused and the other cart's line survives", async () => {
    const victim = await silverLine();
    const attacker = await newCart();
    const r = await designAdd("JS0001", attacker, SILVER_JS0001, { replace_line_id: victim.line.id });
    assert.ok(isRejected(r.status), `status ${r.status}`);
    assert.equal((await lines(victim.cart)).length, 1, "victim's line must still exist");
    assert.equal((await lines(attacker)).length, 0, "nothing added to the attacker's cart");
  });
});

describe("trusted order fields cannot be supplied by the client", () => {
  test("cart metadata cannot pre-set the workshop production state", async () => {
    const r1 = await post("/store/carts", { region_id: regionId, metadata: { production: { stage: "shipped" } } });
    assert.ok(isRejected(r1.status), `create: status ${r1.status}`);
    const cart = await newCart();
    const r2 = await post(`/store/carts/${cart}`, { metadata: { production: { stage: "delivered" } } });
    assert.ok(isRejected(r2.status), `update: status ${r2.status}`);
    const [c] = await sql("SELECT metadata FROM cart WHERE id = $1", [cart]);
    assert.ok(!c.metadata?.production, "no production state stored on the cart");
  });
});

describe("checkout integrity (data corrupted directly in the TEST database)", () => {
  async function corruptAndComplete(mutate) {
    const cart = await newCart();
    assert.equal((await designAdd("JS0001", cart, SILVER_JS0001)).status, 200);
    await readyForCheckout(cart);
    const [l] = await lines(cart);
    await mutate(l);
    const r = await complete(cart);
    return { cart, r };
  }
  const assertNoOrder = async (cart, r) => {
    assert.notEqual(r.json?.type, "order", `an order was created: ${JSON.stringify(r.json?.order?.id)}`);
    assert.equal(await orderFor(cart), null, "no order linked to the cart");
    assert.equal(await cartCompleted(cart), false, "cart not completed");
  };

  test("metal changed in stored design (price still silver) blocks checkout", async () => {
    const { cart, r } = await corruptAndComplete((l) => sql(`UPDATE cart_line_item SET metadata = jsonb_set(metadata, '{design,metal}', '"14KY"') WHERE id = $1`, [l.id]));
    await assertNoOrder(cart, r);
  });

  test("lowered unit price blocks checkout", async () => {
    const { cart, r } = await corruptAndComplete((l) => sql("UPDATE cart_line_item SET unit_price = 100, raw_unit_price = '{\"value\":\"100\",\"precision\":20}' WHERE id = $1", [l.id]));
    await assertNoOrder(cart, r);
  });

  test("missing design data blocks checkout", async () => {
    const { cart, r } = await corruptAndComplete((l) => sql("UPDATE cart_line_item SET metadata = metadata - 'design' WHERE id = $1", [l.id]));
    await assertNoOrder(cart, r);
  });

  test("forged engraving text blocks checkout", async () => {
    const { cart, r } = await corruptAndComplete((l) => sql(`UPDATE cart_line_item SET metadata = jsonb_set(metadata, '{engraving_lines}', '[["Name 1","FORGED"]]') WHERE id = $1`, [l.id]));
    await assertNoOrder(cart, r);
  });

  test("quantity raised to 3 blocks checkout", async () => {
    const { cart, r } = await corruptAndComplete((l) => sql("UPDATE cart_line_item SET quantity = 3 WHERE id = $1", [l.id]));
    await assertNoOrder(cart, r);
  });

  test("personalised line on a non-personalised variant blocks checkout", async () => {
    const { cart, r } = await corruptAndComplete((l) => sql("UPDATE cart_line_item SET variant_id = $2 WHERE id = $1", [l.id, variants["M2TEST-STD-A"]]));
    await assertNoOrder(cart, r);
  });
});

describe("concurrency", () => {
  test("completion racing forged updates and a legitimate replace yields a consistent order", async () => {
    const cart = await newCart();
    assert.equal((await designAdd("JS0001", cart, SILVER_JS0001)).status, 200);
    await readyForCheckout(cart);
    const [l] = await lines(cart);
    const forged = { ...l.metadata, design: { ...l.metadata.design, metal: "14KY" } };
    const results = await Promise.allSettled([
      complete(cart),
      post(`/store/carts/${cart}/line-items/${l.id}`, { quantity: 1, metadata: forged }),
      post(`/store/carts/${cart}/line-items/${l.id}`, { quantity: 5 }),
      designAdd("JS0001", cart, VALID_JS0001, { replace_line_id: l.id }),
    ]);
    const forgedRes = results[1].value;
    const qtyRes = results[2].value;
    assert.ok(forgedRes.status >= 400, `forged metadata update must fail (got ${forgedRes.status})`);
    assert.ok(qtyRes.status >= 400, `quantity update must fail (got ${qtyRes.status})`);
    let orderId = await orderFor(cart);
    if (!orderId) {
      // completion lost the race to the legitimate replace: complete again, it must still be consistent
      const again = await complete(cart);
      assert.equal(again.json?.type, "order", JSON.stringify(again.json));
      orderId = again.json.order.id;
    }
    const items = await sql("SELECT oli.unit_price::numeric AS unit_price, oli.metadata, oi.quantity FROM order_item oi JOIN order_line_item oli ON oli.id = oi.item_id WHERE oi.order_id = $1 AND oi.deleted_at IS NULL", [orderId]);
    assert.equal(items.length, 1);
    const it = items[0];
    const priced = await post("/store/designs/JS0001/price", it.metadata.design);
    assert.equal(Number(it.unit_price), priced.json.total, "order price matches its own design");
    assert.equal(Number(it.quantity), 1);
    assert.notEqual(it.metadata.design.metal === "14KY" && Number(it.unit_price) === 12900, true, "never gold at a silver price");
  });
});

describe("standard (non-personalised) products keep working", () => {
  test("add, change quantity, mixed cart with a personalised ring, checkout", async () => {
    const cart = await newCart();
    const add = await post(`/store/carts/${cart}/line-items`, { variant_id: variants["M2TEST-STD-A"], quantity: 2 });
    assert.equal(add.status, 200, JSON.stringify(add.json));
    let std = (await lines(cart)).find((x) => x.variant_id === variants["M2TEST-STD-A"]);
    assert.equal(Number(std.unit_price), 1111);
    const upd = await post(`/store/carts/${cart}/line-items/${std.id}`, { quantity: 3 });
    assert.equal(upd.status, 200, JSON.stringify(upd.json));
    std = (await lines(cart)).find((x) => x.id === std.id);
    assert.equal(std.quantity, 3);
    assert.equal((await designAdd("JS0001", cart, SILVER_JS0001)).status, 200);
    await readyForCheckout(cart);
    const c = await complete(cart);
    assert.equal(c.json?.type, "order", JSON.stringify(c.json));
    assert.equal(Number(c.json.order.item_total ?? c.json.order.items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0)), 3 * 1111 + 12900);
  });

  test("standard line: browser price refused or ignored; unknown metadata keys refused", async () => {
    const cart = await newCart();
    const priced = await post(`/store/carts/${cart}/line-items`, { variant_id: variants["M2TEST-STD-B"], quantity: 1, unit_price: 1 });
    // Medusa's validator rejects unknown fields (400); if a future version ignored it instead, the price must still be the variant's.
    if (priced.status === 200) assert.equal(Number((await lines(cart))[0].unit_price), 2222);
    else assert.equal(priced.status, 400);
    if (priced.status !== 200) assert.equal((await post(`/store/carts/${cart}/line-items`, { variant_id: variants["M2TEST-STD-B"], quantity: 1 })).status, 200);
    assert.equal(Number((await lines(cart))[0].unit_price), 2222);
    const bad = await post(`/store/carts/${cart}/line-items`, { variant_id: variants["M2TEST-STD-A"], quantity: 1, metadata: { design_summary: [["Metal", "18K"]] } });
    assert.ok(isRejected(bad.status), `status ${bad.status}`);
    assert.equal((await lines(cart)).length, 1);
  });

  test("standard cart creation with initial items works", async () => {
    const r = await post("/store/carts", { region_id: regionId, items: [{ variant_id: variants["M2TEST-STD-A"], quantity: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.cart.items.length, 1);
  });
});
