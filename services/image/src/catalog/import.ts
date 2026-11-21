/**
 * DEMO catalog importer.
 *
 * Reads source image folders (READ-ONLY: nothing in them is ever written, moved or
 * renamed), de-duplicates by SHA-256, applies the reviewed overrides file, generates
 * web images into the output folder and writes a new numbered catalog version.
 *
 * Safety:
 * - source folders are scanned one level deep; symlinks and sub-folders are skipped;
 * - overrides can only reference files the scan found (no path is ever built from
 *   override text, so it cannot point outside a source folder);
 * - files are size-capped before reading, format is detected from content, images
 *   are decoded with a pixel limit;
 * - the output folder may not be inside a source folder (or the reverse);
 * - generated files are content-addressed and written atomically; versions are kept,
 *   so a bad import can be rolled back by moving the `current.json` pointer.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  CATALOG_SCHEMA,
  slugFor,
  validateOverrides,
  type Catalog,
  type CatalogAsset,
  type CatalogProduct,
  type Issue,
  type Overrides,
} from "./schema";

export const LIMITS = {
  fileBytes: 30 * 1024 * 1024,
  overridesBytes: 1 * 1024 * 1024,
  pixels: 60_000_000,
  /** Product images: shorter side below this is refused, below `recommendedSidePx` warned. */
  minSidePx: 300,
  recommendedSidePx: 800,
} as const;
export const VARIANTS = {
  /** Listing card, 4:5, product centred on its own background colour. */
  card: { width: 1000, height: 1250, fill: 0.84 },
  /** Product page / zoom: original aspect, longest side capped. */
  full: { max: 1600 },
} as const;
export const DEMO_NOTE = "DEMO catalog: temporary images for development and testing. Not for sale; prices are synthetic; nothing is published.";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface ScannedFile {
  key: string; // "<source folder name>/<file name>"
  abs: string;
  bytes: number;
  sha256: string;
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
}

export interface ImportOptions {
  sources: string[];
  overridesPath: string;
  outDir: string;
  dryRun?: boolean;
  now?: Date;
}

export interface ImportReport {
  ok: boolean;
  dryRun: boolean;
  /** true when the input matched the active version exactly, so nothing was written. */
  unchanged: boolean;
  version: string | null;
  dataset: string | null;
  issues: Issue[];
  stats: {
    filesScanned: number;
    uniqueImages: number;
    duplicates: { file: string; duplicateOf: string }[];
    excluded: number;
    lifestyle: number;
    products: number;
    imagesGenerated: number;
    unassigned: string[];
    /** Products with review notes (e.g. images flagged for replacement). */
    flagged: string[];
  };
  diff: { added: string[]; removed: string[]; changed: string[]; imagesChanged: string[]; unchanged: number } | null;
  note: string;
}

function sniff(buf: Buffer): ScannedFile["format"] | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Read a whole file, refusing anything over `max` bytes (checked on the open handle). */
function readCapped(abs: string, max: number): Buffer | null {
  const fd = openSync(abs, "r");
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > max) return null;
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n <= 0) break;
      off += n;
    }
    return buf.subarray(0, off);
  } finally {
    closeSync(fd);
  }
}

const inside = (child: string, parent: string) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Scan source folders (one level, read-only). */
export async function scanSources(sources: string[], issues: Issue[]): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  const names = new Set<string>();
  for (const src of sources) {
    let root: string;
    try {
      root = realpathSync(src);
    } catch {
      issues.push({ severity: "error", field: "(source)", message: `Source folder not found: ${src}` });
      continue;
    }
    const name = path.basename(root);
    if (names.has(name)) {
      issues.push({ severity: "error", field: "(source)", message: `Two source folders are both called "${name}"; folder names must be unique.` });
      continue;
    }
    names.add(name);
    const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const key = `${name}/${e.name}`;
      if (e.isSymbolicLink()) {
        issues.push({ severity: "warning", field: key, message: "Symbolic link skipped." });
        continue;
      }
      if (e.isDirectory()) {
        issues.push({ severity: "info", field: key, message: "Sub-folder skipped (sources are scanned one level deep)." });
        continue;
      }
      if (!e.isFile()) continue;
      if (!IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
        issues.push({ severity: "info", field: key, message: "Not an image file type; skipped." });
        continue;
      }
      const abs = path.join(root, e.name);
      const buf = readCapped(abs, LIMITS.fileBytes);
      if (!buf) {
        issues.push({ severity: "warning", field: key, message: `Larger than ${LIMITS.fileBytes / 1024 / 1024} MB or unreadable; skipped.` });
        continue;
      }
      const format = sniff(buf);
      const ext = path.extname(e.name).toLowerCase();
      const extFormat = ext === ".png" ? "png" : ext === ".webp" ? "webp" : "jpeg";
      if (!format) {
        issues.push({ severity: "warning", field: key, message: "Content is not a JPEG, PNG or WebP image; skipped." });
        continue;
      }
      if (format !== extFormat) issues.push({ severity: "warning", field: key, message: `Extension says ${extFormat} but the content is ${format}.` });
      try {
        const meta = await sharp(buf, { limitInputPixels: LIMITS.pixels }).metadata();
        if (!meta.width || !meta.height) throw new Error("no dimensions");
        files.push({ key, abs, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), format, width: meta.width, height: meta.height });
      } catch (err) {
        issues.push({ severity: "warning", field: key, message: `Could not decode image (${(err as Error).message}); skipped.` });
      }
    }
  }
  return files;
}

const assetIdFor = (sha: string) => `img_${sha.slice(0, 16)}`;

function writeAtomic(file: string, data: Buffer | string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

/**
 * Corner colours of a decoded RGB image. Returns their average and how much they
 * differ (0 = all four corners identical, i.e. a plain studio background).
 */
function corners(raw: Buffer, w: number, h: number, ch: number) {
  const s = Math.max(2, Math.min(12, Math.floor(Math.min(w, h) / 20)));
  const boxes = [
    [0, 0],
    [w - s, 0],
    [0, h - s],
    [w - s, h - s],
  ] as const;
  const means = boxes.map(([left, top]) => {
    const sum = [0, 0, 0];
    for (let y = top; y < top + s; y++)
      for (let x = left; x < left + s; x++) for (let c = 0; c < 3; c++) sum[c]! += raw[(y * w + x) * ch + c]!;
    return sum.map((v) => v / (s * s));
  });
  const avg = [0, 1, 2].map((c) => means.reduce((a, m) => a + m[c]!, 0) / 4);
  const spread = Math.max(...means.map((m) => Math.max(...m.map((v, c) => Math.abs(v - avg[c]!)))));
  return { colour: { r: Math.round(avg[0]!), g: Math.round(avg[1]!), b: Math.round(avg[2]!) }, spread };
}

export async function generateVariants(buf: Buffer): Promise<{ card: Buffer; full: Buffer }> {
  const { data: raw, info } = await sharp(buf, { limitInputPixels: LIMITS.pixels })
    .rotate()
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rawOpts = { raw: { width: info.width, height: info.height, channels: info.channels } } as const;

  const full = await sharp(raw, rawOpts)
    .resize({ width: VARIANTS.full.max, height: VARIANTS.full.max, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();

  const { width: cw, height: ch, fill } = VARIANTS.card;
  const bg = corners(raw, info.width, info.height, info.channels);
  const plain = bg.spread <= 12; // a plain studio background

  // Plain background: trim it so small products (e.g. earrings on wide banners) fill the card.
  let subject: Buffer = await sharp(raw, rawOpts).png().toBuffer();
  let trimmed = false;
  if (plain) {
    try {
      const t = await sharp(subject).trim({ background: bg.colour, threshold: 24 }).toBuffer({ resolveWithObject: true });
      if (t.info.width * t.info.height >= info.width * info.height * 0.04 && t.info.width * t.info.height < info.width * info.height * 0.98) {
        subject = t.data;
        trimmed = true;
      }
    } catch {
      /* uniform image: keep the original */
    }
  }
  const scale = trimmed ? fill : 1;
  const fitted = await sharp(subject)
    .resize({ width: Math.round(cw * scale), height: Math.round(ch * scale), fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  // Background: the plain studio colour, or (for scenes such as a bust on fabric) a soft,
  // blurred enlargement of the same image so there are no hard bands beside it.
  const background = plain
    ? sharp({ create: { width: cw, height: ch, channels: 3, background: bg.colour } })
    : sharp(await sharp(raw, rawOpts).resize(cw, ch, { fit: "cover" }).blur(40).modulate({ brightness: 1.02 }).png().toBuffer());
  const card = await background
    .composite([{ input: fitted.data, left: Math.round((cw - fitted.info.width) / 2), top: Math.round((ch - fitted.info.height) / 2) }])
    .webp({ quality: 84 })
    .toBuffer();
  return { card, full };
}

// ---------------- versions ----------------

export const versionName = (n: number) => `v${String(n).padStart(4, "0")}`;

export function listVersions(outDir: string): string[] {
  const dir = path.join(outDir, "versions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^v\d{4}\.json$/.test(f))
    .map((f) => f.slice(0, 5))
    .sort();
}

export function currentVersion(outDir: string): string | null {
  try {
    const v = JSON.parse(readFileSync(path.join(outDir, "current.json"), "utf8")).version;
    return typeof v === "string" && /^v\d{4}$/.test(v) && existsSync(path.join(outDir, "versions", `${v}.json`)) ? v : null;
  } catch {
    return null;
  }
}

export function readCatalog(outDir: string, version = currentVersion(outDir)): Catalog | null {
  if (!version || !/^v\d{4}$/.test(version)) return null;
  try {
    const c = JSON.parse(readFileSync(path.join(outDir, "versions", `${version}.json`), "utf8")) as Catalog;
    return c.schema === CATALOG_SCHEMA && c.schemaVersion === 1 && c.environment === "demo" ? c : null;
  } catch {
    return null;
  }
}

export function activateVersion(outDir: string, version: string): void {
  if (!listVersions(outDir).includes(version)) throw new Error(`Version ${version} does not exist.`);
  writeAtomic(path.join(outDir, "current.json"), JSON.stringify({ version, activatedAt: new Date().toISOString() }, null, 2));
}

/** Point `current` at the version before it. Returns the version now active. */
export function rollback(outDir: string): string {
  const cur = currentVersion(outDir);
  const older = listVersions(outDir).filter((v) => !cur || v < cur);
  const prev = older[older.length - 1];
  if (!prev) throw new Error("There is no earlier version to roll back to.");
  activateVersion(outDir, prev);
  return prev;
}

function diffCatalogs(prev: Catalog | null, next: Catalog): ImportReport["diff"] {
  if (!prev) return { added: next.products.map((p) => p.id), removed: [], changed: [], imagesChanged: [], unchanged: 0 };
  const old = new Map(prev.products.map((p) => [p.id, p]));
  const d = { added: [] as string[], removed: [] as string[], changed: [] as string[], imagesChanged: [] as string[], unchanged: 0 };
  for (const p of next.products) {
    const o = old.get(p.id);
    if (!o) d.added.push(p.id);
    else {
      const imgs = (x: CatalogProduct) => x.images.map((i) => i.asset).join(",");
      const meta = (x: CatalogProduct) => JSON.stringify([x.category, x.title, x.tags, x.price.amount, x.reviewNotes ?? []]);
      if (imgs(o) !== imgs(p)) d.imagesChanged.push(p.id);
      if (meta(o) !== meta(p)) d.changed.push(p.id);
      if (imgs(o) === imgs(p) && meta(o) === meta(p)) d.unchanged++;
    }
    old.delete(p.id);
  }
  d.removed = [...old.keys()];
  return d;
}

// ---------------- import ----------------

export async function runImport(opts: ImportOptions): Promise<ImportReport> {
  const issues: Issue[] = [];
  const report: ImportReport = {
    ok: false,
    dryRun: !!opts.dryRun,
    unchanged: false,
    version: null,
    dataset: null,
    issues,
    stats: { filesScanned: 0, uniqueImages: 0, duplicates: [], excluded: 0, lifestyle: 0, products: 0, imagesGenerated: 0, unassigned: [], flagged: [] },
    diff: null,
    note: DEMO_NOTE,
  };
  const fail = () => ((report.ok = false), report);

  // Output folder must be separate from every source folder.
  const outAbs = path.resolve(opts.outDir);
  for (const s of opts.sources) {
    let sAbs: string;
    try {
      sAbs = realpathSync(s);
    } catch {
      continue; // reported by the scan
    }
    if (inside(outAbs, sAbs) || inside(sAbs, outAbs)) {
      issues.push({ severity: "error", field: "(out)", message: `Output folder ${outAbs} overlaps source folder ${sAbs}. Source folders are never written to.` });
      return fail();
    }
  }
  // ...and must be safe to write into (empty or ours, and git-ignored inside a repository).
  const outProblem = checkOutputFolder(outAbs, issues);
  if (outProblem) {
    issues.push({ severity: "error", field: "(out)", message: outProblem });
    return fail();
  }

  // Overrides
  let raw: unknown;
  try {
    const buf = readCapped(opts.overridesPath, LIMITS.overridesBytes);
    if (!buf) throw new Error(`missing, not a file, or over ${LIMITS.overridesBytes / 1024 / 1024} MB`);
    raw = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    issues.push({ severity: "error", field: "(overrides)", message: `Cannot read overrides file ${opts.overridesPath}: ${(err as Error).message}` });
    return fail();
  }
  const v = validateOverrides(raw);
  issues.push(...v.issues);
  if (!v.overrides) return fail();
  const ov: Overrides = v.overrides;
  report.dataset = ov.dataset;

  // Scan + de-duplicate
  const files = await scanSources(opts.sources, issues);
  if (issues.some((i) => i.severity === "error")) return fail();
  report.stats.filesScanned = files.length;
  const bySha = new Map<string, ScannedFile>();
  const byKey = new Map<string, ScannedFile>();
  // The "original" of a set of identical files is the one without a copy suffix
  // ("Name.jpg" before "Name_2.jpg" / "Name(1).jpg"), then the alphabetically first
  // "folder/file" key. Independent of the order folders are given in.
  const isCopy = (k: string) => (/(_\d+|\(\d+\)| copy)\.[a-z]+$/i.test(k) ? 1 : 0);
  const ranked = [...files].sort((a, b) => isCopy(a.key) - isCopy(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const f of ranked) {
    byKey.set(f.key, f);
    const first = bySha.get(f.sha256);
    if (first) report.stats.duplicates.push({ file: f.key, duplicateOf: first.key });
    else bySha.set(f.sha256, f);
  }
  report.stats.uniqueImages = bySha.size;
  const canonical = (key: string) => {
    const f = byKey.get(key);
    return f ? bySha.get(f.sha256)! : null;
  };

  // Exclusions + lifestyle
  const excluded = new Map<string, string>(); // sha -> reason
  for (const [i, e] of (ov.exclude ?? []).entries()) {
    const c = canonical(e.file);
    if (!c) issues.push({ severity: "warning", field: `exclude[${i}]`, message: `${e.file} was not found in the sources.` });
    else excluded.set(c.sha256, e.reason);
  }
  const lifestyle = new Set<string>();
  for (const [i, file] of (ov.lifestyle ?? []).entries()) {
    const c = canonical(file);
    if (!c) issues.push({ severity: "warning", field: `lifestyle[${i}]`, message: `${file} was not found in the sources.` });
    else if (excluded.has(c.sha256)) issues.push({ severity: "error", field: `lifestyle[${i}]`, message: `${file} is also in the exclude list.` });
    else lifestyle.add(c.sha256);
  }
  report.stats.excluded = excluded.size;
  report.stats.lifestyle = lifestyle.size;

  // Products
  const usedBy = new Map<string, string>(); // sha -> product id
  const products: CatalogProduct[] = [];
  const productShas = new Set<string>();
  for (const [i, p] of ov.products.entries()) {
    const shas: string[] = [];
    p.images.forEach((file, j) => {
      const field = `products[${i}].images[${j}]`;
      const c = canonical(file);
      if (!c) return void issues.push({ severity: "error", field, message: `${file} was not found in the sources (or could not be read).` });
      if (c.key !== file) issues.push({ severity: "warning", field, message: `${file} is a byte-identical copy of ${c.key}; using that image.` });
      if (excluded.has(c.sha256)) return void issues.push({ severity: "error", field, message: `${c.key} is excluded (${excluded.get(c.sha256)}).` });
      if (lifestyle.has(c.sha256)) return void issues.push({ severity: "error", field, message: `${c.key} is listed as a lifestyle image, not a product image.` });
      const owner = usedBy.get(c.sha256);
      if (owner && owner !== p.id) return void issues.push({ severity: "error", field, message: `${c.key} is already used by ${owner}; one image cannot belong to two products.` });
      if (shas.includes(c.sha256)) return void issues.push({ severity: "warning", field, message: `${c.key} is listed twice for ${p.id}; kept once.` });
      usedBy.set(c.sha256, p.id);
      shas.push(c.sha256);
    });
    shas.forEach((s) => productShas.add(s));
    products.push({
      id: p.id,
      slug: slugFor(p.id, p.title),
      status: "demo",
      kind: "catalog",
      category: p.category,
      title: p.title.trim(),
      tags: [...new Set(p.tags)],
      description: null,
      material: null,
      gemstone: null,
      sizes: null,
      price: { amount: p.price, currency: "PKR", synthetic: true },
      availability: "not-for-sale",
      images: shas.map((s, n) => ({ asset: assetIdFor(s), role: n === 0 ? "primary" : "gallery", order: n, alt: `${p.title.trim()} - demo image ${n + 1}` })),
      reviewNotes: [...(p.reviewNotes ?? [])],
    });
  }
  report.stats.flagged = products.filter((p) => p.reviewNotes.length > 0).map((p) => `${p.id}: ${p.reviewNotes.join("; ")}`);
  const slugs = new Set<string>();
  for (const p of products) {
    if (slugs.has(p.slug)) issues.push({ severity: "error", field: p.id, message: `Slug ${p.slug} is not unique.` });
    slugs.add(p.slug);
  }
  report.stats.products = products.length;
  report.stats.unassigned = [...bySha.values()]
    .filter((f) => !productShas.has(f.sha256) && !excluded.has(f.sha256) && !lifestyle.has(f.sha256))
    .map((f) => f.key);
  if (issues.some((i) => i.severity === "error")) return fail();

  // Verify every product image completely (also in a dry run): unchanged since the scan,
  // fully decodable, and large enough. Nothing is written until all of them pass.
  const verified = new Map<string, Buffer>();
  for (const sha of productShas) {
    const f = bySha.get(sha)!;
    const buf = readCapped(f.abs, LIMITS.fileBytes);
    if (!buf || createHash("sha256").update(buf).digest("hex") !== sha) {
      issues.push({ severity: "error", field: f.key, message: "File changed or disappeared during the import; run it again." });
      continue;
    }
    try {
      await sharp(buf, { limitInputPixels: LIMITS.pixels, failOn: "warning" }).stats(); // forces a full decode
    } catch (err) {
      issues.push({ severity: "error", field: f.key, message: `Image is damaged or incomplete and cannot be decoded (${(err as Error).message}).` });
      continue;
    }
    const short = Math.min(f.width, f.height);
    if (short < LIMITS.minSidePx) issues.push({ severity: "error", field: f.key, message: `Too small for a product image (${f.width}x${f.height}; the shorter side must be at least ${LIMITS.minSidePx} px).` });
    else if (short < LIMITS.recommendedSidePx) issues.push({ severity: "warning", field: f.key, message: `Low resolution (${f.width}x${f.height}); zoom will look soft. ${LIMITS.recommendedSidePx} px or more recommended.` });
    verified.set(sha, buf);
  }
  if (issues.some((i) => i.severity === "error")) return fail();

  // Catalog entries for every product and lifestyle image (content-addressed ids).
  const assets: CatalogAsset[] = [...productShas, ...lifestyle].map((sha) => {
    const f = bySha.get(sha)!;
    const id = assetIdFor(sha);
    return { id, sha256: sha, source: f.key, width: f.width, height: f.height, usage: productShas.has(sha) ? "product" : "lifestyle", variants: { card: `assets/${id}/card.webp`, full: `assets/${id}/full.webp` } };
  });

  const prev = readCatalog(outAbs);
  const nextN = (listVersions(outAbs).map((x) => Number(x.slice(1))).sort((a, b) => b - a)[0] ?? 0) + 1;
  const catalog: Catalog = {
    schema: CATALOG_SCHEMA,
    schemaVersion: 1,
    dataset: ov.dataset,
    environment: "demo",
    version: versionName(nextN),
    createdAt: (opts.now ?? new Date()).toISOString(),
    products,
    assets,
  };
  report.diff = diffCatalogs(prev, catalog);
  const d = report.diff!;
  const nothingChanged =
    prev !== null &&
    prev.dataset === catalog.dataset &&
    d.added.length + d.removed.length + d.changed.length + d.imagesChanged.length === 0 &&
    JSON.stringify(prev.assets) === JSON.stringify(catalog.assets);
  report.ok = true;
  if (opts.dryRun) return report;

  // Re-importing identical input changes nothing: keep the active version.
  if (nothingChanged && prev) {
    const missing = prev.assets.some((a) => a.usage === "product" && (!existsSync(path.join(outAbs, a.variants.card)) || !existsSync(path.join(outAbs, a.variants.full))));
    if (!missing) {
      report.unchanged = true;
      report.version = prev.version;
      issues.push({ severity: "info", field: "(catalog)", message: `No changes; version ${prev.version} stays active.` });
      return report;
    }
  }

  // Write: marker first (claims the folder), then images, then the version, then the pointer.
  mkdirSync(outAbs, { recursive: true });
  if (!existsSync(path.join(outAbs, OUTPUT_MARKER))) writeAtomic(path.join(outAbs, OUTPUT_MARKER), `${OUTPUT_MARKER_TEXT}\n`);
  for (const a of assets) {
    if (a.usage !== "product") continue;
    const cardPath = path.join(outAbs, a.variants.card);
    const fullPath = path.join(outAbs, a.variants.full);
    if (existsSync(cardPath) && existsSync(fullPath)) continue; // content-addressed: same id = same bytes
    let out: { card: Buffer; full: Buffer };
    try {
      out = await generateVariants(verified.get(a.sha256)!);
    } catch (err) {
      issues.push({ severity: "error", field: a.source, message: `Could not generate web images: ${(err as Error).message}` });
      return fail();
    }
    writeAtomic(cardPath, out.card);
    writeAtomic(fullPath, out.full);
    report.stats.imagesGenerated++;
  }

  report.version = catalog.version;
  writeAtomic(path.join(outAbs, "versions", `${catalog.version}.json`), JSON.stringify(catalog, null, 2));
  writeAtomic(path.join(outAbs, "reports", `${catalog.version}.json`), JSON.stringify(report, null, 2));
  activateVersion(outAbs, catalog.version);
  return report;
}

// ---------------- output folder safety ----------------

/** Marks a folder as created by this importer; the image service only serves from marked folders. */
export const OUTPUT_MARKER = ".thegemsutra-demo-catalog";
const OUTPUT_MARKER_TEXT = "Generated by `npm run catalog:import` (THEGEMSUTRA demo catalog). Temporary test data - never commit.";

export function isCatalogFolder(dir: string): boolean {
  try {
    return statSync(path.join(dir, OUTPUT_MARKER)).isFile();
  } catch {
    return false;
  }
}

function findRepoRoot(start: string): string | null {
  let dir = start;
  while (!existsSync(dir)) dir = path.dirname(dir);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Returns a problem message, or null when the folder is safe to write:
 * - it is new, empty, or already marked as ours (never write into an unrelated folder);
 * - inside a git repository it must be git-ignored, so generated images can't be committed.
 */
function checkOutputFolder(outAbs: string, issues: Issue[]): string | null {
  if (existsSync(outAbs)) {
    if (!statSync(outAbs).isDirectory()) return `Output path ${outAbs} exists and is not a folder.`;
    if (readdirSync(outAbs).length > 0 && !isCatalogFolder(outAbs)) {
      return `Output folder ${outAbs} is not empty and was not created by this importer (no ${OUTPUT_MARKER} file). Refusing to write into it.`;
    }
  }
  const repo = findRepoRoot(outAbs);
  if (repo) {
    const r = spawnSync("git", ["check-ignore", "-q", "--no-index", path.relative(repo, outAbs).split(path.sep).join("/") + "/"], { cwd: repo });
    if (r.error) issues.push({ severity: "warning", field: "(out)", message: "git not available; could not confirm the output folder is git-ignored." });
    else if (r.status === 1) return `Output folder ${outAbs} is inside the repository but not git-ignored; generated images could be committed. Use the default .demo-catalog folder or add it to .gitignore.`;
  }
  return null;
}
