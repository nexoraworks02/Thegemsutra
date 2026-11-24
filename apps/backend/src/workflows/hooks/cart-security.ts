/**
 * Workflow-level enforcement of the cart security policy (src/lib/cart-security.ts).
 *
 * These hooks run INSIDE Medusa's cart workflows, so they apply whichever route or code path
 * starts the workflow, not only the store routes guarded in src/api/middlewares.ts:
 * - addToCart:     personalised variants only with a server-set price AND server-built metadata
 *                  (i.e. only the designer route); standard items only with allowlisted metadata.
 * - updateLineItem: personalised lines: no metadata changes, quantity only removal.
 * - createCart / updateCart: no reserved (server-owned) metadata keys.
 * - completeCart:  final integrity check of every line, run after Medusa has taken the cart
 *                  lock and loaded the cart, immediately before the order is created. Any problem
 *                  aborts the workflow: no order is created and nothing is silently corrected.
 */
import { completeCartWorkflow, addToCartWorkflow, createCartWorkflow, updateCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  PERSONALISED_MAX_QUANTITY,
  STANDARD_LINE_METADATA_ALLOWLIST,
  classifyVariants,
  lineIsPersonalised,
  metadataProblems,
  reservedKeys,
  verifyPersonalisedLine,
} from "../../lib/cart-security";

const refuse = (message: string): never => {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message);
};

type Item = { variant_id?: string; quantity?: number; unit_price?: number | string | null; metadata?: Record<string, unknown> | null };

addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = ((input as { items?: Item[] }).items ?? []) as Item[];
  const classes = await classifyVariants(container, items.map((i) => i.variant_id ?? ""));
  for (const item of items) {
    const c = classes.get(item.variant_id ?? "");
    if (c?.personalised) {
      // Only the designer route sets a price and the full trusted metadata; verify them now.
      if (item.unit_price === undefined || item.unit_price === null) refuse("Personalised jewelry can only be added through the designer.");
      const problems = await verifyPersonalisedLine(container, { variant_id: item.variant_id, quantity: item.quantity ?? 1, unit_price: item.unit_price!, metadata: item.metadata });
      if (problems.length) refuse(`Personalised item rejected: ${problems.join("; ")}.`);
    } else {
      const p = metadataProblems(item.metadata, STANDARD_LINE_METADATA_ALLOWLIST, "Line item");
      if (p) refuse(p);
    }
  }
});

updateLineItemInCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const { item_id, update } = input as { item_id: string; update?: { quantity?: number; metadata?: unknown } };
  const line = (cart as { items?: { id: string; variant_id?: string | null; quantity: number; metadata?: unknown }[] }).items?.find((i) => i.id === item_id);
  if (!line) refuse("Line item not found in this cart.");
  const classes = await classifyVariants(container, [line!.variant_id ?? ""]);
  if (lineIsPersonalised(line!, classes)) {
    if (update?.metadata !== undefined) refuse("Personalised items can only be changed through the designer.");
    const q = Number(update?.quantity);
    if (!(q === 0 || (q === Number(line!.quantity) && q <= PERSONALISED_MAX_QUANTITY))) refuse("The quantity of a personalised item can't be changed.");
  } else {
    const p = metadataProblems(update?.metadata, STANDARD_LINE_METADATA_ALLOWLIST, "Line item");
    if (p) refuse(p);
  }
});

createCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const i = input as { metadata?: unknown; items?: Item[] };
  if (reservedKeys(i.metadata).length) refuse(`Cart metadata "${reservedKeys(i.metadata)[0]}" is reserved.`);
  const classes = await classifyVariants(container, (i.items ?? []).map((x) => x.variant_id ?? ""));
  for (const item of i.items ?? []) {
    if (classes.get(item.variant_id ?? "")?.personalised) refuse("Personalised jewelry can only be added through the designer.");
    const p = metadataProblems(item.metadata, STANDARD_LINE_METADATA_ALLOWLIST, "Line item");
    if (p) refuse(p);
  }
});

updateCartWorkflow.hooks.validate(async ({ input }) => {
  const keys = reservedKeys((input as { metadata?: unknown }).metadata);
  if (keys.length) refuse(`Cart metadata "${keys[0]}" is reserved.`);
});

completeCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  // Re-read inside the workflow (after Medusa acquired the cart lock) with every field we need.
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "metadata", "items.id", "items.variant_id", "items.quantity", "items.unit_price", "items.metadata"],
    filters: { id: (input as { id: string }).id },
  });
  const cart = data[0] as { id: string; metadata?: unknown; items?: { id: string; variant_id?: string | null; quantity: number; unit_price: number; metadata?: unknown }[] } | undefined;
  if (!cart) refuse("Cart not found.");
  if (reservedKeys(cart!.metadata).length) refuse("Cart contains server-only metadata; checkout refused.");
  const items = cart!.items ?? [];
  const classes = await classifyVariants(container, items.map((i) => i.variant_id ?? ""));
  const problems: string[] = [];
  for (const item of items) {
    if (lineIsPersonalised(item, classes)) {
      const p = await verifyPersonalisedLine(container, item);
      if (p.length) problems.push(`${item.id}: ${p.join("; ")}`);
    } else {
      const p = metadataProblems(item.metadata, STANDARD_LINE_METADATA_ALLOWLIST, "Line item");
      if (p) problems.push(`${item.id}: ${p}`);
    }
  }
  if (problems.length) refuse(`Checkout refused - please remove and re-add these items: ${problems.join(" | ")}`);
});
