import { createHash } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { artworkKindFromViews, configFromQuery, configToQuery } from "@jemsutra/design-engine";
import { getDesign } from "./designs";
import { defaultDrop } from "./necklace";
import { RenderError, closestWidth, loadManifest, renderDesign, renderStone } from "./render";

/**
 * GET /img/:style/:name.webp?v=top&w=800&m=14KR&s1=EMER&e1=Ali&ef=script
 *   -> personalised product image. The `:name` part is only for SEO.
 * GET /stones/:shape/:code.webp?w=120
 *   -> stone swatch for the designer UI.
 */
const app = new Hono();
app.use("*", cors());

// Small in-memory LRU. In production a CDN sits in front and caches forever.
const MAX_CACHE = 500;
const cache = new Map<string, { buffer: Buffer; contentType: string }>();
const remember = (key: string, value: { buffer: Buffer; contentType: string }) => {
  cache.set(key, value);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
};

const IMMUTABLE = "public, max-age=31536000, immutable";
// Designs can be edited in the admin, so design images are only cached briefly.
const DESIGN_IMAGE_CACHE = "public, max-age=600, stale-while-revalidate=86400";

app.get("/health", (c) => c.json({ ok: true, cached: cache.size }));

app.get("/img/:style/:file", async (c) => {
  const found = await getDesign(c.req.param("style"));
  if (!found) return c.text("Unknown product", 404);
  const product = found.def;

  const file = c.req.param("file");
  const ext = file.split(".").pop();
  const format = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpeg" : "webp";
  const url = new URL(c.req.url);

  // Normalise first: invalid values fall back to defaults, so the cache key is stable
  // and nobody can make us render arbitrary combinations.
  const config = configFromQuery(product, url.searchParams);
  const view = url.searchParams.get("v") ?? undefined;
  const width = closestWidth(Number(url.searchParams.get("w") ?? 800));
  const canonical = configToQuery(product, config, { include: "visual" }).toString();
  // Try-on necklaces: optional pendant drop (rounded and clamped again by the renderer).
  const dr = url.searchParams.get("dr");
  const drop = dr != null && Number.isFinite(Number(dr)) ? Math.round(Math.min(2000, Math.max(0, Number(dr))) / 10) * 10 : undefined;
  const key = createHash("sha1").update(`${product.styleCode}|${found.version}|${view}|${width}|${format}|${canonical}${drop != null ? `|dr${drop}` : ""}`).digest("hex");

  let hit = cache.get(key);
  if (!hit) {
    try {
      hit = await renderDesign(product, config, { view, width, format, drop });
      remember(key, hit);
    } catch (err) {
      if (err instanceof RenderError) return c.text(err.message, err.status as 404);
      console.error(err);
      return c.text("Render failed", 500);
    }
  }
  return c.body(new Uint8Array(hit.buffer), 200, { "Content-Type": hit.contentType, "Cache-Control": DESIGN_IMAGE_CACHE, ETag: `"${key}"` });
});

/**
 * GET /tryon-meta/:style  (try-on prototype)
 * Geometry of a design's try-on view: image size and the two neck anchor points.
 * Only designs whose manifest has a "nameplate" view support try-on.
 */
app.get("/tryon-meta/:style", async (c) => {
  const found = await getDesign(c.req.param("style"));
  if (!found) return c.json({ message: "Unknown product" }, 404);
  const manifest = await loadManifest(found.def.renderTemplate || found.def.styleCode);
  const entry = manifest && Object.entries(manifest.views).find(([, v]) => v.nameplate);
  if (!entry) return c.json({ message: "This design does not support try-on yet" }, 404);
  const [view, v] = entry;
  return c.json({
    view,
    width: v.width,
    height: v.height,
    neckLeft: v.nameplate!.neckLeft,
    neckRight: v.nameplate!.neckRight,
    mmPerPx: v.nameplate!.mmPerPx,
    pendant: v.nameplate!.pendant ? { defaultDrop: defaultDrop(v.nameplate!), ...v.nameplate!.pendant } : null,
    approximate: true,
  });
});

/**
 * GET /internal/artwork/:code - does render artwork exist for this style code, and
 * is it ring or necklace artwork? For the backend only (x-internal-key, the same
 * INTERNAL_API_KEY used for /internal/designs): it stops a design being saved with
 * artwork of another product type, or published without artwork. Reads the
 * manifest only; returns no paths or file contents.
 */
app.get("/internal/artwork/:code", async (c) => {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || c.req.header("x-internal-key") !== key) return c.json({ message: "Unauthorized" }, 401);
  const code = c.req.param("code");
  if (!/^[A-Z]{2,4}\d{3,5}$/.test(code)) return c.json({ message: "Invalid style code" }, 400);
  const manifest = await loadManifest(code);
  if (!manifest) return c.json({ code, exists: false, kind: null });
  return c.json({ code, exists: true, kind: artworkKindFromViews(manifest.views) });
});

app.get("/stones/:shape/:file", async (c) => {
  const code = c.req.param("file").replace(/\.(webp|png)$/, "");
  const buf = await renderStone(c.req.param("shape"), code, Number(c.req.query("w") ?? 120));
  if (!buf) return c.text("Unknown stone", 404);
  return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/webp", "Cache-Control": IMMUTABLE });
});

const port = Number(process.env.PORT ?? 4100);
serve({ fetch: app.fetch, port }, () => console.log(`Image service on http://localhost:${port}`));
