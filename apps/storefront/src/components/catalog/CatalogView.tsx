import { notFound } from "next/navigation";
import { getDemoCatalog } from "@/lib/catalog";
import { DEMO_CATEGORIES, DEMO_CATEGORY_LABEL, type DemoCategoryCode } from "@/lib/catalog-shared";
import { CatalogBrowser } from "./CatalogBrowser";

/** Listing for all demo products or one category. */
export async function CatalogView({ category }: { category: string | null }) {
  if (category !== null && !DEMO_CATEGORIES.includes(category as DemoCategoryCode)) notFound();
  const catalog = await getDemoCatalog();
  if (!catalog) return <NoCatalog />;

  const active = category as DemoCategoryCode | null;
  const categories = catalog.categories.map((c) => ({ ...c, count: catalog.products.filter((p) => p.category === c.code).length }));
  const products = active ? catalog.products.filter((p) => p.category === active) : catalog.products;
  if (active && products.length === 0) notFound();

  return (
    <>
      <p className="eyebrow text-brand">Demo catalog</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">{active ? DEMO_CATEGORY_LABEL[active] : "All demo jewelry"}</h1>
      <p className="mt-2 text-sm text-muted max-w-2xl">
        Temporary images used to build and test the shopping experience. Names describe what the image looks like only;
        materials, stones, sizes and prices will come from the approved product data.
      </p>
      <div className="mt-8">
        <CatalogBrowser products={products} categories={categories} active={active} />
      </div>
    </>
  );
}

export function NoCatalog() {
  return (
    <div className="tile p-6 max-w-2xl">
      <h1 className="text-2xl">No demo catalog loaded</h1>
      <p className="mt-2 text-sm text-muted">
        Import the demo images, then start the image service with <code>DEMO_CATALOG_DIR=.demo-catalog</code>:
      </p>
      <pre className="mt-3 text-xs bg-paper border border-line p-3 overflow-x-auto">
        npm run catalog:import -w @jemsutra/image-service -- --source &lt;folder&gt; [--source &lt;folder&gt; ...]
      </pre>
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-3 w-24 bg-sand" />
      <div className="mt-3 h-8 w-64 bg-sand" />
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[4/5] tile" />
        ))}
      </div>
    </div>
  );
}
