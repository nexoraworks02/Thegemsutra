import Link from "next/link";
import { CartBadge } from "./CartBadge";

const NAV = [
  { label: "Rings", href: "/#collection" },
  { label: "Necklaces", href: "/#collection" },
  { label: "Birthstones", href: "/#collection" },
  { label: "Gifts", href: "/#collection" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur border-b border-line">
      <div className="bg-ink text-ivory text-[11px] tracking-[0.18em] uppercase text-center py-2 px-4">
        Free delivery across Pakistan · Cash on delivery · 30-day returns
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="font-serif text-xl sm:text-2xl tracking-[0.18em]">
          THEJEMSUTRA
        </Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-8 text-[13px] tracking-[0.12em] uppercase">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className="hover:text-gold-dark transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <CartBadge />
      </div>
    </header>
  );
}
