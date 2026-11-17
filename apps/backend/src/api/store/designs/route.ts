import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PRODUCTS, fromPrice } from "@jemsutra/design-engine";

/**
 * GET /store/designs
 * Lists the personalisable designs and their option definitions.
 * (Phase 1 moves these definitions into Medusa products + a "design" module;
 * the shape of this response stays the same for the storefront.)
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({
    designs: PRODUCTS.map((p) => ({ ...p, from_price: fromPrice(p), currency_code: "pkr" })),
  });
}
