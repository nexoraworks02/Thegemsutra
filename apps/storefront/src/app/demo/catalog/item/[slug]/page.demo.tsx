import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatMoney } from "@jemsutra/design-engine";
import { DemoProductCard } from "@/components/catalog/DemoProductCard";
import { DEMO_ROBOTS, DemoShell, demoTitle } from "@/components/catalog/DemoShell";
import { NoCatalog } from "@/components/catalog/CatalogView";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { getDemoCatalog } from "@/lib/catalog";
import { DEMO_BASE, DEMO_CATEGORY_LABEL, demoCategoryPath, relatedProducts } from "@/lib/catalog-shared";

// Demo data is read per request, so the title is generic (these pages are noindex anyway).
export const metadata: Metadata = { title: demoTitle("Demo product"), robots: DEMO_ROBOTS };

export default function DemoProductPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <DemoShell>
      <Suspense fallback={<div className="grid gap-10 lg:grid-cols-2"><div className="aspect-square tile" /><div /></div>}>
        <Product params={props.params} />
      </Suspense>
    </DemoShell>
  );
}

const NOT_SUPPLIED = "Not yet supplied";

async function Product({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getDemoCatalog();
  if (!catalog) return <NoCatalog />;
  const product = catalog.products.find((p) => p.slug === slug);
  if (!product) notFound();
  const related = relatedProducts(catalog.products, product);

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs text-muted">
        <Link href={DEMO_BASE} className="hover:text-brand">Demo catalog</Link>
        <span aria-hidden> / </span>
        <Link href={demoCategoryPath(product.category)} className="hover:text-brand">{DEMO_CATEGORY_LABEL[product.category]}</Link>
        <span aria-hidden> / </span>
        <span className="text-ink">{product.title}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:gap-12 lg:grid-cols-2">
        <ProductGallery images={product.images} title={product.title} />

        <div>
          <p className="eyebrow text-brand">Demo product · {product.id}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl leading-tight">{product.title}</h1>
          <p className="mt-4 text-2xl">
            {formatMoney(product.price.amount, product.price.currency)}
            <span className="ml-2 align-middle text-xs text-muted border border-line px-1.5 py-0.5">Synthetic test price</span>
          </p>
          <p className="mt-5 text-sm text-muted leading-relaxed max-w-prose">
            Temporary image used to test the catalog. The name describes how the piece looks in the image only. Approved
            photographs, materials, stones, sizes and prices will replace this demo entry.
          </p>

          {product.reviewNotes && product.reviewNotes.length > 0 && (
            <div role="note" className="mt-5 border border-sale/40 bg-blush-tint px-3 py-2 text-xs text-ink">
              <p className="eyebrow text-[10px] text-sale">Flagged for replacement</p>
              <ul className="mt-1 list-disc pl-4">
                {product.reviewNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <dl className="mt-6 border-t border-line text-sm">
            {[
              ["Category", DEMO_CATEGORY_LABEL[product.category]],
              ["Metal / finish", NOT_SUPPLIED],
              ["Stones", NOT_SUPPLIED],
              ["Sizes", NOT_SUPPLIED],
              ["Availability", "Not for sale (demo)"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line py-3">
                <dt className="text-muted">{k}</dt>
                <dd className={v === NOT_SUPPLIED ? "text-muted italic" : ""}>{v}</dd>
              </div>
            ))}
          </dl>

          {product.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Look">
              {product.tags.map((t) => (
                <span key={t} className="border border-line px-2.5 py-1 text-xs capitalize text-muted">{t}</span>
              ))}
            </div>
          )}

          <button type="button" disabled className="btn-primary mt-8 w-full px-6 py-4">
            Demo product - not purchasable
          </button>
          <p className="mt-2 text-xs text-muted">Cart and checkout testing for catalog products is a later milestone.</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-2xl">You may also like</h2>
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6">
            {related.map((p) => (
              <DemoProductCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
