import { describe, expect, it } from "vitest";
import {
  PRODUCT_BY_STYLE,
  configFromQuery,
  configToQuery,
  defaultConfig,
  formatMoney,
  normalizeConfig,
  priceDesign,
  resolveSlots,
  sanitizeEngraving,
  sizeOptions,
  validateForCart,
} from "./index";

const twin = PRODUCT_BY_STYLE["JS0001"]!;
const family = PRODUCT_BY_STYLE["JS0002"]!;

describe("defaults and normalisation", () => {
  it("builds a default config", () => {
    const c = defaultConfig(twin);
    expect(c.metal).toBe("GP");
    expect(c.stones).toEqual({ s1: "S-EMER", s2: "S-BTOP" });
    expect(c.size).toBeUndefined();
  });

  it("replaces invalid values with defaults", () => {
    const c = normalizeConfig(twin, {
      metal: "PLATINUM",
      stones: { s1: "NOT-A-STONE", s2: "RUBY" },
      font: "comic-sans",
      packaging: "GOLD-BOX",
      size: 99,
    });
    expect(c.metal).toBe("GP");
    expect(c.stones).toEqual({ s1: "S-EMER", s2: "RUBY" });
    expect(c.font).toBe("classic");
    expect(c.packaging).toBe("STD");
    expect(c.size).toBeUndefined();
  });

  it("snaps sizes to the half-size grid", () => {
    expect(normalizeConfig(twin, { size: 7.2 }).size).toBe(7);
    expect(normalizeConfig(twin, { size: 7.3 }).size).toBe(7.5);
  });

  it("cleans and limits engraving text", () => {
    expect(sanitizeEngraving("Ali <script>", 10)).toBe("Ali script");
    expect(normalizeConfig(twin, { engravings: { e1: "Alexandrina-Maria" } }).engravings.e1).toBe("Alexandrin");
  });
});

describe("stone count designs", () => {
  it("creates and clamps slots", () => {
    expect(resolveSlots(family, 7)).toHaveLength(7);
    expect(resolveSlots(family, 50)).toHaveLength(9);
    expect(resolveSlots(family, 1)).toHaveLength(3);
  });

  it("charges for stones beyond the included count", () => {
    const c = normalizeConfig(family, { stoneCount: 8 });
    const p = priceDesign(family, c);
    const extra = p.lines.find((l) => l.label === "Extra stones");
    expect(extra?.amount).toBe(3 * 1500);
    expect(Object.keys(c.stones)).toHaveLength(8);
  });
});

describe("pricing", () => {
  it("prices the default design at the metal base price", () => {
    const p = priceDesign(twin, defaultConfig(twin));
    expect(p.total).toBe(15900);
    expect(p.compareAt).toBe(21200); // 15900 / 0.75 rounded up to 100
  });

  it("adds genuine stones, size surcharge and packaging", () => {
    const c = normalizeConfig(twin, {
      metal: "14KR",
      stones: { s1: "EMER", s2: "LDIA" },
      size: 11.5,
      packaging: "PRM",
    });
    const p = priceDesign(twin, c);
    expect(p.total).toBe(129900 + 9900 + 39900 + 4900 + 2500);
  });

  it("only charges engravings that are filled and priced", () => {
    const empty = priceDesign(family, normalizeConfig(family, {}));
    const filled = priceDesign(family, normalizeConfig(family, { engravings: { e1: "Forever" } }));
    expect(filled.total - empty.total).toBe(1500);
  });
});

describe("URL state", () => {
  it("round-trips a full configuration", () => {
    const c = normalizeConfig(twin, {
      metal: "10KR",
      stones: { s1: "RUBY", s2: "S-AQUA" },
      engravings: { e1: "Ali", e2: "Sara" },
      font: "script",
      size: 7,
      packaging: "PRM",
    });
    const q = configToQuery(twin, c);
    expect(configFromQuery(twin, q)).toEqual(c);
  });

  it("omits defaults for short storefront URLs", () => {
    const q = configToQuery(twin, normalizeConfig(twin, { metal: "14KY" }), { omitDefaults: true });
    expect(q.toString()).toBe("m=14KY");
  });

  it("visual query ignores size and packaging (better image caching)", () => {
    const c = normalizeConfig(twin, { size: 8, packaging: "PRM" });
    const q = configToQuery(twin, c, { include: "visual" });
    expect(q.has("sz")).toBe(false);
    expect(q.has("pk")).toBe(false);
  });
});

describe("cart validation and helpers", () => {
  it("requires a ring size", () => {
    expect(validateForCart(twin, defaultConfig(twin))).toHaveLength(1);
    expect(validateForCart(twin, normalizeConfig(twin, { size: 7 }))).toHaveLength(0);
  });

  it("lists sizes with surcharges", () => {
    const sizes = sizeOptions(twin);
    expect(sizes[0]).toEqual({ value: 4, surcharge: 0 });
    expect(sizes.at(-1)).toEqual({ value: 12, surcharge: 4900 });
    expect(sizes).toHaveLength(17);
  });

  it("formats PKR", () => {
    expect(formatMoney(129900)).toBe("Rs 129,900");
  });
});

describe("describeDesign", () => {
  it("spells out every choice for the workshop", async () => {
    const { describeDesign, variantSku } = await import("./index");
    const c = normalizeConfig(twin, { metal: "14KR", stones: { s1: "RUBY" }, engravings: { e1: "Ayesha" }, font: "script", size: 7 });
    expect(describeDesign(twin, c)).toEqual([
      ["Style", "JS0001"],
      ["Metal", "14K Rose Gold"],
      ["Left Heart", "Ruby (4x4mm heart)"],
      ["Right Heart", "Blue Topaz (Simulated) (4x4mm heart)"],
      ["Left Name", '"Ayesha"'],
      ["Font", "Script"],
      ["Size", "7.0"],
      ["Packaging", "Signature Box"],
    ]);
    expect(variantSku(twin, "14KR")).toBe("JS0001-14KR");
  });
});

describe("production flow", () => {
  it("moves forward one stage at a time", async () => {
    const { readProduction, advance, canMoveTo } = await import("./index");
    const s0 = readProduction(null, "2026-11-17T10:00:00Z");
    expect(s0.stage).toBe("placed");
    expect(canMoveTo("placed", "shipped")).toBe(false);
    expect(canMoveTo("placed", "placed")).toBe(false);
    const s1 = advance(s0, "in_production", { by: "user_1" });
    expect(s1.stage).toBe("in_production");
    expect(s1.history.map((h) => h.stage)).toEqual(["placed", "in_production"]);
    expect(() => advance(s1, "delivered")).toThrow();
  });

  it("requires courier details to ship", async () => {
    const { readProduction, advance } = await import("./index");
    let s = readProduction(null, "2026-11-17T10:00:00Z");
    s = advance(advance(s, "in_production"), "quality_check");
    expect(() => advance(s, "shipped")).toThrow(/tracking/);
    const shipped = advance(s, "shipped", { courier: "TCS", tracking_number: "123" });
    expect(shipped.courier).toBe("TCS");
  });

  it("promises 7 working days, skipping Sundays", async () => {
    const { dueDate } = await import("./index");
    // Tue 17 Nov 2026 + 7 working days (Sun 22 skipped) = Wed 25 Nov
    expect(dueDate("2026-11-17T10:00:00Z")).toBe("2026-11-25");
  });
});

describe("validateProductDef", () => {
  it("accepts the starter catalog", async () => {
    const { validateProductDef, PRODUCTS } = await import("./index");
    for (const p of PRODUCTS) expect(validateProductDef(p)).toEqual([]);
  });

  it("explains what is wrong with a broken design", async () => {
    const { validateProductDef } = await import("./index");
    const bad = structuredClone(twin);
    bad.styleCode = "ring 3";
    bad.slug = "Bad Slug";
    bad.defaultMetal = "PLAT";
    bad.metals[0]!.price = 0;
    bad.stoneSlots[0]!.defaultStone = "NOPE";
    bad.engravings.push({ key: "e1", label: "Dup", maxChars: 10, price: 0 });
    bad.fonts = [];
    const fields = validateProductDef(bad).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["styleCode", "slug", "defaultMetal", "metals", "Left Heart", "engravings", "fonts"]));
  });
});
