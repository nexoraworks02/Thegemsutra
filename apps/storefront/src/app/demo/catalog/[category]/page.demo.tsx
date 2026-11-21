import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSkeleton, CatalogView } from "@/components/catalog/CatalogView";
import { DEMO_ROBOTS, DemoShell, demoTitle } from "@/components/catalog/DemoShell";
import { DEMO_CATEGORIES, DEMO_CATEGORY_LABEL, type DemoCategoryCode } from "@/lib/catalog-shared";

export function generateStaticParams() {
  return DEMO_CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata(props: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await props.params;
  return { title: demoTitle(DEMO_CATEGORY_LABEL[category as DemoCategoryCode] ?? "Demo catalog"), robots: DEMO_ROBOTS };
}

export default function DemoCategoryPage(props: { params: Promise<{ category: string }> }) {
  return (
    <DemoShell>
      <Suspense fallback={<CatalogSkeleton />}>
        <Category params={props.params} />
      </Suspense>
    </DemoShell>
  );
}

async function Category({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return <CatalogView category={category} />;
}
