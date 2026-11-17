/**
 * Generates placeholder render layers for the demo products.
 *
 * Real products will get these layers from 3D renders (one pass per metal,
 * stone-slot masks, engraving area). The file layout and manifest format are
 * the same, so the render service does not change when real assets arrive.
 *
 * Run: npm run layers -w @jemsutra/image-service
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { METALS, STONES, type Metal, type Stone } from "@jemsutra/design-engine";
import type { EngravingArea, ProductManifest, SlotPlacement } from "../src/manifest";

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, "../../../assets");

const W = 1200;
const H = 900;
const BG = "#f7f4ef";

async function svgToPng(svg: string, file: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await sharp(Buffer.from(svg)).png().toBuffer());
}

// ---------- Ring body ----------

interface RingGeometry {
  cx: number;
  cy: number;
  rx: number; // outer
  ry: number;
  thickness: number; // band width seen at the front
  backThickness: number;
}

function ringSvg(m: Metal, g: RingGeometry): string {
  const { cx, cy, rx, ry, thickness, backThickness } = g;
  const irx = rx - 34;
  const iry = ry - (thickness + backThickness) / 2;
  const icy = cy - (thickness - backThickness) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${m.shadow}"/>
      <stop offset="0.18" stop-color="${m.color}"/>
      <stop offset="0.55" stop-color="${m.highlight}"/>
      <stop offset="0.78" stop-color="${m.color}"/>
      <stop offset="1" stop-color="${m.shadow}"/>
    </linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.28"/>
      <stop offset="0.25" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.75" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.28"/>
    </linearGradient>
    <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${m.highlight}"/>
      <stop offset="0.5" stop-color="${m.color}"/>
      <stop offset="1" stop-color="${m.shadow}"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <ellipse cx="${cx}" cy="${cy + ry + 30}" rx="${rx * 0.92}" ry="34" fill="#3a2c1c" opacity="0.18" filter="url(#blur)"/>
  <path fill-rule="evenodd" fill="url(#band)" d="
    M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z
    M ${cx - irx} ${icy} a ${irx} ${iry} 0 1 0 ${2 * irx} 0 a ${irx} ${iry} 0 1 0 ${-2 * irx} 0 Z"/>
  <path fill-rule="evenodd" fill="url(#side)" d="
    M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z
    M ${cx - irx} ${icy} a ${irx} ${iry} 0 1 0 ${2 * irx} 0 a ${irx} ${iry} 0 1 0 ${-2 * irx} 0 Z"/>
  <path fill="url(#inner)" opacity="0.55" d="
    M ${cx - irx} ${icy} a ${irx} ${iry} 0 0 1 ${2 * irx} 0
    a ${irx} ${iry * 0.82} 0 0 0 ${-2 * irx} 0 Z"/>
  <ellipse cx="${cx}" cy="${cy + ry - thickness * 0.42}" rx="${rx * 0.55}" ry="5" fill="#fff" opacity="0.35"/>
</svg>`;
}

/** Point and tangent angle on the band's centre line (used for stones + text). */
function bandPoint(g: RingGeometry, deg: number) {
  const irx = g.rx - 34;
  const mrx = (g.rx + irx) / 2;
  const mry = g.ry - g.thickness / 2;
  const t = (deg * Math.PI) / 180;
  return {
    x: g.cx + mrx * Math.cos(t),
    y: g.cy + mry * Math.sin(t),
    angle: (Math.atan2(mry * Math.cos(t), -mrx * Math.sin(t)) * 180) / Math.PI,
    mrx,
    mry,
  };
}

// ---------- Stones and settings ----------

const HEART = "M50 92 C 20 70, 4 52, 6 32 C 8 14, 24 6, 37 9 C 44 11, 48 16, 50 22 C 52 16, 56 11, 63 9 C 76 6, 92 14, 94 32 C 96 52, 80 70, 50 92 Z";

function stoneSvg(s: Stone, shape: "heart" | "round"): string {
  const outline = shape === "heart" ? `<path d="${HEART}"/>` : `<circle cx="50" cy="50" r="46"/>`;
  const facets =
    shape === "heart"
      ? `<path d="M50 22 L37 9 L28 34 Z" fill="#fff" opacity="0.35"/>
         <path d="M50 22 L63 9 L72 34 Z" fill="#fff" opacity="0.18"/>
         <path d="M28 34 L50 22 L72 34 L50 60 Z" fill="#fff" opacity="0.22"/>
         <path d="M28 34 L50 60 L50 92 L14 52 Z" fill="#000" opacity="0.12"/>
         <path d="M72 34 L50 60 L50 92 L86 52 Z" fill="#000" opacity="0.2"/>`
      : `<polygon points="50,12 78,30 78,70 50,88 22,70 22,30" fill="#fff" opacity="0.18"/>
         <polygon points="50,28 66,40 66,60 50,72 34,60 34,40" fill="#fff" opacity="0.28"/>
         <polygon points="22,30 50,12 50,28 34,40" fill="#fff" opacity="0.3"/>
         <polygon points="78,70 50,88 50,72 66,60" fill="#000" opacity="0.18"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="g" cx="0.4" cy="0.35" r="0.75">
      <stop offset="0" stop-color="${s.light}"/>
      <stop offset="0.55" stop-color="${s.color}"/>
      <stop offset="1" stop-color="${s.dark}"/>
    </radialGradient>
    <clipPath id="c">${outline}</clipPath>
  </defs>
  <g fill="url(#g)">${outline}</g>
  <g clip-path="url(#c)">${facets}</g>
  <g fill="none" stroke="${s.dark}" stroke-opacity="0.55" stroke-width="1.2">${outline}</g>
  <circle cx="36" cy="30" r="4" fill="#fff" opacity="0.85"/>
  <circle cx="36" cy="30" r="9" fill="#fff" opacity="0.18"/>
</svg>`;
}

function settingSvg(m: Metal, shape: "heart" | "round"): string {
  const body =
    shape === "heart"
      ? `<path d="${HEART}" transform="translate(50 52) scale(1.14) translate(-50 -50)"/>`
      : `<circle cx="50" cy="50" r="50"/>`;
  const prongs =
    shape === "heart"
      ? [[50, 98], [7, 26], [93, 26]]
      : [[50, 2], [98, 50], [50, 98], [2, 50]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="-10 -10 120 120">
  <defs>
    <radialGradient id="m" cx="0.35" cy="0.3" r="0.9">
      <stop offset="0" stop-color="${m.highlight}"/>
      <stop offset="0.6" stop-color="${m.color}"/>
      <stop offset="1" stop-color="${m.shadow}"/>
    </radialGradient>
  </defs>
  <g fill="url(#m)">${body}</g>
  ${prongs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="url(#m)" stroke="${m.shadow}" stroke-width="0.8"/>`).join("")}
</svg>`;
}

// ---------- Products ----------

async function twinHearts() {
  const style = "JS0001";
  const g: RingGeometry = { cx: 600, cy: 430, rx: 400, ry: 250, thickness: 78, backThickness: 18 };
  for (const m of METALS) {
    await svgToPng(ringSvg(m, g), path.join(ASSETS, "products", style, "top", `metal-${m.code}.png`));
    await svgToPng(settingSvg(m, "heart"), path.join(ASSETS, "products", style, "top", `setting-${m.code}-heart.png`));
  }
  const left = bandPoint(g, 97);
  const right = bandPoint(g, 83);
  const slots: Record<string, SlotPlacement> = {
    s1: { x: left.x - 4, y: left.y - 18, w: 118, h: 118, rotate: -12 },
    s2: { x: right.x + 4, y: right.y - 18, w: 118, h: 118, rotate: 12 },
  };
  const mid = bandPoint(g, 90);
  const area = (from: number, to: number): EngravingArea => ({
    cx: g.cx, cy: g.cy, rx: mid.mrx, ry: mid.mry, from, to, fontSize: 40,
  });
  const manifest: ProductManifest = {
    styleCode: style,
    defaultView: "top",
    views: {
      top: {
        width: W, height: H, background: BG, stoneShape: "heart", slots,
        // Left name reads left->right along the left front of the band, right name likewise.
        engravings: { e1: area(150, 106), e2: area(74, 30) },
      },
    },
  };
  await writeFile(path.join(ASSETS, "products", style, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function familyBand() {
  const style = "JS0002";
  const g: RingGeometry = { cx: 600, cy: 430, rx: 400, ry: 250, thickness: 70, backThickness: 16 };
  for (const m of METALS) {
    await svgToPng(ringSvg(m, g), path.join(ASSETS, "products", style, "top", `metal-${m.code}.png`));
    await svgToPng(settingSvg(m, "round"), path.join(ASSETS, "products", style, "top", `setting-${m.code}-round.png`));
  }
  const slotLayouts: Record<string, Record<string, SlotPlacement>> = {};
  for (let count = 3; count <= 9; count++) {
    const step = 9.5; // degrees between stones
    const start = 90 + ((count - 1) * step) / 2;
    const layout: Record<string, SlotPlacement> = {};
    for (let i = 0; i < count; i++) {
      const p = bandPoint(g, start - i * step);
      const size = 64 - Math.abs(i - (count - 1) / 2) * 2.2; // smaller towards the sides (perspective)
      layout[`s${i + 1}`] = { x: p.x, y: p.y, w: size, h: size };
    }
    slotLayouts[String(count)] = layout;
  }
  // Inside engraving: back of the band, inner surface, reads left -> right.
  const irx = g.rx - 34;
  const iry = g.ry - (g.thickness + g.backThickness) / 2;
  const icy = g.cy - (g.thickness - g.backThickness) / 2;
  const manifest: ProductManifest = {
    styleCode: style,
    defaultView: "top",
    views: {
      top: {
        width: W, height: H, background: BG, stoneShape: "round", slotLayouts,
        engravings: { e1: { cx: g.cx, cy: icy + 24, rx: irx - 12, ry: iry - 30, from: 238, to: 302, fontSize: 34, opacity: 0.75 } },
      },
    },
  };
  await writeFile(path.join(ASSETS, "products", style, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function stones() {
  for (const s of STONES) {
    for (const shape of ["heart", "round"] as const) {
      await svgToPng(stoneSvg(s, shape), path.join(ASSETS, "stones", shape, `${s.code}.png`));
    }
  }
}

await stones();
await twinHearts();
await familyBand();
console.log(`Demo layers written to ${ASSETS}`);
