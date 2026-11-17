import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows";
import type { ProductDef } from "@jemsutra/design-engine";
import { DESIGN_MODULE } from "../../../../modules/design";
import type DesignModuleService from "../../../../modules/design/service";
import { DesignValidationError, defaultImageUrl, getDesign, revalidateStorefront, saveDesign, type DesignStatus } from "../../../../lib/designs";

/** GET /admin/designs/:style */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const d = await getDesign(req.scope, req.params.style);
  if (!d) {
    res.status(404).json({ message: "Design not found" });
    return;
  }
  res.json({ design: { ...d, preview_url: defaultImageUrl(d.definition, 800) } });
}

/** POST /admin/designs/:style - update. Body: { definition, status }. The style code cannot change. */
export async function POST(req: AuthenticatedMedusaRequest<{ definition: ProductDef; status: DesignStatus }>, res: MedusaResponse) {
  const def = req.body?.definition;
  if (!def || def.styleCode !== req.params.style) {
    res.status(400).json({ message: "The style code of a design cannot be changed." });
    return;
  }
  try {
    const saved = await saveDesign(req.scope, { definition: def, status: req.body.status === "published" ? "published" : "draft" }, { create: false });
    res.json({ design: { ...saved, preview_url: defaultImageUrl(saved.definition, 800) } });
  } catch (e) {
    if (e instanceof DesignValidationError) {
      res.status(400).json({ message: e.message, issues: e.issues });
      return;
    }
    throw e;
  }
}

/** DELETE /admin/designs/:style - drafts only (published designs may have orders; unpublish instead). */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const d = await getDesign(req.scope, req.params.style);
  if (!d) {
    res.status(404).json({ message: "Design not found" });
    return;
  }
  if (d.status !== "draft") {
    res.status(400).json({ message: "Only draft designs can be deleted. Set it to draft first." });
    return;
  }
  if (d.product_id) {
    await deleteProductsWorkflow(req.scope).run({ input: { ids: [d.product_id] } });
  }
  await req.scope.resolve<DesignModuleService>(DESIGN_MODULE).deleteDesigns(d.id);
  await revalidateStorefront(req.scope);
  res.json({ id: d.style_code, deleted: true });
}
