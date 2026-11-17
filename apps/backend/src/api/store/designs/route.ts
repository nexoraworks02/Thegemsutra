import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { fromPrice } from "@jemsutra/design-engine";
import { listDesigns } from "../../../lib/designs";

/**
 * GET /store/designs
 * Published designs with their full option definitions (edited in the admin).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const designs = await listDesigns(req.scope, { publishedOnly: true });
  res.json({
    designs: designs.map((d) => ({ ...d.definition, from_price: fromPrice(d.definition), currency_code: "pkr" })),
  });
}
