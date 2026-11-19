import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { DEMO_PRODUCT_BY_STYLE, PRODUCT_BY_STYLE, normalizeConfig } from "@jemsutra/design-engine";
import { chainPath, defaultDrop, nameplateLayout, withDrop } from "./necklace";
import { loadManifest, renderDesign } from "./render";

const demo = DEMO_PRODUCT_BY_STYLE["JSN900"]!;

async function spec() {
  const m = await loadManifest("JSN900");
  return m!.views.worn!.nameplate!;
}

async function alphaAt(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(Math.round(y) * info.width + Math.round(x)) * info.channels + 3]!;
}

describe("name necklace layout", () => {
  it("uses the exact name the customer typed", async () => {
    const lay = nameplateLayout("Ayesha", "script", await spec());
    expect(lay.text).toBe("Ayesha");
    expect(lay.pathData.length).toBeGreaterThan(100);
  });

  it("falls back to a placeholder only when the name is empty", async () => {
    expect(nameplateLayout("   ", "script", await spec()).text).toBe("Name");
  });

  it("centres the name on the plate and attaches the chain at its ends", async () => {
    const s = await spec();
    const lay = nameplateLayout("Hamza", "classic", s);
    expect((lay.bbox.x1 + lay.bbox.x2) / 2).toBeCloseTo(s.plateCenter.x, 0);
    expect(lay.leftAttach.x).toBeLessThan(s.plateCenter.x);
    expect(lay.rightAttach.x).toBeGreaterThan(s.plateCenter.x);
  });

  it("shrinks long names to the maximum plate width", async () => {
    const s = await spec();
    const short = nameplateLayout("Ali", "script", s);
    const long = nameplateLayout("Alexandrina", "script", s);
    expect(long.bbox.x2 - long.bbox.x1).toBeLessThanOrEqual(s.maxPlateWidth + 1);
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it("chain starts exactly at the neck anchor", () => {
    expect(chainPath({ x: 200, y: 70 }, { x: 480, y: 660 })).toMatch(/^M200\.0 70\.0 C/);
  });
});

describe("pendant drop", () => {
  it("leaves the artwork unchanged when no drop is requested", async () => {
    const s = await spec();
    expect(withDrop(s)).toBe(s);
    expect(withDrop(s, Number.NaN)).toBe(s);
    expect(defaultDrop(s)).toBe(620);
  });

  it("moves the pendant to the requested drop, rounded and clamped to the manifest range", async () => {
    const s = await spec();
    expect(withDrop(s, 500).plateCenter).toEqual({ x: 600, y: 570 });
    expect(withDrop(s, 507).plateCenter.y).toBe(570); // 20 px steps
    expect(withDrop(s, 5000).plateCenter.y).toBe(70 + 740);
    expect(withDrop(s, 0).plateCenter.y).toBe(70 + 380);
  });

  it("renders the name higher for a shorter drop and keeps the deepest drop inside the image", async () => {
    const cfg = normalizeConfig(demo, { font: "script", engravings: { e1: "Jayy" } });
    const short = await renderDesign(demo, cfg, { width: 1200, format: "png", drop: 400 });
    const deep = await renderDesign(demo, cfg, { width: 1200, format: "png", drop: 740 });
    expect(short.buffer.equals(deep.buffer)).toBe(false);
    // bottom rows stay transparent even with descenders at the deepest drop
    for (const x of [450, 600, 750]) expect(await alphaAt(deep.buffer, x, 897)).toBe(0);
  });

  it("is ignored for ring images", async () => {
    const ring = PRODUCT_BY_STYLE["JS0001"]!;
    const a = await renderDesign(ring, normalizeConfig(ring, {}), { width: 400, format: "png" });
    const b = await renderDesign(ring, normalizeConfig(ring, {}), { width: 400, format: "png", drop: 500 });
    expect(a.buffer.equals(b.buffer)).toBe(true);
  });
});

describe("transparent necklace render", () => {
  it("produces a PNG with a genuinely transparent background", async () => {
    const config = normalizeConfig(demo, { metal: "GP", font: "script", engravings: { e1: "Ayesha" } });
    const { buffer, contentType } = await renderDesign(demo, config, { width: 1200, format: "png" });
    expect(contentType).toBe("image/png");
    const meta = await sharp(buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(1200);
    // corners and the space between the chains are fully transparent
    expect(await alphaAt(buffer, 5, 5)).toBe(0);
    expect(await alphaAt(buffer, 1195, 895)).toBe(0);
    expect(await alphaAt(buffer, 600, 300)).toBe(0);
    // the neck anchor (chain start) is drawn
    expect(await alphaAt(buffer, 200, 72)).toBeGreaterThan(200);
  });

  it("changes when the name changes (the image is personalised)", async () => {
    const a = await renderDesign(demo, normalizeConfig(demo, { engravings: { e1: "Sara" } }), { width: 600, format: "png" });
    const b = await renderDesign(demo, normalizeConfig(demo, { engravings: { e1: "Zainab" } }), { width: 600, format: "png" });
    expect(a.buffer.equals(b.buffer)).toBe(false);
  });

  it("keeps ring images opaque (existing rendering unchanged)", async () => {
    const ring = PRODUCT_BY_STYLE["JS0001"]!;
    const { buffer } = await renderDesign(ring, normalizeConfig(ring, {}), { width: 400, format: "png" });
    expect(await alphaAt(buffer, 2, 2)).toBe(255);
  });
});
