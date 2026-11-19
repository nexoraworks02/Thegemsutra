import { describe, expect, it } from "vitest";
import {
  PRODUCT_BY_STYLE,
  configFromQuery,
  configToQuery,
  defaultConfig,
  describeDesign,
  normalizeConfig,
  priceDesign,
  selectedOptions,
  validateForCart,
  validateProductDef,
  type ProductDef,
} from "./index";

/**
 * TEST-ONLY necklace definition. Not part of the catalog; option names, codes and
 * amounts are arbitrary test values, not real chains, prices or workshop limits.
 */
const NECKLACE: ProductDef = {
  styleCode: "TN0001",
  name: "Test Name Necklace",
  slug: "test-name-necklace",
  type: "necklace",
  description: "Test fixture.",
  metals: [
    { metal: "SS", price: 1000 },
    { metal: "GP", price: 2000 },
  ],
  defaultMetal: "SS",
  stoneSlots: [],
  engravings: [{ key: "e1", label: "Name", maxChars: 8, price: 0, required: true }],
  fonts: ["script", "classic"],
  defaultFont: "script",
  options: [
    {
      key: "cl",
      label: "Chain length",
      defaultChoice: "18",
      choices: [
        { code: "16", name: "16 inch", price: 0, attributes: { lengthIn: 16 } },
        { code: "18", name: "18 inch", price: 0, attributes: { lengthIn: 18 } },
        { code: "20", name: "20 inch", price: 300, attributes: { lengthIn: 20 } },
      ],
    },
    {
      key: "ct",
      label: "Chain type",
      visual: true,
      choices: [
        { code: "cable", name: "Cable", price: 0 },
        { code: "box", name: "Box", price: 500 },
      ],
    },
  ],
  packaging: [{ code: "STD", name: "Signature Box", price: 0 }],
};

const q = (s: string) => new URLSearchParams(s);

describe("option groups: defaults, URLs and round trips", () => {
  it("starts every group on its default choice (defaultChoice, else the first)", () => {
    expect(defaultConfig(NECKLACE).options).toEqual({ cl: "18", ct: "cable" });
    expect(normalizeConfig(NECKLACE).options).toEqual({ cl: "18", ct: "cable" });
  });

  it("reads and writes option keys after the existing keys", () => {
    const config = configFromQuery(NECKLACE, q("m=GP&e1=Ayesha&ef=classic&cl=20&ct=box"));
    expect(config.options).toEqual({ cl: "20", ct: "box" });
    expect(configToQuery(NECKLACE, config, { omitDefaults: true }).toString()).toBe("m=GP&e1=Ayesha&ef=classic&cl=20&ct=box");
    // image URLs carry only groups that change the image (chain type, not length)
    expect(configToQuery(NECKLACE, config, { include: "visual" }).toString()).toBe("m=GP&e1=Ayesha&ef=classic&ct=box");
    // full form (stable cache keys) writes every value
    expect(configToQuery(NECKLACE, config).toString()).toBe("m=GP&e1=Ayesha&ef=classic&pk=STD&cl=20&ct=box");
  });

  it("leaves default choices out of short URLs and round-trips them", () => {
    const config = configFromQuery(NECKLACE, q("e1=Sara"));
    const short = configToQuery(NECKLACE, config, { omitDefaults: true }).toString();
    expect(short).toBe("e1=Sara");
    expect(configFromQuery(NECKLACE, q(short))).toStrictEqual(config);
    expect(configFromQuery(NECKLACE, q(configToQuery(NECKLACE, config).toString()))).toStrictEqual(config);
  });

  it("does not add option groups to products without them", () => {
    const ring = PRODUCT_BY_STYLE["JS0001"]!;
    expect("options" in configFromQuery(ring, q("m=SS&cl=20&ct=box"))).toBe(false);
    expect(configToQuery(ring, configFromQuery(ring, q("cl=20")), { omitDefaults: true }).toString()).toBe("");
  });
});

describe("option groups: untrusted input is normalised safely", () => {
  it("falls back to the default for values that aren't an allowed choice", () => {
    for (const bad of ["99", "", " 20", "20 ", "BOX", "box;drop", "<b>"]) {
      const c = configFromQuery(NECKLACE, q(`cl=${encodeURIComponent(bad)}&ct=${encodeURIComponent(bad)}`));
      expect(c.options).toEqual({ cl: "18", ct: "cable" });
    }
  });

  it("uses the first value of a repeated key (predictable)", () => {
    expect(configFromQuery(NECKLACE, q("cl=20&cl=16")).options?.cl).toBe("20");
    expect(configFromQuery(NECKLACE, { cl: ["16", "20"] }).options?.cl).toBe("16");
  });

  it("ignores groups the product doesn't define and never adds extra properties", () => {
    const c = configFromQuery(NECKLACE, q("zz=1&__proto__=x&constructor=y&toString=z&cl=16"));
    expect(c.options).toStrictEqual({ cl: "16", ct: "cable" });
    expect(Object.keys(c)).toEqual(["metal", "stoneCount", "stones", "engravings", "font", "size", "packaging", "options"]);
  });

  it("rejects non-string, nested and prototype-polluting option input", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": "yes"}, "cl": {"code": "20", "price": 1}, "ct": ["box"], "extra": "x"}');
    for (const options of [evil, ["20"], "cl=20", 20, null, { cl: 20, ct: true }]) {
      const c = normalizeConfig(NECKLACE, { options } as never);
      expect(c.options).toStrictEqual({ cl: "18", ct: "cable" });
      expect(Object.getPrototypeOf(c.options)).toBe(Object.prototype);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("option groups: pricing and description", () => {
  it("adds a price line only for chosen choices that carry a charge", () => {
    const plain = priceDesign(NECKLACE, configFromQuery(NECKLACE, q("e1=Sara")));
    expect(plain.total).toBe(1000);
    expect(plain.lines.map((l) => l.label)).toEqual(["Design & metal"]);

    const extras = priceDesign(NECKLACE, configFromQuery(NECKLACE, q("m=GP&e1=Sara&cl=20&ct=box")));
    expect(extras.lines).toEqual([
      { label: "Design & metal", detail: "18K Gold Plated Silver", amount: 2000 },
      { label: "Chain length", detail: "20 inch", amount: 300 },
      { label: "Chain type", detail: "Box", amount: 500 },
    ]);
    expect(extras.total).toBe(2800);
  });

  it("takes amounts only from the product definition, never from the config", () => {
    const tampered = normalizeConfig(NECKLACE, { options: { cl: "16" }, price: 1, total: 1, unit_price: 1 } as never);
    expect(priceDesign(NECKLACE, tampered).total).toBe(1000);
    // even a config edited after normalisation can't invent prices: unknown codes price nothing
    expect(priceDesign(NECKLACE, { ...tampered, options: { cl: "999", ct: "gold" } }).total).toBe(1000);
  });

  it("lists every option on the cart / workshop summary", () => {
    const config = configFromQuery(NECKLACE, q("e1=Ayesha&cl=16&ct=box"));
    expect(describeDesign(NECKLACE, config)).toEqual([
      ["Style", "TN0001"],
      ["Metal", "925 Sterling Silver"],
      ["Name", '"Ayesha"'],
      ["Font", "Script"],
      ["Chain length", "16 inch"],
      ["Chain type", "Box"],
      ["Packaging", "Signature Box"],
    ]);
    expect(selectedOptions(NECKLACE, config).map((o) => o.choice.attributes)).toEqual([{ lengthIn: 16 }, undefined]);
  });
});

describe("required personalisation", () => {
  it("rejects a missing, empty, whitespace-only or unsupported-only name", () => {
    for (const name of [undefined, "", "   ", "\t\n", "😀😀", "<>{}"]) {
      const config = normalizeConfig(NECKLACE, { engravings: name == null ? {} : { e1: name } });
      expect(validateForCart(NECKLACE, config)).toEqual([{ field: "e1", message: "Please enter the name for your piece." }]);
    }
  });

  it("accepts a valid name, keeps the maximum length and strips unsupported characters", () => {
    const config = normalizeConfig(NECKLACE, { engravings: { e1: "Zainab<script>99" } });
    expect(config.engravings.e1).toBe("Zainabsc"); // unsupported removed, then cut to 8
    expect(validateForCart(NECKLACE, config)).toEqual([]);
  });

  it("keeps existing ring engravings optional", () => {
    const ring = PRODUCT_BY_STYLE["JS0001"]!;
    expect(validateForCart(ring, normalizeConfig(ring, { size: 7 }))).toEqual([]);
  });
});

describe("definition rules for option groups", () => {
  const withOptions = (options: unknown, extra: Partial<ProductDef> = {}) =>
    validateProductDef({ ...NECKLACE, ...extra, options } as ProductDef).map((i) => i.message);

  it("accepts the test necklace", () => {
    expect(validateProductDef(NECKLACE)).toEqual([]);
  });

  it("rejects keys that clash with existing URL keys or are malformed", () => {
    for (const key of ["sz", "pk", "ef", "sc", "s3", "s12", "e1", "dr", "line"]) {
      expect(withOptions([{ ...NECKLACE.options![0], key }]).join()).toMatch(/already used/);
    }
    // single-letter keys (m, w, v) are already rejected by the 2-character minimum
    for (const key of ["m", "w", "v"]) expect(withOptions([{ ...NECKLACE.options![0], key }]).length).toBeGreaterThan(0);
    for (const key of ["Cl", "c", "chainlength", "c-l", "1cl", "__proto__"]) {
      expect(withOptions([{ ...NECKLACE.options![0], key }]).join()).toMatch(/2-8 lowercase/);
    }
  });

  it("rejects duplicate keys and choices, bad codes, prices, defaults and attributes", () => {
    const g = NECKLACE.options![0]!;
    expect(withOptions([g, g]).join()).toMatch(/used twice/);
    expect(withOptions([{ ...g, choices: [g.choices[0], g.choices[0]] }]).join()).toMatch(/listed twice/);
    expect(withOptions([{ ...g, choices: [{ ...g.choices[0], code: "18 in" }] }]).join()).toMatch(/choice codes/);
    expect(withOptions([{ ...g, choices: [{ ...g.choices[0], price: -1 }] }]).join()).toMatch(/price must be 0 or more/);
    expect(withOptions([{ ...g, defaultChoice: "24" }]).join()).toMatch(/default choice/);
    expect(withOptions([{ ...g, choices: [] }]).join()).toMatch(/at least one choice/);
    expect(withOptions([{ ...g, choices: [{ ...g.choices[0], attributes: { mm: { nested: 1 } } }] }]).join()).toMatch(/attributes/);
    expect(withOptions({ cl: g }).join()).toMatch(/must be a list/);
  });

  it("rejects a non-boolean required flag", () => {
    const def = { ...NECKLACE, engravings: [{ ...NECKLACE.engravings[0]!, required: "yes" }] } as unknown as ProductDef;
    expect(validateProductDef(def).map((i) => i.message).join()).toMatch(/required/);
  });
});
