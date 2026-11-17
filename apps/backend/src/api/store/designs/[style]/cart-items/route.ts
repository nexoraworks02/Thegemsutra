import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { addToCartWorkflow, deleteLineItemsWorkflow } from "@medusajs/medusa/core-flows";
import {
  configToQuery,
  describeDesign,
  normalizeConfig,
  priceDesign,
  validateForCart,
  type DesignConfig,
} from "@jemsutra/design-engine";
import { findVariantId, getDesign } from "../../../../../lib/designs";

const IMAGE_URL = process.env.IMAGE_SERVICE_URL ?? "http://localhost:4100";

type Body = {
  cart_id: string;
  config: Partial<DesignConfig>;
  /** "Modify item": replace this existing line with the new design */
  replace_line_id?: string;
};

/**
 * POST /store/designs/:style/cart-items
 *
 * Adds a personalised design to a Medusa cart. The browser only sends the
 * choices; the price is calculated here by the shared engine and set as the
 * line's unit price, so it can't be tampered with. Everything the workshop
 * needs is stored in the line item's metadata.
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const product = (await getDesign(req.scope, req.params.style, { publishedOnly: true }))?.definition;
  if (!product) {
    res.status(404).json({ message: `Unknown design ${req.params.style}` });
    return;
  }
  const { cart_id, replace_line_id } = req.body ?? ({} as Body);
  if (!cart_id) {
    res.status(400).json({ message: "cart_id is required" });
    return;
  }

  const config = normalizeConfig(product, req.body.config ?? {});
  const issues = validateForCart(product, config);
  if (issues.length) {
    res.status(400).json({ message: issues.map((i) => i.message).join(" "), issues });
    return;
  }
  const price = priceDesign(product, config);

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const variantId = await findVariantId(req.scope, product, config.metal);
  if (!variantId) {
    res.status(409).json({ message: `Design ${product.styleCode} has no product yet - save it in the admin.` });
    return;
  }

  if (replace_line_id) {
    await deleteLineItemsWorkflow(req.scope).run({ input: { cart_id, ids: [replace_line_id] } });
  }

  const imageQuery = configToQuery(product, config, { include: "visual" }).toString();
  await addToCartWorkflow(req.scope).run({
    input: {
      cart_id,
      items: [
        {
          variant_id: variantId,
          quantity: 1,
          unit_price: price.total,
          metadata: {
            style_code: product.styleCode,
            design: config,
            design_summary: describeDesign(product, config),
            price_lines: price.lines,
            compare_at: price.compareAt ?? null,
            image_url: `${IMAGE_URL}/img/${product.styleCode}/${product.slug}.webp?${imageQuery}&w=800`,
            product_path: `/products/${product.styleCode}/${product.slug}?${configToQuery(product, config, { omitDefaults: true }).toString()}`,
          },
        },
      ],
    },
  });

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "total", "subtotal", "currency_code", "items.*"],
    filters: { id: cart_id },
  });
  res.json({ cart: carts[0] });
}
