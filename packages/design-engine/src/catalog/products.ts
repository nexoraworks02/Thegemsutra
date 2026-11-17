import type { ProductDef } from "../types";

/** Same price for every simulated stone; genuine stones priced per slot size. */
const heartStonePrices4mm: Record<string, number> = {
  // simulated / CZ: included
  "S-GARN": 0, "S-AMET": 0, "S-AQUA": 0, CZ: 0, "S-EMER": 0, "S-ALEX": 0,
  "S-RUBY": 0, "S-PERI": 0, "S-SAPH": 0, "S-PTOU": 0, "S-CITR": 0, "S-BTOP": 0,
  // genuine
  GARN: 2900, AMET: 2900, AQUA: 4900, WTOP: 2900, EMER: 9900, PERL: 3900,
  RUBY: 9900, PERI: 2900, SAPH: 9900, PTOU: 4900, CITR: 2900, BTOP: 2900,
  LDIA: 39900,
};

const roundStonePrices3mm: Record<string, number> = {
  "S-GARN": 0, "S-AMET": 0, "S-AQUA": 0, CZ: 0, "S-EMER": 0, "S-ALEX": 0,
  "S-RUBY": 0, "S-PERI": 0, "S-SAPH": 0, "S-PTOU": 0, "S-CITR": 0, "S-BTOP": 0,
  GARN: 1900, AMET: 1900, AQUA: 3900, WTOP: 1900, EMER: 5900, PERL: 2900,
  RUBY: 5900, PERI: 1900, SAPH: 5900, PTOU: 3900, CITR: 1900, BTOP: 1900,
  LDIA: 22900,
};

const standardPackaging = [
  { code: "STD", name: "Signature Box", price: 0, description: "Arrives in our signature ivory box." },
  { code: "PRM", name: "Velvet Keepsake Box", price: 2500, description: "A soft velvet box to keep forever." },
];

export const PRODUCTS: ProductDef[] = [
  {
    styleCode: "JS0001",
    name: "Twin Hearts Birthstone Ring",
    slug: "twin-hearts-birthstone-ring",
    type: "ring",
    description:
      "Two heart-cut stones sit side by side on a gently curved band - one for each of you. Engrave both names along the band to make it yours.",
    metals: [
      { metal: "SS", price: 12900 },
      { metal: "GP", price: 15900 },
      { metal: "10KW", price: 89900 },
      { metal: "10KY", price: 89900 },
      { metal: "10KR", price: 89900 },
      { metal: "14KW", price: 129900 },
      { metal: "14KY", price: 129900 },
      { metal: "14KR", price: 129900 },
    ],
    defaultMetal: "GP",
    stoneSlots: [
      { key: "s1", label: "Left Heart", shape: "heart", sizeMm: "4x4", defaultStone: "S-EMER", prices: heartStonePrices4mm },
      { key: "s2", label: "Right Heart", shape: "heart", sizeMm: "4x4", defaultStone: "S-BTOP", prices: heartStonePrices4mm },
    ],
    engravings: [
      { key: "e1", label: "Left Name", maxChars: 10, price: 0 },
      { key: "e2", label: "Right Name", maxChars: 10, price: 0 },
    ],
    fonts: ["classic", "modern", "italic", "script"],
    defaultFont: "classic",
    size: { min: 4, max: 12, step: 0.5, surchargeFrom: 11, surcharge: 4900, hint: "Most popular size for women is 7" },
    packaging: standardPackaging,
    salePercent: 25,
    badges: ["Best Seller"],
  },
  {
    styleCode: "JS0002",
    name: "Family Birthstone Band",
    slug: "family-birthstone-band",
    type: "ring",
    description:
      "A band of round birthstones - one for every member of your family. Choose from 3 to 9 stones and add a hidden engraving inside.",
    metals: [
      { metal: "SS", price: 14900 },
      { metal: "GP", price: 17900 },
      { metal: "10KY", price: 94900 },
      { metal: "10KR", price: 94900 },
      { metal: "14KY", price: 139900 },
      { metal: "14KW", price: 139900 },
    ],
    defaultMetal: "SS",
    stoneSlots: [],
    stoneCount: {
      min: 3,
      max: 9,
      included: 5,
      pricePerExtra: 1500,
      defaultCount: 5,
      slot: { shape: "round", sizeMm: "3", defaultStone: "CZ", prices: roundStonePrices3mm },
    },
    engravings: [{ key: "e1", label: "Inside Engraving", maxChars: 16, price: 1500 }],
    fonts: ["classic", "script"],
    defaultFont: "classic",
    size: { min: 4, max: 12, step: 0.5, surchargeFrom: 11, surcharge: 4900 },
    packaging: standardPackaging,
    salePercent: 20,
    badges: ["New"],
  },
];

export const PRODUCT_BY_STYLE: Record<string, ProductDef> = Object.fromEntries(
  PRODUCTS.map((p) => [p.styleCode, p]),
);
