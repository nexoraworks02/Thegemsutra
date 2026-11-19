import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_BY_STYLE,
  configFromQuery,
  configToQuery,
  describeDesign,
  priceDesign,
  validateForCart,
  validateProductDef,
  type ProductDef,
} from "./index";

/**
 * FIXED regression baseline for the existing ring products, recorded from the
 * engine BEFORE option groups were added (Phase 1A, engine at commit 6339c26).
 * Definitions are the ones the live store sells, exported from the local
 * database's `design` table:
 *   - JS0001, JS0002: identical to the code catalog (catalog/products.ts).
 *   - JS0003: exists ONLY in the local database (created with the admin Designs
 *     manager on 2026-11-17); its definition is embedded here so the test does
 *     not depend on a database.
 * Verified: regenerating from the commit-6339c26 engine reproduces this fixture byte for byte.
 * Never regenerate this file to make a failing test pass - a difference means
 * existing ring URLs, prices, cart summaries or validation changed.
 */
interface Golden {
  definitions: Record<string, ProductDef>;
  cases: {
    style: string;
    query: string;
    config: unknown;
    price: unknown;
    urlShort: string;
    urlVisual: string;
    urlAll: string;
    summary: unknown;
    cartIssues: unknown;
  }[];
}
/** The fixture is JSON, which has no `undefined`: compare through the same JSON form. */
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v));

const golden: Golden = JSON.parse(readFileSync(new URL("./__fixtures__/ring-baseline.json", import.meta.url), "utf8"));

describe("existing ring products behave exactly as before", () => {
  it("covers all three rings", () => {
    expect(Object.keys(golden.definitions).sort()).toEqual(["JS0001", "JS0002", "JS0003"]);
    expect(golden.cases.length).toBeGreaterThanOrEqual(13);
  });

  it("ring definitions are still valid and the catalog rings are unchanged", () => {
    for (const def of Object.values(golden.definitions)) expect(validateProductDef(def)).toEqual([]);
    expect(PRODUCT_BY_STYLE["JS0001"]).toEqual(golden.definitions["JS0001"]);
    expect(PRODUCT_BY_STYLE["JS0002"]).toEqual(golden.definitions["JS0002"]);
  });

  for (const c of golden.cases) {
    it(`${c.style} ?${c.query || "(defaults)"}`, () => {
      const product = golden.definitions[c.style]!;
      const config = configFromQuery(product, new URLSearchParams(c.query));
      // Normalised config (incl. no new "options" field), price breakdown, URLs,
      // workshop/cart summary and cart validation are all byte-for-byte the same.
      expect(asJson(config)).toStrictEqual(c.config);
      expect(Object.keys(config)).toEqual(["metal", "stoneCount", "stones", "engravings", "font", "size", "packaging"]);
      expect(asJson(priceDesign(product, config))).toStrictEqual(c.price);
      expect(configToQuery(product, config, { omitDefaults: true }).toString()).toBe(c.urlShort);
      expect(configToQuery(product, config, { include: "visual" }).toString()).toBe(c.urlVisual);
      expect(configToQuery(product, config).toString()).toBe(c.urlAll);
      expect(asJson(describeDesign(product, config))).toStrictEqual(c.summary);
      expect(asJson(validateForCart(product, config))).toStrictEqual(c.cartIssues);
    });
  }

  it("round-trips every ring URL (short and full) to the same configuration", () => {
    for (const c of golden.cases) {
      const product = golden.definitions[c.style]!;
      const config = configFromQuery(product, new URLSearchParams(c.query));
      expect(configFromQuery(product, new URLSearchParams(c.urlShort))).toStrictEqual(config);
      expect(configFromQuery(product, new URLSearchParams(c.urlAll))).toStrictEqual(config);
    }
  });
});
