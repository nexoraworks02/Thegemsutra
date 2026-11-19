/** Official brand identity (customer-facing). Internal identifiers keep the old "jemsutra" names. */
export const BRAND_NAME = "THEGEMSUTRA";
export const BRAND_TAGLINE = "Personalized Jewelry, Made for You";
export const BRAND_DESCRIPTION =
  "Design your own ring or necklace: choose the metal, birthstones and engraving, see it live, and we hand-make it for you.";
/** Burgundy (official). Used for the browser theme colour. */
export const BRAND_COLOR = "#4E091B";

export interface LogoAsset {
  /** Path under /public, e.g. "/brand/logo-burgundy.svg" (SVG preferred; PNG works). */
  src: string;
  /** Intrinsic size of the artwork, so the aspect ratio is always preserved. */
  width: number;
  height: number;
}

/**
 * Approved logo artwork. null = clean text fallback (current state).
 * When the designer's official files arrive, add them to /public/brand/ and set:
 *   onLight: the logo for white/blush backgrounds (e.g. burgundy artwork)
 *   onDark:  the logo for burgundy/near-black backgrounds (e.g. blush or white artwork)
 * Nothing else needs to change: every logo on the site goes through <Logo>.
 */
export const LOGO_ASSETS: { onLight: LogoAsset | null; onDark: LogoAsset | null } = {
  onLight: null,
  onDark: null,
};

/**
 * Site-wide Open Graph fields. Next.js merges metadata shallowly, so pages that set
 * their own `openGraph` (product pages) spread this in to keep the site name.
 */
export const SITE_OPEN_GRAPH = { siteName: BRAND_NAME, type: "website", locale: "en_PK" } as const;
