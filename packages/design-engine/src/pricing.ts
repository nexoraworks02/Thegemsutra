import { METAL_BY_CODE, STONE_BY_CODE } from "./catalog/materials";
import { resolveSlots } from "./config";
import type { DesignConfig, PriceBreakdown, PriceLine, ProductDef } from "./types";

/**
 * Price formula (same on storefront and backend):
 *   metal base price
 * + each stone's price for its slot size
 * + extra stones beyond the included count
 * + filled engravings that carry a charge
 * + size surcharge
 * + packaging
 * The config must already be normalised (see normalizeConfig).
 */
export function priceDesign(product: ProductDef, config: DesignConfig): PriceBreakdown {
  const lines: PriceLine[] = [];

  const metalOpt = product.metals.find((m) => m.metal === config.metal);
  if (!metalOpt) throw new Error(`Metal ${config.metal} not offered for ${product.styleCode}`);
  lines.push({
    label: "Design & metal",
    detail: METAL_BY_CODE[config.metal]?.name ?? config.metal,
    amount: metalOpt.price,
  });

  for (const slot of resolveSlots(product, config.stoneCount)) {
    const code = config.stones[slot.key];
    if (!code) continue;
    const amount = slot.prices[code] ?? 0;
    if (amount > 0) {
      lines.push({ label: slot.label, detail: STONE_BY_CODE[code]?.name ?? code, amount });
    }
  }

  const sc = product.stoneCount;
  if (sc && config.stoneCount != null && config.stoneCount > sc.included) {
    const extra = config.stoneCount - sc.included;
    lines.push({ label: "Extra stones", detail: `${extra} x ${sc.pricePerExtra}`, amount: extra * sc.pricePerExtra });
  }

  for (const e of product.engravings) {
    const text = config.engravings[e.key]?.trim();
    if (text && e.price > 0) {
      lines.push({ label: e.label, detail: `"${text}"`, amount: e.price });
    }
  }

  const s = product.size;
  if (s && config.size != null && s.surchargeFrom != null && config.size >= s.surchargeFrom && s.surcharge) {
    lines.push({ label: "Ring size", detail: `Size ${config.size}`, amount: s.surcharge });
  }

  const pack = product.packaging.find((p) => p.code === config.packaging);
  if (pack && pack.price > 0) {
    lines.push({ label: "Packaging", detail: pack.name, amount: pack.price });
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const compareAt = product.salePercent ? roundUpTo(total / (1 - product.salePercent / 100), 100) : undefined;

  return { lines, total, compareAt };
}

/** "From" price shown on listing cards (cheapest metal, included stones). */
export function fromPrice(product: ProductDef): number {
  return Math.min(...product.metals.map((m) => m.price));
}

export function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}
