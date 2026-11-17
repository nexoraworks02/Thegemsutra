/** Prices are whole numbers in the store's base currency (PKR). */
export type Money = number;

export type ProductType = "ring" | "necklace" | "bracelet" | "earring";
export type StoneKind = "genuine" | "lab" | "simulated";
export type StoneShape = "heart" | "round" | "oval" | "princess" | "pear" | "marquise";

export interface Metal {
  code: string; // e.g. "SS", "GP", "10KY", "14KR"
  name: string; // "14K Rose Gold"
  shortLabel: string; // "14K"
  /** Swatch / render colours */
  color: string;
  highlight: string;
  shadow: string;
}

export interface Stone {
  code: string; // e.g. "EMER", "S-EMER"
  name: string; // "Emerald"
  kind: StoneKind;
  birthMonth?: number; // 1..12
  meaning?: string;
  /** Render colours */
  color: string;
  light: string;
  dark: string;
}

export interface Font {
  code: string; // "classic" | "modern" | "italic" | "script"
  name: string;
}

export interface MetalOption {
  metal: string; // Metal.code
  price: Money; // base price of the design in this metal
}

export interface StoneSlotDef {
  key: string; // "s1", "s2" ... (URL key)
  label: string; // "Top Heart"
  shape: StoneShape;
  sizeMm: string; // "4x4"
  defaultStone: string;
  /** Price of each allowed stone *for this slot size*. 0 = included. */
  prices: Record<string, Money>;
}

export interface StoneCountDef {
  min: number;
  max: number;
  /** Count included in the base price */
  included: number;
  pricePerExtra: Money;
  /** Template used to create s1..sN slots */
  slot: Omit<StoneSlotDef, "key" | "label">;
  defaultCount: number;
}

export interface EngravingDef {
  key: string; // "e1", "e2", "e0"
  label: string;
  maxChars: number;
  price: Money; // extra charge when filled
}

export interface SizeDef {
  min: number;
  max: number;
  step: number;
  /** Sizes >= this value cost `surcharge` extra */
  surchargeFrom?: number;
  surcharge?: Money;
  hint?: string;
}

export interface PackagingOption {
  code: string;
  name: string;
  price: Money;
  description?: string;
}

export interface ProductDef {
  styleCode: string; // "JS0001"
  name: string;
  slug: string;
  type: ProductType;
  description: string;
  metals: MetalOption[];
  defaultMetal: string;
  /** Fixed slots. Ignored when `stoneCount` is set. */
  stoneSlots: StoneSlotDef[];
  stoneCount?: StoneCountDef;
  engravings: EngravingDef[];
  fonts: string[]; // Font.code
  defaultFont: string;
  size?: SizeDef;
  packaging: PackagingOption[];
  /** Strike-through "compare at" price = price / (1 - salePercent/100) */
  salePercent?: number;
  badges?: string[];
}

/** Everything the shopper chose. Serialisable to/from the URL. */
export interface DesignConfig {
  metal: string;
  stoneCount?: number;
  stones: Record<string, string>; // slot key -> stone code
  engravings: Record<string, string>; // engraving key -> text
  font: string;
  size?: number;
  packaging: string;
}

export interface PriceLine {
  label: string;
  detail: string;
  amount: Money;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  total: Money;
  compareAt?: Money;
}

export interface ValidationIssue {
  field: string;
  message: string;
}
