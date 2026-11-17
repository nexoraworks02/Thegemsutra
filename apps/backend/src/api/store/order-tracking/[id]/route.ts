import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { loadOrder, productionOf } from "../../../../lib/production";

/**
 * GET /store/order-tracking/:id
 * Public order progress for the customer's order page. Only customer-safe
 * fields are returned - internal workshop notes and staff ids stay private.
 * (Order ids are long random strings, the same protection as Medusa's own
 * guest order lookup.)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const order = await loadOrder(req.scope, req.params.id);
  if (!order) {
    res.status(404).json({ message: "Order not found" });
    return;
  }
  const p = productionOf(order);
  res.json({
    tracking: {
      stage: p.stage,
      due_date: p.due_date ?? null,
      courier: p.stage === "shipped" || p.stage === "delivered" ? p.courier ?? null : null,
      tracking_number: p.stage === "shipped" || p.stage === "delivered" ? p.tracking_number ?? null : null,
      history: p.history.map((h) => ({ stage: h.stage, at: h.at })),
      canceled: order.status === "canceled",
    },
  });
}
