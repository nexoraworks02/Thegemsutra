import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDemoCatalogEnabled } from "@/lib/catalog-shared";
import { DemoBanner } from "./DemoBanner";

/** Page metadata for every DEMO catalog page: never indexed or cached by search engines. */
export const DEMO_ROBOTS: Metadata["robots"] = { index: false, follow: false, nocache: true };
export const demoTitle = (t: string) => `${t} (demo)`;

/**
 * Wrapper for every DEMO catalog page (development and local testing only).
 * The pages exist only in `next dev` or a build with ENABLE_DEMO_CATALOG=true
 * (see next.config.ts), are not linked from the store navigation, are noindex,
 * and always show the demo banner.
 */
export function DemoShell({ children }: { children: React.ReactNode }) {
  if (!isDemoCatalogEnabled()) notFound();
  return (
    <>
      <DemoBanner />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 pb-20">{children}</div>
    </>
  );
}
