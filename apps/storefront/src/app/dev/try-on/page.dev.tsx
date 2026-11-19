import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TryOnLab } from "./TryOnLab";

export const metadata: Metadata = {
  title: "Try-on prototype (dev)",
  robots: { index: false, follow: false },
};

/**
 * DEVELOPMENT-ONLY virtual try-on proof of concept.
 * Available in `next dev`, or when ENABLE_TRYON_DEMO=true; otherwise 404.
 * Not linked from the store navigation.
 */
export default function TryOnDevPage() {
  const enabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_TRYON_DEMO === "true";
  if (!enabled) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <p className="eyebrow text-sale">Developer prototype · not visible to customers</p>
      <h1 className="mt-2 text-3xl">Virtual try-on - Phase 0</h1>
      <p className="mt-2 text-sm text-muted max-w-2xl">
        Type a name, upload a selfie, and the exact personalised necklace is placed on the neck automatically.
        Demo jewelry artwork; the name is rendered exactly. Your photo is processed on this device and never uploaded.
      </p>
      <TryOnLab />
    </div>
  );
}
