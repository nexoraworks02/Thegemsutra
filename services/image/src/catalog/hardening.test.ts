import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { OUTPUT_MARKER, listVersions, readCatalog, rollback, runImport, type ImportReport } from "./import";
import { catalogRoutes } from "./routes";
import { validateOverrides, type Overrides } from "./schema";

/*
 * Hardening tests for the DEMO catalog importer and routes.
 * SYNTHETIC FIXTURES ONLY: generated shapes in temp folders; titles/prices are test values.
 */
const roots: string[] = [];
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "gs-harden-"));
  roots.push(d);
  return d;
};

async function img(file: string, colour: string, w = 480, h = 360) {
  mkdirSync(path.dirname(file), { recursive: true });
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5efe8"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="${colour}"/></svg>`;
  await sharp(Buffer.from(svg)).jpeg().toFile(file);
}

const product = (o: Partial<Overrides["products"][number]> = {}) => ({ id: "DEMO-RNG-001", category: "rings" as const, title: "Blue Ring", tags: ["blue"], price: 1111, images: ["Rings/One.jpg"], ...o });
function overrides(root: string, products: Overrides["products"], extra: Partial<Overrides> = {}) {
  const file = path.join(root, `ov-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ schema: "thegemsutra.catalog-overrides", schemaVersion: 1, dataset: "test-set", products, ...extra }));
  return file;
}
const errors = (r: ImportReport) => r.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" | ");
function treeHash(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p.slice(dir.length) + ":" + createHash("sha256").update(readFileSync(p)).digest("hex") + ":" + statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return h.digest("hex");
}

async function basic() {
  const root = tmp();
  const A = path.join(root, "src", "Rings");
  const B = path.join(root, "src", "Earrings");
  await img(path.join(A, "One.jpg"), "#3355aa");
  await img(path.join(A, "Two.jpg"), "#aa3355");
  return { root, A, B, out: path.join(root, "out") };
}

describe("duplicate detection", () => {
  it("picks the same original whatever order the folders are given in", async () => {
    const f = await basic();
    mkdirSync(f.B, { recursive: true });
    copyFileSync(path.join(f.A, "One.jpg"), path.join(f.B, "One.jpg")); // identical, no copy suffix
    const ov = overrides(f.root, [product()]);
    const r1 = await runImport({ sources: [f.A, f.B], overridesPath: ov, outDir: path.join(f.root, "o1"), dryRun: true });
    const r2 = await runImport({ sources: [f.B, f.A], overridesPath: ov, outDir: path.join(f.root, "o2"), dryRun: true });
    expect(r1.stats.duplicates).toEqual([{ file: "Rings/One.jpg", duplicateOf: "Earrings/One.jpg" }]);
    expect(r2.stats.duplicates).toEqual(r1.stats.duplicates);
  });
});

describe("re-import and replacement", () => {
  it("re-importing identical input writes nothing and keeps the active version", async () => {
    const f = await basic();
    const ov = overrides(f.root, [product()]);
    const r1 = await runImport({ sources: [f.A], overridesPath: ov, outDir: f.out });
    expect(r1.version).toBe("v0001");
    const before = treeHash(f.out);
    const r2 = await runImport({ sources: [f.A], overridesPath: ov, outDir: f.out });
    expect(r2.ok).toBe(true);
    expect(r2.unchanged).toBe(true);
    expect(r2.version).toBe("v0001");
    expect(listVersions(f.out)).toEqual(["v0001"]);
    expect(treeHash(f.out)).toBe(before);
  });

  it("new source images are never added without a reviewed mapping", async () => {
    const f = await basic();
    const ov = overrides(f.root, [product()]);
    await runImport({ sources: [f.A], overridesPath: ov, outDir: f.out });
    await img(path.join(f.A, "Approved-new.jpg"), "#00aa00");
    const r = await runImport({ sources: [f.A], overridesPath: ov, outDir: f.out });
    expect(r.unchanged).toBe(true);
    expect(r.stats.unassigned).toContain("Rings/Approved-new.jpg");
    expect(readCatalog(f.out)!.products.map((p) => p.images.length)).toEqual([1]);
  });

  it("an explicit mapping replaces images while keeping the product id; rollback restores the previous state", async () => {
    const f = await basic();
    await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product()]), outDir: f.out });
    const v1 = JSON.stringify(readCatalog(f.out)!.products);
    await img(path.join(f.A, "Client.jpg"), "#0000ff", 900, 900);
    const r = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product({ images: ["Rings/Client.jpg", "Rings/Two.jpg"] })]), outDir: f.out });
    expect(r.diff!.imagesChanged).toEqual(["DEMO-RNG-001"]);
    const p = readCatalog(f.out)!.products[0]!;
    expect(p.id).toBe("DEMO-RNG-001");
    expect(p.images.map((i) => [i.role, i.order])).toEqual([["primary", 0], ["gallery", 1]]);
    expect(p.images[0]!.asset).not.toBe(JSON.parse(v1)[0].images[0].asset); // asset ids follow content, not the product
    rollback(f.out);
    expect(JSON.stringify(readCatalog(f.out)!.products)).toBe(v1);
  });

  it("carries review notes and lists flagged products", async () => {
    const f = await basic();
    const r = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product({ reviewNotes: ["Replace: checkerboard background baked in"] })]), outDir: f.out });
    expect(r.stats.flagged).toEqual(["DEMO-RNG-001: Replace: checkerboard background baked in"]);
    expect(readCatalog(f.out)!.products[0]!.reviewNotes).toEqual(["Replace: checkerboard background baked in"]);
    const bad = validateOverrides({ schema: "thegemsutra.catalog-overrides", schemaVersion: 1, dataset: "x-set", products: [product({ reviewNotes: ["x".repeat(201)] })] });
    expect(bad.overrides).toBeNull();
  });
});

describe("invalid files fail clearly (also in a dry run)", () => {
  it("refuses a damaged (truncated) image", async () => {
    const f = await basic();
    const full = readFileSync(path.join(f.A, "One.jpg"));
    writeFileSync(path.join(f.A, "Broken.jpg"), full.subarray(0, Math.floor(full.length / 3)));
    for (const dryRun of [true, false]) {
      const r = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product({ images: ["Rings/Broken.jpg"] })]), outDir: f.out, dryRun });
      expect(r.ok).toBe(false);
      expect(errors(r)).toMatch(/Broken\.jpg|damaged|could not be read|not found/i);
    }
    expect(existsSync(path.join(f.out, "versions"))).toBe(false);
  });

  it("refuses too-small images and warns about low resolution", async () => {
    const f = await basic();
    await img(path.join(f.A, "Tiny.jpg"), "#123456", 200, 150);
    const small = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product({ images: ["Rings/Tiny.jpg"] })]), outDir: f.out, dryRun: true });
    expect(small.ok).toBe(false);
    expect(errors(small)).toMatch(/Too small/);
    const ok = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product()]), outDir: f.out, dryRun: true });
    expect(ok.ok).toBe(true);
    expect(ok.issues.some((i) => i.severity === "warning" && /Low resolution/.test(i.message))).toBe(true);
  });

  it("reports a missing source folder", async () => {
    const f = await basic();
    const r = await runImport({ sources: [path.join(f.root, "nope")], overridesPath: overrides(f.root, [product()]), outDir: f.out });
    expect(r.ok).toBe(false);
    expect(errors(r)).toMatch(/Source folder not found/);
  });
});

describe("the importer cannot overwrite unrelated folders", () => {
  it("refuses a non-empty folder it did not create, and marks folders it creates", async () => {
    const f = await basic();
    const other = path.join(f.root, "project-assets");
    mkdirSync(other);
    writeFileSync(path.join(other, "logo.svg"), "<svg/>");
    const before = treeHash(other);
    const r = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product()]), outDir: other });
    expect(r.ok).toBe(false);
    expect(errors(r)).toMatch(/not created by this importer/);
    expect(treeHash(other)).toBe(before);

    const ok = await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product()]), outDir: f.out });
    expect(ok.ok).toBe(true);
    expect(existsSync(path.join(f.out, OUTPUT_MARKER))).toBe(true);
  });

  it("inside a git repository, refuses an output folder that is not git-ignored", async () => {
    if (spawnSync("git", ["--version"]).status !== 0) return; // git not installed
    const f = await basic();
    const repo = path.join(f.root, "repo");
    mkdirSync(repo);
    spawnSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(path.join(repo, ".gitignore"), ".demo-catalog/\n");
    const ov = overrides(f.root, [product()]);
    const tracked = await runImport({ sources: [f.A], overridesPath: ov, outDir: path.join(repo, "public", "demo") });
    expect(tracked.ok).toBe(false);
    expect(errors(tracked)).toMatch(/not git-ignored/);
    expect(existsSync(path.join(repo, "public"))).toBe(false);
    const ignored = await runImport({ sources: [f.A], overridesPath: ov, outDir: path.join(repo, ".demo-catalog") });
    expect(ignored.ok).toBe(true);
  });
});

describe("routes: isolation and path safety", () => {
  async function served() {
    const f = await basic();
    await runImport({ sources: [f.A], overridesPath: overrides(f.root, [product()]), outDir: f.out });
    return { f, app: catalogRoutes(f.out), asset: readCatalog(f.out)!.products[0]!.images[0]!.asset, slug: readCatalog(f.out)!.products[0]!.slug };
  }

  it("answers only for loopback hosts", async () => {
    const { app } = await served();
    expect((await app.request("http://localhost/index.json")).status).toBe(200);
    expect((await app.request("http://127.0.0.1/index.json")).status).toBe(200);
    expect((await app.request("http://shop.example.com/index.json")).status).toBe(404);
    expect((await app.request("http://192.168.1.20/index.json")).status).toBe(404);
  });

  it("refuses to serve a folder that was not created by the importer", async () => {
    const { f } = await served();
    rmSync(path.join(f.out, OUTPUT_MARKER));
    expect((await catalogRoutes(f.out).request("/index.json")).status).toBe(404);
  });

  it("existence check returns only a status", async () => {
    const { app, slug } = await served();
    const yes = await app.request(`/exists/${slug}`);
    expect(yes.status).toBe(204);
    expect(await yes.text()).toBe("");
    for (const s of ["demo-rng-999-missing", "..%2F..%2Fcurrent", "x".repeat(200), "DEMO-RNG-001"]) expect((await app.request(`/exists/${s}`)).status, s).toBe(404);
  });

  it("rejects traversal and malformed asset requests without revealing paths", async () => {
    const { f, app, asset } = await served();
    const bad = [
      "/img/..%2F..%2F..%2Fetc%2Fpasswd/card.webp",
      "/img/img_..%2F..%2Fx/card.webp",
      `/img/${asset}/..%2Fcurrent.json`,
      `/img/${asset}/card.png`,
      `/img/${asset.toUpperCase()}/card.webp`,
      `/img/${asset}0/card.webp`,
      "/versions/v0001.json",
      "/current.json",
      `/assets/${asset}/card.webp`,
      "/.thegemsutra-demo-catalog",
    ];
    for (const u of bad) {
      const r = await app.request(u);
      expect(r.status, u).toBe(404);
      const body = await r.text();
      expect(body, u).not.toContain(f.out);
      expect(body, u).not.toMatch(/[A-Za-z]:\\|\/tmp\/|node_modules/);
    }
    const index = await (await app.request("/index.json")).text();
    expect(index).not.toContain(f.out);
    expect(index).not.toMatch(/Rings\/|One\.jpg|sha256/);
  });

  it("snaps widths to the allowed set and never upscales", async () => {
    const { app, asset } = await served();
    const w = async (q: string) => (await sharp(Buffer.from(await (await app.request(`/img/${asset}/full.webp?w=${q}`)).arrayBuffer())).metadata()).width;
    expect(await w("99999")).toBeLessThanOrEqual(1200);
    expect(await w("-5")).toBeGreaterThan(0);
    expect(await w("abc")).toBeGreaterThan(0);
  });

  it("a damaged generated file gives a plain 404, not an error with details", async () => {
    const { f, app, asset } = await served();
    writeFileSync(path.join(f.out, "assets", asset, "card.webp"), "not an image");
    const r = await app.request(`/img/${asset}/card.webp?w=240`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("Not found");
  });
});
