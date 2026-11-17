import { configToQuery, type DesignConfig, type ProductDef } from "@jemsutra/design-engine";

export const IMAGE_URL = process.env.NEXT_PUBLIC_IMAGE_URL ?? "http://localhost:4100";

/** URL of the personalised product image for a design. */
export function designImageUrl(
  product: ProductDef,
  config: DesignConfig,
  opts: { width?: number; view?: string } = {},
): string {
  const q = configToQuery(product, config, { include: "visual" });
  q.set("w", String(opts.width ?? 800));
  if (opts.view) q.set("v", opts.view);
  return `${IMAGE_URL}/img/${product.styleCode}/${product.slug}.webp?${q.toString()}`;
}

export function stoneImageUrl(shape: string, code: string, width = 120): string {
  return `${IMAGE_URL}/stones/${shape}/${code}.webp?w=${width}`;
}

export function productPath(product: ProductDef, config?: DesignConfig): string {
  const base = `/products/${product.styleCode}/${product.slug}`;
  if (!config) return base;
  const q = configToQuery(product, config, { omitDefaults: true }).toString();
  return q ? `${base}?${q}` : base;
}
