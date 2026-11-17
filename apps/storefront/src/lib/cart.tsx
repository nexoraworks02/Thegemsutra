"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DesignConfig } from "@jemsutra/design-engine";
import { store, type StoreCart } from "./medusa";

/**
 * Bag backed by the Medusa cart. The browser only keeps the cart id.
 * Designs are added through POST /store/designs/:style/cart-items, which
 * prices them on the server (the browser never sets a price).
 */
const CART_KEY = "jemsutra:cart_id";
const LEGACY_KEY = "jemsutra:cart:v1"; // old browser-only bag, migrated once

interface CartState {
  cart: StoreCart | null;
  ready: boolean;
  count: number;
  addDesign: (styleCode: string, config: DesignConfig, replaceLineId?: string) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  /** Re-load from the server (after checkout steps) */
  refresh: () => Promise<StoreCart | null>;
  /** Forget the cart after an order is placed */
  reset: () => void;
}

const CartContext = createContext<CartState | null>(null);

function readId(): string | null {
  try {
    return localStorage.getItem(CART_KEY);
  } catch {
    return null;
  }
}
function writeId(id: string | null) {
  try {
    if (id) localStorage.setItem(CART_KEY, id);
    else localStorage.removeItem(CART_KEY);
  } catch {
    /* ignore */
  }
}

async function fetchCart(id: string): Promise<StoreCart | null> {
  try {
    const { cart } = await store<{ cart: StoreCart }>(`/store/carts/${id}`);
    return cart.completed_at ? null : cart;
  } catch {
    return null;
  }
}

async function createCart(): Promise<StoreCart> {
  const { regions } = await store<{ regions: { id: string; countries?: { iso_2: string }[] }[] }>("/store/regions");
  const region = regions.find((r) => r.countries?.some((c) => c.iso_2 === "pk")) ?? regions[0];
  const { cart } = await store<{ cart: StoreCart }>("/store/carts", { body: { region_id: region?.id } });
  writeId(cart.id);
  return cart;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<StoreCart | null>(null);
  const [ready, setReady] = useState(false);
  const creating = useRef<Promise<StoreCart> | null>(null);

  const ensureCart = useCallback(async (): Promise<StoreCart> => {
    if (cart) return cart;
    const id = readId();
    const existing = id ? await fetchCart(id) : null;
    if (existing) return existing;
    creating.current ??= createCart().finally(() => (creating.current = null));
    return creating.current;
  }, [cart]);

  const refresh = useCallback(async () => {
    const id = readId();
    const c = id ? await fetchCart(id) : null;
    setCart(c);
    return c;
  }, []);

  const addDesign = useCallback(
    async (styleCode: string, config: DesignConfig, replaceLineId?: string) => {
      const c = await ensureCart();
      const { cart: updated } = await store<{ cart: StoreCart }>(`/store/designs/${styleCode}/cart-items`, {
        body: { cart_id: c.id, config, replace_line_id: replaceLineId },
      });
      // Re-fetch for full totals (the custom route returns a lighter cart).
      setCart((await fetchCart(updated.id)) ?? updated);
    },
    [ensureCart],
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      if (!cart) return;
      await store(`/store/carts/${cart.id}/line-items/${lineId}`, { method: "DELETE" });
      setCart(await fetchCart(cart.id));
    },
    [cart],
  );

  const reset = useCallback(() => {
    writeId(null);
    setCart(null);
  }, []);

  // Load the existing cart, migrating any old browser-only bag once.
  useEffect(() => {
    (async () => {
      let c = await refresh();
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as { styleCode: string; config: DesignConfig }[];
        if (legacy.length) {
          localStorage.removeItem(LEGACY_KEY);
          c ??= await createCart();
          for (const line of legacy) {
            await store(`/store/designs/${line.styleCode}/cart-items`, { body: { cart_id: c.id, config: line.config } }).catch(() => {});
          }
          await refresh();
        }
      } catch {
        /* ignore broken legacy data */
      }
      setReady(true);
    })();
  }, [refresh]);

  const value = useMemo<CartState>(
    () => ({
      cart,
      ready,
      count: cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0,
      addDesign,
      removeLine,
      refresh,
      reset,
    }),
    [cart, ready, addDesign, removeLine, refresh, reset],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
