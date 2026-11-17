import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";
import { METAL_BY_CODE, type DesignConfig, type ProductDef } from "@jemsutra/design-engine";
import { engravingSvg } from "./engrave";
import { necklaceSvg } from "./necklace";
import type { ProductManifest, SlotPlacement } from "./manifest";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ASSETS_DIR = process.env.ASSETS_DIR ?? path.resolve(here, "../../../assets");

export const ALLOWED_WIDTHS = [120, 240, 400, 600, 800, 1200] as const;

const manifestCache = new Map<string, ProductManifest>();
const layerCache = new Map<string, Buffer>();

export async function loadManifest(styleCode: string): Promise<ProductManifest | null> {
  const cached = manifestCache.get(styleCode);
  if (cached) return cached;
  const file = path.join(ASSETS_DIR, "products", styleCode, "manifest.json");
  if (!existsSync(file)) return null;
  const m = JSON.parse(await readFile(file, "utf8")) as ProductManifest;
  manifestCache.set(styleCode, m);
  return m;
}

async function layer(file: string): Promise<Buffer> {
  let buf = layerCache.get(file);
  if (!buf) {
    buf = await readFile(file);
    layerCache.set(file, buf);
  }
  return buf;
}

/** Resize + rotate a layer and position it by its centre. */
async function place(file: string, p: SlotPlacement, scale = 1): Promise<OverlayOptions> {
  const w = Math.round(p.w * scale);
  const h = Math.round(p.h * scale);
  let img = sharp(await layer(file)).resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (p.rotate) img = img.rotate(p.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const buf = await img.png().toBuffer();
  const meta = await sharp(buf).metadata();
  return {
    input: buf,
    left: Math.round(p.x - (meta.width ?? w) / 2),
    top: Math.round(p.y - (meta.height ?? h) / 2),
  };
}

export interface RenderOptions {
  view?: string;
  width?: number;
  format?: "webp" | "png" | "jpeg";
}

/** Compose metal body + stone settings + stones + engraving into one image. */
export async function renderDesign(
  product: ProductDef,
  config: DesignConfig,
  opts: RenderOptions = {},
): Promise<{ buffer: Buffer; contentType: string }> {
  // A new design can borrow another design's artwork until its own 3D renders exist.
  const artwork = product.renderTemplate || product.styleCode;
  const manifest = await loadManifest(artwork);
  if (!manifest) throw new RenderError(404, `No render assets for ${artwork}`);
  const viewName = opts.view && manifest.views[opts.view] ? opts.view : manifest.defaultView;
  const view = manifest.views[viewName]!;
  const metal = METAL_BY_CODE[config.metal]!;
  const dir = path.join(ASSETS_DIR, "products", artwork, viewName);

  const transparent = view.background === "transparent";
  const background = transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : view.background;
  let overlays: OverlayOptions[];

  if (view.nameplate) {
    // Try-on prototype: a whole name necklace drawn from the customer's exact name.
    const name = config.engravings[view.nameplate.textKey] ?? "";
    overlays = [{ input: Buffer.from(necklaceSvg(name, config.font, view.nameplate, metal, view.width, view.height)) }];
  } else {
    overlays = [{ input: await layer(path.join(dir, `metal-${metal.code}.png`)) }];

    const slots = view.slotLayouts ? view.slotLayouts[String(config.stoneCount)] ?? {} : view.slots ?? {};
    for (const [key, placement] of Object.entries(slots)) {
      const stone = config.stones[key];
      if (!stone) continue;
      overlays.push(await place(path.join(dir, `setting-${metal.code}-${view.stoneShape}.png`), placement, 1.2));
      overlays.push(await place(path.join(ASSETS_DIR, "stones", view.stoneShape, `${stone}.png`), placement));
    }

    const textSvg = Object.entries(view.engravings)
      .map(([key, area]) => engravingSvg(config.engravings[key] ?? "", config.font, area, metal))
      .join("");
    if (textSvg) {
      overlays.push({
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}">${textSvg}</svg>`),
      });
    }
  }

  let img = sharp({
    create: { width: view.width, height: view.height, channels: 4, background },
  }).composite(overlays);

  // Flatten composite before resizing (sharp applies resize before composite otherwise).
  const flat = await img.png().toBuffer();
  const width = closestWidth(opts.width ?? 800);
  let out = sharp(flat).resize(width);
  const format = opts.format ?? "webp";
  if (format === "webp") out = out.webp({ quality: 88 });
  else if (format === "jpeg") out = out.flatten({ background: transparent ? "#ffffff" : view.background }).jpeg({ quality: 88 });
  else out = out.png();
  return { buffer: await out.toBuffer(), contentType: `image/${format}` };
}

export async function renderStone(shape: string, code: string, width: number): Promise<Buffer | null> {
  const file = path.join(ASSETS_DIR, "stones", shape, `${code}.png`);
  if (!/^[a-z]+$/.test(shape) || !/^[A-Z0-9-]+$/.test(code) || !existsSync(file)) return null;
  return sharp(await layer(file)).resize(closestWidth(width)).webp({ quality: 90 }).toBuffer();
}

export function closestWidth(w: number): number {
  return ALLOWED_WIDTHS.reduce((best, cur) => (Math.abs(cur - w) < Math.abs(best - w) ? cur : best), 800);
}

export class RenderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
