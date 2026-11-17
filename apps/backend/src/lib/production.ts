import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";
import {
  advance,
  dueDate,
  readProduction,
  type ProductionStage,
  type ProductionState,
} from "@jemsutra/design-engine";
import { renderStageEmail } from "./order-emails";

export const STAGE_CHANGED_EVENT = "production.stage_changed";

export interface ProductionOrder {
  id: string;
  display_id: number;
  email: string;
  created_at: string | Date;
  status: string;
  currency_code: string;
  metadata: Record<string, unknown> | null;
  total: number;
  item_total: number;
  shipping_total: number;
  shipping_address?: { first_name?: string; last_name?: string; phone?: string; address_1?: string; address_2?: string; city?: string; province?: string; postal_code?: string } | null;
  shipping_methods?: { name: string }[];
  items?: { id: string; title: string; product_title?: string; variant_title?: string; quantity: number; unit_price: number; metadata?: Record<string, unknown> | null }[];
  payment_collections?: { payments?: { id: string; captured_at?: string | null; amount: number }[] }[];
}

const ORDER_FIELDS = [
  "id", "display_id", "email", "created_at", "status", "currency_code", "metadata",
  "total", "item_total", "shipping_total",
  "shipping_address.*", "shipping_methods.name",
  "items.id", "items.title", "items.product_title", "items.variant_title", "items.quantity", "items.unit_price", "items.metadata",
  "payment_collections.payments.id", "payment_collections.payments.captured_at", "payment_collections.payments.amount",
];

export async function loadOrder(container: MedusaContainer, id: string): Promise<ProductionOrder | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id } });
  return (data[0] as unknown as ProductionOrder) ?? null;
}

export async function listOrders(container: MedusaContainer, limit = 100): Promise<ProductionOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { status: { $nin: ["canceled", "archived", "draft"] } },
    pagination: { take: limit, order: { created_at: "DESC" } },
  });
  return data as unknown as ProductionOrder[];
}

export function productionOf(order: ProductionOrder): ProductionState {
  return readProduction(order.metadata, order.created_at);
}

async function saveProduction(container: MedusaContainer, order: ProductionOrder, production: ProductionState) {
  const orderService = container.resolve(Modules.ORDER);
  await orderService.updateOrders(order.id, { metadata: { ...(order.metadata ?? {}), production } });
}

/** Called once when an order is placed: record stage + promised ship-by date. */
export async function initProduction(container: MedusaContainer, orderId: string) {
  const order = await loadOrder(container, orderId);
  if (!order || (order.metadata as { production?: unknown } | null)?.production) return order;
  const production: ProductionState = {
    stage: "placed",
    history: [{ stage: "placed", at: new Date(order.created_at).toISOString() }],
    due_date: dueDate(order.created_at),
  };
  await saveProduction(container, order, production);
  return { ...order, metadata: { ...(order.metadata ?? {}), production } };
}

/** Move an order to the next workshop stage, then notify the customer. */
export async function setStage(
  container: MedusaContainer,
  orderId: string,
  next: ProductionStage,
  info: { by?: string; note?: string; courier?: string; tracking_number?: string },
): Promise<ProductionState> {
  const order = await loadOrder(container, orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "canceled") throw new Error("This order is canceled");

  const updated = advance(productionOf(order), next, info);
  await saveProduction(container, order, updated);

  // Cash on delivery: the rider collected the money, so mark the payment as captured.
  if (next === "delivered") {
    for (const pc of order.payment_collections ?? []) {
      for (const p of pc.payments ?? []) {
        if (!p.captured_at) {
          await capturePaymentWorkflow(container).run({ input: { payment_id: p.id, captured_by: info.by } });
        }
      }
    }
  }

  const eventBus = container.resolve(Modules.EVENT_BUS);
  await eventBus.emit({ name: STAGE_CHANGED_EVENT, data: { id: orderId, stage: next } });
  return updated;
}

/** Send the customer email for the order's current stage. */
export async function sendStageEmail(container: MedusaContainer, orderId: string) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const order = await loadOrder(container, orderId);
  if (!order?.email) return;
  const prod = productionOf(order);
  const { subject, html } = renderStageEmail(order, prod.stage, prod);
  try {
    const notifications = container.resolve(Modules.NOTIFICATION);
    await notifications.createNotifications({
      to: order.email,
      channel: "email",
      template: `order-${prod.stage}`,
      data: { order_id: order.id, stage: prod.stage },
      content: { subject, html },
    });
  } catch (e) {
    // An email problem must never block the workshop flow.
    logger.error(`Failed to send "${subject}" to ${order.email}: ${(e as Error).message}`);
  }
}
