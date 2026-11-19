"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  METAL_BY_CODE,
  defaultConfig,
  formatMoney,
  fromPrice,
  roundUpTo,
  type ProductDef,
} from "@jemsutra/design-engine";
import { designImageUrl, productPath } from "@/lib/media";
import { readPrefs, withPrefs } from "@/lib/remember";

/** Listing card. Shows the product with the shopper's remembered metal, name and stone. */
export function ProductCard({ product }: { product: ProductDef }) {
  const [config, setConfig] = useState(() => defaultConfig(product));

  useEffect(() => {
    const apply = () => setConfig(withPrefs(product, readPrefs()));
    apply();
    window.addEventListener("jemsutra:prefs", apply);
    return () => window.removeEventListener("jemsutra:prefs", apply);
  }, [product]);

  const price = fromPrice(product);
  const compare = product.salePercent ? roundUpTo(price / (1 - product.salePercent / 100), 100) : undefined;

  return (
    <Link href={productPath(product, config)} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm tile transition-shadow duration-300 group-hover:shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element -- images are rendered + sized by the image service */}
        <img
          src={designImageUrl(product, config, { width: 600 })}
          alt={`${product.name} in ${METAL_BY_CODE[config.metal]?.name ?? ""}`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
        {product.badges?.[0] && (
          <span className="absolute left-3 top-3 bg-blush-tint/95 text-brand px-2 py-1 eyebrow text-[10px]">{product.badges[0]}</span>
        )}
      </div>
      <div className="mt-3 flex gap-1.5">
        {product.metals.slice(0, 6).map((m) => (
          <span
            key={m.metal}
            title={METAL_BY_CODE[m.metal]?.name}
            className="h-3.5 w-3.5 rounded-full border border-line"
            style={{ background: METAL_BY_CODE[m.metal]?.color }}
          />
        ))}
      </div>
      <h3 className="mt-2 font-serif text-lg leading-snug group-hover:text-brand transition-colors">{product.name}</h3>
      <p className="mt-1 text-sm">
        <span>from {formatMoney(price)}</span>
        {compare && <span className="ml-2 text-muted line-through">{formatMoney(compare)}</span>}
        {product.salePercent && <span className="ml-2 text-sale font-medium">{product.salePercent}% off</span>}
      </p>
    </Link>
  );
}
