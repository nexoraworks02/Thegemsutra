import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { initProduction, sendStageEmail } from "../lib/production";

/** New order: start the workshop flow and send the order confirmation email. */
export default async function orderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await initProduction(container, event.data.id);
  await sendStageEmail(container, event.data.id);
}

export const config: SubscriberConfig = { event: "order.placed" };
