import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { isStage } from "@jemsutra/design-engine";
import { setStage } from "../../../../../../lib/production";

type Body = { stage: string; note?: string; courier?: string; tracking_number?: string };

/**
 * POST /admin/production/orders/:id/stage
 * Moves the order to the next workshop stage (one step at a time) and emails the customer.
 * "shipped" requires courier + tracking number; "delivered" captures the cash-on-delivery payment.
 */
export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const { stage, note, courier, tracking_number } = req.body ?? ({} as Body);
  if (!isStage(stage)) {
    res.status(400).json({ message: "Unknown stage" });
    return;
  }
  try {
    const production = await setStage(req.scope, req.params.id, stage, {
      by: req.auth_context?.actor_id,
      note: note?.trim() || undefined,
      courier: courier?.trim() || undefined,
      tracking_number: tracking_number?.trim() || undefined,
    });
    res.json({ production });
  } catch (e) {
    res.status(400).json({ message: (e as Error).message });
  }
}
