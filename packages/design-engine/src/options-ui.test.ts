import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  artworkCompatibilityIssues,
  artworkInfoFromResponse,
  artworkKindFromViews,
  describeDesign,
  engravingLines,
  normalizeConfig,
  optionEdits,
  sheetEngravingLines,
  formatChoicePrice,
  formatOptionAttributes,
  parseOptionAttributes,
  validateProductDef,
  type OptionGroupDef,
  type ProductDef,
} from "./index";

/** The three ring designs as the live store sells them (see ring-regression.test.ts). */
const rings: Record<string, ProductDef> = JSON.parse(readFileSync(new URL("./__fixtures__/ring-baseline.json", import.meta.url), "utf8")).definitions;
const manifest = (code: string) => JSON.parse(readFileSync(new URL(`../../../assets/products/${code}/manifest.json`, import.meta.url), "utf8"));

describe("option choice price label (designer)", () => {
  it("shows Included for free choices and +Rs for extras", () => {
    expect(formatChoicePrice(0)).toBe("Included");
    expect(formatChoicePrice(300)).toBe("+Rs 300");
    expect(formatChoicePrice(12500)).toBe("+Rs 12,500");
  });
});

describe("choice attributes as text (admin editor)", () => {
  it("parses typed values and formats them back", () => {
    const { attributes, error } = parseOptionAttributes(" lengthIn=18, mm = 1.2, plated=true, finish=polished, gift=false ");
    expect(error).toBeUndefined();
    expect(attributes).toEqual({ lengthIn: 18, mm: 1.2, plated: true, finish: "polished", gift: false });
    expect(formatOptionAttributes(attributes)).toBe("lengthIn=18, mm=1.2, plated=true, finish=polished, gift=false");
    expect(parseOptionAttributes(formatOptionAttributes(attributes)).attributes).toEqual(attributes);
  });

  it("treats empty text as no attributes", () => {
    expect(parseOptionAttributes("   ")).toEqual({});
    expect(formatOptionAttributes(undefined)).toBe("");
  });

  it("reports malformed or duplicate entries instead of guessing", () => {
    expect(parseOptionAttributes("lengthIn").error).toMatch(/name=value/);
    expect(parseOptionAttributes("1x=2").error).toMatch(/name=value/);
    expect(parseOptionAttributes("__proto__=1").error).toMatch(/name=value/);
    expect(parseOptionAttributes("a=1, a=2").error).toMatch(/twice/);
  });

  it("produces attributes the definition rules accept", () => {
    const { attributes } = parseOptionAttributes("lengthIn=18, plated=true, finish=polished");
    const def: ProductDef = {
      ...rings["JS0001"]!,
      options: [{ key: "cl", label: "Chain length", choices: [{ code: "18", name: "18 inch", price: 0, attributes }] }],
    };
    expect(validateProductDef(def)).toEqual([]);
  });
});

describe("render artwork compatibility (publishing safeguard)", () => {
  it("classifies the real manifests", () => {
    expect(artworkKindFromViews(manifest("JS0001").views)).toBe("ring");
    expect(artworkKindFromViews(manifest("JS0002").views)).toBe("ring");
    expect(artworkKindFromViews(manifest("JSN900").views)).toBe("necklace");
  });

  it("keeps the three existing ring designs valid (JS0003 borrows JS0001 ring artwork)", () => {
    for (const def of Object.values(rings)) {
      const code = def.renderTemplate || def.styleCode;
      const info = { code, exists: true, kind: artworkKindFromViews(manifest(code).views) };
      expect(artworkCompatibilityIssues(def, info, { publishing: true })).toEqual([]);
    }
    expect(rings["JS0003"]!.renderTemplate).toBe("JS0001");
  });

  it("refuses ring artwork for a necklace, even for a draft", () => {
    const necklace: ProductDef = { ...rings["JS0003"]!, type: "necklace" };
    for (const publishing of [true, false]) {
      const issues = artworkCompatibilityIssues(necklace, { code: "JS0001", exists: true, kind: "ring" }, { publishing });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toMatch(/necklace, but render artwork JS0001 is ring artwork/);
    }
  });

  it("lets a draft wait for its artwork but blocks publishing without it", () => {
    const draft: ProductDef = { ...rings["JS0001"]!, styleCode: "JS0099", renderTemplate: undefined };
    const missing = { code: "JS0099", exists: false, kind: null };
    expect(artworkCompatibilityIssues(draft, missing, { publishing: false })).toEqual([]);
    expect(artworkCompatibilityIssues(draft, missing, { publishing: true })[0]!.message).toMatch(/does not exist yet/);
  });

  it("blocks publishing when the artwork can't be checked", () => {
    expect(artworkCompatibilityIssues(rings["JS0001"]!, null, { publishing: false })).toEqual([]);
    expect(artworkCompatibilityIssues(rings["JS0001"]!, null, { publishing: true })[0]!.message).toMatch(/Could not check/);
  });

  it("has no artwork kind for bracelets or earrings yet, so they cannot be published", () => {
    const bracelet: ProductDef = { ...rings["JS0001"]!, type: "bracelet" };
    expect(artworkCompatibilityIssues(bracelet, { code: "JS0001", exists: true, kind: "ring" }, { publishing: true })).toHaveLength(1);
  });
});

describe("admin option-group editor operations (used by the editor component)", () => {
  const g = (key: string, codes: string[], extra: Partial<OptionGroupDef> = {}): OptionGroupDef => ({
    key,
    label: key.toUpperCase(),
    choices: codes.map((code) => ({ code, name: `Choice ${code}`, price: 0 })),
    ...extra,
  });

  it("adds groups with free keys and removes them", () => {
    let groups = optionEdits.addGroup([]);
    expect(groups).toEqual([{ key: "opt1", label: "", choices: [{ code: "", name: "", price: 0 }] }]);
    groups = optionEdits.addGroup([g("opt1", ["A"]), g("opt3", ["A"])]);
    expect(groups.map((x) => x.key)).toEqual(["opt1", "opt3", "opt2"]);
    expect(optionEdits.removeGroup(groups, 1).map((x) => x.key)).toEqual(["opt1", "opt2"]);
  });

  it("reorders groups and ignores moves past either end", () => {
    const groups = [g("aa", ["A"]), g("bb", ["A"]), g("cc", ["A"])];
    expect(optionEdits.moveGroup(groups, 2, -1).map((x) => x.key)).toEqual(["aa", "cc", "bb"]);
    expect(optionEdits.moveGroup(groups, 0, 1).map((x) => x.key)).toEqual(["bb", "aa", "cc"]);
    expect(optionEdits.moveGroup(groups, 0, -1)).toBe(groups);
    expect(optionEdits.moveGroup(groups, 2, 1)).toBe(groups);
  });

  it("cleans typed keys and choice codes the same way the server expects", () => {
    expect(optionEdits.setKey([g("aa", ["A"])], 0, "Chain Length!")[0]!.key).toBe("chainlen");
    expect(optionEdits.updateChoice([g("aa", ["A"])], 0, 0, { code: "18 in/ch" })[0]!.choices[0]!.code).toBe("18inch");
  });

  it("adds, edits and removes choices, always keeping one", () => {
    let groups = [g("cl", ["A"])];
    groups = optionEdits.addChoice(groups, 0);
    groups = optionEdits.updateChoice(groups, 0, 1, { code: "B", name: "Choice B", price: 300, attributes: { lengthIn: 20 } });
    expect(groups[0]!.choices[1]).toEqual({ code: "B", name: "Choice B", price: 300, attributes: { lengthIn: 20 } });
    groups = optionEdits.removeChoice(groups, 0, 0);
    expect(groups[0]!.choices.map((c) => c.code)).toEqual(["B"]);
    expect(optionEdits.removeChoice(groups, 0, 0)).toBe(groups); // last choice stays
  });

  it("stores a default only when it isn't the first choice, and clears a removed default", () => {
    let groups = [g("cl", ["A", "B", "C"])];
    groups = optionEdits.setDefault(groups, 0, "B");
    expect(groups[0]!.defaultChoice).toBe("B");
    expect("defaultChoice" in optionEdits.setDefault(groups, 0, "A")[0]!).toBe(false);
    groups = optionEdits.removeChoice(groups, 0, 1);
    expect("defaultChoice" in groups[0]!).toBe(false);
  });

  it("stores the visual and required flags only when true", () => {
    const on = optionEdits.setVisual([g("ct", ["A"])], 0, true);
    expect(on[0]!.visual).toBe(true);
    expect("visual" in optionEdits.setVisual(on, 0, false)[0]!).toBe(false);
    const e = { key: "e1", label: "Name", maxChars: 10, price: 0 };
    expect(optionEdits.setRequired(e, true)).toEqual({ ...e, required: true });
    expect(optionEdits.setRequired({ ...e, required: true }, false)).toEqual(e);
  });

  it("produces definitions that pass the server rules, and invalid edits are reported", () => {
    let groups = optionEdits.addGroup([]);
    groups = optionEdits.setKey(groups, 0, "cl");
    groups = optionEdits.updateGroup(groups, 0, { label: "Chain length" });
    groups = optionEdits.updateChoice(groups, 0, 0, { code: "A", name: "Choice A" });
    groups = optionEdits.addChoice(groups, 0);
    groups = optionEdits.updateChoice(groups, 0, 1, { code: "B", name: "Choice B", price: 300 });
    groups = optionEdits.setDefault(groups, 0, "B");
    const ok: ProductDef = { ...rings["JS0001"]!, options: groups };
    expect(validateProductDef(ok)).toEqual([]);
    // an unfinished choice (empty code and name) or a clashing key is refused on save
    const unfinished = { ...ok, options: optionEdits.addChoice(groups, 0) };
    expect(validateProductDef(unfinished).map((i) => i.message).join()).toMatch(/choice codes|needs a name/);
    expect(validateProductDef({ ...ok, options: optionEdits.setKey(groups, 0, "sz") }).map((i) => i.message).join()).toMatch(/already used/);
  });
});

describe("artwork lookup replies (backend check)", () => {
  it("accepts only clean answers", () => {
    expect(artworkInfoFromResponse("JS0001", 200, { exists: true, kind: "ring" })).toEqual({ code: "JS0001", exists: true, kind: "ring" });
    expect(artworkInfoFromResponse("JS9999", 200, { exists: false, kind: null })).toEqual({ code: "JS9999", exists: false, kind: null });
  });

  it("treats errors, unauthorised replies and odd bodies as 'could not be checked'", () => {
    for (const [status, body] of [
      [401, { message: "Unauthorized" }],
      [500, null],
      [200, null],
      [200, "ok"],
      [200, {}],
      [200, { exists: true }],
      [200, { exists: true, kind: "bracelet" }],
      [200, { exists: "yes", kind: "ring" }],
    ] as const) {
      expect(artworkInfoFromResponse("JS0001", status, body)).toBeNull();
    }
  });

  it("so a failing service can only block publishing, never allow it", () => {
    const necklace: ProductDef = { ...rings["JS0001"]!, type: "necklace" };
    expect(artworkCompatibilityIssues(necklace, artworkInfoFromResponse("JS0001", 500, null), { publishing: true })).toHaveLength(1);
  });
});

describe("workshop sheet engraving lines", () => {
  const ring = rings["JS0001"]!;

  it("stores the exact engraving text with its field label", () => {
    const config = normalizeConfig(ring, { engravings: { e1: "Ayesha", e2: "" } });
    expect(engravingLines(ring, config)).toEqual([["Left Name", "Ayesha"]]);
  });

  it("uses structured lines when present, so option labels can't be mistaken for engraving", () => {
    const meta = {
      engraving_lines: [["Message", "Forever"]],
      design_summary: [["Engraving style", "Deep"], ["Message", '"Forever"'], ["Name plate size", "Large"]],
    };
    expect(sheetEngravingLines(meta)).toEqual([["Message", "Forever"]]);
    expect(sheetEngravingLines({ engraving_lines: [], design_summary: meta.design_summary })).toEqual([]);
    expect(sheetEngravingLines({ engraving_lines: "bad" })).toEqual([]);
  });

  it("keeps the original rule for orders placed before structured lines existed", () => {
    const summary = describeDesign(ring, normalizeConfig(ring, { engravings: { e1: "Ali", e2: "Sara" }, size: 7 }));
    expect(sheetEngravingLines({ design_summary: summary })).toEqual([["Left Name", "Ali"], ["Right Name", "Sara"]]);
  });
});
