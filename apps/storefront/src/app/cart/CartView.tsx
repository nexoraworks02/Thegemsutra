"use client";

import Link from "next/link";
import { useState } from "react";
import { PRODUCT_BY_STYLE, formatMoney } from "@jemsutra/design-engine";
import { useCart } from "@/lib/cart";
import { productPath } from "@/lib/media";
import type { StoreLineItem } from "@/lib/medusa";

export function CartView() {
  const { cart, ready, removeLine } = useCart();
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) {
    return <div className="mt-8 h-40 bg-sand animate-pulse rounded-sm" />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mt-10 border border-line bg-paper p-10 text-center">
        <p className="text-muted">Your bag is empty.</p>
        <Link href="/#collection" className="mt-6 inline-block bg-ink text-ivory px-7 py-3 text-[13px] tracking-[0.16em] uppercase">
          Start designing
        </Link>
      </div>
    );
  }

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await removeLine(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
      <ul className="space-y-6">
        {cart.items.map((line) => (
          <CartLine key={line.id} line={line} busy={busy === line.id} onRemove={() => remove(line.id)} />
        ))}
      </ul>

      <aside className="border border-line bg-paper p-5 h-fit lg:sticky lg:top-28">
        <h2 className="eyebrow">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(cart.item_total ?? cart.total)}</dd></div>
          <div className="flex justify-between"><dt>Delivery</dt><dd>Free (express available)</dd></div>
          <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>Total</dt><dd>{formatMoney(cart.item_total ?? cart.total)}</dd></div>
        </dl>
        <Link href="/checkout" className="mt-5 block text-center w-full bg-ink text-ivory py-3.5 text-[13px] tracking-[0.16em] uppercase hover:bg-gold-dark transition-colors">
          Checkout
        </Link>
        <p className="mt-3 text-xs text-muted">Cash on delivery · Free delivery across Pakistan</p>
      </aside>
    </div>
  );
}

export function CartLine({ line, busy, onRemove }: { line: StoreLineItem; busy?: boolean; onRemove?: () => void }) {
  const meta = line.metadata ?? {};
  const product = meta.style_code ? PRODUCT_BY_STYLE[meta.style_code] : undefined;
  const modifyHref = product && meta.design ? withParam(productPath(product, meta.design), "line", line.id) : null;

  return (
    <li className="grid grid-cols-[110px_1fr] sm:grid-cols-[180px_1fr] gap-5 border border-line bg-paper p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image service */}
      <img src={meta.image_url ?? line.thumbnail ?? ""} alt={line.product_title ?? line.title} className="w-full aspect-[4/3] object-cover border border-line bg-ivory" />
      <div>
        <div className="flex justify-between gap-4">
          <h2 className="font-serif text-lg">{line.product_title ?? line.title}</h2>
          <p className="font-medium whitespace-nowrap">{formatMoney(line.unit_price * line.quantity)}</p>
        </div>
        {meta.design_summary && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {meta.design_summary.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {onRemove && (
          <div className="mt-4 flex gap-5 text-sm">
            {modifyHref && <Link href={modifyHref} className="underline underline-offset-4">Modify item</Link>}
            <button type="button" onClick={onRemove} disabled={busy} className="text-muted underline underline-offset-4 disabled:opacity-50">
              {busy ? "Removing..." : "Remove"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function withParam(href: string, key: string, value: string) {
  return `${href}${href.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
