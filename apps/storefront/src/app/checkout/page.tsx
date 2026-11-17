import type { Metadata } from "next";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <h1 className="text-3xl sm:text-4xl">Checkout</h1>
      <p className="mt-2 text-sm text-muted">Secure checkout · Pay with cash when your jewelry arrives</p>
      <CheckoutForm />
    </div>
  );
}
