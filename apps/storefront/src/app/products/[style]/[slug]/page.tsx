import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PRODUCTS, PRODUCT_BY_STYLE, defaultConfig, fromPrice } from "@jemsutra/design-engine";
import { Designer } from "@/components/designer/Designer";
import { designImageUrl } from "@/lib/media";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ style: p.styleCode, slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/products/[style]/[slug]">): Promise<Metadata> {
  const { style } = await props.params;
  const product = PRODUCT_BY_STYLE[style];
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    openGraph: { images: [designImageUrl(product, defaultConfig(product), { width: 1200 })] },
  };
}

/**
 * The page shell is shared by every product URL, so the `params` read happens
 * inside <Suspense> (instant navigation with Partial Prefetching).
 */
export default function ProductPage(props: PageProps<"/products/[style]/[slug]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 pb-28 lg:pb-10">
      <Suspense fallback={<DesignerFallback />}>
        <ProductContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function ProductContent({ params }: { params: PageProps<"/products/[style]/[slug]">["params"] }) {
  const { style } = await params;
  const product = PRODUCT_BY_STYLE[style];
  if (!product) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.styleCode,
    description: product.description,
    image: designImageUrl(product, defaultConfig(product), { width: 1200 }),
    brand: { "@type": "Brand", name: "THEJEMSUTRA" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "PKR",
      lowPrice: fromPrice(product),
      highPrice: Math.max(...product.metals.map((m) => m.price)),
      availability: "https://schema.org/MadeToOrder",
    },
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-xs text-muted mb-6">
        <Link href="/" className="hover:text-ink">Home</Link> / <Link href="/#collection" className="hover:text-ink">Rings</Link> /{" "}
        <span className="text-ink">{product.name}</span>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Suspense fallback={<DesignerFallback name={product.name} />}>
        <Designer product={product} />
      </Suspense>
    </>
  );
}

function DesignerFallback({ name }: { name?: string }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
      <div className="aspect-[4/3] rounded-sm border border-line bg-paper animate-pulse" />
      <div>
        {name ? <h1 className="text-3xl sm:text-4xl">{name}</h1> : <div className="h-10 w-2/3 bg-sand animate-pulse rounded-sm" />}
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 bg-sand animate-pulse rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
