import { describe, expect, it } from "vitest";
import {
  demoImageUrl,
  demoProductPath,
  filterProducts,
  galleryHasNavigation,
  galleryImages,
  galleryStep,
  primaryImage,
  relatedProducts,
  type DemoFilters,
  type DemoImage,
  type DemoProduct,
} from "./catalog-shared";

/* Synthetic demo products (test values only). */
const img = (asset: string, order = 0): DemoImage => ({ asset, role: order === 0 ? "primary" : "gallery", order, alt: "test", width: 1000, height: 1000 });
const p = (id: string, category: DemoProduct["category"], title: string, tags: string[], price: number, images = [img(`img_${id}`)]): DemoProduct => ({
  id, slug: id.toLowerCase(), status: "demo", kind: "catalog", category, title, tags,
  description: null, material: null, gemstone: null, sizes: null,
  price: { amount: price, currency: "PKR", synthetic: true }, availability: "not-for-sale", images,
});
const ALL = [
  p("DEMO-RNG-001", "rings", "Blue Halo Ring", ["blue", "halo", "oval"], 22222),
  p("DEMO-RNG-002", "rings", "Red Heart Halo Ring", ["red", "halo", "heart"], 11111),
  p("DEMO-RNG-003", "rings", "Twisted Band Ring", ["white", "twisted"], 33333),
  p("DEMO-EAR-001", "earrings", "Twisted Hoops", ["hoop", "twisted"], 4444),
  p("DEMO-NCK-001", "necklaces", "Purple Pendant", ["purple", "pendant"], 5555),
];
const F = (o: Partial<DemoFilters> = {}): DemoFilters => ({ q: "", colour: [], shape: [], style: [], sort: "featured", ...o });
const ids = (list: DemoProduct[]) => list.map((x) => x.id);

describe("search", () => {
  it("matches all words, case-insensitively, across title, tags, category and id", () => {
    expect(ids(filterProducts(ALL, F({ q: "twisted hoop" })))).toEqual(["DEMO-EAR-001"]);
    expect(ids(filterProducts(ALL, F({ q: "HALO" })))).toEqual(["DEMO-RNG-001", "DEMO-RNG-002"]);
    expect(ids(filterProducts(ALL, F({ q: "necklaces" })))).toEqual(["DEMO-NCK-001"]);
    expect(ids(filterProducts(ALL, F({ q: "demo-rng-003" })))).toEqual(["DEMO-RNG-003"]);
    expect(filterProducts(ALL, F({ q: "gold" }))).toEqual([]);
    expect(filterProducts(ALL, F({ q: "   " }))).toHaveLength(ALL.length);
  });
});

describe("filters", () => {
  it("OR within a group, AND across groups", () => {
    expect(ids(filterProducts(ALL, F({ colour: ["blue", "red"] })))).toEqual(["DEMO-RNG-001", "DEMO-RNG-002"]);
    expect(ids(filterProducts(ALL, F({ colour: ["red"], style: ["halo"] })))).toEqual(["DEMO-RNG-002"]);
    expect(filterProducts(ALL, F({ colour: ["purple"], style: ["halo"] }))).toEqual([]);
  });
});

describe("sort", () => {
  it("sorts by price and name without changing the input", () => {
    const before = ids(ALL);
    expect(filterProducts(ALL, F({ sort: "price-asc" })).map((x) => x.price.amount)).toEqual([4444, 5555, 11111, 22222, 33333]);
    expect(filterProducts(ALL, F({ sort: "price-desc" })).map((x) => x.price.amount)).toEqual([33333, 22222, 11111, 5555, 4444]);
    expect(filterProducts(ALL, F({ sort: "name" })).map((x) => x.title)[0]).toBe("Blue Halo Ring");
    expect(ids(filterProducts(ALL, F()))).toEqual(before); // featured = catalog order
    expect(ids(ALL)).toEqual(before);
  });
});

describe("related products", () => {
  it("prefers the same category and shared tags, never the product itself", () => {
    const r = relatedProducts(ALL, ALL[0]!, 3);
    expect(ids(r)).toEqual(["DEMO-RNG-002", "DEMO-RNG-003", "DEMO-EAR-001"]);
    expect(ids(r)).not.toContain("DEMO-RNG-001");
    expect(relatedProducts([ALL[0]!], ALL[0]!)).toEqual([]);
  });
});

describe("gallery", () => {
  it("a one-image product has exactly one image and no navigation", () => {
    const one = galleryImages([img("img_a")]);
    expect(one).toHaveLength(1);
    expect(galleryHasNavigation(one.length)).toBe(false);
    expect(galleryStep(0, 1, 1)).toBe(0);
    expect(galleryStep(0, -1, 1)).toBe(0);
    expect(galleryStep(0, 1, 0)).toBe(0);
  });

  it("never invents images: duplicates collapse, order follows the catalog", () => {
    const g = galleryImages([img("img_c", 2), img("img_a", 0), img("img_b", 1), img("img_a", 3)]);
    expect(g.map((x) => x.asset)).toEqual(["img_a", "img_b", "img_c"]);
    expect(galleryHasNavigation(g.length)).toBe(true);
  });

  it("steps through multiple genuine images with wrap-around", () => {
    expect(galleryStep(0, 1, 3)).toBe(1);
    expect(galleryStep(2, 1, 3)).toBe(0);
    expect(galleryStep(0, -1, 3)).toBe(2);
  });

  it("primary image is the lowest order", () => {
    expect(primaryImage(p("DEMO-RNG-009", "rings", "X Ring", [], 1111, [img("img_z", 1), img("img_y", 0)]))?.asset).toBe("img_y");
  });
});

describe("urls", () => {
  it("builds image and product URLs from validated ids only", () => {
    expect(demoImageUrl("img_0123456789abcdef", "card", 600)).toMatch(/\/catalog\/img\/img_0123456789abcdef\/card\.webp\?w=600$/);
    expect(demoProductPath({ slug: "demo-rng-001-blue" })).toBe("/demo/catalog/item/demo-rng-001-blue");
  });
});
