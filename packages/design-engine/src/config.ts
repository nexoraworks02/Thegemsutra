import { FONT_BY_CODE, METAL_BY_CODE, STONE_BY_CODE } from "./catalog/materials";
import type { DesignConfig, OptionChoiceDef, OptionGroupDef, ProductDef, StoneSlotDef, ValidationIssue } from "./types";

/** Defaults used to give multi-stone designs a colourful starting look. */
const STONE_COUNT_DEFAULTS = ["S-RUBY", "S-AQUA", "CZ", "S-EMER", "S-SAPH", "S-PERI", "S-AMET", "S-CITR", "S-PTOU"];

/** Characters we can engrave. Anything else is removed. */
const ENGRAVING_ALLOWED = /[^A-Za-z0-9 &.,'!\-♥]/g;

export function sanitizeEngraving(text: string, maxChars: number): string {
  return text.replace(ENGRAVING_ALLOWED, "").replace(/\s{2,}/g, " ").slice(0, maxChars);
}

/** The stone slots that exist for a given configuration (stone-count designs grow/shrink). */
export function resolveSlots(product: ProductDef, stoneCount?: number): StoneSlotDef[] {
  const sc = product.stoneCount;
  if (!sc) return product.stoneSlots;
  const count = clampInt(stoneCount ?? sc.defaultCount, sc.min, sc.max);
  return Array.from({ length: count }, (_, i) => ({
    ...sc.slot,
    key: `s${i + 1}`,
    label: `Stone ${i + 1}`,
    defaultStone: STONE_COUNT_DEFAULTS[i % STONE_COUNT_DEFAULTS.length] ?? sc.slot.defaultStone,
  }));
}

/** The pre-selected choice of an option group (its defaultChoice, else the first choice). */
export function defaultChoice(group: OptionGroupDef): string {
  const wanted = group.defaultChoice;
  return wanted != null && group.choices.some((c) => c.code === wanted) ? wanted : group.choices[0]?.code ?? "";
}

/** Option groups with the chosen choice of each (config must be normalised). */
export function selectedOptions(product: ProductDef, config: DesignConfig): { group: OptionGroupDef; choice: OptionChoiceDef }[] {
  const out: { group: OptionGroupDef; choice: OptionChoiceDef }[] = [];
  for (const group of product.options ?? []) {
    const code = config.options?.[group.key] ?? defaultChoice(group);
    const choice = group.choices.find((c) => c.code === code);
    if (choice) out.push({ group, choice });
  }
  return out;
}

export function defaultConfig(product: ProductDef): DesignConfig {
  const stoneCount = product.stoneCount?.defaultCount;
  const slots = resolveSlots(product, stoneCount);
  const config: DesignConfig = {
    metal: product.defaultMetal,
    stoneCount,
    stones: Object.fromEntries(slots.map((s) => [s.key, s.defaultStone])),
    engravings: Object.fromEntries(product.engravings.map((e) => [e.key, ""])),
    font: product.defaultFont,
    size: undefined,
    packaging: product.packaging[0]?.code ?? "STD",
  };
  // Only products with option groups carry an `options` field (existing configs stay identical).
  if (product.options?.length) config.options = normalizeOptions(product, undefined);
  return config;
}

/**
 * Chosen option codes for every group the PRODUCT defines. Input keys the product
 * doesn't define are dropped; values that aren't an exact allowed choice code
 * fall back to the group's default (normalisation, not rejection - same rule as
 * metals and stones). Built on a null-prototype object and keyed only by the
 * product's own group keys, so input can't add arbitrary properties.
 */
function normalizeOptions(product: ProductDef, input: unknown): Record<string, string> {
  const given = input != null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const out: Record<string, string> = Object.create(null);
  for (const group of product.options ?? []) {
    const wanted = Object.prototype.hasOwnProperty.call(given, group.key) ? given[group.key] : undefined;
    out[group.key] = typeof wanted === "string" && group.choices.some((c) => c.code === wanted) ? wanted : defaultChoice(group);
  }
  return { ...out };
}

/**
 * Turn any (possibly partial or tampered) input into a valid configuration.
 * Unknown or disallowed values fall back to the product defaults.
 */
export function normalizeConfig(product: ProductDef, input: Partial<DesignConfig> = {}): DesignConfig {
  const def = defaultConfig(product);

  const metal = product.metals.some((m) => m.metal === input.metal) && METAL_BY_CODE[input.metal!] ? input.metal! : def.metal;

  const stoneCount = product.stoneCount
    ? clampInt(input.stoneCount ?? product.stoneCount.defaultCount, product.stoneCount.min, product.stoneCount.max)
    : undefined;

  const slots = resolveSlots(product, stoneCount);
  const stones: Record<string, string> = {};
  for (const slot of slots) {
    const wanted = input.stones?.[slot.key];
    stones[slot.key] = wanted && wanted in slot.prices && STONE_BY_CODE[wanted] ? wanted : slot.defaultStone;
  }

  const engravings: Record<string, string> = {};
  for (const e of product.engravings) {
    engravings[e.key] = sanitizeEngraving(input.engravings?.[e.key] ?? "", e.maxChars);
  }

  const font = input.font && product.fonts.includes(input.font) && FONT_BY_CODE[input.font] ? input.font : def.font;

  let size: number | undefined;
  if (product.size && input.size != null && Number.isFinite(input.size)) {
    const { min, max, step } = product.size;
    const snapped = Math.round(input.size / step) * step;
    size = snapped >= min && snapped <= max ? Number(snapped.toFixed(2)) : undefined;
  }

  const packaging = product.packaging.some((p) => p.code === input.packaging) ? input.packaging! : def.packaging;

  const config: DesignConfig = { metal, stoneCount, stones, engravings, font, size, packaging };
  if (product.options?.length) config.options = normalizeOptions(product, input.options);
  return config;
}

/** Checks that must pass before the design can be added to the cart. */
export function validateForCart(product: ProductDef, config: DesignConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Required personalisation (e.g. the name on a name necklace). The config is
  // normalised, so unsupported characters are already removed: text that was only
  // spaces or unsupported characters counts as empty.
  for (const e of product.engravings) {
    if (e.required && !config.engravings[e.key]?.trim()) {
      issues.push({ field: e.key, message: `Please enter the ${e.label.toLowerCase()} for your piece.` });
    }
  }
  if (product.size && config.size == null) {
    issues.push({ field: "size", message: "Please select your ring size." });
  }
  return issues;
}

/** All sizes a shopper can pick, with surcharge info. */
export function sizeOptions(product: ProductDef): { value: number; surcharge: number }[] {
  const s = product.size;
  if (!s) return [];
  const out: { value: number; surcharge: number }[] = [];
  for (let v = s.min; v <= s.max + 1e-9; v += s.step) {
    const value = Number(v.toFixed(2));
    const surcharge = s.surchargeFrom != null && value >= s.surchargeFrom ? s.surcharge ?? 0 : 0;
    out.push({ value, surcharge });
  }
  return out;
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
