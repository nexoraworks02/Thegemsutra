/**
 * Store cart route guards (M2.2). First line of defence for the policy in src/lib/cart-security.ts;
 * the workflow hooks in src/workflows/hooks/cart-security.ts enforce the same rules again inside
 * Medusa's workflows, and checkout re-verifies every personalised line.
 *
 * Guards read the raw JSON body, so they do not depend on running before or after Medusa's own
 * request validators. A rejected request never reaches the route handler.
 */
import { defineMiddlewares, type MedusaNextFunction, type MedusaRequest, type MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  CART_METADATA_ALLOWLIST,
  CartPolicyError,
  PERSONALISED_MAX_QUANTITY,
  STANDARD_LINE_METADATA_ALLOWLIST,
  classifyVariants,
  lineIsPersonalised,
  metadataProblems,
} from "../lib/cart-security";

type Body = Record<string, unknown>;
type Guard = (req: MedusaRequest, res: MedusaResponse) => Promise<void>;

/** Wrap a guard: CartPolicyError -> JSON error response; anything else -> fail closed (500). */
const guard = (fn: Guard) => async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  try {
    await fn(req, res);
    next();
  } catch (e) {
    if (e instanceof CartPolicyError) {
      res.status(e.status).json({ type: e.status === 404 ? "not_found" : "not_allowed", message: e.message });
      return;
    }
    res.status(500).json({ type: "unexpected_state", message: "Cart request could not be checked." });
  }
};

const body = (req: MedusaRequest): Body => (typeof req.body === "object" && req.body !== null && !Array.isArray(req.body) ? (req.body as Body) : {});

const PERSONALISED_MESSAGE = "Personalised jewelry can only be added through the designer.";

async function assertStandardItems(req: MedusaRequest, items: unknown) {
  if (items === undefined) return;
  if (!Array.isArray(items)) throw new CartPolicyError("items must be a list.");
  const list = items as Body[];
  const classes = await classifyVariants(req.scope, list.map((i) => String(i?.variant_id ?? "")));
  for (const item of list) {
    const c = classes.get(String(item?.variant_id ?? ""));
    if (!c?.exists) throw new CartPolicyError("Unknown product variant.");
    if (c.personalised) throw new CartPolicyError(PERSONALISED_MESSAGE);
    const p = metadataProblems(item.metadata, STANDARD_LINE_METADATA_ALLOWLIST, "Line item");
    if (p) throw new CartPolicyError(p);
  }
}

async function loadCartItems(req: MedusaRequest, cartId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: ["id", "completed_at", "items.id", "items.variant_id", "items.quantity", "items.metadata"], filters: { id: cartId } });
  const cart = data[0] as { id: string; completed_at?: string | null; items?: { id: string; variant_id?: string | null; quantity: number; metadata?: unknown }[] } | undefined;
  if (!cart) throw new CartPolicyError("Cart not found.", 404);
  return cart;
}

/** POST /store/carts - no personalised items, no client metadata on items or cart. */
const createCart = guard(async (req) => {
  const b = body(req);
  const p = metadataProblems(b.metadata, CART_METADATA_ALLOWLIST, "Cart");
  if (p) throw new CartPolicyError(p);
  await assertStandardItems(req, b.items);
});

/** POST /store/carts/:id - no client cart metadata (it is copied onto the order). */
const updateCart = guard(async (req) => {
  const p = metadataProblems(body(req).metadata, CART_METADATA_ALLOWLIST, "Cart");
  if (p) throw new CartPolicyError(p);
});

/** POST /store/carts/:id/line-items - standard variants only, allowlisted metadata only. */
const addLineItem = guard(async (req) => {
  const b = body(req);
  await assertStandardItems(req, [{ variant_id: b.variant_id, metadata: b.metadata }]);
});

/** POST /store/carts/:id/line-items/:line_id - the line must be in this cart; personalised lines are locked. */
const updateLineItem = guard(async (req) => {
  const cart = await loadCartItems(req, req.params.id);
  const line = cart.items?.find((i) => i.id === req.params.line_id);
  if (!line) throw new CartPolicyError("Line item not found in this cart.", 404);
  const b = body(req);
  const classes = await classifyVariants(req.scope, [line.variant_id ?? ""]);
  if (lineIsPersonalised(line, classes)) {
    if (b.metadata !== undefined) throw new CartPolicyError("Personalised items can only be changed through the designer.");
    const q = Number(b.quantity);
    if (!(q === 0 || (q === Number(line.quantity) && q <= PERSONALISED_MAX_QUANTITY))) {
      throw new CartPolicyError("The quantity of a personalised item can't be changed; remove it or add another from the designer.");
    }
    return;
  }
  const p = metadataProblems(b.metadata, STANDARD_LINE_METADATA_ALLOWLIST, "Line item");
  if (p) throw new CartPolicyError(p);
});

/** DELETE /store/carts/:id/line-items/:line_id - the line must belong to this cart. */
const deleteLineItem = guard(async (req) => {
  const cart = await loadCartItems(req, req.params.id);
  if (!cart.items?.some((i) => i.id === req.params.line_id)) throw new CartPolicyError("Line item not found in this cart.", 404);
});

export default defineMiddlewares({
  routes: [
    { matcher: "/store/carts", method: ["POST"], middlewares: [createCart] },
    { matcher: "/store/carts/:id", method: ["POST"], middlewares: [updateCart] },
    { matcher: "/store/carts/:id/line-items", method: ["POST"], middlewares: [addLineItem] },
    { matcher: "/store/carts/:id/line-items/:line_id", method: ["POST"], middlewares: [updateLineItem] },
    { matcher: "/store/carts/:id/line-items/:line_id", method: ["DELETE"], middlewares: [deleteLineItem] },
  ],
});
