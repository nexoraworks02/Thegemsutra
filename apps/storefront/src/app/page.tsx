import Link from "next/link";
import { PRODUCTS, normalizeConfig } from "@jemsutra/design-engine";
import { ProductCard } from "@/components/ProductCard";
import { getDesigns } from "@/lib/designs";
import { designImageUrl, productPath } from "@/lib/media";

const TRUST = [
  "Designed by you",
  "Hand-made in 5-7 days",
  "Free delivery across Pakistan",
  "Cash on delivery",
  "30-day returns",
  "1-year warranty",
];

const STEPS = [
  { n: "01", title: "Choose your metal", text: "Sterling silver, gold plated, or solid 10K and 14K gold." },
  { n: "02", title: "Pick your stones", text: "Birthstones for every person you love - genuine or simulated." },
  { n: "03", title: "Add your words", text: "Names, dates or a secret message in the font you love." },
];

export default async function HomePage() {
  const designs = await getDesigns();
  // Hero shows the two-name ring when available (falls back to the first design).
  const hero = designs.find((d) => d.styleCode === "JS0001") ?? designs[0] ?? PRODUCTS[0]!;
  const heroConfig = normalizeConfig(hero, {
    metal: "14KY",
    stones: { s1: "RUBY", s2: "SAPH" },
    engravings: { e1: "Ayesha", e2: "Hamza" },
    font: "script",
  });

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-16 grid gap-10 lg:grid-cols-2 items-center">
        <div>
          <p className="eyebrow text-brand">Personalized fine jewelry</p>
          <h1 className="mt-4 text-4xl sm:text-6xl leading-[1.05]">
            Jewelry that <em className="text-brand">tells your story</em>
          </h1>
          <p className="mt-6 max-w-md text-muted leading-relaxed">
            Choose the metal, the birthstones and the words. See your design come to life as you create it - then
            our artisans hand-make it, just for you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={productPath(hero)} className="btn-primary px-7 py-3.5">
              Start designing
            </Link>
            <Link href="#collection" className="btn-secondary px-7 py-3.5">
              Shop the collection
            </Link>
          </div>
        </div>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image service */}
          <img
            src={designImageUrl(hero, heroConfig, { width: 1200 })}
            alt="Twin Hearts ring in 14K yellow gold with ruby and sapphire, engraved Ayesha and Hamza"
            className="w-full rounded-sm tile shadow-soft"
          />
          <p className="absolute bottom-4 left-4 bg-ivory/90 border border-line px-3 py-2 text-xs text-muted">
            Live preview · 14K gold · Ruby & Sapphire · &ldquo;Ayesha&rdquo; & &ldquo;Hamza&rdquo;
          </p>
        </div>
      </section>

      <div className="border-y border-line bg-sand overflow-hidden" aria-label="Our promise">
        <div className="marquee-track flex w-max gap-12 py-3 text-[12px] tracking-[0.18em] uppercase">
          {[...TRUST, ...TRUST].map((t, i) => (
            <span key={i} className="flex items-center gap-12">
              {t} <span className="text-brand" aria-hidden>◆</span>
            </span>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <p className="eyebrow text-brand text-center">How it works</p>
        <h2 className="mt-3 text-3xl sm:text-4xl text-center">Designed by you, made by hand</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="border-t border-line pt-6">
              <p className="font-serif text-brand text-3xl">{s.n}</p>
              <h3 className="mt-2 text-xl">{s.title}</h3>
              <p className="mt-2 text-muted text-sm leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="collection" className="mx-auto max-w-7xl px-4 sm:px-6 scroll-mt-32">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-brand">The collection</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Start with a design you love</h2>
          </div>
          <p className="hidden sm:block text-sm text-muted">{designs.length} designs</p>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {designs.length === 0 && <p className="text-muted">New designs are coming soon.</p>}
          {designs.map((p) => (
            <ProductCard key={p.styleCode} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
