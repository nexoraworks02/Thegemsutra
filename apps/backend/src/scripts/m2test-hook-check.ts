/**
 * M2 TEST ENVIRONMENT ONLY - proves the workflow-level cart security hooks on their own, by
 * calling Medusa's cart workflows directly (no HTTP route, so no request middleware involved).
 * Run through: npm run m2test -- hooks      (refuses to run outside jemsutra_m2test)
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { addToCartWorkflow, createCartWorkflow, updateCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows";
import { normalizeConfig } from "@jemsutra/design-engine";
import { getDesign } from "../lib/designs";
import { buildTrustedLineMetadata, newLineRef } from "../lib/cart-security";
import { assertM2TestDatabase } from "../lib/m2test-guard";

export default async function hookCheck({ container }: ExecArgs) {
  await assertM2TestDatabase();
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: regions } = await query.graph({ entity: "region", fields: ["id"] });
  const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id", "sku"] });
  const vid = (sku: string) => (variants as { id: string; sku: string }[]).find((v) => v.sku === sku)!.id;
  const def = (await getDesign(container, "JS0001", { publishedOnly: true }))!.definition;
  const config = normalizeConfig(def, { metal: "SS", stones: { s1: "S-RUBY" }, size: 8 });
  const trusted = buildTrustedLineMetadata(def, config);

  let pass = 0;
  let fail = 0;
  const expectRefused = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      fail++;
      console.log(`FAIL  ${label} - was ACCEPTED`);
    } catch (e) {
      pass++;
      console.log(`PASS  ${label} - refused: ${String((e as Error).message).slice(0, 110)}`);
    }
  };
  const expectAccepted = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${label} - accepted`);
    } catch (e) {
      fail++;
      console.log(`FAIL  ${label} - refused: ${(e as Error).message}`);
    }
  };
  const newCart = async (extra: Record<string, unknown> = {}) =>
    (await createCartWorkflow(container).run({ input: { region_id: regions[0].id, ...extra } })).result.id;

  await expectRefused("createCart with reserved cart metadata (production)", () => newCart({ metadata: { production: { stage: "shipped" } } }));
  await expectRefused("createCart with a personalised variant", () => newCart({ items: [{ variant_id: vid("JS0003"), quantity: 1 }] }));

  const cart = await newCart();
  await expectRefused("updateCart with reserved cart metadata", () => updateCartWorkflow(container).run({ input: { id: cart, metadata: { production: { stage: "delivered" } } } }));
  await expectRefused("addToCart personalised variant without a server price", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("JS0001"), quantity: 1 }] } }));
  await expectRefused("addToCart legacy-style personalised variant", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("JS0001-14KR"), quantity: 1 }] } }));
  await expectRefused("addToCart personalised with a server-looking price but wrong amount", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("JS0001"), quantity: 1, unit_price: 100, metadata: { ...trusted.metadata, line_ref: newLineRef() } }] } }));
  await expectRefused("addToCart personalised with forged engraving", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("JS0001"), quantity: 1, unit_price: trusted.price.total, metadata: { ...trusted.metadata, engraving_lines: [["Name 1", "FORGED"]], line_ref: newLineRef() } }] } }));
  await expectRefused("addToCart standard item with trusted metadata", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("M2TEST-STD-A"), quantity: 1, metadata: { design_summary: [] } }] } }));
  await expectAccepted("addToCart personalised exactly as the designer route builds it", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("JS0001"), quantity: 1, unit_price: trusted.price.total, metadata: { ...trusted.metadata, line_ref: newLineRef() } }] } }));
  await expectAccepted("addToCart standard item", () =>
    addToCartWorkflow(container).run({ input: { cart_id: cart, items: [{ variant_id: vid("M2TEST-STD-A"), quantity: 2 }] } }));

  const { data } = await query.graph({ entity: "cart", fields: ["items.id", "items.variant_id"], filters: { id: cart } });
  const items = (data[0] as { items: { id: string; variant_id: string }[] }).items;
  const pers = items.find((i) => i.variant_id === vid("JS0001"))!;
  const std = items.find((i) => i.variant_id === vid("M2TEST-STD-A"))!;
  await expectRefused("updateLineItem personalised metadata change", () =>
    updateLineItemInCartWorkflow(container).run({ input: { cart_id: cart, item_id: pers.id, update: { quantity: 1, metadata: { design: { ...config, metal: "14KY" } } } } }));
  await expectRefused("updateLineItem personalised quantity 4", () =>
    updateLineItemInCartWorkflow(container).run({ input: { cart_id: cart, item_id: pers.id, update: { quantity: 4 } } }));
  await expectAccepted("updateLineItem standard quantity 5", () =>
    updateLineItemInCartWorkflow(container).run({ input: { cart_id: cart, item_id: std.id, update: { quantity: 5 } } }));

  console.log(`\nWorkflow hook checks: ${pass} passed, ${fail} failed`);
  if (fail) throw new Error("hook checks failed");
}
