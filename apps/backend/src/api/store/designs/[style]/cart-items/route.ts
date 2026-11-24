import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { addToCartWorkflow, deleteLineItemsWorkflow } from "@medusajs/medusa/core-flows";
import { normalizeConfig, validateForCart, type DesignConfig } from "@jemsutra/design-engine";
import { findVariantId, getDesign } from "../../../../../lib/designs";
import { buildTrustedLineMetadata, classifyVariants, lineIsPersonalised, newLineRef } from "../../../../../lib/cart-security";

type Body = {
  cart_id: string;
  config: Partial<DesignConfig>;
  /** "Modify item": replace this existing line with the new design */
  replace_line_id?: string;
};

/**
 * POST /store/designs/:style/cart-items
 *
 * The ONLY way a personalised design enters a cart. The browser only sends the choices; the
 * server validates them, calculates the price with the shared engine and writes the trusted
 * line metadata (src/lib/cart-security.ts). Checkout later rebuilds and compares all of it.
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const product = (await getDesign(req.scope, req.params.style, { publishedOnly: true }))?.definition;
  if (!product) {
    res.status(404).json({ message: `Unknown design ${req.params.style}` });
    return;
  }
  const { cart_id, replace_line_id } = req.body ?? ({} as Body);
  if (!cart_id || typeof cart_id !== "string") {
    res.status(400).json({ message: "cart_id is required" });
    return;
  }

  const config = normalizeConfig(product, req.body.config ?? {});
  const issues = validateForCart(product, config);
  if (issues.length) {
    res.status(400).json({ message: issues.map((i) => i.message).join(" "), issues });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const variantId = await findVariantId(req.scope, product, config.metal);
  if (!variantId) {
    res.status(409).json({ message: `Design ${product.styleCode} has no product yet - save it in the admin.` });
    return;
  }

  // "Modify item" may only replace a personalised line that belongs to THIS cart. Checked before
  // anything changes (Medusa's delete step itself removes any line id it is given).
  if (replace_line_id !== undefined) {
    const { data } = await query.graph({ entity: "cart", fields: ["id", "items.id", "items.variant_id", "items.metadata"], filters: { id: cart_id } });
    const line = (data[0] as { items?: { id: string; variant_id?: string | null; metadata?: unknown }[] } | undefined)?.items?.find((i) => i.id === replace_line_id);
    if (!line) {
      res.status(404).json({ message: "The item to replace is not in this cart." });
      return;
    }
    if (!lineIsPersonalised(line, await classifyVariants(req.scope, [line.variant_id ?? ""]))) {
      res.status(400).json({ message: "Only personalised items can be modified in the designer." });
      return;
    }
  }

  const { price, metadata } = buildTrustedLineMetadata(product, config);

  if (replace_line_id) {
    await deleteLineItemsWorkflow(req.scope).run({ input: { cart_id, ids: [replace_line_id] } });
  }

  await addToCartWorkflow(req.scope).run({
    input: {
      cart_id,
      items: [{ variant_id: variantId, quantity: 1, unit_price: price.total, metadata: { ...metadata, line_ref: newLineRef() } }],
    },
  });

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "total", "subtotal", "currency_code", "items.*"],
    filters: { id: cart_id },
  });
  res.json({ cart: carts[0] });
}
