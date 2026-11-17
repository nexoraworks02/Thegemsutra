import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { fromPrice, type ProductDef } from "@jemsutra/design-engine";
import { DesignValidationError, defaultImageUrl, listDesigns, saveDesign, type DesignStatus } from "../../../lib/designs";

/** GET /admin/designs - all designs (draft + published) for the Designs page. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const designs = await listDesigns(req.scope);
  res.json({
    designs: designs.map((d) => ({
      style_code: d.style_code,
      status: d.status,
      name: d.definition.name,
      type: d.definition.type,
      slug: d.definition.slug,
      metals: d.definition.metals.length,
      from_price: fromPrice(d.definition),
      sale_percent: d.definition.salePercent ?? 0,
      image_url: defaultImageUrl(d.definition, 240),
      product_id: d.product_id,
      updated_at: d.updated_at,
    })),
  });
}

/** POST /admin/designs - create a new design. Body: { definition, status } */
export async function POST(req: AuthenticatedMedusaRequest<{ definition: ProductDef; status?: DesignStatus }>, res: MedusaResponse) {
  try {
    const saved = await saveDesign(req.scope, { definition: req.body.definition, status: req.body.status ?? "draft" }, { create: true });
    res.status(201).json({ design: saved });
  } catch (e) {
    if (e instanceof DesignValidationError) {
      res.status(400).json({ message: e.message, issues: e.issues });
      return;
    }
    throw e;
  }
}
