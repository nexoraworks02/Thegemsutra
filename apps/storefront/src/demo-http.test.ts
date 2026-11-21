import { describe, expect, it } from "vitest";

/*
 * Optional end-to-end HTTP checks against a RUNNING storefront + image service with the
 * demo catalog loaded. Skipped unless DEMO_HTTP_BASE is set, e.g.:
 *   DEMO_HTTP_BASE=http://localhost:3000 DEMO_IMAGE_BASE=http://localhost:4100 npm test -w @jemsutra/storefront
 */
const BASE = process.env.DEMO_HTTP_BASE;
const IMG = process.env.DEMO_IMAGE_BASE ?? "http://localhost:4100";
const status = async (url: string, init?: RequestInit) => (await fetch(url, { redirect: "manual", ...init })).status;

describe.skipIf(!BASE)("demo catalog over HTTP", () => {
  it("valid pages return 200", async () => {
    const idx = (await (await fetch(`${IMG}/catalog/index.json`)).json()) as { products: { slug: string }[] };
    for (const u of ["/demo/catalog", "/demo/catalog/rings", "/demo/catalog/sets", `/demo/catalog/item/${idx.products[0]!.slug}`]) {
      expect(await status(`${BASE}${u}`), u).toBe(200);
    }
  }, 120_000);

  it("missing products, invalid categories and malformed requests return a genuine 404", async () => {
    const urls = [
      "/demo/catalog/bracelets",
      "/demo/catalog/RINGS",
      "/demo/catalog/item/demo-rng-999-missing",
      "/demo/catalog/item/no-such-product",
      "/demo/catalog/item/..%2F..%2Fetc",
      "/demo/catalog/item/%3Cscript%3E",
      "/demo/catalog/item",
      "/demo/catalog/rings/extra",
      "/demo",
    ];
    for (const u of urls) expect(await status(`${BASE}${u}`), u).toBe(404);
    const body = await (await fetch(`${BASE}/demo/catalog/bracelets`)).text();
    expect(body).toMatch(/could not be found/);
  }, 120_000);

  it("image service rejects traversal and unknown assets", async () => {
    for (const u of ["/catalog/img/..%2F..%2Fcurrent.json/card.webp", "/catalog/img/img_0000000000000000/card.webp", "/catalog/versions/v0001.json", "/catalog/exists/..%2Fx"]) {
      expect(await status(`${IMG}${u}`), u).toBe(404);
    }
  });
});
