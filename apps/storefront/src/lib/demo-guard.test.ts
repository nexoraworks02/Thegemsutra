import { describe, expect, it } from "vitest";
import { DEMO_CATEGORIES } from "./catalog-shared";
import { DEMO_ROUTE_CATEGORIES, MAX_SLUG_LENGTH, demoAllowed, demoRouteDecision, requestHostname } from "./demo-guard";

it("route categories match the catalog categories", () => {
  expect([...DEMO_ROUTE_CATEGORIES]).toEqual(DEMO_CATEGORIES);
});

describe("demoRouteDecision", () => {
  it("allows the listing and the four known categories", () => {
    for (const p of ["/demo/catalog", "/demo/catalog/", "/demo/catalog/rings", "/demo/catalog/earrings", "/demo/catalog/necklaces", "/demo/catalog/sets"]) {
      expect(demoRouteDecision(p), p).toEqual({ action: "allow" });
    }
  });

  it("returns not-found for invalid categories", () => {
    for (const p of ["/demo/catalog/bracelets", "/demo/catalog/RINGS", "/demo/catalog/Rings", "/demo/catalog/ring", "/demo/catalog/rings%20", "/demo/catalog/item"]) {
      expect(demoRouteDecision(p).action, p).toBe("not-found");
    }
  });

  it("checks well-formed product slugs against the catalog", () => {
    expect(demoRouteDecision("/demo/catalog/item/demo-rng-002-blue-marquise-cluster-ring")).toEqual({ action: "check-slug", slug: "demo-rng-002-blue-marquise-cluster-ring" });
    expect(demoRouteDecision("/demo/catalog/item/demo-set-001")).toEqual({ action: "check-slug", slug: "demo-set-001" });
  });

  it("returns not-found for malformed slugs without any lookup", () => {
    const bad = [
      "no-such-product",
      "DEMO-RNG-001-blue",
      "demo-rng-1-blue",
      "demo-xyz-001-blue",
      "demo-rng-001--blue",
      "demo-rng-001-blue-",
      "../../etc/passwd",
      "..%2F..%2Fetc",
      "<script>alert(1)</script>",
      "demo-rng-001-blue ring",
      "demo-rng-001-blue.json",
      `demo-rng-001-${"a".repeat(MAX_SLUG_LENGTH)}`,
      "",
    ];
    for (const s of bad) expect(demoRouteDecision(`/demo/catalog/item/${s}`).action, s).toBe("not-found");
  });

  it("returns not-found for unknown demo paths", () => {
    for (const p of ["/demo", "/demo/", "/demo/other", "/demo/catalog/rings/extra", "/demo/catalog/item/demo-rng-001-x/extra", "/demo/catalogue", "/demo/catalog//rings"]) {
      expect(demoRouteDecision(p).action, p).toBe("not-found");
    }
  });
});

describe("requestHostname", () => {
  it("reads the Host header without the port", () => {
    expect(requestHostname("localhost:3000", null)).toBe("localhost");
    expect(requestHostname("127.0.0.1:3100", null)).toBe("127.0.0.1");
    expect(requestHostname("[::1]:3000", null)).toBe("[::1]");
    expect(requestHostname("Shop.Example.com", null)).toBe("shop.example.com");
  });
  it("a forwarded public host wins over a loopback Host header", () => {
    expect(requestHostname("localhost:3000", "thegemsutra.com")).toBe("thegemsutra.com");
    expect(requestHostname("localhost:3000", "thegemsutra.com, proxy.internal")).toBe("thegemsutra.com");
    expect(requestHostname("thegemsutra.com", "localhost")).toBe("thegemsutra.com");
  });
  it("missing headers give an empty host (not loopback)", () => {
    expect(requestHostname(null, null)).toBe("");
    expect(demoAllowed({ NODE_ENV: "production", ENABLE_DEMO_CATALOG: "true" }, requestHostname(null, null))).toBe(false);
  });
});

describe("demoAllowed", () => {
  it("is always allowed in development", () => {
    expect(demoAllowed({ NODE_ENV: "development" }, "shop.example.com")).toBe(true);
    expect(demoAllowed({}, "localhost")).toBe(true);
  });

  it("is never allowed in production by the environment variable alone", () => {
    expect(demoAllowed({ NODE_ENV: "production" }, "localhost")).toBe(false);
    expect(demoAllowed({ NODE_ENV: "production", ENABLE_DEMO_CATALOG: "true" }, "thegemsutra.com")).toBe(false);
    expect(demoAllowed({ NODE_ENV: "production", ENABLE_DEMO_CATALOG: "true" }, "192.168.1.20")).toBe(false);
    expect(demoAllowed({ NODE_ENV: "production", ENABLE_DEMO_CATALOG: "1" }, "localhost")).toBe(false);
  });

  it("is allowed in a production build only with the explicit flag on a loopback host", () => {
    for (const h of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"]) {
      expect(demoAllowed({ NODE_ENV: "production", ENABLE_DEMO_CATALOG: "true" }, h), h).toBe(true);
    }
  });
});
