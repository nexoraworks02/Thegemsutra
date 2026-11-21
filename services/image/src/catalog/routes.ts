/**
 * DEMO catalog routes (development and local testing only).
 *
 *   GET /catalog/index.json                      -> active demo catalog (no source paths, no hashes)
 *   GET /catalog/exists/:slug                    -> 204 / 404 only (used by the storefront Proxy)
 *   GET /catalog/img/:assetId/:variant.webp?w=   -> card | full image, resized to an allowed width
 *
 * Isolation (all must hold, otherwise every /catalog URL is a plain 404):
 * - DEMO_CATALOG_DIR is set (and in production ENABLE_DEMO_CATALOG=true as well);
 * - that folder carries the importer's marker file (so it can't be pointed at an
 *   arbitrary folder);
 * - the request is addressed to a loopback host (localhost / 127.0.0.1 / ::1).
 * Only images of products in the ACTIVE catalog version are served. Asset ids and
 * variants are matched against fixed patterns and looked up in the catalog, so no
 * request can build a file path; responses never contain paths or error details.
 * Every response carries X-Robots-Tag: noindex.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import sharp from "sharp";
import { isCatalogFolder, readCatalog } from "./import";
import { toPublic } from "./schema";
import { closestWidth } from "../render";

const ASSET_RE = /^img_[0-9a-f]{16}$/;
const SLUG_RE = /^demo-(rng|ear|nck|set)-\d{3}(-[a-z0-9]+)*$/;
const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function demoCatalogEnabled(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = env.DEMO_CATALOG_DIR?.trim();
  if (!dir) return null;
  if (env.NODE_ENV === "production" && env.ENABLE_DEMO_CATALOG !== "true") return null;
  return path.resolve(dir);
}

export function catalogRoutes(dir: string | null): Hono {
  const app = new Hono();
  const notFound = () => new Response("Not found", { status: 404, headers: { ...NOINDEX, "Content-Type": "text/plain" } });
  if (!dir) {
    app.all("*", () => notFound());
    return app;
  }

  // Gate every request: loopback host + a folder created by the importer.
  app.use("*", async (c, next) => {
    let host = "";
    try {
      host = new URL(c.req.url).hostname.toLowerCase();
    } catch {
      return notFound();
    }
    if (!LOOPBACK.has(host) || !isCatalogFolder(dir)) return notFound();
    await next();
  });

  const cache = new Map<string, Buffer>();
  const MAX = 300;

  app.get("/index.json", (c) => {
    const catalog = readCatalog(dir);
    if (!catalog) return c.json({ message: "No demo catalog has been imported yet." }, 404, NOINDEX);
    return c.json(toPublic(catalog), 200, { ...NOINDEX, "Cache-Control": "no-store" });
  });

  // Existence check used by the storefront Proxy to return a genuine 404 before rendering.
  // Answers with a status only: 204 (exists) or 404.
  app.get("/exists/:slug", (c) => {
    const slug = c.req.param("slug");
    if (slug.length > 80 || !SLUG_RE.test(slug)) return c.body(null, 404, NOINDEX);
    const found = readCatalog(dir)?.products.some((p) => p.slug === slug);
    return c.body(null, found ? 204 : 404, NOINDEX);
  });

  app.get("/img/:asset/:file", async (c) => {
    const asset = c.req.param("asset");
    const m = /^(card|full)\.webp$/.exec(c.req.param("file"));
    if (!ASSET_RE.test(asset) || !m) return notFound();
    const variant = m[1] as "card" | "full";
    const catalog = readCatalog(dir);
    const entry = catalog?.assets.find((a) => a.id === asset && a.usage === "product");
    if (!catalog || !entry || !catalog.products.some((p) => p.images.some((i) => i.asset === asset))) return notFound();

    const width = closestWidth(Number(c.req.query("w") ?? 800));
    const key = `${asset}|${variant}|${width}`;
    let buf = cache.get(key);
    if (!buf) {
      // Path built only from the validated id and a fixed variant name.
      const file = path.join(dir, "assets", asset, `${variant}.webp`);
      if (!existsSync(file)) return notFound();
      try {
        buf = await sharp(readFileSync(file)).resize({ width, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      } catch {
        return notFound(); // never leak paths or decoder messages
      }
      cache.set(key, buf);
      if (cache.size > MAX) cache.delete(cache.keys().next().value!);
    }
    // Content-addressed: the bytes for an asset id never change.
    return c.body(new Uint8Array(buf), 200, { ...NOINDEX, "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400" });
  });

  app.all("*", () => notFound());
  app.onError(() => new Response("Server error", { status: 500, headers: { ...NOINDEX, "Content-Type": "text/plain" } }));
  return app;
}
