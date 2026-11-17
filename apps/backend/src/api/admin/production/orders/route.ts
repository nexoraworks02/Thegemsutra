import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STAGE_INFO } from "@jemsutra/design-engine";
import { listOrders, productionOf } from "../../../../lib/production";

/**
 * GET /admin/production/orders
 * The workshop queue: every open order with its stage and ship-by date.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const orders = await listOrders(req.scope);
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    orders: orders.map((o) => {
      const p = productionOf(o);
      return {
        id: o.id,
        display_id: o.display_id,
        created_at: o.created_at,
        email: o.email,
        customer: [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(" "),
        city: o.shipping_address?.city ?? "",
        delivery: o.shipping_methods?.[0]?.name ?? "",
        total: o.total,
        stage: p.stage,
        stage_label: STAGE_INFO[p.stage].label,
        due_date: p.due_date ?? null,
        overdue: !!p.due_date && p.due_date < today && ["placed", "in_production", "quality_check"].includes(p.stage),
        items: (o.items ?? []).map((i) => ({
          title: i.product_title ?? i.title,
          variant_title: i.variant_title,
          quantity: i.quantity,
          image_url: (i.metadata as { image_url?: string } | null)?.image_url ?? null,
        })),
      };
    }),
  });
}
