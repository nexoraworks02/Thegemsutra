"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FONT_BY_CODE,
  METAL_BY_CODE,
  MONTHS,
  STONES,
  STONE_BY_CODE,
  configFromQuery,
  configToQuery,
  formatMoney,
  normalizeConfig,
  priceDesign,
  resolveSlots,
  sizeOptions,
  validateForCart,
  type DesignConfig,
  type ProductDef,
  type StoneSlotDef,
} from "@jemsutra/design-engine";
import { useCart } from "@/lib/cart";
import { designImageUrl, productPath, stoneImageUrl } from "@/lib/media";
import { readPrefs, savePrefs, withPrefs } from "@/lib/remember";

const DESIGN_KEYS = ["m", "sc", "s1", "e1", "e2", "ef", "sz", "pk"];

const FONT_FAMILY: Record<string, string> = {
  classic: "var(--font-serif)",
  modern: "var(--font-sans)",
  italic: "var(--font-serif)",
  script: "var(--font-script)",
};

export function Designer({ product }: { product: ProductDef }) {
  const params = useSearchParams();
  const cart = useCart();
  const editingLineId = params.get("line");

  const [config, setConfig] = useState<DesignConfig>(() => configFromQuery(product, params));
  const [open, setOpen] = useState<string>("metal");
  const [sizeError, setSizeError] = useState(false);
  const [added, setAdded] = useState(false);

  // No design in the URL? Start from what the shopper chose on other products.
  useEffect(() => {
    if (!DESIGN_KEYS.some((k) => params.has(k))) {
      setConfig(withPrefs(product, readPrefs()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first load
  }, [product]);

  const update = useCallback(
    (patch: Partial<DesignConfig>) => {
      setConfig((prev) => normalizeConfig(product, { ...prev, ...patch, stones: { ...prev.stones, ...patch.stones }, engravings: { ...prev.engravings, ...patch.engravings } }));
      if (patch.size != null) setSizeError(false);
      setAdded(false);
    },
    [product],
  );

  // Keep the URL and remembered preferences in sync (shareable design links).
  useEffect(() => {
    const q = configToQuery(product, config, { omitDefaults: true });
    if (editingLineId) q.set("line", editingLineId);
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    const t = setTimeout(() => savePrefs(product, config), 400);
    return () => clearTimeout(t);
  }, [config, product, editingLineId]);

  const price = useMemo(() => priceDesign(product, config), [product, config]);
  const slots = resolveSlots(product, config.stoneCount);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addToCart = async () => {
    const issues = validateForCart(product, config);
    if (issues.length) {
      setSizeError(true);
      setOpen("size");
      document.getElementById("step-size")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const replace = editingLineId && cart.cart?.items.some((l) => l.id === editingLineId) ? editingLineId : undefined;
      await cart.addDesign(product.styleCode, config, replace);
      setAdded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const metal = METAL_BY_CODE[config.metal]!;
  const off = product.salePercent;

  return (
    <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
      <Gallery product={product} config={config} />

      <div>
        <p className="eyebrow text-gold-dark">{product.badges?.[0] ?? "Personalized"}</p>
        <h1 className="mt-2 text-3xl sm:text-4xl leading-tight">{product.name}</h1>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-2xl font-medium">{formatMoney(price.total)}</span>
          {price.compareAt && <span className="text-muted line-through">{formatMoney(price.compareAt)}</span>}
          {off && <span className="text-sale text-sm font-medium">{off}% off</span>}
        </div>
        <p className="mt-4 text-muted leading-relaxed text-[15px]">{product.description}</p>

        <div className="mt-8 border-t border-line">
          <Step id="metal" title="Metal" summary={metal.name} open={open} setOpen={setOpen}>
            <div className="grid grid-cols-4 gap-3">
              {product.metals.map((m) => {
                const mm = METAL_BY_CODE[m.metal]!;
                const active = m.metal === config.metal;
                return (
                  <button
                    key={m.metal}
                    type="button"
                    onClick={() => update({ metal: m.metal })}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1.5 rounded-sm border p-2 text-center transition ${active ? "border-ink bg-paper" : "border-transparent hover:border-line"}`}
                  >
                    <span className="h-10 w-10 rounded-full grid place-items-center text-[10px] font-semibold text-ink/70 border border-black/5" style={{ background: `radial-gradient(circle at 35% 30%, ${mm.highlight}, ${mm.color} 60%, ${mm.shadow})` }}>
                      {mm.shortLabel}
                    </span>
                    <span className="text-[11px] leading-tight">{mm.name.replace("925 ", "")}</span>
                    <span className="text-[11px] text-muted">{formatMoney(m.price)}</span>
                  </button>
                );
              })}
            </div>
          </Step>

          {product.stoneCount && (
            <Step id="count" title="Number of stones" summary={`${config.stoneCount} stones`} open={open} setOpen={setOpen}>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: product.stoneCount.max - product.stoneCount.min + 1 }, (_, i) => product.stoneCount!.min + i).map((n) => {
                  const extra = Math.max(0, n - product.stoneCount!.included) * product.stoneCount!.pricePerExtra;
                  const active = n === config.stoneCount;
                  return (
                    <button key={n} type="button" onClick={() => update({ stoneCount: n })} aria-pressed={active}
                      className={`min-w-16 border px-3 py-2 text-sm rounded-sm ${active ? "border-ink bg-ink text-ivory" : "border-line bg-paper hover:border-ink"}`}>
                      {n}
                      <span className="block text-[10px] opacity-70">{extra ? `+${formatMoney(extra)}` : "included"}</span>
                    </button>
                  );
                })}
              </div>
            </Step>
          )}

          {slots.map((slot) => (
            <Step
              key={slot.key}
              id={slot.key}
              title={slot.label}
              summary={stoneSummary(config.stones[slot.key])}
              open={open}
              setOpen={setOpen}
              icon={<img src={stoneImageUrl(slot.shape, config.stones[slot.key] ?? slot.defaultStone, 120)} alt="" className="h-7 w-7" />}
            >
              <StonePicker slot={slot} value={config.stones[slot.key]!} onChange={(code) => update({ stones: { [slot.key]: code } })} />
            </Step>
          ))}

          {product.engravings.length > 0 && (
            <Step
              id="engraving"
              title={`Engraving (${FONT_BY_CODE[config.font]?.name})`}
              summary={product.engravings.map((e) => config.engravings[e.key]).filter(Boolean).join(" · ") || "Optional"}
              open={open}
              setOpen={setOpen}
            >
              <div className="space-y-3">
                {product.engravings.map((e) => {
                  const value = config.engravings[e.key] ?? "";
                  return (
                    <label key={e.key} className="block">
                      <span className="flex justify-between text-xs text-muted mb-1">
                        <span>{e.label}{e.price ? ` (+${formatMoney(e.price)})` : ""}</span>
                        <span>{e.maxChars - value.length} left</span>
                      </span>
                      <input
                        value={value}
                        maxLength={e.maxChars}
                        onChange={(ev) => update({ engravings: { [e.key]: ev.target.value } })}
                        placeholder={e.label}
                        className="w-full border border-line bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-ink"
                        style={{ fontFamily: FONT_FAMILY[config.font], fontStyle: config.font === "italic" ? "italic" : undefined }}
                      />
                    </label>
                  );
                })}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {product.fonts.map((f) => {
                    const active = f === config.font;
                    return (
                      <button key={f} type="button" onClick={() => update({ font: f })} aria-pressed={active}
                        className={`border py-2 rounded-sm ${active ? "border-ink bg-paper" : "border-line hover:border-ink"}`}>
                        <span className="block text-xl" style={{ fontFamily: FONT_FAMILY[f], fontStyle: f === "italic" ? "italic" : undefined }}>Abc</span>
                        <span className="block text-[10px] text-muted">{FONT_BY_CODE[f]?.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Step>
          )}

          {product.size && (
            <Step id="size" title="Ring size" summary={config.size != null ? `Size ${config.size}` : "Select your size"} open={open} setOpen={setOpen} error={sizeError}>
              <select
                value={config.size ?? ""}
                onChange={(e) => update({ size: e.target.value ? Number(e.target.value) : undefined })}
                className={`w-full border bg-paper px-3 py-2.5 text-[15px] ${sizeError ? "border-sale" : "border-line"}`}
              >
                <option value="">Please select your size</option>
                {sizeOptions(product).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value.toFixed(1)}{s.surcharge ? ` (+${formatMoney(s.surcharge)})` : ""}
                  </option>
                ))}
              </select>
              {sizeError && <p className="mt-2 text-sm text-sale">Please select your ring size to continue.</p>}
              {product.size.hint && <p className="mt-2 text-xs text-muted">{product.size.hint}. Free resizing within 30 days.</p>}
            </Step>
          )}

          <Step id="packaging" title="Packaging" summary={product.packaging.find((p) => p.code === config.packaging)?.name ?? ""} open={open} setOpen={setOpen}>
            <div className="grid gap-2 sm:grid-cols-2">
              {product.packaging.map((p) => {
                const active = p.code === config.packaging;
                return (
                  <button key={p.code} type="button" onClick={() => update({ packaging: p.code })} aria-pressed={active}
                    className={`text-left border p-3 rounded-sm ${active ? "border-ink bg-paper" : "border-line hover:border-ink"}`}>
                    <span className="flex justify-between text-sm font-medium"><span>{p.name}</span><span>{p.price ? formatMoney(p.price) : "Free"}</span></span>
                    {p.description && <span className="block mt-1 text-xs text-muted">{p.description}</span>}
                  </button>
                );
              })}
            </div>
          </Step>
        </div>

        <PriceSummary lines={price.lines} total={price.total} />

        <button type="button" onClick={addToCart} disabled={saving}
          className="mt-5 w-full bg-ink text-ivory py-4 text-[13px] tracking-[0.16em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-60 disabled:cursor-wait">
          {saving ? "Adding..." : `${editingLineId ? "Update bag item" : "Add to bag"} · ${formatMoney(price.total)}`}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-sale">{error}</p>}

        {added && (
          <div role="status" className="mt-4 border border-gold/50 bg-paper p-4 flex items-center justify-between gap-4">
            <p className="text-sm">{editingLineId ? "Your bag item was updated." : "Added to your bag."}</p>
            <div className="flex gap-3 text-sm">
              <Link href="/cart" className="underline underline-offset-4">View bag</Link>
              <Link href="/#collection" className="text-muted underline underline-offset-4">Keep shopping</Link>
            </div>
          </div>
        )}

        <ul className="mt-6 grid grid-cols-2 gap-3 text-xs text-muted">
          <li>✦ Hand-made in 5-7 days</li>
          <li>✦ Free delivery · COD</li>
          <li>✦ 30-day returns</li>
          <li>✦ Free resizing</li>
        </ul>
        <p className="mt-6 text-xs text-muted">
          Share your design:{" "}
          <span className="select-all break-all text-ink">{productPath(product, config)}</span>
        </p>
      </div>

      {/* Mobile: sticky bar with live mini preview + price */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <img src={designImageUrl(product, config, { width: 120 })} alt="" className="h-12 w-16 object-cover border border-line bg-paper" />
        <button type="button" onClick={addToCart} disabled={saving} className="flex-1 bg-ink text-ivory py-3 text-[12px] tracking-[0.14em] uppercase disabled:opacity-60">
          {saving ? "Adding..." : `${formatMoney(price.total)} · ${editingLineId ? "Update" : "Add to bag"}`}
        </button>
      </div>
    </div>
  );
}

function stoneSummary(code?: string) {
  const s = code ? STONE_BY_CODE[code] : undefined;
  if (!s) return "";
  return s.birthMonth ? `${s.name} · ${MONTHS[s.birthMonth - 1]}` : s.name;
}

/** Live image with a soft cross-fade; text changes are debounced while typing. */
function Gallery({ product, config }: { product: ProductDef; config: DesignConfig }) {
  const target = designImageUrl(product, config, { width: 1200 });
  const [shown, setShown] = useState(target);
  const [loading, setLoading] = useState(false);
  const latest = useRef(target);

  useEffect(() => {
    latest.current = target;
    if (target === shown) return;
    setLoading(true);
    const t = setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        if (latest.current === target) {
          setShown(target);
          setLoading(false);
        }
      };
      img.onerror = () => setLoading(false);
      img.src = target;
    }, 180);
    return () => clearTimeout(t);
  }, [target, shown]);

  return (
    <div className="lg:sticky lg:top-28 self-start">
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-line bg-paper">
        <img src={shown} alt={`${product.name} - your design`} className="h-full w-full object-cover" />
        {loading && (
          <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-gold animate-ping" aria-label="Updating preview" />
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Live preview of your design · updates as you choose</p>
    </div>
  );
}

function Step(props: {
  id: string;
  title: string;
  summary: string;
  open: string;
  setOpen: (id: string) => void;
  icon?: React.ReactNode;
  error?: boolean;
  children: React.ReactNode;
}) {
  const isOpen = props.open === props.id;
  return (
    <section id={`step-${props.id}`} className="border-b border-line">
      <button type="button" onClick={() => props.setOpen(isOpen ? "" : props.id)} aria-expanded={isOpen}
        className="w-full flex items-center gap-3 py-4 text-left">
        {props.icon && <span className="shrink-0">{props.icon}</span>}
        <span className="flex-1">
          <span className={`block eyebrow ${props.error ? "text-sale" : ""}`}>{props.title}</span>
          <span className="block text-sm text-muted mt-0.5 truncate">{props.summary}</span>
        </span>
        <span className="text-xl text-muted w-5 text-center">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="pb-5">{props.children}</div>}
    </section>
  );
}

function StonePicker({ slot, value, onChange }: { slot: StoneSlotDef; value: string; onChange: (code: string) => void }) {
  const available = STONES.filter((s) => s.code in slot.prices);
  const groups = [
    { title: "Genuine & lab-grown", items: available.filter((s) => s.kind !== "simulated") },
    { title: "Simulated", items: available.filter((s) => s.kind === "simulated") },
  ];
  const current = STONE_BY_CODE[value];
  return (
    <div>
      {current && (
        <p className="text-xs text-muted mb-3">
          <span className="text-ink font-medium">{current.name}</span> · {slot.sizeMm}mm {slot.shape}
          {current.birthMonth ? ` · ${MONTHS[current.birthMonth - 1]}` : ""}
          {current.meaning ? ` · ${current.meaning}` : ""}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.title} className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted mb-2">{g.title}</p>
          <div className="grid grid-cols-6 gap-2">
            {g.items.map((s) => {
              const price = slot.prices[s.code] ?? 0;
              const active = s.code === value;
              return (
                <button key={s.code} type="button" onClick={() => onChange(s.code)} aria-pressed={active} title={s.name}
                  className={`flex flex-col items-center rounded-sm border p-1 ${active ? "border-ink bg-paper" : "border-transparent hover:border-line"}`}>
                  <img src={stoneImageUrl(slot.shape, s.code, 120)} alt={s.name} className="h-9 w-9" loading="lazy" />
                  <span className="text-[10px] text-muted">{price ? `+${Math.round(price / 100) / 10}k` : "incl."}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceSummary({ lines, total }: { lines: { label: string; detail: string; amount: number }[]; total: number }) {
  return (
    <details className="mt-6 bg-paper border border-line p-4 text-sm">
      <summary className="cursor-pointer flex justify-between">
        <span>Price breakdown</span>
        <span className="font-medium">{formatMoney(total)}</span>
      </summary>
      <ul className="mt-3 space-y-1.5">
        {lines.map((l) => (
          <li key={l.label + l.detail} className="flex justify-between gap-4 text-muted">
            <span>{l.label} <span className="text-ink/70">· {l.detail}</span></span>
            <span className="text-ink">{formatMoney(l.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
