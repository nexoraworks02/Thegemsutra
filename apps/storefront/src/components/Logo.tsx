import { BRAND_NAME, LOGO_ASSETS } from "@/lib/brand";

/**
 * The brand logo. Uses the approved artwork from LOGO_ASSETS when configured,
 * otherwise a clean text fallback in the site's serif (not an imitation of the
 * official wordmark).
 *
 * - tone "onLight": for white / blush backgrounds; "onDark": for burgundy / near-black.
 * - height: rendered height in px (also used for the width/height attributes, so the
 *   browser reserves the right space before the file loads: no layout shift).
 * - heightClass: optional responsive Tailwind heights (e.g. "h-12 sm:h-16"); the
 *   width always follows the artwork's own proportions (never stretched).
 * - alt text is the official name THEGEMSUTRA, even while the artwork reads GEMSUTRA.
 */
export function Logo({
  tone = "onLight",
  height = 40,
  heightClass,
  className = "",
}: {
  tone?: "onLight" | "onDark";
  height?: number;
  heightClass?: string;
  className?: string;
}) {
  const asset = LOGO_ASSETS[tone];
  if (asset) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static vector brand artwork, sized by height
      <img
        src={asset.src}
        alt={BRAND_NAME}
        width={Math.round((asset.width / asset.height) * height)}
        height={height}
        decoding="async"
        className={`block max-w-full ${heightClass ?? ""} ${className}`}
        style={heightClass ? { width: "auto" } : { height, width: "auto" }}
      />
    );
  }
  return (
    <span className={`font-serif tracking-[0.18em] leading-none ${tone === "onDark" ? "text-blush" : "text-brand"} ${className}`}>
      {BRAND_NAME}
    </span>
  );
}
