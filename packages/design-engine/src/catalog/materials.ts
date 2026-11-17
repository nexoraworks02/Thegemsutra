import type { Font, Metal, Stone } from "../types";

export const METALS: Metal[] = [
  { code: "SS", name: "925 Sterling Silver", shortLabel: "S", color: "#c9ccd1", highlight: "#f4f6f8", shadow: "#7d838c" },
  { code: "GP", name: "18K Gold Plated Silver", shortLabel: "18K", color: "#e2bf6e", highlight: "#fbe9b7", shadow: "#9c7a2e" },
  { code: "10KW", name: "10K White Gold", shortLabel: "10K", color: "#d6d7d9", highlight: "#fafafa", shadow: "#8a8d92" },
  { code: "10KY", name: "10K Yellow Gold", shortLabel: "10K", color: "#ddb75e", highlight: "#f8e3a6", shadow: "#94712a" },
  { code: "10KR", name: "10K Rose Gold", shortLabel: "10K", color: "#e0a48a", highlight: "#f8d6c6", shadow: "#9a5e47" },
  { code: "14KW", name: "14K White Gold", shortLabel: "14K", color: "#dcdde0", highlight: "#ffffff", shadow: "#8e9196" },
  { code: "14KY", name: "14K Yellow Gold", shortLabel: "14K", color: "#e6bd57", highlight: "#fbe7a8", shadow: "#9b7424" },
  { code: "14KR", name: "14K Rose Gold", shortLabel: "14K", color: "#e7a88c", highlight: "#fadbcb", shadow: "#a0614a" },
];

export const STONES: Stone[] = [
  // Genuine birthstones
  { code: "GARN", name: "Garnet", kind: "genuine", birthMonth: 1, meaning: "Protection, friendship", color: "#8b1a2b", light: "#d4475c", dark: "#4a0a14" },
  { code: "AMET", name: "Amethyst", kind: "genuine", birthMonth: 2, meaning: "Peace, clarity", color: "#7b4fa8", light: "#c39be8", dark: "#3d2160" },
  { code: "AQUA", name: "Aquamarine", kind: "genuine", birthMonth: 3, meaning: "Courage, calm", color: "#7fc8e0", light: "#d4f1fa", dark: "#3a7f98" },
  { code: "WTOP", name: "White Topaz", kind: "genuine", birthMonth: 4, meaning: "Love, strength", color: "#e9eef2", light: "#ffffff", dark: "#a8b2ba" },
  { code: "EMER", name: "Emerald", kind: "genuine", birthMonth: 5, meaning: "Rebirth, love", color: "#1f8a4c", light: "#6fd59a", dark: "#0b4423" },
  { code: "PERL", name: "Pearl", kind: "genuine", birthMonth: 6, meaning: "Purity, wisdom", color: "#efe8dc", light: "#ffffff", dark: "#bfb3a0" },
  { code: "RUBY", name: "Ruby", kind: "genuine", birthMonth: 7, meaning: "Passion, energy", color: "#b0102c", light: "#f05570", dark: "#5c0414" },
  { code: "PERI", name: "Peridot", kind: "genuine", birthMonth: 8, meaning: "Strength, positivity", color: "#9cc93a", light: "#dcf58e", dark: "#567515" },
  { code: "SAPH", name: "Blue Sapphire", kind: "genuine", birthMonth: 9, meaning: "Wisdom, loyalty", color: "#1f3f9c", light: "#6e8ff0", dark: "#0b1c52" },
  { code: "PTOU", name: "Pink Tourmaline", kind: "genuine", birthMonth: 10, meaning: "Compassion, hope", color: "#e06aa0", light: "#ffc2dd", dark: "#8a2a58" },
  { code: "CITR", name: "Citrine", kind: "genuine", birthMonth: 11, meaning: "Joy, success", color: "#e8a51c", light: "#ffe08a", dark: "#8e5a05" },
  { code: "BTOP", name: "Blue Topaz", kind: "genuine", birthMonth: 12, meaning: "Honesty, calm", color: "#3fa7d6", light: "#a9e3fb", dark: "#145e80" },
  { code: "LDIA", name: "Lab Diamond", kind: "lab", birthMonth: 4, meaning: "Eternal love", color: "#f2f6fa", light: "#ffffff", dark: "#9fb0c0" },
  // Simulated (included in price on most designs)
  { code: "S-GARN", name: "Garnet (Simulated)", kind: "simulated", birthMonth: 1, color: "#8b1a2b", light: "#d4475c", dark: "#4a0a14" },
  { code: "S-AMET", name: "Amethyst (Simulated)", kind: "simulated", birthMonth: 2, color: "#7b4fa8", light: "#c39be8", dark: "#3d2160" },
  { code: "S-AQUA", name: "Aquamarine (Simulated)", kind: "simulated", birthMonth: 3, color: "#7fc8e0", light: "#d4f1fa", dark: "#3a7f98" },
  { code: "CZ", name: "Cubic Zirconia", kind: "simulated", birthMonth: 4, color: "#eef2f6", light: "#ffffff", dark: "#a7b3bf" },
  { code: "S-EMER", name: "Emerald (Simulated)", kind: "simulated", birthMonth: 5, color: "#1f8a4c", light: "#6fd59a", dark: "#0b4423" },
  { code: "S-ALEX", name: "Alexandrite (Simulated)", kind: "simulated", birthMonth: 6, color: "#6b3f7a", light: "#b98ac9", dark: "#33183d" },
  { code: "S-RUBY", name: "Ruby (Simulated)", kind: "simulated", birthMonth: 7, color: "#b0102c", light: "#f05570", dark: "#5c0414" },
  { code: "S-PERI", name: "Peridot (Simulated)", kind: "simulated", birthMonth: 8, color: "#9cc93a", light: "#dcf58e", dark: "#567515" },
  { code: "S-SAPH", name: "Sapphire (Simulated)", kind: "simulated", birthMonth: 9, color: "#1f3f9c", light: "#6e8ff0", dark: "#0b1c52" },
  { code: "S-PTOU", name: "Pink Tourmaline (Simulated)", kind: "simulated", birthMonth: 10, color: "#e06aa0", light: "#ffc2dd", dark: "#8a2a58" },
  { code: "S-CITR", name: "Citrine (Simulated)", kind: "simulated", birthMonth: 11, color: "#e8a51c", light: "#ffe08a", dark: "#8e5a05" },
  { code: "S-BTOP", name: "Blue Topaz (Simulated)", kind: "simulated", birthMonth: 12, color: "#3fa7d6", light: "#a9e3fb", dark: "#145e80" },
];

export const FONTS: Font[] = [
  { code: "classic", name: "Classic" },
  { code: "modern", name: "Modern" },
  { code: "italic", name: "Italic" },
  { code: "script", name: "Script" },
];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const byCode = <T extends { code: string }>(list: T[]) =>
  Object.fromEntries(list.map((x) => [x.code, x])) as Record<string, T>;

export const METAL_BY_CODE = byCode(METALS);
export const STONE_BY_CODE = byCode(STONES);
export const FONT_BY_CODE = byCode(FONTS);
