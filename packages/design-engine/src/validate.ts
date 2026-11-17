import { FONT_BY_CODE, METAL_BY_CODE, STONE_BY_CODE } from "./catalog/materials";
import type { ProductDef, StoneSlotDef, ValidationIssue } from "./types";

const SHAPES = ["heart", "round", "oval", "princess", "pear", "marquise"];
const TYPES = ["ring", "necklace", "bracelet", "earring"];

/**
 * Checks a design definition before it is saved from the admin.
 * Returns plain-language problems; an empty list means the design is valid.
 */
export function validateProductDef(def: ProductDef): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  const isMoney = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 50_000_000;

  if (!/^[A-Z]{2,4}\d{3,5}$/.test(def.styleCode ?? "")) add("styleCode", "Style code must look like JS0003 (letters then numbers).");
  if (!def.name?.trim()) add("name", "Name is required.");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.slug ?? "")) add("slug", "URL name may only use lowercase letters, numbers and dashes.");
  if (!TYPES.includes(def.type)) add("type", "Choose a product type.");
  if (!def.description?.trim()) add("description", "Description is required.");
  if (def.salePercent != null && (!Number.isInteger(def.salePercent) || def.salePercent < 0 || def.salePercent > 90)) {
    add("salePercent", "Sale % must be a whole number from 0 to 90.");
  }

  // Metals
  if (!def.metals?.length) add("metals", "Offer at least one metal.");
  const metalCodes = new Set<string>();
  for (const m of def.metals ?? []) {
    if (!METAL_BY_CODE[m.metal]) add("metals", `Unknown metal "${m.metal}".`);
    if (metalCodes.has(m.metal)) add("metals", `Metal ${m.metal} is listed twice.`);
    metalCodes.add(m.metal);
    if (!isMoney(m.price) || m.price <= 0) add("metals", `${METAL_BY_CODE[m.metal]?.name ?? m.metal}: enter a price above 0.`);
  }
  if (!metalCodes.has(def.defaultMetal)) add("defaultMetal", "The default metal must be one of the offered metals.");

  // Stones
  const checkSlot = (slot: Omit<StoneSlotDef, "key" | "label">, where: string) => {
    if (!SHAPES.includes(slot.shape)) add(where, `${where}: choose a stone shape.`);
    if (!slot.sizeMm?.trim()) add(where, `${where}: enter the stone size in mm.`);
    const offered = Object.keys(slot.prices ?? {});
    if (!offered.length) add(where, `${where}: offer at least one stone.`);
    for (const code of offered) {
      if (!STONE_BY_CODE[code]) add(where, `${where}: unknown stone "${code}".`);
      if (!isMoney(slot.prices[code])) add(where, `${where}: ${STONE_BY_CODE[code]?.name ?? code} needs a price of 0 or more.`);
    }
    if (!(slot.defaultStone in (slot.prices ?? {}))) add(where, `${where}: the default stone must be one of the offered stones.`);
  };

  if (def.stoneCount) {
    const sc = def.stoneCount;
    if (!Number.isInteger(sc.min) || sc.min < 1) add("stoneCount", "Minimum stones must be at least 1.");
    if (!Number.isInteger(sc.max) || sc.max < sc.min || sc.max > 20) add("stoneCount", "Maximum stones must be between the minimum and 20.");
    if (sc.defaultCount < sc.min || sc.defaultCount > sc.max) add("stoneCount", "Default number of stones must be between min and max.");
    if (sc.included < sc.min || sc.included > sc.max) add("stoneCount", "Stones included in the price must be between min and max.");
    if (!isMoney(sc.pricePerExtra)) add("stoneCount", "Price per extra stone must be 0 or more.");
    checkSlot(sc.slot, "Stones");
  } else {
    const keys = new Set<string>();
    (def.stoneSlots ?? []).forEach((slot, i) => {
      const where = slot.label?.trim() || `Stone slot ${i + 1}`;
      if (!/^s\d{1,2}$/.test(slot.key)) add("stoneSlots", `${where}: internal key must be s1, s2, ...`);
      if (keys.has(slot.key)) add("stoneSlots", `${where}: key ${slot.key} is used twice.`);
      keys.add(slot.key);
      if (!slot.label?.trim()) add("stoneSlots", `Stone slot ${i + 1} needs a label (e.g. "Left Heart").`);
      checkSlot(slot, where);
    });
  }

  // Engraving
  const eKeys = new Set<string>();
  for (const e of def.engravings ?? []) {
    const where = e.label?.trim() || "Engraving";
    if (!/^e\d$/.test(e.key)) add("engravings", `${where}: internal key must be e0 to e9.`);
    if (eKeys.has(e.key)) add("engravings", `${where}: key ${e.key} is used twice.`);
    eKeys.add(e.key);
    if (!e.label?.trim()) add("engravings", "Every engraving field needs a label.");
    if (!Number.isInteger(e.maxChars) || e.maxChars < 1 || e.maxChars > 40) add("engravings", `${where}: max characters must be 1 to 40.`);
    if (!isMoney(e.price)) add("engravings", `${where}: price must be 0 or more.`);
  }
  if ((def.engravings ?? []).length) {
    if (!def.fonts?.length) add("fonts", "Choose at least one engraving font.");
    for (const f of def.fonts ?? []) if (!FONT_BY_CODE[f]) add("fonts", `Unknown font "${f}".`);
    if (!def.fonts?.includes(def.defaultFont)) add("defaultFont", "The default font must be one of the chosen fonts.");
  }

  // Size
  if (def.size) {
    const s = def.size;
    if (!(s.min > 0 && s.max > s.min && s.max <= 30)) add("size", "Sizes: maximum must be above minimum (up to 30).");
    if (!(s.step > 0 && s.step <= 1)) add("size", "Size step must be between 0.25 and 1.");
    if (s.surchargeFrom != null && (s.surchargeFrom < s.min || s.surchargeFrom > s.max)) add("size", "Surcharge size must be within the size range.");
    if (s.surcharge != null && !isMoney(s.surcharge)) add("size", "Size surcharge must be 0 or more.");
  }

  // Packaging
  if (!def.packaging?.length) add("packaging", "Add at least one packaging option.");
  const pCodes = new Set<string>();
  for (const p of def.packaging ?? []) {
    if (!p.code?.trim() || !p.name?.trim()) add("packaging", "Every packaging option needs a code and a name.");
    if (pCodes.has(p.code)) add("packaging", `Packaging code ${p.code} is used twice.`);
    pCodes.add(p.code);
    if (!isMoney(p.price)) add("packaging", `${p.name || "Packaging"}: price must be 0 or more.`);
  }

  if (def.renderTemplate != null && def.renderTemplate !== "" && !/^[A-Z]{2,4}\d{3,5}$/.test(def.renderTemplate)) {
    add("renderTemplate", "Render artwork must be a style code like JS0001.");
  }
  return issues;
}
