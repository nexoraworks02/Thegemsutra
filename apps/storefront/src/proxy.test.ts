import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

/*
 * The Proxy decides demo 404s before rendering. A rewrite to /_demo-not-found (a path
 * with no route) is how Next.js serves the normal not-found page with status 404.
 */
const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(url), { headers: { host: new URL(url).host, ...headers } });
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");
const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("proxy", () => {
  it("passes valid pages through", async () => {
    for (const u of ["http://localhost:3000/demo/catalog", "http://localhost:3000/demo/catalog/rings"]) {
      expect(passedThrough(await proxy(req(u))), u).toBe(true);
    }
  });

  it("rewrites invalid categories and malformed slugs to the 404 route without any lookup", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const u of ["/demo/catalog/bracelets", "/demo/catalog/item/no-such-product", "/demo/catalog/item/..%2F..%2Fetc", "/demo", "/demo/catalog/rings/extra"]) {
      const res = await proxy(req(`http://localhost:3000${u}`));
      expect(rewrittenTo(res), u).toMatch(/\/_demo-not-found$/);
      expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks the image service whether a well-formed slug exists", async () => {
    const slug = "demo-rng-002-blue-marquise-cluster-ring";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(rewrittenTo(await proxy(req(`http://localhost:3000/demo/catalog/item/${slug}`)))).toMatch(/\/_demo-not-found$/);

    const ok = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", ok);
    expect(passedThrough(await proxy(req(`http://localhost:3000/demo/catalog/item/${slug}`)))).toBe(true);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`/catalog/exists/${slug}$`));
  });

  it("lets the page explain when the image service is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(passedThrough(await proxy(req("http://localhost:3000/demo/catalog/item/demo-rng-001-blue")))).toBe(true);
  });

  it("in production: 404 without the explicit flag, and 404 on a public host even with it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(rewrittenTo(await proxy(req("http://localhost:3000/demo/catalog")))).toMatch(/_demo-not-found/);
    vi.stubEnv("ENABLE_DEMO_CATALOG", "true");
    expect(rewrittenTo(await proxy(req("https://thegemsutra.com/demo/catalog")))).toMatch(/_demo-not-found/);
    expect(passedThrough(await proxy(req("http://localhost:3000/demo/catalog")))).toBe(true);
    // The URL says localhost but the browser asked for a public host (Host / X-Forwarded-Host): refused.
    expect(rewrittenTo(await proxy(req("http://localhost:3000/demo/catalog", { host: "shop.example.com" })))).toMatch(/_demo-not-found/);
    expect(rewrittenTo(await proxy(req("http://localhost:3000/demo/catalog", { "x-forwarded-host": "thegemsutra.com" })))).toMatch(/_demo-not-found/);
  });
});
