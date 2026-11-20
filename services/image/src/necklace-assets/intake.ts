/**
 * Necklace asset intake checker (Phase 1C Stage A).
 *
 * Validates a necklace asset manifest and the files it references, treating all
 * artwork as UNTRUSTED input:
 * - read-only: never writes, moves or rewrites any input file;
 * - paths must be relative, stay inside the manifest's folder (also after
 *   resolving symlinks) and use plain characters;
 * - file sizes are capped before reading; images are decoded with a pixel limit;
 * - formats are detected from file contents, not trusted from the extension;
 * - SVGs are scanned as text and rejected if they contain scripts, event handlers,
 *   external references, DTDs/entities or embedded documents (never executed).
 *
 * A passing result means the asset set is STRUCTURALLY usable. It is not a
 * manufacturing approval and never makes a product publishable.
 */
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEMO_PRODUCT_BY_STYLE } from "@jemsutra/design-engine";
import { NECKLACE_ASSET_SCHEMA, validateNecklaceManifest, type FoundAsset, type Issue } from "./schema";

export const MANIFEST_FILE = "necklace-assets.json";
export const LEGACY_MANIFEST_FILE = "manifest.json";
export const LIMITS = {
  manifestBytes: 1 * 1024 * 1024,
  rasterBytes: 30 * 1024 * 1024,
  svgBytes: 2 * 1024 * 1024,
  /** Decoded pixel limit for raster images (width x height). */
  pixels: 100_000_000,
} as const;

export const NOT_AN_APPROVAL = "Structural check only: this is not a manufacturing approval and does not make any product publishable.";

export interface IntakeReport {
  /** What was checked. */
  kind: "necklace-assets" | "legacy-render-manifest" | "unknown";
  manifestPath: string | null;
  /** true when there are no errors (warnings allowed). */
  structureValid: boolean;
  issues: Issue[];
  filesChecked: number;
  note: string;
}

const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;

/** Check a manifest file, or a folder containing necklace-assets.json (or a legacy manifest.json). */
export async function checkNecklaceAssets(inputPath: string): Promise<IntakeReport> {
  const issues: Issue[] = [];
  const report = (kind: IntakeReport["kind"], manifestPath: string | null, filesChecked = 0): IntakeReport => ({
    kind,
    manifestPath,
    structureValid: !issues.some((i) => i.severity === "error"),
    issues,
    filesChecked,
    note: NOT_AN_APPROVAL,
  });

  // ---- locate the manifest ----
  let manifestPath: string;
  try {
    const st = statSync(inputPath);
    if (st.isDirectory()) {
      const preferred = path.join(inputPath, MANIFEST_FILE);
      const legacy = path.join(inputPath, LEGACY_MANIFEST_FILE);
      if (existsSync(preferred)) manifestPath = preferred;
      else if (existsSync(legacy)) manifestPath = legacy;
      else {
        issues.push({ severity: "error", field: "(input)", message: `No ${MANIFEST_FILE} (or legacy ${LEGACY_MANIFEST_FILE}) in ${inputPath}.` });
        return report("unknown", null);
      }
    } else manifestPath = inputPath;
  } catch {
    issues.push({ severity: "error", field: "(input)", message: `Path not found or not readable: ${inputPath}` });
    return report("unknown", null);
  }

  // ---- read the manifest (size-capped JSON) ----
  let data: unknown;
  try {
    const st = statSync(manifestPath);
    if (!st.isFile()) throw new Error("not a regular file");
    if (st.size > LIMITS.manifestBytes) {
      issues.push({ severity: "error", field: "(manifest)", message: `Manifest is ${st.size} bytes; the limit is ${LIMITS.manifestBytes}.` });
      return report("unknown", manifestPath);
    }
    data = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    issues.push({ severity: "error", field: "(manifest)", message: `Not valid JSON: ${(e as Error).message}` });
    return report("unknown", manifestPath);
  }

  // ---- legacy render manifest (current renderer format) ----
  const obj = data as Record<string, unknown>;
  if (obj && typeof obj === "object" && obj.schema === undefined && obj.views && typeof obj.views === "object") {
    issues.push(...checkLegacyManifest(obj));
    return report("legacy-render-manifest", manifestPath);
  }

  // ---- necklace asset manifest ----
  if (obj?.schema !== NECKLACE_ASSET_SCHEMA) {
    issues.push({ severity: "error", field: "schema", message: `Not a necklace asset manifest: "schema" must be "${NECKLACE_ASSET_SCHEMA}".` });
    return report("unknown", manifestPath);
  }
  const { issues: structural, assets } = validateNecklaceManifest(data);
  issues.push(...structural);
  if (typeof obj.styleCode === "string" && DEMO_PRODUCT_BY_STYLE[obj.styleCode]) {
    issues.push({ severity: "warning", field: "styleCode", message: `${obj.styleCode} is a developer-only demo design; it is not a verified physical product and must not be sold.` });
  }

  // ---- file checks ----
  const root = path.dirname(path.resolve(manifestPath));
  let filesChecked = 0;
  for (const a of assets) {
    filesChecked++;
    issues.push(...(await checkAssetFile(root, a)));
  }
  return report("necklace-assets", manifestPath, filesChecked);
}

/** Resolve a manifest-relative path safely inside root (symlinks included). */
export function resolveInside(root: string, rel: string): { abs: string } | { error: string } {
  if (typeof rel !== "string" || !rel || rel.length > 240) return { error: "Path is empty or too long." };
  if (rel.includes("\0")) return { error: "Path contains a NUL character." };
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith("\\") || rel.startsWith("/")) return { error: "Path must be relative to the manifest folder (no absolute paths or drive letters)." };
  if (!SAFE_PATH.test(rel)) return { error: "Path may only use letters, digits, '.', '-', '_' and '/' (no backslashes, spaces or special characters)." };
  if (rel.split("/").some((seg) => seg === ".." || seg === "")) return { error: 'Path must not contain ".." or empty segments (it would leave the manifest folder).' };
  const rootReal = realpathSync(root);
  const abs = path.resolve(rootReal, rel);
  if (!abs.startsWith(rootReal + path.sep)) return { error: "Path resolves outside the manifest folder." };
  if (!existsSync(abs)) return { error: "File not found." };
  const l = lstatSync(abs);
  const real = realpathSync(abs);
  if (!real.startsWith(rootReal + path.sep)) return { error: l.isSymbolicLink() ? "Symbolic link points outside the manifest folder." : "Path resolves outside the manifest folder." };
  if (!statSync(real).isFile()) return { error: "Not a regular file." };
  return { abs: real };
}

function sniff(abs: string): "png" | "webp" | "svg" | "unknown" {
  const fd = openSync(abs, "r");
  try {
    const head = Buffer.alloc(512);
    const n = readSync(fd, head, 0, 512, 0);
    const b = head.subarray(0, n);
    if (n >= 8 && b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return "png";
    if (n >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
    const text = b.toString("utf8").replace(/^﻿/, "").trimStart();
    if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text) || /^<!DOCTYPE\s+svg/i.test(text)) return "svg";
    return "unknown";
  } finally {
    closeSync(fd);
  }
}

/** SVG content rules: anything active or external is rejected (the file is never rendered here). */
export function svgSafetyProblems(svg: string): string[] {
  const problems: string[] = [];
  const rules: [RegExp, string][] = [
    [/<!DOCTYPE/i, "contains a DOCTYPE (DTDs/entities are not allowed)"],
    [/<!ENTITY/i, "declares XML entities"],
    [/<script[\s>/]/i, "contains a <script> element"],
    [/<foreignObject[\s>/]/i, "contains <foreignObject> (embedded HTML)"],
    [/<(iframe|object|embed|audio|video)[\s>/]/i, "embeds another document or media"],
    [/<image[\s>/]/i, "contains an <image> element (raster or external content)"],
    [/\son[a-z]+\s*=/i, "contains an event handler attribute (on...)"],
    [/javascript:/i, "contains a javascript: URL"],
    [/(?:xlink:)?href\s*=\s*["'](?!#)/i, "references something outside the file (href must point to an internal #id)"],
    [/url\(\s*["']?(?!#)/i, "uses url(...) to an external resource"],
    [/@import/i, "uses CSS @import"],
  ];
  for (const [re, msg] of rules) if (re.test(svg)) problems.push(msg);
  return problems;
}

function svgViewBox(svg: string): { width: number; height: number } | null {
  const m = svg.match(/<svg[^>]*\sviewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*["']/i);
  if (!m) return null;
  const w = Number(m[3]);
  const h = Number(m[4]);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : null;
}

async function checkAssetFile(root: string, a: FoundAsset): Promise<Issue[]> {
  const out: Issue[] = [];
  const field = `${a.field}.file`;
  const err = (message: string) => out.push({ severity: "error", field, message: `${a.ref.file}: ${message}` });

  const resolved = resolveInside(root, a.ref.file);
  if ("error" in resolved) {
    err(resolved.error);
    return out;
  }
  const abs = resolved.abs;
  const ext = path.extname(abs).slice(1).toLowerCase();
  if (ext !== a.ref.format) err(`extension ".${ext}" does not match the declared format "${a.ref.format}".`);
  const size = statSync(abs).size;
  const limit = a.ref.format === "svg" ? LIMITS.svgBytes : LIMITS.rasterBytes;
  if (size > limit) {
    err(`file is ${size} bytes; the limit for ${a.ref.format} is ${limit}.`);
    return out;
  }
  const actual = sniff(abs);
  if (actual === "unknown") {
    err("file content is not a supported image (PNG, WebP or SVG).");
    return out;
  }
  if (actual !== a.ref.format) {
    err(`file content is ${actual.toUpperCase()}, but the manifest says ${a.ref.format}.`);
    return out;
  }

  if (actual === "svg") {
    const text = readFileSync(abs, "utf8");
    for (const p of svgSafetyProblems(text)) err(`unsafe SVG: ${p}.`);
    const vb = svgViewBox(text);
    if (!vb) err("SVG needs a viewBox so its size and anchor coordinates are defined.");
    else if (Math.abs(vb.width - a.ref.width) > 0.5 || Math.abs(vb.height - a.ref.height) > 0.5) {
      err(`viewBox is ${vb.width} x ${vb.height}, but the manifest says ${a.ref.width} x ${a.ref.height}.`);
    }
    if (a.ref.alpha === "required" && /<rect[^>]*\swidth\s*=\s*["']100%["'][^>]*\sheight\s*=\s*["']100%["']/i.test(text)) {
      err("SVG appears to have a full-canvas background rectangle, but transparency is required.");
    }
    return out;
  }

  // Raster: decode metadata with a pixel limit; never write.
  try {
    const img = sharp(abs, { limitInputPixels: LIMITS.pixels, failOn: "error" });
    const meta = await img.metadata();
    if (meta.width !== a.ref.width || meta.height !== a.ref.height) err(`image is ${meta.width} x ${meta.height} px, but the manifest says ${a.ref.width} x ${a.ref.height}.`);
    if (a.ref.alpha === "required") {
      if (!meta.hasAlpha) err("transparency is required, but the image has no alpha channel.");
      else {
        const stats = await sharp(abs, { limitInputPixels: LIMITS.pixels }).stats();
        const alpha = stats.channels[stats.channels.length - 1]!;
        if (alpha.min === 255) err("transparency is required, but every pixel is fully opaque.");
        if (alpha.max === 0) err("the image is completely transparent (no artwork).");
      }
    }
  } catch (e) {
    err(`image could not be decoded safely (${(e as Error).message}).`);
  }
  return out;
}

/** Light structural check of the current render manifest format (backward compatibility). */
export function checkLegacyManifest(m: Record<string, unknown>): Issue[] {
  const out: Issue[] = [];
  out.push({ severity: "info", field: "(manifest)", message: "Legacy render manifest (the format the current renderer uses). Recognised and left unchanged; it is not a necklace asset manifest." });
  const views = m.views as Record<string, unknown>;
  if (!Object.keys(views).length) out.push({ severity: "error", field: "views", message: "No views declared." });
  for (const [name, v] of Object.entries(views)) {
    const vv = v as Record<string, unknown>;
    if (!vv || typeof vv !== "object") { out.push({ severity: "error", field: `views.${name}`, message: "Must be an object." }); continue; }
    if (!(typeof vv.width === "number" && vv.width > 0 && typeof vv.height === "number" && vv.height > 0)) out.push({ severity: "error", field: `views.${name}`, message: "width and height must be positive numbers." });
    if (vv.nameplate) {
      out.push({ severity: "warning", field: `views.${name}.nameplate`, message: "Procedural demo nameplate: placeholder artwork with unmeasured geometry, not a verified physical product." });
    }
  }
  if (typeof m.styleCode === "string" && DEMO_PRODUCT_BY_STYLE[m.styleCode]) {
    out.push({ severity: "warning", field: "styleCode", message: `${m.styleCode} is a developer-only demo design and must not be sold.` });
  }
  return out;
}
