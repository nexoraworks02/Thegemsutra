import Link from "next/link";
import { CartBadge } from "./CartBadge";
import { Logo } from "./Logo";
import { BRAND_NAME } from "@/lib/brand";

const NAV = [
  { label: "Rings", href: "/#collection" },
  { label: "Necklaces", href: "/#collection" },
  { label: "Birthstones", href: "/#collection" },
  { label: "Gifts", href: "/#collection" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur border-b border-line">
      <div className="bg-brand text-blush text-[11px] tracking-[0.18em] uppercase text-center py-2 px-4">
        Free delivery across Pakistan · Cash on delivery · 30-day returns
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-6">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="shrink-0 text-xl sm:text-2xl">
          <Logo tone="onLight" height={64} heightClass="h-12 sm:h-16" />
        </Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-8 text-[13px] tracking-[0.12em] uppercase">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className="py-1 border-b border-transparent hover:text-brand hover:border-brand transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <CartBadge />
      </div>
    </header>
  );
}
