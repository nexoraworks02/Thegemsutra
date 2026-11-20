/**
 * Necklace asset manifest - versioned schema (Phase 1C Stage A).
 *
 * Describes the artwork and physical scale a real necklace will be rendered from.
 * It is SEPARATE from the current render manifest (assets/products/{style}/manifest.json,
 * see ../manifest.ts), which the renderer keeps using unchanged.
 *
 * File: assets/products/{style}/necklace-assets.json (or any path given to the checker).
 *
 * Coordinate spaces
 * - "view space": the pixel canvas of a view (origin top-left, x right, y down).
 * - "asset space": the pixel canvas of one asset file (same convention).
 * - Physical lengths are always millimetres (units.length = "mm"); a view's
 *   mmPerPx converts view-space pixels to millimetres when the view is to scale.
 *
 * IMPORTANT: passing validation means the files are STRUCTURALLY usable. It is not
 * a manufacturing approval and never makes a product publishable.
 */

export const NECKLACE_ASSET_SCHEMA = "thegemsutra.necklace-assets";
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number; // top-left
  y: number;
  w: number;
  h: number;
}

export type AssetFormat = "png" | "webp" | "svg";

/** A reference to one artwork file, relative to the manifest's folder. */
export interface AssetRef {
  file: string;
  format: AssetFormat;
  /** Expected pixel size (SVG: the viewBox size). */
  width: number;
  height: number;
  /** "required": must have an alpha channel and real transparency. Default "optional". */
  alpha?: "required" | "optional";
  /** Named points in this asset's own pixel space. */
  anchors?: Record<string, Point>;
}

export type Readiness = "placeholder" | "partial" | "complete";
export type ProvenanceSource = "designer" | "manufacturer" | "photography" | "cad-render" | "generated-placeholder";

export interface ViewSpec {
  /** What the view shows. Only "front" is required in v1. */
  kind: "front" | "angle" | "detail" | "worn";
  canvas: { width: number; height: number };
  /** Millimetres per view-space pixel, when the view is drawn to physical scale. */
  mmPerPx?: number;
  /** Named points in view space (e.g. where chains attach to the pendant). */
  anchors?: Record<string, Point>;
}

/** Text that is cut/engraved from a licensed font (a nameplate). */
export interface NameplatePendant {
  type: "nameplate";
  view: string;
  /** Area (view space) the name must fit inside. */
  textBox: Box;
  /** Physical limits from the manufacturer (mm). Optional until supplied. */
  maxWidthMm?: number;
  maxHeightMm?: number;
  thicknessMm?: number;
  /** View anchors where the chain(s) attach to the pendant. */
  attach: string[];
}

/** A pendant drawn from supplied artwork (shapes, charms...), per finish. */
export interface ArtworkPendant {
  type: "artwork";
  view: string;
  artwork: Record<string, AssetRef>;
  attach: string[];
}

export type PendantSpec = NameplatePendant | ArtworkPendant;

export interface ChainSpec {
  /** Stable id (e.g. matches a chain-type option choice code). */
  id: string;
  label?: string;
  view: string;
  /** Artwork per finish code; each needs "start" and "end" anchors in asset space. */
  variants: Record<string, AssetRef>;
  /** The view anchors this chain connects (usually the pendant's attach points). */
  connects: [string, string];
}

export interface FinishSpec {
  label?: string;
  /** Optional material/texture reference (e.g. photographed polished plate). */
  material?: AssetRef;
}

/** Optional future: anchors for virtual try-on on a worn view. */
export interface WornSpec {
  view: string;
  anchors: { neckLeft: string; neckRight: string; pendantCenter?: string };
}

export interface NecklaceAssetManifest {
  schema: typeof NECKLACE_ASSET_SCHEMA;
  schemaVersion: 1;
  styleCode: string;
  units: { length: "mm" };
  provenance: { source: ProvenanceSource; supplier?: string; receivedAt?: string; notes?: string };
  /** Self-declared completeness of the asset set (informational; not an approval). */
  readiness: Readiness;
  views: Record<string, ViewSpec>;
  pendant: PendantSpec;
  chains: ChainSpec[];
  finishes: Record<string, FinishSpec>;
  worn?: WornSpec;
}

export type Severity = "error" | "warning" | "info";
export interface Issue {
  severity: Severity;
  /** Where in the manifest, e.g. "chains[0].variants.SS.file". */
  field: string;
  message: string;
}

/** An asset reference found in the manifest, with where it is used. */
export interface FoundAsset {
  field: string;
  ref: AssetRef;
}

const READINESS = ["placeholder", "partial", "complete"];
const SOURCES = ["designer", "manufacturer", "photography", "cad-render", "generated-placeholder"];
const VIEW_KINDS = ["front", "angle", "detail", "worn"];
const FORMATS = ["png", "webp", "svg"];
const TOP_LEVEL = ["schema", "schemaVersion", "styleCode", "units", "provenance", "readiness", "views", "pendant", "chains", "finishes", "worn"];
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
/** Sanity bounds: a view's mm-per-pixel scale and canvas size. */
export const MM_PER_PX_RANGE = [0.001, 10] as const;
export const MAX_CANVAS_PX = 20000;

const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const isPos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Structural validation of a necklace asset manifest (no file access).
 * Returns issues and every asset reference for the file checks.
 */
export function validateNecklaceManifest(input: unknown): { issues: Issue[]; assets: FoundAsset[] } {
  const issues: Issue[] = [];
  const assets: FoundAsset[] = [];
  const err = (field: string, message: string) => issues.push({ severity: "error", field, message });
  const warn = (field: string, message: string) => issues.push({ severity: "warning", field, message });

  if (!isObj(input)) {
    err("(root)", "The manifest must be a JSON object.");
    return { issues, assets };
  }
  const m = input;

  if (m.schema !== NECKLACE_ASSET_SCHEMA) err("schema", `Must be "${NECKLACE_ASSET_SCHEMA}".`);
  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly unknown[]).includes(m.schemaVersion)) {
    err("schemaVersion", `Unsupported schema version ${JSON.stringify(m.schemaVersion)}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`);
    return { issues, assets }; // don't guess at an unknown format
  }
  for (const k of Object.keys(m)) if (!TOP_LEVEL.includes(k)) warn(k, `Unknown field "${k}" (typo?). It is ignored.`);

  if (typeof m.styleCode !== "string" || !/^[A-Z]{2,4}\d{3,5}$/.test(m.styleCode)) err("styleCode", "Must be a style code like JSN001 (letters then numbers).");
  if (!isObj(m.units) || m.units.length !== "mm") err("units.length", 'Physical lengths must be declared in millimetres: "units": { "length": "mm" }.');

  if (!isObj(m.provenance) || !SOURCES.includes(m.provenance.source as string)) {
    err("provenance.source", `Say where the artwork came from: one of ${SOURCES.join(", ")}.`);
  } else if (m.provenance.receivedAt != null && (typeof m.provenance.receivedAt !== "string" || Number.isNaN(Date.parse(m.provenance.receivedAt)))) {
    err("provenance.receivedAt", "Must be a date like 2026-12-01.");
  }
  if (!READINESS.includes(m.readiness as string)) err("readiness", `Must be one of ${READINESS.join(", ")}.`);

  // ---- views ----
  const views: Record<string, ViewSpec> = isObj(m.views) ? (m.views as Record<string, ViewSpec>) : {};
  if (!isObj(m.views) || !Object.keys(views).length) err("views", "Declare at least one view (a \"front\" view is required).");
  if (!Object.values(views).some((v) => isObj(v) && v.kind === "front")) err("views", 'At least one view must have kind "front".');
  for (const [name, v] of Object.entries(views)) {
    const f = `views.${name}`;
    if (!ID.test(name)) err(f, "View names may use letters, digits, - and _ only.");
    if (!isObj(v)) { err(f, "Must be an object."); continue; }
    if (!VIEW_KINDS.includes(v.kind)) err(`${f}.kind`, `Must be one of ${VIEW_KINDS.join(", ")}.`);
    if (!isObj(v.canvas) || !isPos(v.canvas.width) || !isPos(v.canvas.height) || v.canvas.width > MAX_CANVAS_PX || v.canvas.height > MAX_CANVAS_PX) {
      err(`${f}.canvas`, `Width and height must be positive pixel sizes up to ${MAX_CANVAS_PX}.`);
    }
    if (v.mmPerPx !== undefined && (!isPos(v.mmPerPx) || v.mmPerPx < MM_PER_PX_RANGE[0] || v.mmPerPx > MM_PER_PX_RANGE[1])) {
      err(`${f}.mmPerPx`, `Physical scale must be a positive number between ${MM_PER_PX_RANGE[0]} and ${MM_PER_PX_RANGE[1]} mm per pixel.`);
    }
    if (v.anchors !== undefined) checkAnchors(v.anchors, `${f}.anchors`, isObj(v.canvas) ? v.canvas : undefined, err);
  }
  const viewAnchor = (view: string, id: string) => isObj(views[view]) && isObj(views[view]!.anchors) && isObj((views[view]!.anchors as Record<string, unknown>)[id]);
  const needView = (field: string, view: unknown) => {
    if (typeof view !== "string" || !isObj(views[view])) { err(field, `Refers to view ${JSON.stringify(view)}, which is not declared.`); return false; }
    return true;
  };

  // ---- finishes ----
  const finishes = isObj(m.finishes) ? (m.finishes as Record<string, FinishSpec>) : {};
  if (!isObj(m.finishes) || !Object.keys(finishes).length) err("finishes", "Declare at least one finish (only manufacturer-confirmed finishes).");
  for (const [code, fin] of Object.entries(finishes)) {
    const f = `finishes.${code}`;
    if (!ID.test(code)) err(f, "Finish codes may use letters, digits, - and _ only.");
    if (!isObj(fin)) { err(f, "Must be an object."); continue; }
    if (fin.material !== undefined) checkAssetRef(fin.material, `${f}.material`, err, assets);
  }
  const finishCodes = Object.keys(finishes);

  // ---- pendant ----
  const p = m.pendant;
  if (!isObj(p)) err("pendant", "Describe the pendant (type \"nameplate\" or \"artwork\").");
  else {
    const okView = needView("pendant.view", p.view);
    const view = okView ? views[p.view as string]! : undefined;
    if (!Array.isArray(p.attach) || !p.attach.length) err("pendant.attach", "List the view anchors where the chain attaches to the pendant.");
    else for (const [i, a] of (p.attach as unknown[]).entries()) {
      if (typeof a !== "string" || (okView && !viewAnchor(p.view as string, a))) err(`pendant.attach[${i}]`, `Anchor ${JSON.stringify(a)} is not declared in views.${String(p.view)}.anchors.`);
    }
    if (p.type === "nameplate") {
      if (!isObj(p.textBox) || !isNum(p.textBox.x) || !isNum(p.textBox.y) || !isPos(p.textBox.w) || !isPos(p.textBox.h)) {
        err("pendant.textBox", "Give the name area as { x, y, w, h } in view pixels (w and h above 0).");
      } else if (view && isObj(view.canvas)) {
        const b = p.textBox as unknown as Box;
        if (b.x < 0 || b.y < 0 || b.x + b.w > view.canvas.width || b.y + b.h > view.canvas.height) err("pendant.textBox", "The name area must lie inside the view canvas.");
        // Consistency with physical limits when the view is to scale.
        if (isPos(view.mmPerPx)) {
          if (isPos(p.maxWidthMm) && b.w * view.mmPerPx + 1e-9 < p.maxWidthMm) err("pendant.textBox", `The name area is ${(b.w * view.mmPerPx).toFixed(2)} mm wide at this scale, narrower than maxWidthMm (${p.maxWidthMm} mm).`);
          if (isPos(p.maxHeightMm) && b.h * view.mmPerPx + 1e-9 < p.maxHeightMm) err("pendant.textBox", `The name area is ${(b.h * view.mmPerPx).toFixed(2)} mm tall at this scale, shorter than maxHeightMm (${p.maxHeightMm} mm).`);
        }
      }
      for (const k of ["maxWidthMm", "maxHeightMm", "thicknessMm"] as const) {
        if (p[k] !== undefined && !isPos(p[k])) err(`pendant.${k}`, "Must be a positive number of millimetres (or leave it out until the manufacturer confirms it).");
      }
    } else if (p.type === "artwork") {
      if (!isObj(p.artwork) || !Object.keys(p.artwork).length) err("pendant.artwork", "Give pendant artwork per finish.");
      else for (const [code, ref] of Object.entries(p.artwork)) {
        if (!finishCodes.includes(code)) err(`pendant.artwork.${code}`, `Finish "${code}" is not declared in finishes.`);
        checkAssetRef(ref, `pendant.artwork.${code}`, err, assets);
      }
    } else {
      err("pendant.type", 'Must be "nameplate" or "artwork".');
    }
  }

  // ---- chains ----
  if (!Array.isArray(m.chains) || !m.chains.length) err("chains", "Declare at least one chain (only manufacturer-confirmed chains).");
  const chainIds = new Set<string>();
  for (const [i, c] of (Array.isArray(m.chains) ? m.chains : []).entries()) {
    const f = `chains[${i}]`;
    if (!isObj(c)) { err(f, "Must be an object."); continue; }
    if (typeof c.id !== "string" || !ID.test(c.id)) err(`${f}.id`, "Chain ids may use letters, digits, - and _ only.");
    else if (chainIds.has(c.id)) err(`${f}.id`, `Chain id "${c.id}" is used twice.`);
    else chainIds.add(c.id);
    const okView = needView(`${f}.view`, c.view);
    if (!Array.isArray(c.connects) || c.connects.length !== 2) err(`${f}.connects`, "List exactly two view anchors the chain connects.");
    else for (const [k, a] of (c.connects as unknown[]).entries()) {
      if (typeof a !== "string" || (okView && !viewAnchor(c.view as string, a))) err(`${f}.connects[${k}]`, `Anchor ${JSON.stringify(a)} is not declared in views.${String(c.view)}.anchors.`);
    }
    if (!isObj(c.variants) || !Object.keys(c.variants).length) { err(`${f}.variants`, "Give chain artwork per finish."); continue; }
    for (const [code, ref] of Object.entries(c.variants)) {
      const vf = `${f}.variants.${code}`;
      if (!finishCodes.includes(code)) err(vf, `Finish "${code}" is not declared in finishes.`);
      if (checkAssetRef(ref, vf, err, assets)) {
        const anchors = (ref as AssetRef).anchors ?? {};
        for (const need of ["start", "end"]) if (!isObj(anchors[need])) err(`${vf}.anchors`, `Chain artwork needs a "${need}" anchor (where it meets the pendant).`);
      }
    }
    const missing = finishCodes.filter((code) => !(code in (c.variants as object)));
    if (missing.length) (m.readiness === "complete" ? err : warn)(`${f}.variants`, `No chain artwork for finish(es): ${missing.join(", ")}.`);
  }

  // ---- optional future: worn view ----
  if (m.worn !== undefined) {
    const w = m.worn;
    if (!isObj(w)) err("worn", "Must be an object.");
    else if (needView("worn.view", w.view)) {
      if (!isObj(w.anchors)) err("worn.anchors", "Give neckLeft and neckRight anchor names.");
      else for (const k of ["neckLeft", "neckRight", "pendantCenter"]) {
        const a = (w.anchors as Record<string, unknown>)[k];
        if (a === undefined && k === "pendantCenter") continue;
        if (typeof a !== "string" || !viewAnchor(w.view as string, a)) err(`worn.anchors.${k}`, `Anchor ${JSON.stringify(a)} is not declared in views.${String(w.view)}.anchors.`);
      }
    }
  }

  // ---- duplicates across the whole manifest ----
  const seen = new Map<string, string>();
  for (const a of assets) {
    if (typeof a.ref?.file !== "string") continue;
    const key = a.ref.file.replace(/\\/g, "/").toLowerCase();
    const prev = seen.get(key);
    if (prev) err(`${a.field}.file`, `"${a.ref.file}" is also used by ${prev}; each asset needs its own file (names are compared case-insensitively).`);
    else seen.set(key, a.field);
  }

  // ---- readiness consistency (informational, never an approval) ----
  if (m.readiness === "complete") {
    if (isObj(m.provenance) && m.provenance.source === "generated-placeholder") err("readiness", 'Placeholder artwork cannot be marked "complete".');
    if (isObj(p) && p.type === "nameplate") {
      const v = typeof p.view === "string" ? views[p.view] : undefined;
      if (!isPos(v?.mmPerPx)) err(`views.${String(p.view)}.mmPerPx`, 'A "complete" nameplate needs the view\'s physical scale (mmPerPx).');
      for (const k of ["maxWidthMm", "maxHeightMm", "thicknessMm"] as const) if (!isPos(p[k])) err(`pendant.${k}`, `A "complete" nameplate needs ${k} from the manufacturer.`);
    }
  }
  if (isObj(m.provenance) && m.provenance.source === "generated-placeholder") {
    issues.push({ severity: "info", field: "provenance.source", message: "Placeholder artwork: for development and testing only, never production artwork." });
  }

  return { issues, assets };
}

function checkAnchors(anchors: unknown, field: string, canvas: { width: number; height: number } | undefined, err: (f: string, m: string) => void) {
  if (!isObj(anchors)) { err(field, "Anchors must be an object of named { x, y } points."); return; }
  for (const [id, pt] of Object.entries(anchors)) {
    if (!ID.test(id)) err(`${field}.${id}`, "Anchor names may use letters, digits, - and _ only.");
    if (!isObj(pt) || !isNum(pt.x) || !isNum(pt.y)) { err(`${field}.${id}`, "Must be { x, y } numbers."); continue; }
    if (canvas && isPos(canvas.width) && isPos(canvas.height) && (pt.x < 0 || pt.y < 0 || pt.x > canvas.width || pt.y > canvas.height)) {
      err(`${field}.${id}`, `Point (${pt.x}, ${pt.y}) is outside the ${canvas.width} x ${canvas.height} canvas.`);
    }
  }
}

/** Checks one asset reference's fields; records it for the file checks. Returns true if well-formed. */
function checkAssetRef(ref: unknown, field: string, err: (f: string, m: string) => void, assets: FoundAsset[]): boolean {
  if (!isObj(ref)) { err(field, "Must be an asset reference { file, format, width, height }."); return false; }
  let ok = true;
  if (typeof ref.file !== "string" || !ref.file.trim()) { err(`${field}.file`, "Give the file path relative to the manifest folder."); ok = false; }
  if (!FORMATS.includes(ref.format as string)) { err(`${field}.format`, `Supported formats: ${FORMATS.join(", ")}.`); ok = false; }
  if (!isPos(ref.width) || !isPos(ref.height) || (ref.width as number) > MAX_CANVAS_PX || (ref.height as number) > MAX_CANVAS_PX) {
    err(`${field}`, `width and height must be positive pixel sizes up to ${MAX_CANVAS_PX}.`);
    ok = false;
  }
  if (ref.alpha !== undefined && ref.alpha !== "required" && ref.alpha !== "optional") { err(`${field}.alpha`, 'Must be "required" or "optional".'); ok = false; }
  if (ref.anchors !== undefined) checkAnchors(ref.anchors, `${field}.anchors`, ok ? { width: ref.width as number, height: ref.height as number } : undefined, err);
  if (typeof ref.file === "string") assets.push({ field, ref: ref as unknown as AssetRef });
  return ok;
}
