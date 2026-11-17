/**
 * Workshop production flow for made-to-order pieces.
 * Stored on the Medusa order as metadata.production = { stage, history[], courier?, tracking? }.
 * Shared by the backend (admin + emails) and the storefront (order tracking).
 */
export const PRODUCTION_STAGES = ["placed", "in_production", "quality_check", "shipped", "delivered"] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export interface StageInfo {
  label: string; // admin + tracker label
  customerTitle: string; // email subject line part / tracker headline
  customerMessage: string; // one or two friendly sentences
}

export const STAGE_INFO: Record<ProductionStage, StageInfo> = {
  placed: {
    label: "Order placed",
    customerTitle: "We've received your order",
    customerMessage: "Thank you! Your design has been sent to our workshop. We'll let you know as soon as our artisans start making it.",
  },
  in_production: {
    label: "Being hand-made",
    customerTitle: "Your piece is being hand-made",
    customerMessage: "Our artisans have started crafting your jewelry - casting the metal, setting your stones and engraving your words.",
  },
  quality_check: {
    label: "Quality check",
    customerTitle: "Your piece is in quality check",
    customerMessage: "Your jewelry is finished and is now being polished and inspected, so it arrives exactly as you designed it.",
  },
  shipped: {
    label: "Out for delivery",
    customerTitle: "Your order is on its way",
    customerMessage: "Your jewelry has been handed to our courier. Please keep your phone nearby - the rider will call before delivery.",
  },
  delivered: {
    label: "Delivered",
    customerTitle: "Your order has been delivered",
    customerMessage: "We hope you love it! If anything isn't perfect, you have 30 days to return it and free resizing within 30 days.",
  },
};

export const COURIERS = ["TCS", "Leopards", "M&P", "PostEx", "Trax", "Pakistan Post", "Other"] as const;

export interface ProductionHistoryEntry {
  stage: ProductionStage;
  at: string; // ISO timestamp
  by?: string; // admin user id
  note?: string;
}

export interface ProductionState {
  stage: ProductionStage;
  history: ProductionHistoryEntry[];
  courier?: string;
  tracking_number?: string;
  /** Promised ship-by date (ISO date) */
  due_date?: string;
}

export function isStage(v: unknown): v is ProductionStage {
  return typeof v === "string" && (PRODUCTION_STAGES as readonly string[]).includes(v);
}

/** Read production state from order metadata; orders without it are "placed". */
export function readProduction(metadata: Record<string, unknown> | null | undefined, placedAt?: string | Date): ProductionState {
  const raw = (metadata?.production ?? null) as Partial<ProductionState> | null;
  if (raw && isStage(raw.stage)) {
    return { history: [], ...raw, stage: raw.stage } as ProductionState;
  }
  const at = placedAt ? new Date(placedAt).toISOString() : new Date(0).toISOString();
  return { stage: "placed", history: [{ stage: "placed", at }], due_date: placedAt ? dueDate(placedAt) : undefined };
}

/** Stages must move forward one step at a time (or stay); no skipping, no going back. */
export function canMoveTo(current: ProductionStage, next: ProductionStage): boolean {
  return PRODUCTION_STAGES.indexOf(next) === PRODUCTION_STAGES.indexOf(current) + 1;
}

export function nextStage(current: ProductionStage): ProductionStage | null {
  return PRODUCTION_STAGES[PRODUCTION_STAGES.indexOf(current) + 1] ?? null;
}

/** Apply a stage change, returning the new state (pure function). */
export function advance(
  state: ProductionState,
  next: ProductionStage,
  info: { by?: string; note?: string; courier?: string; tracking_number?: string; at?: Date } = {},
): ProductionState {
  if (!canMoveTo(state.stage, next)) {
    throw new Error(`Cannot move from "${state.stage}" to "${next}"`);
  }
  if (next === "shipped" && (!info.courier || !info.tracking_number)) {
    throw new Error("Courier and tracking number are required to mark an order as shipped");
  }
  return {
    ...state,
    stage: next,
    courier: info.courier ?? state.courier,
    tracking_number: info.tracking_number ?? state.tracking_number,
    history: [...state.history, { stage: next, at: (info.at ?? new Date()).toISOString(), by: info.by, note: info.note }],
  };
}

/**
 * Promised ship-by date: 7 working days after the order (Sundays are off).
 * Returned as YYYY-MM-DD.
 */
export function dueDate(placedAt: string | Date, workingDays = 7): string {
  const d = new Date(placedAt);
  let added = 0;
  while (added < workingDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) added++;
  }
  return d.toISOString().slice(0, 10);
}
