import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import type { Metal } from "@jemsutra/design-engine";
import type { EngravingArea } from "./manifest";

const require = createRequire(import.meta.url);

/** Engraving fonts. Same families the storefront uses for its font picker. */
const FONT_FILES: Record<string, string> = {
  classic: "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
  modern: "@fontsource/montserrat/files/montserrat-latin-500-normal.woff",
  italic: "@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff",
  script: "@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff",
};

const fontCache = new Map<string, opentype.Font>();

function loadFont(code: string): opentype.Font {
  const key = FONT_FILES[code] ? code : "classic";
  let font = fontCache.get(key);
  if (!font) {
    const buf = readFileSync(require.resolve(FONT_FILES[key]!));
    font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    fontCache.set(key, font);
  }
  return font;
}

/** Script fonts look smaller at the same size. */
const SIZE_FACTOR: Record<string, number> = { script: 1.35, modern: 0.82 };

/**
 * Lay text along an ellipse arc and return SVG path markup with an engraved look:
 * a dark cut plus a thin light edge underneath.
 */
export function engravingSvg(text: string, fontCode: string, area: EngravingArea, metal: Metal): string {
  if (!text.trim()) return "";
  const font = loadFont(fontCode);
  let fontSize = area.fontSize * (SIZE_FACTOR[fontCode] ?? 1);
  const scale = () => fontSize / font.unitsPerEm;

  // Sample the arc so we can measure distance along it.
  const samples = 400;
  const pts: { x: number; y: number; d: number; a: number }[] = [];
  let dist = 0;
  for (let i = 0; i <= samples; i++) {
    const deg = area.from + ((area.to - area.from) * i) / samples;
    const t = (deg * Math.PI) / 180;
    const x = area.cx + area.rx * Math.cos(t);
    const y = area.cy + area.ry * Math.sin(t);
    if (i > 0) {
      const p = pts[i - 1]!;
      dist += Math.hypot(x - p.x, y - p.y);
    }
    // tangent in the direction of travel
    const dir = Math.sign(area.to - area.from) || 1;
    const a = Math.atan2(area.ry * Math.cos(t) * dir, -area.rx * Math.sin(t) * dir);
    pts.push({ x, y, d: dist, a });
  }
  const arcLen = dist;

  const glyphs = font.stringToGlyphs(text);
  const measure = () =>
    glyphs.reduce((w, g, i) => {
      const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]!) : 0;
      return w + ((g.advanceWidth ?? 0) + kern) * scale();
    }, 0);

  // Shrink to fit the available arc.
  let width = measure();
  if (width > arcLen * 0.94) {
    fontSize *= (arcLen * 0.94) / width;
    width = measure();
  }

  const at = (d: number) => {
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid]!.d < d) lo = mid + 1;
      else hi = mid;
    }
    return pts[Math.min(lo, pts.length - 1)]!;
  };

  const baselineShift = fontSize * 0.32; // centre the x-height on the band line
  let cursor = (arcLen - width) / 2;
  const parts: string[] = [];
  glyphs.forEach((g, i) => {
    const adv = (g.advanceWidth ?? 0) * scale();
    const centre = at(cursor + adv / 2);
    const deg = (centre.a * 180) / Math.PI;
    const d = g.getPath(-adv / 2, baselineShift, fontSize).toPathData(2);
    if (d) parts.push(`<path transform="translate(${centre.x.toFixed(1)} ${centre.y.toFixed(1)}) rotate(${deg.toFixed(2)})" d="${d}"/>`);
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]!) * scale() : 0;
    cursor += adv + kern;
  });

  const paths = parts.join("");
  const op = area.opacity ?? 1;
  return `
    <g opacity="${op}">
      <g transform="translate(0 1.4)" fill="${metal.highlight}" opacity="0.9">${paths}</g>
      <g fill="${metal.shadow}" opacity="0.95">${paths}</g>
      <g fill="#000" opacity="0.18">${paths}</g>
    </g>`;
}
