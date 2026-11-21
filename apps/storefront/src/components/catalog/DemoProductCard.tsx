import Link from "next/link";
import { formatMoney } from "@jemsutra/design-engine";
import { DEMO_CATEGORY_LABEL, demoImageUrl, demoProductPath, demoSrcSet, primaryImage, type DemoProduct } from "@/lib/catalog-shared";

export function DemoProductCard({ product, sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" }: { product: DemoProduct; sizes?: string }) {
  const img = primaryImage(product);
  return (
    <Link href={demoProductPath(product)} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm tile transition-shadow duration-300 group-hover:shadow-soft">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element -- sized by the image service
          <img
            src={demoImageUrl(img.asset, "card", 600)}
            srcSet={demoSrcSet(img.asset, "card", [400, 600, 800])}
            sizes={sizes}
            alt={img.alt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute left-2 top-2 bg-ink/85 text-white px-1.5 py-0.5 eyebrow text-[9px]">Demo</span>
      </div>
      <p className="mt-3 eyebrow text-[10px] text-muted">{DEMO_CATEGORY_LABEL[product.category]}</p>
      <h3 className="mt-1 font-serif text-base sm:text-lg leading-snug group-hover:text-brand transition-colors">{product.title}</h3>
      <p className="mt-1 text-sm">
        {formatMoney(product.price.amount, product.price.currency)} <span className="text-xs text-muted">· test price</span>
      </p>
    </Link>
  );
}
