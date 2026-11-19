import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { FONTS, METALS, MONTHS, STONES } from "@jemsutra/design-engine";
import { listDesigns } from "../../../lib/designs";

/** GET /admin/design-meta - reference data for the design editor. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const designs = await listDesigns(req.scope);
  res.json({
    metals: METALS.map((m) => ({ code: m.code, name: m.name, color: m.color })),
    stones: STONES.map((s) => ({ code: s.code, name: s.name, kind: s.kind, month: s.birthMonth ? MONTHS[s.birthMonth - 1] : null, color: s.color })),
    fonts: FONTS,
    shapes: ["heart", "round", "oval", "princess", "pear", "marquise"],
    types: ["ring", "necklace", "bracelet", "earring"],
    // Designs with render artwork that new designs can borrow until they get their own 3D renders.
    render_templates: designs
      .filter((d) => !d.definition.renderTemplate || d.definition.renderTemplate === d.style_code)
      .map((d) => ({ style_code: d.style_code, name: d.definition.name, type: d.definition.type, stone_shape: d.definition.stoneCount?.slot.shape ?? d.definition.stoneSlots[0]?.shape ?? null, multi_stone: !!d.definition.stoneCount })),
  });
}
