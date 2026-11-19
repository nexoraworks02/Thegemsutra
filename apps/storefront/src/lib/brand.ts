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
 * Logo artwork used by <Logo> (header, footer). null = clean text fallback.
 *
 * TEMPORARY: the designer's GEMSUTRA logo, extracted as exact vector paths from the
 * brand board (see brand-assets/gemsutra-temporary/README.md). Replace both files
 * with the corrected THEGEMSUTRA artwork when the designer supplies it; alt text
 * and all customer-facing text already say THEGEMSUTRA.
 *   onLight: near-black logo for white/blush backgrounds (as on the brand board)
 *   onDark:  soft-blush logo for burgundy backgrounds (as on the brand board)
 * width/height = the SVG viewBox, so proportions are always preserved.
 */
export const LOGO_ASSETS: { onLight: LogoAsset | null; onDark: LogoAsset | null } = {
  onLight: { src: "/brand/gemsutra-temporary-logo-on-light.svg", width: 431.434, height: 177.483 },
  onDark: { src: "/brand/gemsutra-temporary-logo-on-dark.svg", width: 431.434, height: 177.483 },
};

/**
 * Site-wide Open Graph fields. Next.js merges metadata shallowly, so pages that set
 * their own `openGraph` (product pages) spread this in to keep the site name.
 */
export const SITE_OPEN_GRAPH = { siteName: BRAND_NAME, type: "website", locale: "en_PK" } as const;
