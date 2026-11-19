import { FONT_BY_CODE, METAL_BY_CODE, STONE_BY_CODE } from "./catalog/materials";
import { resolveSlots, selectedOptions } from "./config";
import type { DesignConfig, ProductDef } from "./types";

/**
 * Every choice in plain words, in a fixed order. Used for the bag, order
 * records and the workshop production sheet, so they always match.
 */
export function describeDesign(product: ProductDef, config: DesignConfig): [label: string, value: string][] {
  const rows: [string, string][] = [
    ["Style", product.styleCode],
    ["Metal", METAL_BY_CODE[config.metal]?.name ?? config.metal],
  ];
  if (config.stoneCount != null) rows.push(["Stones", String(config.stoneCount)]);
  for (const slot of resolveSlots(product, config.stoneCount)) {
    const code = config.stones[slot.key];
    if (code) rows.push([slot.label, `${STONE_BY_CODE[code]?.name ?? code} (${slot.sizeMm}mm ${slot.shape})`]);
  }
  const engraved = product.engravings.filter((e) => config.engravings[e.key]);
  for (const e of engraved) rows.push([e.label, `"${config.engravings[e.key]}"`]);
  if (engraved.length) rows.push(["Font", FONT_BY_CODE[config.font]?.name ?? config.font]);
  for (const { group, choice } of selectedOptions(product, config)) rows.push([group.label, choice.name]);
  if (config.size != null) rows.push(["Size", config.size.toFixed(1)]);
  rows.push(["Packaging", product.packaging.find((p) => p.code === config.packaging)?.name ?? config.packaging]);
  return rows;
}

/**
 * The text to engrave, as structured [label, text] pairs from the product's
 * engraving definitions (filled fields only). Stored on cart lines/orders so the
 * workshop sheet's letter-by-letter check never depends on display labels.
 */
export function engravingLines(product: ProductDef, config: DesignConfig): [label: string, text: string][] {
  return product.engravings.filter((e) => config.engravings[e.key]).map((e) => [e.label, config.engravings[e.key]!]);
}

/**
 * Engraving lines for the workshop sheet from a line item's metadata.
 * New orders carry `engraving_lines` (structured, exact). Orders placed before it
 * existed fall back to the original rule (summary rows whose label mentions a
 * name or engraving), so their sheets are unchanged.
 */
export function sheetEngravingLines(meta: { engraving_lines?: unknown; design_summary?: unknown }): [label: string, text: string][] {
  const isPairs = (v: unknown): v is [string, string][] =>
    Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && typeof p[1] === "string");
  if (meta.engraving_lines !== undefined) return isPairs(meta.engraving_lines) ? meta.engraving_lines : [];
  const summary = isPairs(meta.design_summary) ? meta.design_summary : [];
  return summary.filter(([k]) => /name|engraving/i.test(k)).map(([k, v]) => [k, v.replace(/^"|"$/g, "")]);
}

/** Medusa variant SKU for a design in a metal (one variant per metal). */
export function variantSku(product: ProductDef, metal: string): string {
  return `${product.styleCode}-${metal}`;
}
