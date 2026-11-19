import { Logo } from "./Logo";
import { BRAND_NAME } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-24 bg-brand text-blush">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-lg"><Logo tone="onDark" height={80} heightClass="h-16 sm:h-20" /></p>
          <p className="mt-3 text-blush/85 leading-relaxed">
            Personalized jewelry, designed by you and hand-made by our artisans.
          </p>
        </div>
        <div>
          <p className="eyebrow text-white">Our promise</p>
          <ul className="mt-3 space-y-2">
            <li>Made to order in 5-7 days</li>
            <li>Free delivery & cash on delivery</li>
            <li>30-day returns · 1-year warranty</li>
            <li>Free resizing</li>
          </ul>
        </div>
        <div>
          <p className="eyebrow text-white">Help</p>
          <ul className="mt-3 space-y-2">
            <li>Ring size guide</li>
            <li>Shipping & returns</li>
            <li>Contact us</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="border-t border-blush/25 pt-6 pb-8 text-center text-xs text-blush/85">© {BRAND_NAME} · All rights reserved</p>
      </div>
    </footer>
  );
}
