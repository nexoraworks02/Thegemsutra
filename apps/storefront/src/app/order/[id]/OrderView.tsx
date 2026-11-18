"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRODUCTION_STAGES, STAGE_INFO, formatMoney, readProduction, type ProductionState } from "@jemsutra/design-engine";
import { store, type StoreOrder } from "@/lib/medusa";
import { CartLine } from "@/app/cart/CartView";

export function OrderView({ id }: { id: string }) {
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [tracking, setTracking] = useState<ProductionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oid = encodeURIComponent(id);
    Promise.all([
      store<{ order: StoreOrder }>(`/store/orders/${oid}?fields=*items,*shipping_address,*shipping_methods`),
      store<{ tracking: ProductionState }>(`/store/order-tracking/${oid}`).catch(() => null),
    ])
      .then(([{ order }, t]) => {
        setOrder(order);
        setTracking(t?.tracking ?? null);
      })
      .catch(() => setError("We couldn't find this order."));
  }, [id]);

  if (error) {
    return (
      <div className="border border-line bg-paper p-10 text-center">
        <p className="text-muted">{error}</p>
        <Link href="/" className="mt-6 inline-block text-rose-deep underline underline-offset-4 hover:text-ink">Back to the store</Link>
      </div>
    );
  }
  if (!order) return <div className="h-64 bg-sand animate-pulse rounded-sm" />;

  const a = order.shipping_address;
  const prod = tracking ?? readProduction(null, order.created_at);
  const paid = prod.stage === "delivered";
  return (
    <div>
      <p className="eyebrow text-rose-deep">Order #{order.display_id}</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">{prod.stage === "placed" ? "Your order is confirmed" : STAGE_INFO[prod.stage].customerTitle}</h1>
      <p className="mt-3 text-muted">
        Updates are sent to {order.email}. Bookmark this page to follow your order.
      </p>

      <section className="mt-8 border border-line bg-paper shadow-soft p-5" aria-label="Order progress">
        <p className="eyebrow text-rose-deep">{STAGE_INFO[prod.stage].label}</p>
        <p className="mt-1 font-serif text-xl">{STAGE_INFO[prod.stage].customerTitle}</p>
        <p className="mt-1 text-sm text-muted">{STAGE_INFO[prod.stage].customerMessage}</p>
        {prod.stage === "shipped" && prod.tracking_number && (
          <p className="mt-3 text-sm">Courier: <b>{prod.courier}</b> · Tracking number: <b>{prod.tracking_number}</b></p>
        )}
        {prod.due_date && ["placed", "in_production", "quality_check"].includes(prod.stage) && (
          <p className="mt-3 text-sm">Expected to ship by <b>{new Date(`${prod.due_date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</b></p>
        )}
        <ol className="mt-5 grid gap-3 sm:grid-cols-5 text-xs">
          {PRODUCTION_STAGES.map((s, i) => {
            const h = prod.history.find((x) => x.stage === s);
            const current = s === prod.stage;
            return (
              <li key={s} className={`border p-3 rounded-sm ${current ? "border-ink bg-blush-tint shadow-[inset_0_0_0_1px_var(--ink)]" : h ? "border-line" : "border-line text-muted"}`}>
                <span className={`block font-serif text-lg ${h ? "text-rose-deep" : "text-muted"}`}>{h ? "✓" : String(i + 1).padStart(2, "0")}</span>
                {STAGE_INFO[s].label}
                {h && <span className="block mt-1 text-[10px] text-muted">{new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <ul className="mt-10 space-y-6">
        {order.items.map((i) => <CartLine key={i.id} line={i} />)}
      </ul>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section className="border border-line bg-paper p-5 text-sm">
          <h2 className="eyebrow text-rose-deep">Delivering to</h2>
          {a && (
            <p className="mt-3 leading-relaxed">
              {a.first_name} {a.last_name}<br />
              {a.address_1}{a.address_2 ? `, ${a.address_2}` : ""}<br />
              {a.city}, {a.province}{a.postal_code ? ` ${a.postal_code}` : ""}<br />
              {a.phone}
            </p>
          )}
          <p className="mt-3 text-muted">{order.shipping_methods?.[0]?.name}</p>
        </section>
        <section className="border border-line bg-paper p-5 text-sm">
          <h2 className="eyebrow text-rose-deep">Payment</h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between"><dt>Items</dt><dd>{formatMoney(order.item_total)}</dd></div>
            <div className="flex justify-between"><dt>Delivery</dt><dd>{order.shipping_total ? formatMoney(order.shipping_total) : "Free"}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>{paid ? "Total paid" : "Total due on delivery"}</dt><dd>{formatMoney(order.total)}</dd></div>
          </dl>
          <p className="mt-3 text-muted">Cash on delivery{paid ? " · received" : ""}</p>
        </section>
      </div>

      <Link href="/#collection" className="btn-primary mt-10 px-7 py-3.5">
        Continue shopping
      </Link>
    </div>
  );
}
