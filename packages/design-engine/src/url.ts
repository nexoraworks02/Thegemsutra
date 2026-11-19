import { defaultConfig, normalizeConfig } from "./config";
import type { DesignConfig, ProductDef } from "./types";

/**
 * Short URL keys (like Jewlr) so a design is shareable and cacheable:
 *   m=14KR  sc=7  s1=EMER  e1=Ali  ef=script  sz=7  pk=PRM
 * plus one key per option group the product defines, e.g. cl=18 (chain length).
 * A repeated key uses its FIRST value (URLSearchParams.get); keys the product
 * doesn't define are ignored.
 */
type QueryInput = URLSearchParams | Record<string, string | string[] | undefined>;

function getter(q: QueryInput) {
  if (q instanceof URLSearchParams) return (k: string) => q.get(k) ?? undefined;
  return (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
}

export function configFromQuery(product: ProductDef, query: QueryInput): DesignConfig {
  const get = getter(query);
  const stones: Record<string, string> = {};
  const engravings: Record<string, string> = {};
  for (let i = 1; i <= 20; i++) {
    const s = get(`s${i}`);
    if (s) stones[`s${i}`] = s;
  }
  for (const e of product.engravings) {
    const v = get(e.key);
    if (v != null) engravings[e.key] = v;
  }
  const sc = get("sc");
  const sz = get("sz");
  const options: Record<string, string> = {};
  for (const group of product.options ?? []) {
    const v = get(group.key);
    if (v != null) options[group.key] = v;
  }
  return normalizeConfig(product, {
    metal: get("m"),
    stoneCount: sc ? Number(sc) : undefined,
    stones,
    engravings,
    font: get("ef"),
    size: sz ? Number(sz) : undefined,
    packaging: get("pk"),
    options,
  });
}

/**
 * Serialise a config. With `omitDefaults`, values equal to the product default
 * are left out (short, pretty URLs for the storefront). Without it, every value
 * is written in a fixed order (stable cache keys for the image service).
 */
export function configToQuery(
  product: ProductDef,
  config: DesignConfig,
  opts: { omitDefaults?: boolean; include?: "all" | "visual" } = {},
): URLSearchParams {
  const def = defaultConfig(product);
  const omit = opts.omitDefaults ?? false;
  const visualOnly = opts.include === "visual";
  const q = new URLSearchParams();
  const put = (k: string, v: string | undefined, d?: string) => {
    if (v == null || v === "") return;
    if (omit && v === d) return;
    q.set(k, v);
  };

  put("m", config.metal, def.metal);
  if (config.stoneCount != null) put("sc", String(config.stoneCount), def.stoneCount != null ? String(def.stoneCount) : undefined);
  for (const key of Object.keys(config.stones).sort(bySlotNumber)) {
    put(key, config.stones[key], omit ? normalizeConfig(product, { stoneCount: config.stoneCount }).stones[key] : undefined);
  }
  for (const e of product.engravings) put(e.key, config.engravings[e.key]);
  const anyText = product.engravings.some((e) => config.engravings[e.key]);
  if (anyText || !visualOnly) put("ef", config.font, def.font);
  if (!visualOnly) {
    if (config.size != null) put("sz", String(config.size));
    put("pk", config.packaging, def.packaging);
  }
  // Option groups come last, in the product's order, so URLs of products without
  // options are unchanged. Image URLs only include groups that change the image.
  for (const group of product.options ?? []) {
    if (visualOnly && !group.visual) continue;
    put(group.key, config.options?.[group.key], def.options?.[group.key]);
  }
  return q;
}

function bySlotNumber(a: string, b: string) {
  return Number(a.slice(1)) - Number(b.slice(1));
}
