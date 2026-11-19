import { formatMoney } from "./money";
import type { OptionChoiceDef, OptionGroupDef, ProductDef, ProductType, ValidationIssue } from "./types";

/** Price shown beside an option choice: "Included" or "+Rs 300". */
export function formatChoicePrice(price: number): string {
  return price > 0 ? `+${formatMoney(price)}` : "Included";
}

// ---- Choice attributes as editable text (admin) ----

export type OptionAttributes = Record<string, string | number | boolean>;

/** "lengthIn=18, mm=1.2, plated=true" -> { lengthIn: 18, mm: 1.2, plated: true }. */
export function parseOptionAttributes(text: string): { attributes?: OptionAttributes; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const attributes: OptionAttributes = {};
  for (const part of trimmed.split(",")) {
    const m = part.trim().match(/^([A-Za-z][A-Za-z0-9]{0,31})\s*=\s*(.+)$/);
    if (!m) return { error: `"${part.trim()}" should look like name=value` };
    const [, key, raw] = m as unknown as [string, string, string];
    if (Object.prototype.hasOwnProperty.call(attributes, key)) return { error: `"${key}" is listed twice` };
    const value = raw.trim();
    attributes[key] = value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return { attributes };
}

export function formatOptionAttributes(attributes?: OptionAttributes): string {
  return attributes ? Object.entries(attributes).map(([k, v]) => `${k}=${v}`).join(", ") : "";
}

// ---- Option-group editing (pure operations used by the admin editor) ----

/** A group as edited in the admin (choices may still be incomplete until saved). */
export type EditableGroup = OptionGroupDef;

export const optionEdits = {
  /** New group with a free key (opt1, opt2, ...) and one empty choice. */
  addGroup(groups: EditableGroup[]): EditableGroup[] {
    const used = new Set(groups.map((g) => g.key));
    let n = 1;
    while (used.has(`opt${n}`)) n++;
    return [...groups, { key: `opt${n}`, label: "", choices: [{ code: "", name: "", price: 0 }] }];
  },
  removeGroup(groups: EditableGroup[], i: number): EditableGroup[] {
    return groups.filter((_, j) => j !== i);
  },
  /** Move group i up (by = -1) or down (by = 1); out-of-range moves change nothing. */
  moveGroup(groups: EditableGroup[], i: number, by: -1 | 1): EditableGroup[] {
    const to = i + by;
    if (i < 0 || i >= groups.length || to < 0 || to >= groups.length) return groups;
    const next = [...groups];
    const [g] = next.splice(i, 1);
    next.splice(to, 0, g!);
    return next;
  },
  updateGroup(groups: EditableGroup[], i: number, patch: Partial<EditableGroup>): EditableGroup[] {
    return groups.map((g, j) => (j === i ? { ...g, ...patch } : g));
  },
  /** Keys are typed as lowercase letters/digits only, at most 8 (server re-validates). */
  setKey(groups: EditableGroup[], i: number, raw: string): EditableGroup[] {
    return optionEdits.updateGroup(groups, i, { key: raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) });
  },
  /** "Changes the product image": stored only when true. */
  setVisual(groups: EditableGroup[], i: number, visual: boolean): EditableGroup[] {
    return groups.map((g, j) => {
      if (j !== i) return g;
      const { visual: _drop, ...rest } = g;
      return visual ? { ...rest, visual: true } : rest;
    });
  },
  /** Default choice; choosing the first choice clears it (the first is the default anyway). */
  setDefault(groups: EditableGroup[], i: number, code: string): EditableGroup[] {
    return groups.map((g, j) => {
      if (j !== i) return g;
      const { defaultChoice: _drop, ...rest } = g;
      return code && code !== g.choices[0]?.code ? { ...rest, defaultChoice: code } : rest;
    });
  },
  addChoice(groups: EditableGroup[], i: number): EditableGroup[] {
    return optionEdits.updateGroup(groups, i, { choices: [...groups[i]!.choices, { code: "", name: "", price: 0 }] });
  },
  /** A group always keeps at least one choice; a removed default falls back to the first choice. */
  removeChoice(groups: EditableGroup[], i: number, c: number): EditableGroup[] {
    const g = groups[i]!;
    if (g.choices.length <= 1) return groups;
    const removed = g.choices[c]?.code;
    const next = optionEdits.updateGroup(groups, i, { choices: g.choices.filter((_, k) => k !== c) });
    return removed !== undefined && g.defaultChoice === removed ? optionEdits.setDefault(next, i, "") : next;
  },
  updateChoice(groups: EditableGroup[], i: number, c: number, patch: Partial<OptionChoiceDef>): EditableGroup[] {
    const clean = { ...patch };
    if (clean.code !== undefined) clean.code = clean.code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 16);
    return optionEdits.updateGroup(groups, i, { choices: groups[i]!.choices.map((x, k) => (k === c ? { ...x, ...clean } : x)) });
  },
  /** Engraving "required" flag: stored only when true, so existing definitions stay unchanged. */
  setRequired<T extends { required?: boolean }>(engraving: T, required: boolean): T {
    const { required: _drop, ...rest } = engraving;
    return (required ? { ...rest, required: true } : rest) as T;
  },
};

// ---- Render artwork compatibility (publishing safeguard) ----

/** What artwork a manifest provides. Necklace artwork has a "nameplate" view. */
export type ArtworkKind = Extract<ProductType, "ring" | "necklace">;

export function artworkKindFromViews(views: Record<string, { nameplate?: unknown }>): ArtworkKind {
  return Object.values(views).some((v) => v.nameplate != null) ? "necklace" : "ring";
}

/** Artwork lookup result from the image service; null when it could not be checked. */
export interface ArtworkInfo {
  code: string;
  exists: boolean;
  kind: ArtworkKind | null;
}

/**
 * Turn the image service's /internal/artwork reply into ArtworkInfo. Anything other
 * than a clean 200 answer with a known kind counts as "could not be checked" (null),
 * so a failing or odd service can never make a design publishable by accident.
 */
export function artworkInfoFromResponse(code: string, status: number, body: unknown): ArtworkInfo | null {
  if (status !== 200 || body == null || typeof body !== "object") return null;
  const b = body as { exists?: unknown; kind?: unknown };
  if (b.exists === false) return { code, exists: false, kind: null };
  if (b.exists === true && (b.kind === "ring" || b.kind === "necklace")) return { code, exists: true, kind: b.kind };
  return null;
}

/**
 * Rules for the artwork a design renders with (its own style code, or the design
 * named in `renderTemplate`):
 * - Artwork of a different product type (e.g. ring artwork on a necklace) is
 *   always refused, drafts included.
 * - Missing artwork, or artwork that couldn't be checked, only blocks PUBLISHING:
 *   a draft can be prepared before its artwork exists.
 */
export function artworkCompatibilityIssues(def: ProductDef, artwork: ArtworkInfo | null, opts: { publishing: boolean }): ValidationIssue[] {
  const code = def.renderTemplate || def.styleCode;
  const field = "renderTemplate";
  if (!artwork) {
    return opts.publishing ? [{ field, message: `Could not check render artwork ${code} (image service unavailable). Save as draft or try again.` }] : [];
  }
  if (!artwork.exists) {
    return opts.publishing ? [{ field, message: `Render artwork ${code} does not exist yet, so this design cannot be published. Save it as a draft.` }] : [];
  }
  if (artwork.kind !== def.type) {
    return [{ field, message: `This design is a ${def.type}, but render artwork ${code} is ${artwork.kind ?? "unknown"} artwork. Choose ${def.type} artwork.` }];
  }
  return [];
}
