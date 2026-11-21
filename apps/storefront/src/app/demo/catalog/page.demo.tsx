import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSkeleton, CatalogView } from "@/components/catalog/CatalogView";
import { DEMO_ROBOTS, DemoShell } from "@/components/catalog/DemoShell";

export const metadata: Metadata = { title: "Demo catalog", robots: DEMO_ROBOTS };

export default function DemoCatalogPage() {
  return (
    <DemoShell>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogView category={null} />
      </Suspense>
    </DemoShell>
  );
}
