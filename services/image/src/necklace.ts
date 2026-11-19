import type { Metal } from "@jemsutra/design-engine";
import { SIZE_FACTOR, loadFont } from "./engrave";
import type { NameplateSpec, Point } from "./manifest";

/**
 * TEMPORARY DEMO ARTWORK for the virtual try-on proof of concept.
 *
 * Draws a complete name necklace on a transparent background: the customer's
 * name cut out in metal (exact font outlines - no AI), two jump rings, a chain
 * from each neck anchor down to the name, and a soft contact shadow.
 *
 * Only the NAME is production-accurate. The metal shading, chain links and
 * shadow are procedural placeholders to be replaced by CAD-derived renders
 * (see docs/tryon-phase0.md).
 */

export interface NameplateLayout {
  /** SVG path data of the name, already positioned. */
  pathData: string;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  leftAttach: Point;
  rightAttach: Point;
  fontSize: number;
  text: string;
}

const PLACEHOLDER_NAME = "Name";

/** Default pendant drop of the artwork: neck-anchor line to pendant centre (image px). */
export function defaultDrop(spec: NameplateSpec): number {
  return spec.plateCenter.y - (spec.neckLeft.y + spec.neckRight.y) / 2;
}

/**
 * The nameplate spec with the pendant moved to a requested drop.
 * No drop (or no pendant range in the manifest) = the artwork unchanged.
 * Requested drops are rounded to the manifest step and clamped to its range,
 * so arbitrary values can't create unlimited render variants.
 */
export function withDrop(spec: NameplateSpec, drop?: number): NameplateSpec {
  if (drop == null || !Number.isFinite(drop) || !spec.pendant) return spec;
  const { minDrop, maxDrop, step } = spec.pendant;
  const d = Math.min(maxDrop, Math.max(minDrop, Math.round(drop / step) * step));
  const neckY = (spec.neckLeft.y + spec.neckRight.y) / 2;
  return { ...spec, plateCenter: { x: spec.plateCenter.x, y: neckY + d } };
}

export function nameplateLayout(rawText: string, fontCode: string, spec: NameplateSpec): NameplateLayout {
  const text = rawText.trim() || PLACEHOLDER_NAME;
  const font = loadFont(fontCode);
  let fontSize = spec.fontSize * (SIZE_FACTOR[fontCode] ?? 1);

  // Measure at origin, shrink long names to the maximum plate width.
  let box = font.getPath(text, 0, 0, fontSize).getBoundingBox();
  const width = box.x2 - box.x1;
  if (width > spec.maxPlateWidth) {
    fontSize *= spec.maxPlateWidth / width;
    box = font.getPath(text, 0, 0, fontSize).getBoundingBox();
  }

  // Centre the name on the plate position.
  const ox = spec.plateCenter.x - (box.x1 + box.x2) / 2;
  const oy = spec.plateCenter.y - (box.y1 + box.y2) / 2;
  const path = font.getPath(text, ox, oy, fontSize);
  const b = path.getBoundingBox();
  const attachY = b.y1 + (b.y2 - b.y1) * 0.4;
  const inset = Math.min(8, (b.x2 - b.x1) * 0.04);

  return {
    pathData: path.toPathData(2),
    bbox: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 },
    leftAttach: { x: b.x1 + inset, y: attachY },
    rightAttach: { x: b.x2 - inset, y: attachY },
    fontSize,
    text,
  };
}

/** Chain from a neck anchor down to the name: drops, then curves in towards the name. */
export function chainPath(from: Point, to: Point): string {
  const dy = to.y - from.y;
  const dx = to.x - from.x;
  const c1 = { x: from.x + dx * 0.05, y: from.y + dy * 0.55 };
  const c2 = { x: to.x - dx * 0.45, y: to.y - Math.max(8, dy * 0.04) };
  const f = (n: number) => n.toFixed(1);
  return `M${f(from.x)} ${f(from.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(to.x)} ${f(to.y)}`;
}

export function necklaceSvg(text: string, fontCode: string, spec: NameplateSpec, metal: Metal, width: number, height: number): string {
  const lay = nameplateLayout(text, fontCode, spec);
  const chainL = chainPath(spec.neckLeft, lay.leftAttach);
  const chainR = chainPath(spec.neckRight, lay.rightAttach);
  const cw = spec.chainWidth ?? 5;
  const ring = (p: Point) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(cw * 1.7).toFixed(1)}"/>`;

  // Everything that casts a shadow on the skin, drawn once as a silhouette.
  const silhouette = `
    <path d="${chainL}" fill="none" stroke-width="${cw + 2}" stroke-linecap="round"/>
    <path d="${chainR}" fill="none" stroke-width="${cw + 2}" stroke-linecap="round"/>
    <path d="${lay.pathData}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${metal.highlight}"/>
      <stop offset="0.45" stop-color="${metal.color}"/>
      <stop offset="1" stop-color="${metal.shadow}"/>
    </linearGradient>
    <linearGradient id="metalH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${metal.shadow}"/>
      <stop offset="0.5" stop-color="${metal.color}"/>
      <stop offset="1" stop-color="${metal.shadow}"/>
    </linearGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>

  <!-- contact shadow on the skin -->
  <g transform="translate(4 7)" fill="#000" stroke="#000" opacity="0.32" filter="url(#soft)">${silhouette}</g>

  <!-- chain: dark core, metal links, tiny highlights -->
  <g fill="none" stroke-linecap="round">
    <path d="${chainL}" stroke="${metal.shadow}" stroke-width="${cw + 1.5}"/>
    <path d="${chainR}" stroke="${metal.shadow}" stroke-width="${cw + 1.5}"/>
    <path d="${chainL}" stroke="url(#metalH)" stroke-width="${cw}" stroke-dasharray="${cw * 1.8} ${cw * 0.6}"/>
    <path d="${chainR}" stroke="url(#metalH)" stroke-width="${cw}" stroke-dasharray="${cw * 1.8} ${cw * 0.6}"/>
    <path d="${chainL}" stroke="${metal.highlight}" stroke-width="${cw * 0.3}" stroke-dasharray="${cw * 0.8} ${cw * 1.6}" opacity="0.9"/>
    <path d="${chainR}" stroke="${metal.highlight}" stroke-width="${cw * 0.3}" stroke-dasharray="${cw * 0.8} ${cw * 1.6}" opacity="0.9"/>
  </g>

  <!-- jump rings joining chain and name -->
  <g fill="none" stroke="${metal.shadow}" stroke-width="${cw * 0.9}">${ring(lay.leftAttach)}${ring(lay.rightAttach)}</g>
  <g fill="none" stroke="${metal.color}" stroke-width="${cw * 0.55}">${ring(lay.leftAttach)}${ring(lay.rightAttach)}</g>

  <!-- the name, cut out in metal (exact font outlines) -->
  <path d="${lay.pathData}" transform="translate(1.2 1.6)" fill="${metal.shadow}"/>
  <path d="${lay.pathData}" fill="url(#metalV)" stroke="${metal.shadow}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="${lay.pathData}" transform="translate(-0.8 -1)" fill="${metal.highlight}" opacity="0.35"/>
</svg>`;
}
