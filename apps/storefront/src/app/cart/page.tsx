import type { Metadata } from "next";
import { CartView } from "./CartView";

export const metadata: Metadata = { title: "Your bag" };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <h1 className="text-3xl sm:text-4xl">Your bag</h1>
      <CartView />
    </div>
  );
}
