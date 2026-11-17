"use client";

import { normalizeConfig, type DesignConfig, type ProductDef } from "@jemsutra/design-engine";

/**
 * "Your design follows you": the last metal, name, font, first stone and size
 * a shopper picked are re-used on every other product and listing image.
 */
const KEY = "jemsutra:prefs:v1";

export interface Prefs {
  metal?: string;
  name?: string;
  font?: string;
  stone?: string;
  size?: number;
}

export function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

export function savePrefs(product: ProductDef, config: DesignConfig) {
  try {
    const firstEngraving = product.engravings[0];
    const prefs: Prefs = {
      ...readPrefs(),
      metal: config.metal,
      font: config.font,
      stone: config.stones.s1,
      size: config.size ?? readPrefs().size,
      name: firstEngraving ? config.engravings[firstEngraving.key] || readPrefs().name : readPrefs().name,
    };
    localStorage.setItem(KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event("jemsutra:prefs"));
  } catch {
    /* storage unavailable: personalisation simply doesn't carry over */
  }
}

/** Apply remembered preferences to a product (invalid values are dropped by normalizeConfig). */
export function withPrefs(product: ProductDef, prefs: Prefs, base?: Partial<DesignConfig>): DesignConfig {
  const first = product.engravings[0];
  return normalizeConfig(product, {
    metal: prefs.metal,
    font: prefs.font,
    size: prefs.size,
    stones: prefs.stone ? { s1: prefs.stone } : undefined,
    engravings: first && prefs.name ? { [first.key]: prefs.name } : undefined,
    ...base,
  });
}
