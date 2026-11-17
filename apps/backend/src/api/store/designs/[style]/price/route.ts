import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  PRODUCT_BY_STYLE,
  normalizeConfig,
  priceDesign,
  validateForCart,
  type DesignConfig,
} from "@jemsutra/design-engine";

/**
 * POST /store/designs/:style/price
 * Body: a design configuration (same shape the storefront uses).
 *
 * The server is the source of truth for prices: whatever the browser sends is
 * normalised (invalid choices replaced by defaults) and re-priced here with the
 * same shared engine the storefront uses. Checkout will call this before
 * creating the cart line item.
 */
export async function POST(req: MedusaRequest<Partial<DesignConfig>>, res: MedusaResponse) {
  const product = PRODUCT_BY_STYLE[req.params.style];
  if (!product) {
    res.status(404).json({ message: `Unknown design ${req.params.style}` });
    return;
  }

  const config = normalizeConfig(product, req.body ?? {});
  const price = priceDesign(product, config);
  const issues = validateForCart(product, config);

  res.json({
    style_code: product.styleCode,
    config,
    currency_code: "pkr",
    lines: price.lines,
    total: price.total,
    compare_at: price.compareAt ?? null,
    ready_for_cart: issues.length === 0,
    issues,
  });
}
