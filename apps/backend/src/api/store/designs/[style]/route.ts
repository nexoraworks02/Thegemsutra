import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { fromPrice } from "@jemsutra/design-engine";
import { getDesign } from "../../../../lib/designs";

/** GET /store/designs/:style - one published design. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const d = await getDesign(req.scope, req.params.style, { publishedOnly: true });
  if (!d) {
    res.status(404).json({ message: `Unknown design ${req.params.style}` });
    return;
  }
  res.json({ design: { ...d.definition, from_price: fromPrice(d.definition), currency_code: "pkr" } });
}
