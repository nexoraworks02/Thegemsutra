export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-sand">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-serif text-lg tracking-[0.16em]">THEJEMSUTRA</p>
          <p className="mt-3 text-muted leading-relaxed">
            Personalized jewelry, designed by you and hand-made by our artisans.
          </p>
        </div>
        <div>
          <p className="eyebrow text-rose-deep">Our promise</p>
          <ul className="mt-3 space-y-2">
            <li>Made to order in 5-7 days</li>
            <li>Free delivery & cash on delivery</li>
            <li>30-day returns · 1-year warranty</li>
            <li>Free resizing</li>
          </ul>
        </div>
        <div>
          <p className="eyebrow text-rose-deep">Help</p>
          <ul className="mt-3 space-y-2">
            <li>Ring size guide</li>
            <li>Shipping & returns</li>
            <li>Contact us</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="border-t border-line pt-6 pb-8 text-center text-xs text-muted">© THEJEMSUTRA · All rights reserved</p>
      </div>
    </footer>
  );
}
