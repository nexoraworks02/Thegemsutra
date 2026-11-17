import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { STAGE_CHANGED_EVENT, sendStageEmail } from "../lib/production";

/** Workshop moved an order to a new stage: email the customer. */
export default async function productionStageChangedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await sendStageEmail(container, event.data.id);
}

export const config: SubscriberConfig = { event: STAGE_CHANGED_EVENT };
