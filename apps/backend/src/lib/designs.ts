import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import {
  configToQuery,
  defaultConfig,
  fromPrice,
  validateProductDef,
  type ProductDef,
  type ValidationIssue,
} from "@jemsutra/design-engine";
import { DESIGN_MODULE } from "../modules/design";
import type DesignModuleService from "../modules/design/service";

const IMAGE_URL = process.env.IMAGE_SERVICE_URL ?? "http://localhost:4100";

export type DesignStatus = "draft" | "published";

export interface DesignRecord {
  id: string;
  style_code: string;
  status: DesignStatus;
  definition: ProductDef;
  product_id: string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export class DesignValidationError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super(issues.map((i) => i.message).join(" "));
  }
}

/** Ask the storefront to reload designs (best effort - a failure only delays the update). */
export async function revalidateStorefront(container: MedusaContainer) {
  const url = process.env.STORE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(`${url}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": secret }, signal: AbortSignal.timeout(3000) });
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`Storefront refresh failed: ${(e as Error).message}`);
  }
}

const service = (c: MedusaContainer) => c.resolve<DesignModuleService>(DESIGN_MODULE);

export async function listDesigns(container: MedusaContainer, opts: { publishedOnly?: boolean } = {}): Promise<DesignRecord[]> {
  const rows = await service(container).listDesigns(opts.publishedOnly ? { status: "published" } : {}, { order: { style_code: "ASC" } });
  return rows as unknown as DesignRecord[];
}

export async function getDesign(
  container: MedusaContainer,
  styleCode: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<DesignRecord | null> {
  const [row] = await service(container).listDesigns({ style_code: styleCode, ...(opts.publishedOnly ? { status: "published" } : {}) });
  return (row as unknown as DesignRecord) ?? null;
}

/** Image URL of a design's default look (used for product thumbnails). */
export function defaultImageUrl(def: ProductDef, width = 800): string {
  const q = configToQuery(def, defaultConfig(def), { include: "visual" }).toString();
  return `${IMAGE_URL}/img/${def.styleCode}/${def.slug}.webp?${q}&w=${width}`;
}

/** Normalise free-form admin input into a clean definition. */
function clean(def: ProductDef): ProductDef {
  const d = structuredClone(def);
  d.name = d.name?.trim();
  d.slug = d.slug?.trim().toLowerCase();
  d.description = d.description?.trim();
  d.badges = (d.badges ?? []).map((b) => b.trim()).filter(Boolean);
  if (!d.salePercent) delete d.salePercent;
  if (!d.renderTemplate) delete d.renderTemplate;
  if (d.stoneCount) d.stoneSlots = [];
  return d;
}

/**
 * Validate and save a design, then create/update its Medusa product.
 * The Medusa product has a single "Made to order" variant: all option pricing
 * comes from the design and is applied to the cart line by the server.
 */
export async function saveDesign(
  container: MedusaContainer,
  input: { definition: ProductDef; status: DesignStatus },
  opts: { create: boolean },
): Promise<DesignRecord> {
  const def = clean(input.definition);
  const issues = validateProductDef(def);
  const existing = await getDesign(container, def.styleCode);
  if (opts.create && existing) issues.push({ field: "styleCode", message: `Style code ${def.styleCode} already exists.` });
  if (!opts.create && !existing) issues.push({ field: "styleCode", message: `Design ${def.styleCode} not found.` });
  const others = (await listDesigns(container)).filter((d) => d.style_code !== def.styleCode);
  if (others.some((d) => d.definition.slug === def.slug)) issues.push({ field: "slug", message: `URL name "${def.slug}" is already used by another design.` });
  if (def.renderTemplate && def.renderTemplate !== def.styleCode && ![def.styleCode, ...others.map((o) => o.style_code)].includes(def.renderTemplate)) {
    issues.push({ field: "renderTemplate", message: `Render artwork ${def.renderTemplate} is not an existing design.` });
  }
  if (issues.length) throw new DesignValidationError(issues);

  const productId = await syncProduct(container, def, input.status, existing?.product_id ?? null);
  const svc = service(container);
  const saved = existing
    ? await svc.updateDesigns({ id: existing.id, status: input.status, definition: def as unknown as Record<string, unknown>, product_id: productId })
    : await svc.createDesigns({ style_code: def.styleCode, status: input.status, definition: def as unknown as Record<string, unknown>, product_id: productId });
  await revalidateStorefront(container);
  return saved as unknown as DesignRecord;
}

async function syncProduct(container: MedusaContainer, def: ProductDef, status: DesignStatus, productId: string | null): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productStatus = status === "published" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT;
  const image = defaultImageUrl(def, 1200);
  const common = {
    title: def.name,
    description: def.description,
    handle: def.slug,
    status: productStatus,
    thumbnail: defaultImageUrl(def, 600),
    metadata: { style_code: def.styleCode, personalised: true, sale_percent: def.salePercent ?? 0 },
  };

  // Find the product: stored id, else an existing product with this handle (older seeds).
  let id = productId;
  if (!id) {
    const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: def.slug } });
    id = data[0]?.id ?? null;
  } else {
    const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { id } });
    if (!data.length) id = null;
  }

  if (id) {
    await updateProductsWorkflow(container).run({
      input: { selector: { id }, update: { ...common, images: [{ url: image }] } },
    });
    return id;
  }

  const salesChannels = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "Default Sales Channel" });
  const [profile] = await container.resolve(Modules.FULFILLMENT).listShippingProfiles({ type: "default" });
  const { data: categories } = await query.graph({ entity: "product_category", fields: ["id", "name"] });
  const category = categories.find((c) => c.name.toLowerCase() === `${def.type}s`);

  const { result } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          ...common,
          images: [{ url: image }],
          category_ids: category ? [category.id] : [],
          shipping_profile_id: profile?.id,
          options: [{ title: "Made to order", values: ["Personalised"] }],
          variants: [
            {
              title: "Made to order",
              sku: def.styleCode,
              manage_inventory: false,
              options: { "Made to order": "Personalised" },
              prices: [{ amount: fromPrice(def), currency_code: "pkr" }],
            },
          ],
          sales_channels: salesChannels[0] ? [{ id: salesChannels[0].id }] : [],
        },
      ],
    },
  });
  return result[0]!.id;
}

/** Variant to attach a cart line to: the design's single variant, or the legacy per-metal variant. */
export async function findVariantId(container: MedusaContainer, def: ProductDef, metal: string): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku"],
    filters: { sku: [def.styleCode, `${def.styleCode}-${metal}`] },
  });
  return (data.find((v) => v.sku === def.styleCode) ?? data[0])?.id ?? null;
}
