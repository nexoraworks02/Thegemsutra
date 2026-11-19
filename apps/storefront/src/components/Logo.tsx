import { BRAND_NAME, LOGO_ASSETS } from "@/lib/brand";

/**
 * The brand logo. Uses the approved artwork from LOGO_ASSETS when configured,
 * otherwise a clean text fallback in the site's serif (not an imitation of the
 * official wordmark).
 *
 * - tone "onLight": for white / blush backgrounds; "onDark": for burgundy / near-black.
 * - height: rendered height in px; the width follows the artwork's own proportions
 *   (never stretched).
 */
export function Logo({ tone = "onLight", height = 40, className = "" }: { tone?: "onLight" | "onDark"; height?: number; className?: string }) {
  const asset = LOGO_ASSETS[tone];
  if (asset) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static SVG/PNG brand artwork, sized by height
      <img
        src={asset.src}
        alt={BRAND_NAME}
        width={Math.round((asset.width / asset.height) * height)}
        height={height}
        className={`block h-auto max-w-full ${className}`}
        style={{ height, width: "auto" }}
      />
    );
  }
  return (
    <span className={`font-serif tracking-[0.18em] leading-none ${tone === "onDark" ? "text-blush" : "text-brand"} ${className}`}>
      {BRAND_NAME}
    </span>
  );
}
