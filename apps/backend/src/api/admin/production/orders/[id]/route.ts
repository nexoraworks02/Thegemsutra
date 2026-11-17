import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { COURIERS, PRODUCTION_STAGES, STAGE_INFO, nextStage } from "@jemsutra/design-engine";
import { loadOrder, productionOf } from "../../../../../lib/production";

/** GET /admin/production/orders/:id - production state for the order widget. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const order = await loadOrder(req.scope, req.params.id);
  if (!order) {
    res.status(404).json({ message: "Order not found" });
    return;
  }
  const production = productionOf(order);
  const next = order.status === "canceled" ? null : nextStage(production.stage);
  res.json({
    production,
    next_stage: next,
    stages: PRODUCTION_STAGES.map((s) => ({ value: s, label: STAGE_INFO[s].label })),
    couriers: COURIERS,
  });
}
