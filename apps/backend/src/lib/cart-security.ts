/**
 * Cart & pricing security policy (M2.2) - the single source of truth used by:
 * - the request middlewares on Medusa's store cart routes (src/api/middlewares.ts),
 * - the workflow hooks on Medusa's cart workflows (src/workflows/hooks/cart-security.ts),
 * - the trusted designer route (src/api/store/designs/[style]/cart-items/route.ts).
 *
 * Invariants for PERSONALISED products (any product that is a design):
 * 1. They enter a cart only through the designer route, which validates every option and sets
 *    the server-calculated price and the trusted line metadata.
 * 2. Customers cannot add them through standard routes, cannot supply or change their metadata,
 *    and cannot change their quantity (only remove the line).
 * 3. At checkout every personalised line is rebuilt from the stored design and the CURRENT
 *    published definition; price, variant, quantity and all trusted metadata must match exactly,
 *    otherwise the order is not created (nothing is silently corrected).
 *
 * STANDARD products: normal Medusa variants and quantities; client metadata only from an
 * explicit allowlist (empty today), never trusted keys. Client cart metadata is not accepted.
 */
import { randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  configToQuery,
  describeDesign,
  engravingLines,
  normalizeConfig,
  priceDesign,
  validateForCart,
  type DesignConfig,
  type ProductDef,
} from "@jemsutra/design-engine";
import { findVariantId, getDesign, listDesigns } from "./designs";

const IMAGE_URL = process.env.IMAGE_SERVICE_URL ?? "http://localhost:4100";

/** Line metadata keys that only the server may write (design + pricing + fulfilment data). */
export const TRUSTED_LINE_METADATA_KEYS = [
  "style_code",
  "design",
  "design_summary",
  "engraving_lines",
  "price_lines",
  "compare_at",
  "image_url",
  "product_path",
  "line_ref",
] as const;

/**
 * Client-supplied metadata permitted on STANDARD lines: key -> validator. Empty on purpose -
 * add entries deliberately (e.g. `gift_message: (v) => typeof v === "string" && v.length <= 200`).
 */
export const STANDARD_LINE_METADATA_ALLOWLIST: Record<string, (value: unknown) => boolean> = {};

/** Client-supplied CART metadata permitted on store routes. Empty: the store never needs it. */
export const CART_METADATA_ALLOWLIST: Record<string, (value: unknown) => boolean> = {};

/** Cart/order metadata keys the server owns (copied onto the order at checkout). */
export const RESERVED_CART_METADATA_KEYS = ["production", ...TRUSTED_LINE_METADATA_KEYS] as const;

export const PERSONALISED_MAX_QUANTITY = 1;

export class CartPolicyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Problems with client metadata against an allowlist (null/undefined/{} are fine). */
export function metadataProblems(meta: unknown, allowlist: Record<string, (v: unknown) => boolean>, what: string): string | null {
  if (meta === undefined || meta === null) return null;
  if (!isPlainObject(meta)) return `${what} metadata must be an object.`;
  for (const [k, v] of Object.entries(meta)) {
    if (!(k in allowlist)) return `${what} metadata "${k}" is not allowed.`;
    if (!allowlist[k]!(v)) return `${what} metadata "${k}" has an invalid value.`;
  }
  return null;
}

/** Defence in depth for workflow hooks: reserved keys may never come from outside. */
export function reservedKeys(meta: unknown): string[] {
  if (!isPlainObject(meta)) return [];
  return Object.keys(meta).filter((k) => (RESERVED_CART_METADATA_KEYS as readonly string[]).includes(k));
}

// ---------------------------------------------------------------- variant classification

export interface VariantClass {
  exists: boolean;
  personalised: boolean;
  sku: string | null;
  productId: string | null;
}

/**
 * Decide, from trusted data only, whether variants belong to personalised products.
 * Personalised when ANY holds (fail-closed): product.metadata.personalised === true; the product
 * is linked to a design; or the SKU is a design style code or "<style>-..." (legacy per-metal).
 */
export async function classifyVariants(container: MedusaContainer, variantIds: string[]): Promise<Map<string, VariantClass>> {
  const out = new Map<string, VariantClass>();
  const ids = [...new Set(variantIds.filter((v) => typeof v === "string" && v))];
  if (!ids.length) return out;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "product_variant", fields: ["id", "sku", "product.id", "product.metadata"], filters: { id: ids } });
  const designs = await listDesigns(container);
  const designProducts = new Set(designs.map((d) => d.product_id).filter(Boolean));
  const styles = designs.map((d) => d.style_code);
  for (const id of ids) {
    const v = (data as { id: string; sku?: string | null; product?: { id: string; metadata?: Record<string, unknown> | null } | null }[]).find((x) => x.id === id);
    if (!v) {
      out.set(id, { exists: false, personalised: false, sku: null, productId: null });
      continue;
    }
    const sku = v.sku ?? null;
    const personalised =
      v.product?.metadata?.personalised === true ||
      (!!v.product?.id && designProducts.has(v.product.id)) ||
      (!!sku && styles.some((s) => sku === s || sku.startsWith(`${s}-`)));
    out.set(id, { exists: true, personalised, sku, productId: v.product?.id ?? null });
  }
  return out;
}

/** A line is personalised if its variant is, or it carries any trusted design key. */
export function lineIsPersonalised(line: { variant_id?: string | null; metadata?: unknown }, classes: Map<string, VariantClass>): boolean {
  const meta = isPlainObject(line.metadata) ? line.metadata : {};
  if (Object.keys(meta).some((k) => (TRUSTED_LINE_METADATA_KEYS as readonly string[]).includes(k))) return true;
  return !!(line.variant_id && classes.get(line.variant_id)?.personalised);
}

// ---------------------------------------------------------------- trusted line data

/** The exact metadata the server stores on a personalised line (line_ref excluded). */
export function buildTrustedLineMetadata(product: ProductDef, config: DesignConfig) {
  const price = priceDesign(product, config);
  const imageQuery = configToQuery(product, config, { include: "visual" }).toString();
  return {
    price,
    metadata: {
      style_code: product.styleCode,
      design: config,
      design_summary: describeDesign(product, config),
      engraving_lines: engravingLines(product, config),
      price_lines: price.lines,
      compare_at: price.compareAt ?? null,
      image_url: `${IMAGE_URL}/img/${product.styleCode}/${product.slug}.webp?${imageQuery}&w=800`,
      product_path: `/products/${product.styleCode}/${product.slug}?${configToQuery(product, config, { omitDefaults: true }).toString()}`,
    },
  };
}

/** Unique per line so identical designs never merge into one line with quantity > 1. */
export const newLineRef = () => randomUUID();

const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : isPlainObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(canon(JSON.parse(JSON.stringify(a ?? null)))) === JSON.stringify(canon(JSON.parse(JSON.stringify(b ?? null))));
const LINE_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface LineToVerify {
  id?: string;
  variant_id?: string | null;
  quantity: number | string;
  unit_price: number | string;
  metadata?: unknown;
}

/**
 * Rebuild a personalised line from its stored design and the CURRENT published definition and
 * report every mismatch. An empty array means the line is exactly what the server would create.
 */
export async function verifyPersonalisedLine(container: MedusaContainer, line: LineToVerify): Promise<string[]> {
  const problems: string[] = [];
  const meta = isPlainObject(line.metadata) ? line.metadata : null;
  if (!meta) return ["missing design data"];
  const style = typeof meta.style_code === "string" ? meta.style_code : null;
  if (!style) return ["missing style code"];
  const def = (await getDesign(container, style, { publishedOnly: true }))?.definition;
  if (!def) return [`design ${style} is not available`];
  if (!isPlainObject(meta.design)) return ["missing design configuration"];

  const stored = meta.design as Partial<DesignConfig>;
  const config = normalizeConfig(def, stored);
  if (!sameJson(config, stored)) problems.push("design contains values the server would not accept");
  const issues = validateForCart(def, config);
  if (issues.length) problems.push(`design incomplete: ${issues.map((i) => i.message).join(" ")}`);

  const expectedVariant = await findVariantId(container, def, config.metal);
  if (!expectedVariant || line.variant_id !== expectedVariant) problems.push("line is not on the design's product variant");
  if (Number(line.quantity) < 1 || Number(line.quantity) > PERSONALISED_MAX_QUANTITY) problems.push(`quantity must be ${PERSONALISED_MAX_QUANTITY}`);

  const { price, metadata: expected } = buildTrustedLineMetadata(def, config);
  if (Number(line.unit_price) !== price.total) problems.push("price does not match the design");
  const { line_ref, ...rest } = meta;
  if (line_ref !== undefined && (typeof line_ref !== "string" || !LINE_REF.test(line_ref))) problems.push("invalid line reference");
  if (!sameJson(rest, expected)) problems.push("design details do not match the server's record");
  return problems;
}
