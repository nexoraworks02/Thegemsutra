import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { loadManifest } from "../render";
import { checkNecklaceAssets, resolveInside, svgSafetyProblems } from "./intake";
import { validateNecklaceManifest } from "./schema";

/*
 * SYNTHETIC FIXTURES ONLY. All numbers below (canvas sizes, mm-per-pixel scale,
 * text box, anchors) are arbitrary test values - not real product dimensions,
 * materials or manufacturing rules.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, "../../../../assets/products");
const tmpRoots: string[] = [];
afterAll(() => tmpRoots.forEach((d) => rmSync(d, { recursive: true, force: true })));

async function png(file: string, w: number, h: number, mode: "transparent" | "opaque" | "noalpha" | "empty" = "transparent") {
  mkdirSync(path.dirname(file), { recursive: true });
  if (mode === "noalpha") return sharp({ create: { width: w, height: h, channels: 3, background: "#808080" } }).png().toFile(file);
  const bg = mode === "opaque" ? { r: 128, g: 128, b: 128, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
  const base = sharp({ create: { width: w, height: h, channels: 4, background: bg } });
  if (mode === "empty" || mode === "opaque") return base.png().toFile(file);
  const shape = await sharp({ create: { width: Math.ceil(w / 2), height: Math.ceil(h / 4), channels: 4, background: { r: 200, g: 170, b: 90, alpha: 1 } } }).png().toBuffer();
  return base.composite([{ input: shape, left: Math.floor(w / 4), top: Math.floor(h / 2) }]).png().toFile(file);
}

const SAFE_SVG = (w: number, h: number) => `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path d="M10 ${h - 10} C ${w / 3} 10, ${(2 * w) / 3} 10, ${w - 10} ${h - 10}" fill="none" stroke="#000"/></svg>\n`;

function baseManifest() {
  return {
    schema: "thegemsutra.necklace-assets",
    schemaVersion: 1,
    styleCode: "TST001",
    units: { length: "mm" },
    provenance: { source: "generated-placeholder", notes: "synthetic test fixture" },
    readiness: "placeholder",
    views: {
      front: { kind: "front", canvas: { width: 1200, height: 900 }, mmPerPx: 0.1, anchors: { chainLeft: { x: 400, y: 300 }, chainRight: { x: 800, y: 300 } } },
    },
    pendant: { type: "nameplate", view: "front", textBox: { x: 350, y: 350, w: 500, h: 200 }, attach: ["chainLeft", "chainRight"] },
    chains: [
      {
        id: "test-chain",
        view: "front",
        connects: ["chainLeft", "chainRight"],
        variants: {
          F1: { file: "chains/test-F1.png", format: "png", width: 600, height: 300, alpha: "required", anchors: { start: { x: 10, y: 290 }, end: { x: 590, y: 290 } } },
          F2: { file: "chains/test-F2.svg", format: "svg", width: 600, height: 300, alpha: "required", anchors: { start: { x: 10, y: 290 }, end: { x: 590, y: 290 } } },
        },
      },
    ],
    finishes: { F1: { label: "Test finish 1" }, F2: { label: "Test finish 2", material: { file: "materials/f2.png", format: "png", width: 256, height: 256 } } },
  };
}
type Manifest = ReturnType<typeof baseManifest> & Record<string, unknown>;

/** Write a complete, valid synthetic asset set; `edit` may change the manifest or files. */
async function fixture(edit?: (m: Manifest, dir: string) => void | Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "necklace-assets-"));
  tmpRoots.push(dir);
  await png(path.join(dir, "chains/test-F1.png"), 600, 300);
  mkdirSync(path.join(dir, "chains"), { recursive: true });
  writeFileSync(path.join(dir, "chains/test-F2.svg"), SAFE_SVG(600, 300));
  await png(path.join(dir, "materials/f2.png"), 256, 256, "opaque");
  const m = baseManifest() as Manifest;
  await edit?.(m, dir);
  writeFileSync(path.join(dir, "necklace-assets.json"), JSON.stringify(m, null, 2));
  return dir;
}
const errors = (r: { issues: { severity: string; field: string; message: string }[] }) => r.issues.filter((i) => i.severity === "error");
const errorText = (r: Parameters<typeof errors>[0]) => errors(r).map((i) => `${i.field}: ${i.message}`).join("\n");

describe("valid synthetic asset sets", () => {
  it("passes a complete synthetic placeholder set (structure only, not an approval)", async () => {
    const r = await checkNecklaceAssets(await fixture());
    expect(errorText(r)).toBe("");
    expect(r.structureValid).toBe(true);
    expect(r.kind).toBe("necklace-assets");
    expect(r.filesChecked).toBe(3);
    expect(r.note).toMatch(/not a manufacturing approval/);
    expect(r).not.toHaveProperty("publishable");
    expect(r.issues.some((i) => i.severity === "info" && /Placeholder artwork/.test(i.message))).toBe(true);
  });

  it("accepts the manifest path directly as well as its folder", async () => {
    const dir = await fixture();
    expect((await checkNecklaceAssets(path.join(dir, "necklace-assets.json"))).structureValid).toBe(true);
  });

  it("accepts optional future fields (worn view, physical limits, artwork pendant)", async () => {
    const dir = await fixture(async (m, d) => {
      (m.views as Record<string, unknown>).worn = { kind: "worn", canvas: { width: 1200, height: 900 }, anchors: { neckL: { x: 300, y: 100 }, neckR: { x: 900, y: 100 }, pc: { x: 600, y: 600 } } };
      m.worn = { view: "worn", anchors: { neckLeft: "neckL", neckRight: "neckR", pendantCenter: "pc" } };
      Object.assign(m.pendant, { maxWidthMm: 40, maxHeightMm: 15, thicknessMm: 1 }); // synthetic test values
      await png(path.join(d, "pendants/heart-F1.png"), 300, 300);
    });
    expect(errorText(await checkNecklaceAssets(dir))).toBe("");
    const art = await fixture(async (m, d) => {
      await png(path.join(d, "pendants/heart-F1.png"), 300, 300);
      m.pendant = { type: "artwork", view: "front", attach: ["chainLeft", "chainRight"], artwork: { F1: { file: "pendants/heart-F1.png", format: "png", width: 300, height: 300, alpha: "required" } } } as never;
    });
    expect(errorText(await checkNecklaceAssets(art))).toBe("");
  });

  it("requires measurements before a nameplate can be called complete, and never for placeholders", async () => {
    const r = await checkNecklaceAssets(await fixture((m) => { m.readiness = "complete"; }));
    const t = errorText(r);
    expect(t).toMatch(/Placeholder artwork cannot be marked "complete"/);
    expect(t).toMatch(/maxWidthMm/);
    expect(t).toMatch(/thicknessMm/);
  });
});

describe("files", () => {
  it("reports missing files", async () => {
    const r = await checkNecklaceAssets(await fixture((m) => { m.chains[0]!.variants.F1.file = "chains/missing.png"; }));
    expect(errorText(r)).toMatch(/chains\/missing\.png: File not found/);
  });

  it("rejects unsupported formats and content that doesn't match the declared format", async () => {
    const declared = await checkNecklaceAssets(await fixture((m) => { (m.chains[0]!.variants.F1 as { format: string }).format = "jpg"; }));
    expect(errorText(declared)).toMatch(/Supported formats: png, webp, svg/);
    const jpegAsPng = await fixture(async (_m, d) => {
      await sharp({ create: { width: 600, height: 300, channels: 3, background: "#808080" } }).jpeg().toFile(path.join(d, "chains/test-F1.png"));
    });
    expect(errorText(await checkNecklaceAssets(jpegAsPng))).toMatch(/not a supported image/);
    const svgAsPng = await fixture((m) => { m.chains[0]!.variants.F2.format = "png"; });
    expect(errorText(await checkNecklaceAssets(svgAsPng))).toMatch(/extension "\.svg" does not match|content is SVG/);
  });

  it("checks image dimensions against the manifest", async () => {
    const r = await checkNecklaceAssets(await fixture((m) => { m.chains[0]!.variants.F1.width = 500; }));
    expect(errorText(r)).toMatch(/image is 600 x 300 px, but the manifest says 500 x 300/);
    const svg = await checkNecklaceAssets(await fixture((_m, d) => writeFileSync(path.join(d, "chains/test-F2.svg"), SAFE_SVG(640, 300))));
    expect(errorText(svg)).toMatch(/viewBox is 640 x 300/);
    const bad = await checkNecklaceAssets(await fixture((m) => { m.views.front.canvas.width = -5; }));
    expect(errorText(bad)).toMatch(/views\.front\.canvas/);
  });

  it("checks transparency where required", async () => {
    const noAlpha = await checkNecklaceAssets(await fixture((_m, d) => png(path.join(d, "chains/test-F1.png"), 600, 300, "noalpha").then(() => undefined)));
    expect(errorText(noAlpha)).toMatch(/has no alpha channel/);
    const opaque = await checkNecklaceAssets(await fixture((_m, d) => png(path.join(d, "chains/test-F1.png"), 600, 300, "opaque").then(() => undefined)));
    expect(errorText(opaque)).toMatch(/every pixel is fully opaque/);
    const empty = await checkNecklaceAssets(await fixture((_m, d) => png(path.join(d, "chains/test-F1.png"), 600, 300, "empty").then(() => undefined)));
    expect(errorText(empty)).toMatch(/completely transparent/);
    // a material reference with optional alpha may be opaque
    expect(errorText(await checkNecklaceAssets(await fixture()))).toBe("");
  });

  it("never modifies the input files", async () => {
    const dir = await fixture();
    const snapshot = () => {
      const out: Record<string, string> = {};
      const walk = (d: string) => readdirSync(d).forEach((n) => {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else out[path.relative(dir, p)] = createHash("sha256").update(readFileSync(p)).digest("hex") + ":" + statSync(p).mtimeMs;
      });
      walk(dir);
      return out;
    };
    const before = snapshot();
    await checkNecklaceAssets(dir);
    expect(snapshot()).toEqual(before);
  });
});

describe("physical scale and anchors", () => {
  it("rejects invalid physical scales and inconsistent physical limits", async () => {
    for (const s of [0, -1, 50, Number.NaN]) {
      const r = await checkNecklaceAssets(await fixture((m) => { m.views.front.mmPerPx = s; }));
      expect(errorText(r)).toMatch(/views\.front\.mmPerPx/);
    }
    const units = await checkNecklaceAssets(await fixture((m) => { (m.units as { length: string }).length = "in"; }));
    expect(errorText(units)).toMatch(/millimetres/);
    // text box is 500 px x 0.1 mm/px = 50 mm wide: a 60 mm plate cannot fit (synthetic values)
    const r = await checkNecklaceAssets(await fixture((m) => { Object.assign(m.pendant, { maxWidthMm: 60 }); }));
    expect(errorText(r)).toMatch(/50\.00 mm wide at this scale, narrower than maxWidthMm/);
  });

  it("rejects out-of-bounds and undeclared anchors", async () => {
    const outside = await checkNecklaceAssets(await fixture((m) => { m.views.front.anchors.chainLeft = { x: 1300, y: 300 }; }));
    expect(errorText(outside)).toMatch(/outside the 1200 x 900 canvas/);
    const assetAnchor = await checkNecklaceAssets(await fixture((m) => { m.chains[0]!.variants.F1.anchors.end = { x: 700, y: 10 }; }));
    expect(errorText(assetAnchor)).toMatch(/outside the 600 x 300 canvas/);
    const undeclared = await checkNecklaceAssets(await fixture((m) => { m.pendant.attach = ["chainLeft", "nowhere"]; }));
    expect(errorText(undeclared)).toMatch(/Anchor "nowhere" is not declared/);
    const missingEnd = await checkNecklaceAssets(await fixture((m) => { delete (m.chains[0]!.variants.F1.anchors as Record<string, unknown>).end; }));
    expect(errorText(missingEnd)).toMatch(/needs a "end" anchor/);
    const box = await checkNecklaceAssets(await fixture((m) => { m.pendant.textBox = { x: 1000, y: 350, w: 500, h: 200 }; }));
    expect(errorText(box)).toMatch(/must lie inside the view canvas/);
  });
});

describe("references and duplicates", () => {
  it("detects duplicate and inconsistent asset references", async () => {
    const dup = await checkNecklaceAssets(await fixture((m) => { m.chains[0]!.variants.F2 = { ...m.chains[0]!.variants.F1 } as never; }));
    expect(errorText(dup)).toMatch(/is also used by/);
    const caseDup = await checkNecklaceAssets(await fixture((m) => { (m.finishes.F2.material as { file: string }).file = "CHAINS/test-F1.png"; }));
    expect(errorText(caseDup)).toMatch(/also used by|File not found/);
    const ids = await checkNecklaceAssets(await fixture((m) => { m.chains.push({ ...m.chains[0]!, variants: {} as never }); }));
    expect(errorText(ids)).toMatch(/Chain id "test-chain" is used twice/);
    const finish = await checkNecklaceAssets(await fixture((m) => { (m.chains[0]!.variants as Record<string, unknown>).F9 = { file: "chains/f9.png", format: "png", width: 1, height: 1 }; }));
    expect(errorText(finish)).toMatch(/Finish "F9" is not declared/);
    const view = await checkNecklaceAssets(await fixture((m) => { m.chains[0]!.view = "side"; }));
    expect(errorText(view)).toMatch(/view "side", which is not declared/);
  });

  it("warns (or errors when complete) about finishes without chain artwork", async () => {
    const r = await checkNecklaceAssets(await fixture((m) => { delete (m.chains[0]!.variants as Record<string, unknown>).F2; }));
    expect(r.structureValid).toBe(true);
    expect(r.issues.some((i) => i.severity === "warning" && /No chain artwork for finish\(es\): F2/.test(i.message))).toBe(true);
  });
});

describe("schema versions", () => {
  it("rejects unknown schema versions and non-necklace manifests without guessing", async () => {
    const v2 = await checkNecklaceAssets(await fixture((m) => { (m as { schemaVersion: number }).schemaVersion = 2; }));
    expect(errorText(v2)).toMatch(/Unsupported schema version 2/);
    expect(errors(v2)).toHaveLength(1); // nothing else is interpreted
    const other = await checkNecklaceAssets(await fixture((m) => { (m as { schema: string }).schema = "something-else"; }));
    expect(errorText(other)).toMatch(/Not a necklace asset manifest/);
    expect(validateNecklaceManifest("nope").issues[0]!.message).toMatch(/JSON object/);
  });

  it("warns about unknown fields (likely typos)", async () => {
    const r = await checkNecklaceAssets(await fixture((m) => { m.chainz = []; }));
    expect(r.issues.some((i) => i.severity === "warning" && i.field === "chainz")).toBe(true);
  });
});

describe("security", () => {
  it("rejects path traversal, absolute paths and unsafe characters", async () => {
    for (const bad of ["../outside.png", "chains/../../outside.png", "/etc/passwd", "C:/Windows/win.ini", "chains\\test-F1.png", "chains//test-F1.png", "chains/te st.png", "chains/%2e%2e/x.png"]) {
      const r = await checkNecklaceAssets(await fixture((m) => { m.chains[0]!.variants.F1.file = bad; }));
      expect(errors(r).some((i) => i.field.endsWith("F1.file")), `expected ${bad} to be rejected`).toBe(true);
    }
  });

  it("rejects symbolic links that escape the asset folder", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "necklace-outside-"));
    tmpRoots.push(outside);
    await png(path.join(outside, "secret.png"), 600, 300);
    let linked = true;
    const dir = await fixture((_m, d) => {
      try {
        symlinkSync(path.join(outside, "secret.png"), path.join(d, "chains/link.png"), "file");
      } catch {
        linked = false; // creating symlinks needs extra rights on some Windows setups
      }
    });
    if (!linked) return expect(resolveInside(dir, "chains/test-F1.png")).toHaveProperty("abs");
    writeFileSync(path.join(dir, "necklace-assets.json"), readFileSync(path.join(dir, "necklace-assets.json"), "utf8").replace("chains/test-F1.png", "chains/link.png"));
    expect(errorText(await checkNecklaceAssets(dir))).toMatch(/outside the manifest folder/);
  });

  it("rejects active or external SVG content", () => {
    const cases: [string, RegExp][] = [
      ['<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', /<script>/],
      ['<svg viewBox="0 0 1 1" onload="x()"></svg>', /event handler/],
      ['<svg viewBox="0 0 1 1"><use href="https://example.com/a.svg#x"/></svg>', /outside the file/],
      ['<svg viewBox="0 0 1 1"><image href="data:image/png;base64,AAAA"/></svg>', /<image>/],
      ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1">&x;</svg>', /DOCTYPE/],
      ['<svg viewBox="0 0 1 1"><foreignObject><div/></foreignObject></svg>', /foreignObject/],
      ['<svg viewBox="0 0 1 1"><rect style="fill:url(https://x/y)"/></svg>', /url\(/],
      ['<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"/></svg>', /javascript:/],
    ];
    for (const [svg, re] of cases) expect(svgSafetyProblems(svg).join(" ")).toMatch(re);
    expect(svgSafetyProblems(SAFE_SVG(10, 10))).toEqual([]);
    expect(svgSafetyProblems('<svg viewBox="0 0 1 1"><use href="#a"/><path fill="url(#g)"/></svg>')).toEqual([]);
  });

  it("refuses an unsafe SVG inside an asset set", async () => {
    const r = await checkNecklaceAssets(await fixture((_m, d) => writeFileSync(path.join(d, "chains/test-F2.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><script>alert(1)</script></svg>')));
    expect(errorText(r)).toMatch(/unsafe SVG: contains a <script> element/);
  });

  it("caps manifest size and handles unreadable input", async () => {
    const dir = await fixture();
    writeFileSync(path.join(dir, "necklace-assets.json"), " ".repeat(1024 * 1024 + 10));
    expect(errorText(await checkNecklaceAssets(dir))).toMatch(/limit is/);
    expect(errorText(await checkNecklaceAssets(path.join(dir, "does-not-exist")))).toMatch(/not found/);
    writeFileSync(path.join(dir, "necklace-assets.json"), "{ not json");
    expect(errorText(await checkNecklaceAssets(dir))).toMatch(/Not valid JSON/);
  });
});

describe("backward compatibility with existing render manifests", () => {
  it("recognises the current ring and demo manifests without changing them", async () => {
    for (const code of ["JS0001", "JS0002", "JSN900"]) {
      const file = path.join(ASSETS, code, "manifest.json");
      const before = readFileSync(file);
      const r = await checkNecklaceAssets(path.join(ASSETS, code));
      expect(r.kind).toBe("legacy-render-manifest");
      expect(r.structureValid).toBe(true);
      expect(readFileSync(file).equals(before)).toBe(true);
    }
  });

  it("keeps JSN900 flagged as a developer-only demo, not a verified product", async () => {
    const r = await checkNecklaceAssets(path.join(ASSETS, "JSN900"));
    const warnings = r.issues.filter((i) => i.severity === "warning").map((i) => i.message).join(" ");
    expect(warnings).toMatch(/developer-only demo/);
    expect(warnings).toMatch(/not a verified physical product/);
  });

  it("the renderer still loads the existing manifests", async () => {
    for (const code of ["JS0001", "JS0002", "JSN900"]) expect((await loadManifest(code))?.views).toBeTruthy();
  });
});

describe("command line", () => {
  const cli = (args: string[]) =>
    spawnSync(process.execPath, [path.resolve(here, "../../../../node_modules/tsx/dist/cli.mjs"), path.resolve(here, "../../scripts/check-necklace-assets.ts"), ...args], { encoding: "utf8" });

  it("exits 0 for a valid set, 1 for problems, 2 for usage errors", async () => {
    const ok = cli([await fixture()]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/RESULT: structurally valid/);
    expect(ok.stdout).toMatch(/not a manufacturing approval/);
    const bad = cli([await fixture((m) => { m.chains[0]!.variants.F1.file = "../x.png"; })]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/ERROR/);
    expect(cli([]).status).toBe(2);
    const json = cli([await fixture(), "--json"]);
    expect(JSON.parse(json.stdout).structureValid).toBe(true);
  }, 60_000);
});
