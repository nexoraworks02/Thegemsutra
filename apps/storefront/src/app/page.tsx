import Link from "next/link";
import { PRODUCTS } from "@jemsutra/design-engine";
import { ProductCard } from "@/components/ProductCard";
import { designImageUrl, productPath } from "@/lib/media";
import { normalizeConfig } from "@jemsutra/design-engine";

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

export default function HomePage() {
  const hero = PRODUCTS[0]!;
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
          <p className="eyebrow text-gold-dark">Personalized fine jewelry</p>
          <h1 className="mt-4 text-4xl sm:text-6xl leading-[1.05]">
            Jewelry that <em className="text-gold-dark">tells your story</em>
          </h1>
          <p className="mt-6 max-w-md text-muted leading-relaxed">
            Choose the metal, the birthstones and the words. See your design come to life as you create it - then
            our artisans hand-make it, just for you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={productPath(hero)} className="bg-ink text-ivory px-7 py-3.5 text-[13px] tracking-[0.16em] uppercase hover:bg-gold-dark transition-colors">
              Start designing
            </Link>
            <Link href="#collection" className="border border-ink px-7 py-3.5 text-[13px] tracking-[0.16em] uppercase hover:bg-ink hover:text-ivory transition-colors">
              Shop the collection
            </Link>
          </div>
        </div>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image service */}
          <img
            src={designImageUrl(hero, heroConfig, { width: 1200 })}
            alt="Twin Hearts ring in 14K yellow gold with ruby and sapphire, engraved Ayesha and Hamza"
            className="w-full rounded-sm border border-line bg-paper"
          />
          <p className="absolute bottom-4 left-4 bg-paper/90 px-3 py-2 text-xs text-muted">
            Live preview · 14K gold · Ruby & Sapphire · &ldquo;Ayesha&rdquo; & &ldquo;Hamza&rdquo;
          </p>
        </div>
      </section>

      <div className="border-y border-line bg-sand/50 overflow-hidden" aria-label="Our promise">
        <div className="marquee-track flex w-max gap-12 py-3 text-[12px] tracking-[0.18em] uppercase">
          {[...TRUST, ...TRUST].map((t, i) => (
            <span key={i} className="flex items-center gap-12">
              {t} <span className="text-gold">◆</span>
            </span>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <p className="eyebrow text-gold-dark text-center">How it works</p>
        <h2 className="mt-3 text-3xl sm:text-4xl text-center">Designed by you, made by hand</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="border-t border-ink pt-6">
              <p className="font-serif text-gold text-2xl">{s.n}</p>
              <h3 className="mt-2 text-xl">{s.title}</h3>
              <p className="mt-2 text-muted text-sm leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="collection" className="mx-auto max-w-7xl px-4 sm:px-6 scroll-mt-28">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-gold-dark">The collection</p>
            <h2 className="mt-3 text-3xl sm:text-4xl">Start with a design you love</h2>
          </div>
          <p className="hidden sm:block text-sm text-muted">{PRODUCTS.length} designs</p>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.styleCode} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
