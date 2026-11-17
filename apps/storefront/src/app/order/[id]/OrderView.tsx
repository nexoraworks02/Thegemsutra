"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@jemsutra/design-engine";
import { store, type StoreOrder } from "@/lib/medusa";
import { CartLine } from "@/app/cart/CartView";

export function OrderView({ id }: { id: string }) {
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store<{ order: StoreOrder }>(`/store/orders/${encodeURIComponent(id)}?fields=*items,*shipping_address,*shipping_methods`)
      .then(({ order }) => setOrder(order))
      .catch(() => setError("We couldn't find this order."));
  }, [id]);

  if (error) {
    return (
      <div className="border border-line bg-paper p-10 text-center">
        <p className="text-muted">{error}</p>
        <Link href="/" className="mt-6 inline-block underline underline-offset-4">Back to the store</Link>
      </div>
    );
  }
  if (!order) return <div className="h-64 bg-sand animate-pulse rounded-sm" />;

  const a = order.shipping_address;
  return (
    <div>
      <p className="eyebrow text-gold-dark">Thank you</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">Your order is confirmed</h1>
      <p className="mt-3 text-muted">
        Order <span className="text-ink font-medium">#{order.display_id}</span> · A confirmation will be sent to {order.email}.
        Our artisans will start hand-making your piece now.
      </p>

      <ol className="mt-8 grid gap-3 sm:grid-cols-4 text-xs">
        {["Order placed", "Being hand-made (5-7 days)", "Quality check", "Out for delivery"].map((s, i) => (
          <li key={s} className={`border p-3 rounded-sm ${i === 0 ? "border-ink bg-paper" : "border-line text-muted"}`}>
            <span className="block font-serif text-lg text-gold">{String(i + 1).padStart(2, "0")}</span>
            {s}
          </li>
        ))}
      </ol>

      <ul className="mt-10 space-y-6">
        {order.items.map((i) => <CartLine key={i.id} line={i} />)}
      </ul>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <section className="border border-line bg-paper p-5 text-sm">
          <h2 className="eyebrow">Delivering to</h2>
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
          <h2 className="eyebrow">Payment</h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between"><dt>Items</dt><dd>{formatMoney(order.item_total)}</dd></div>
            <div className="flex justify-between"><dt>Delivery</dt><dd>{order.shipping_total ? formatMoney(order.shipping_total) : "Free"}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>Total due on delivery</dt><dd>{formatMoney(order.total)}</dd></div>
          </dl>
          <p className="mt-3 text-muted">Cash on delivery</p>
        </section>
      </div>

      <Link href="/#collection" className="mt-10 inline-block bg-ink text-ivory px-7 py-3.5 text-[13px] tracking-[0.16em] uppercase">
        Continue shopping
      </Link>
    </div>
  );
}
