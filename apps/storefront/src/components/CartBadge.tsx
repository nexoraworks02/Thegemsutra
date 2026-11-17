"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartBadge() {
  const { count } = useCart();
  return (
    <Link href="/cart" className="relative inline-flex items-center gap-2 text-[13px] tracking-[0.12em] uppercase" aria-label={`Cart, ${count} items`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M6 7h12l-1 13H7L6 7Z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      <span className="hidden sm:inline">Bag</span>
      {count > 0 && (
        <span className="absolute -top-2 -right-3 min-w-5 h-5 px-1 rounded-full bg-gold text-paper text-[11px] grid place-items-center">
          {count}
        </span>
      )}
    </Link>
  );
}
