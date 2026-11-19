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

/** Medusa variant SKU for a design in a metal (one variant per metal). */
export function variantSku(product: ProductDef, metal: string): string {
  return `${product.styleCode}-${metal}`;
}
