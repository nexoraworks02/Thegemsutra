/**
 * Minimal client for the Medusa Store API.
 * The publishable key is public by design (it only identifies the sales channel).
 */
export const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_URL ?? "http://localhost:9000";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export class StoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function store<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${MEDUSA_URL}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", "x-publishable-api-key": PUBLISHABLE_KEY },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new StoreError(0, "We couldn't reach the store. Please check your connection and try again.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new StoreError(res.status, data?.message ?? `Request failed (${res.status})`);
  return data as T;
}

// ---- Types (only the fields we use) ----

export interface StoreAddress {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
}

export interface StoreLineItem {
  id: string;
  title: string;
  product_title?: string;
  variant_title?: string;
  quantity: number;
  unit_price: number;
  total?: number;
  thumbnail?: string | null;
  metadata?: {
    style_code?: string;
    design?: import("@jemsutra/design-engine").DesignConfig;
    design_summary?: [string, string][];
    image_url?: string;
    compare_at?: number | null;
  } | null;
}

export interface StoreCart {
  id: string;
  email?: string | null;
  currency_code: string;
  region_id?: string;
  items: StoreLineItem[];
  item_total?: number;
  shipping_total?: number;
  total: number;
  subtotal?: number;
  completed_at?: string | null;
  shipping_address?: StoreAddress | null;
  shipping_methods?: { id: string; name: string; amount: number; shipping_option_id: string }[];
}

export interface StoreShippingOption {
  id: string;
  name: string;
  amount: number;
  type?: { label?: string; description?: string; code?: string } | null;
}

export interface StoreOrder {
  id: string;
  display_id: number;
  email: string;
  created_at: string;
  currency_code: string;
  items: StoreLineItem[];
  item_total: number;
  shipping_total: number;
  total: number;
  shipping_address?: StoreAddress | null;
  shipping_methods?: { name: string; amount: number }[];
}
