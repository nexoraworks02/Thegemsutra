"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  DEMO_BASE,
  DEMO_TAG_GROUPS,
  DEMO_TAG_GROUP_LABEL,
  demoCategoryPath,
  filterProducts,
  type DemoCategoryCode,
  type DemoFilters,
  type DemoProduct,
  type DemoTagGroup,
} from "@/lib/catalog-shared";
import { DemoProductCard } from "./DemoProductCard";

const SORTS: { value: DemoFilters["sort"]; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
];
const GROUPS = Object.keys(DEMO_TAG_GROUPS) as DemoTagGroup[];

function readFilters(sp: URLSearchParams): DemoFilters {
  const list = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const sort = sp.get("sort") as DemoFilters["sort"] | null;
  return {
    q: sp.get("q") ?? "",
    colour: list("colour"),
    shape: list("shape"),
    style: list("style"),
    sort: SORTS.some((s) => s.value === sort) ? sort! : "featured",
  };
}

/** Category tabs, search, visual filters and sort. State lives in the URL so filtered views can be shared. */
export function CatalogBrowser({
  products,
  categories,
  active,
}: {
  products: DemoProduct[];
  categories: { code: DemoCategoryCode; label: string; count: number }[];
  active: DemoCategoryCode | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(sp.toString())), [sp]);
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  // Keep the search box in step when the URL changes (back/forward, "Clear filters").
  const [urlQ, setUrlQ] = useState(filters.q);
  if (urlQ !== filters.q) {
    setUrlQ(filters.q);
    setQ(filters.q);
  }

  const update = (patch: Partial<DemoFilters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q.trim());
    for (const g of GROUPS) if (next[g].length) params.set(g, next[g].join(","));
    if (next.sort !== "featured") params.set("sort", next.sort);
    const s = params.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Debounced search box.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => update({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [q]);

  const toggle = (g: DemoTagGroup, tag: string) =>
    update({ [g]: filters[g].includes(tag) ? filters[g].filter((t) => t !== tag) : [...filters[g], tag] } as Partial<DemoFilters>);

  const shown = filterProducts(products, filters);
  const activeCount = GROUPS.reduce((n, g) => n + filters[g].length, 0) + (filters.q ? 1 : 0);
  // Only offer tags that exist in this category, with counts.
  const available = GROUPS.map((g) => ({
    g,
    tags: DEMO_TAG_GROUPS[g]
      .map((t) => ({ t, n: products.filter((p) => p.tags.includes(t)).length }))
      .filter((x) => x.n > 0),
  })).filter((x) => x.tags.length > 0);

  return (
    <div>
      <nav aria-label="Demo categories" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <ul className="flex gap-2 w-max">
          <li>
            <Link href={DEMO_BASE} aria-current={active === null ? "page" : undefined} className={`option block px-4 py-2 text-sm ${active === null ? "option-active" : ""}`}>
              All
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.code}>
              <Link
                href={demoCategoryPath(c.code)}
                aria-current={active === c.code ? "page" : undefined}
                className={`option block px-4 py-2 text-sm whitespace-nowrap ${active === c.code ? "option-active" : ""}`}
              >
                {c.label} <span className="text-muted">({c.count})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Search demo products</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, colour or style" className="field px-4 py-2.5 text-sm" />
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="demo-filters"
            className="btn-secondary px-4 py-2.5 sm:hidden flex-1"
          >
            Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
          <label className="flex-1 sm:flex-none">
            <span className="sr-only">Sort</span>
            <select value={filters.sort} onChange={(e) => update({ sort: e.target.value as DemoFilters["sort"] })} className="field px-3 py-2.5 text-sm">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div id="demo-filters" className={`mt-4 space-y-3 ${open ? "block" : "hidden"} sm:block`}>
        {available.map(({ g, tags }) => (
          <div key={g} role="group" aria-label={DEMO_TAG_GROUP_LABEL[g]} className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="eyebrow text-[10px] text-muted w-[4.75rem] shrink-0">{DEMO_TAG_GROUP_LABEL[g]}</span>
            {tags.map(({ t, n }) => {
              const on = filters[g].includes(t);
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => toggle(g, t)} className={`option px-3 py-1.5 text-xs capitalize ${on ? "option-active" : ""}`}>
                  {t} <span className="text-muted">{n}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between text-sm text-muted" aria-live="polite">
        <span>
          {shown.length} of {products.length} demo product{products.length === 1 ? "" : "s"}
        </span>
        {activeCount > 0 && (
          <button type="button" onClick={() => (setQ(""), update({ q: "", colour: [], shape: [], style: [] }))} className="underline hover:text-brand">
            Clear filters
          </button>
        )}
      </div>

      {shown.length ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
          {shown.map((p) => (
            <DemoProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-muted">No demo products match these filters.</p>
      )}
    </div>
  );
}
