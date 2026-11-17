import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getDesign } from "../../../../lib/designs";

/**
 * GET /internal/designs/:style
 * For the image render service only (protected by INTERNAL_API_KEY).
 * Includes drafts, so the admin can preview a design before publishing it.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || req.headers["x-internal-key"] !== key) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const d = await getDesign(req.scope, req.params.style);
  if (!d) {
    res.status(404).json({ message: "Not found" });
    return;
  }
  res.json({ design: d.definition, status: d.status, updated_at: d.updated_at });
}
