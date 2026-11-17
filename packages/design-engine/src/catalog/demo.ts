import type { ProductDef } from "../types";

/**
 * DEVELOPMENT-ONLY demo designs for the virtual try-on proof of concept.
 *
 * These are deliberately NOT part of `PRODUCTS`: they are never seeded, never
 * imported into the design table and never listed in the store. The image
 * service only serves them when ENABLE_TRYON_DEMO=true.
 *
 * The artwork is procedural placeholder jewelry (see services/image/src/necklace.ts);
 * only the customer's name is rendered exactly (real font outlines, no AI).
 */
export const DEMO_TRYON_PRODUCTS: ProductDef[] = [
  {
    styleCode: "JSN900",
    name: "Demo Name Necklace (try-on prototype)",
    slug: "demo-name-necklace",
    type: "necklace",
    description: "Development-only demo name necklace used to test virtual try-on.",
    metals: [
      { metal: "SS", price: 9900 },
      { metal: "GP", price: 11900 },
      { metal: "14KY", price: 89900 },
      { metal: "14KR", price: 89900 },
    ],
    defaultMetal: "GP",
    stoneSlots: [],
    engravings: [{ key: "e1", label: "Name", maxChars: 10, price: 0 }],
    fonts: ["script", "classic", "italic", "modern"],
    defaultFont: "script",
    packaging: [{ code: "STD", name: "Signature Box", price: 0 }],
  },
];

export const DEMO_PRODUCT_BY_STYLE: Record<string, ProductDef> = Object.fromEntries(
  DEMO_TRYON_PRODUCTS.map((p) => [p.styleCode, p]),
);
