import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { activateVersion, currentVersion, listVersions, readCatalog, rollback, runImport, type ImportReport } from "./import";
import { catalogRoutes, demoCatalogEnabled } from "./routes";
import { hasClaim, isRepdigit, toPublic, validateOverrides, type Overrides } from "./schema";

/*
 * SYNTHETIC FIXTURES ONLY: generated solid-colour images in a temp folder.
 * Titles, tags and prices below are test values, not product data.
 */
const roots: string[] = [];
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })));

async function img(file: string, colour: string, w = 480, h = 360, fmt: "jpeg" | "png" = "jpeg") {
  mkdirSync(path.dirname(file), { recursive: true });
  // a bordered shape so trimming has something to find
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5efe8"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="${colour}"/></svg>`;
  const s = sharp(Buffer.from(svg));
  await (fmt === "png" ? s.png() : s.jpeg()).toFile(file);
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "gs-catalog-"));
  roots.push(root);
  const A = path.join(root, "src", "Rings");
  const B = path.join(root, "src", "Earrings");
  await img(path.join(A, "One.jpg"), "#3355aa");
  await img(path.join(A, "Two.jpg"), "#aa3355");
  copyFileSync(path.join(A, "One.jpg"), path.join(A, "One_2.jpg")); // byte-identical copy
  await img(path.join(A, "Board.jpg"), "#55aa33");
  await img(path.join(B, "Hoop.png"), "#ccaa22", 600, 360, "png");
  await img(path.join(B, "Life.jpg"), "#222222");
  writeFileSync(path.join(B, "notes.txt"), "not an image");
  const overrides: Overrides = {
    schema: "thegemsutra.catalog-overrides",
    schemaVersion: 1,
    dataset: "test-set",
    exclude: [{ file: "Rings/Board.jpg", reason: "mood board" }],
    lifestyle: ["Earrings/Life.jpg"],
    products: [
      { id: "DEMO-RNG-001", category: "rings", title: "Blue Halo Ring", tags: ["blue", "halo"], price: 1111, images: ["Rings/One.jpg"] },
      { id: "DEMO-RNG-002", category: "rings", title: "Red Oval Ring", tags: ["red", "oval"], price: 2222, images: ["Rings/Two.jpg"] },
      { id: "DEMO-EAR-001", category: "earrings", title: "Spiral Hoops", tags: ["hoop", "spiral"], price: 3333, images: ["Earrings/Hoop.png"] },
    ],
  };
  const ovPath = path.join(root, "overrides.json");
  const write = (o: unknown) => writeFileSync(ovPath, JSON.stringify(o));
  write(overrides);
  return { root, A, B, sources: [A, B], out: path.join(root, "out"), ovPath, overrides, write };
}

const run = (f: Awaited<ReturnType<typeof fixture>>, extra: Partial<Parameters<typeof runImport>[0]> = {}) =>
  runImport({ sources: f.sources, overridesPath: f.ovPath, outDir: f.out, ...extra });
const errors = (r: ImportReport) => r.issues.filter((i) => i.severity === "error");

function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isFile()) out[f] = createHash("sha256").update(readFileSync(p)).digest("hex") + statSync(p).mtimeMs;
  }
  return out;
}

describe("schema rules", () => {
  it("rejects claim words in titles", () => {
    for (const t of ["Gold Halo Ring", "Diamond Studs", "18k Floral Necklace", "Sapphire Pendant", "Genuine Pearl Drop", "14 K Band"]) expect(hasClaim(t)).toBe(true);
    for (const t of ["Blue Halo Ring", "Spiral Hoops", "Golfer Ring" /* not "gold" */]) expect(hasClaim(t)).toBe(false);
  });
  it("only allows repeated-digit synthetic prices", () => {
    expect([1111, 22222, 99].every(isRepdigit)).toBe(true);
    expect([1250, 12900, 0, 7, 1111.5, -1111].some(isRepdigit)).toBe(false);
  });
  it("validates ids, categories, tags and schema version", () => {
    const base = { schema: "thegemsutra.catalog-overrides", schemaVersion: 1, dataset: "x-set", products: [] as unknown[] };
    const p = (o: object) => ({ id: "DEMO-RNG-001", category: "rings", title: "Blue Ring", tags: ["blue"], price: 1111, images: ["Rings/a.jpg"], ...o });
    const msgs = (prods: unknown[]) => validateOverrides({ ...base, products: prods }).issues.filter((i) => i.severity === "error").map((i) => i.message).join(" | ");
    expect(msgs([p({ id: "RNG-1" })])).toMatch(/DEMO-RNG-001/);
    expect(msgs([p({ id: "DEMO-EAR-001" })])).toMatch(/does not match category/);
    expect(msgs([p({ tags: ["sparkly"] })])).toMatch(/Unknown tag/);
    expect(msgs([p({ price: 12900 })])).toMatch(/synthetic/);
    expect(msgs([p({}), p({})])).toMatch(/Duplicate id/);
    expect(msgs([p({ images: [] })])).toMatch(/At least one source image/);
    expect(validateOverrides({ ...base, schemaVersion: 2, products: [p({})] }).overrides).toBeNull();
  });
});

describe("import", () => {
  it("imports, de-duplicates, excludes and records lifestyle images", async () => {
    const f = await fixture();
    const r = await run(f);
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.version).toBe("v0001");
    expect(r.stats.filesScanned).toBe(6);
    expect(r.stats.uniqueImages).toBe(5);
    expect(r.stats.duplicates).toEqual([{ file: "Rings/One_2.jpg", duplicateOf: "Rings/One.jpg" }]);
    expect(r.stats.excluded).toBe(1);
    expect(r.stats.lifestyle).toBe(1);
    expect(r.stats.products).toBe(3);
    expect(r.stats.imagesGenerated).toBe(3);
    expect(r.stats.unassigned).toEqual([]);
    expect(r.issues.some((i) => i.field === "Earrings/notes.txt")).toBe(true);

    const c = readCatalog(f.out)!;
    expect(c.environment).toBe("demo");
    expect(c.products.map((p) => p.id)).toEqual(["DEMO-RNG-001", "DEMO-RNG-002", "DEMO-EAR-001"]);
    for (const p of c.products) {
      expect(p.status).toBe("demo");
      expect(p.availability).toBe("not-for-sale");
      expect(p.price.synthetic).toBe(true);
      expect([p.material, p.gemstone, p.sizes, p.description]).toEqual([null, null, null, null]);
      expect(p.slug.startsWith(p.id.toLowerCase())).toBe(true);
    }
    // generated variants exist and are WebP of the expected shape
    const a = c.assets.find((x) => x.usage === "product")!;
    const card = await sharp(path.join(f.out, a.variants.card)).metadata();
    expect([card.format, card.width, card.height]).toEqual(["webp", 1000, 1250]);
    const full = await sharp(path.join(f.out, a.variants.full)).metadata();
    expect(full.format).toBe("webp");
    // lifestyle asset recorded but no files generated for it
    const life = c.assets.find((x) => x.usage === "lifestyle")!;
    expect(existsSync(path.join(f.out, life.variants.card))).toBe(false);
  });

  it("never writes to the source folders", async () => {
    const f = await fixture();
    const before = [hashTree(f.A), hashTree(f.B)];
    await run(f);
    await run(f);
    expect([hashTree(f.A), hashTree(f.B)]).toEqual(before);
  });

  it("dry run writes nothing", async () => {
    const f = await fixture();
    const r = await run(f, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.version).toBeNull();
    expect(existsSync(f.out)).toBe(false);
  });

  it("resolves a referenced duplicate to the original, with a warning", async () => {
    const f = await fixture();
    f.overrides.products[0]!.images = ["Rings/One_2.jpg"];
    f.write(f.overrides);
    const r = await run(f);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.severity === "warning" && /byte-identical copy of Rings\/One.jpg/.test(i.message))).toBe(true);
    expect(readCatalog(f.out)!.assets.find((a) => a.usage === "product" && a.source === "Rings/One.jpg")).toBeTruthy();
  });

  it("refuses: missing file, excluded image, lifestyle image, image shared by two products", async () => {
    for (const [images, re] of [
      [["Rings/Nope.jpg"], /not found/],
      [["Rings/Board.jpg"], /excluded/],
      [["Earrings/Life.jpg"], /lifestyle/],
      [["Rings/Two.jpg"], /Rings\/Two.jpg is already used by DEMO-RNG-001/],
    ] as const) {
      const f = await fixture();
      f.overrides.products[0]!.images = [...images];
      f.write(f.overrides);
      const r = await run(f);
      expect(r.ok).toBe(false);
      expect(errors(r).map((e) => e.message).join(" ")).toMatch(re);
      expect(existsSync(path.join(f.out, "versions"))).toBe(false);
    }
  });

  it("refuses claim titles and realistic prices before touching files", async () => {
    const f = await fixture();
    f.overrides.products[0]!.title = "Gold Sapphire Ring";
    f.overrides.products[1]!.price = 12900;
    f.write(f.overrides);
    const r = await run(f);
    expect(r.ok).toBe(false);
    expect(errors(r)).toHaveLength(2);
    expect(r.stats.filesScanned).toBe(0);
  });

  it("skips non-images, fake extensions and symlinks; reports unassigned images", async () => {
    const f = await fixture();
    writeFileSync(path.join(f.A, "Fake.jpg"), "GIF89a not really");
    await img(path.join(f.A, "Extra.jpg"), "#123456");
    let linked = true;
    try {
      symlinkSync(path.join(f.A, "Two.jpg"), path.join(f.A, "Link.jpg"));
    } catch {
      linked = false; // symlinks may need privileges on Windows
    }
    const r = await run(f);
    expect(r.ok).toBe(true);
    expect(r.issues.find((i) => i.field === "Rings/Fake.jpg")?.severity).toBe("warning");
    if (linked) expect(r.issues.find((i) => i.field === "Rings/Link.jpg")?.message).toMatch(/Symbolic link/);
    expect(r.stats.unassigned).toEqual(["Rings/Extra.jpg"]);
  });

  it("refuses an output folder inside a source folder", async () => {
    const f = await fixture();
    const r = await run(f, { outDir: path.join(f.A, "out") });
    expect(r.ok).toBe(false);
    expect(errors(r)[0]!.message).toMatch(/overlaps source folder/);
    expect(existsSync(path.join(f.A, "out"))).toBe(false);
  });

  it("keeps ids stable across re-imports, reports changes, and rolls back", async () => {
    const f = await fixture();
    await run(f);
    // client replacement: same product id, new image; one product renamed; one removed
    await img(path.join(f.A, "Approved.jpg"), "#0000ff", 500, 500);
    f.overrides.products[0]!.images = ["Rings/Approved.jpg"];
    f.overrides.products[1]!.title = "Red Oval Halo Ring";
    f.overrides.products.pop();
    f.write(f.overrides);
    const r2 = await run(f);
    expect(r2.version).toBe("v0002");
    expect(r2.diff).toEqual({ added: [], removed: ["DEMO-EAR-001"], changed: ["DEMO-RNG-002"], imagesChanged: ["DEMO-RNG-001"], unchanged: 0 });
    expect(readCatalog(f.out)!.products[0]!.id).toBe("DEMO-RNG-001");
    expect(listVersions(f.out)).toEqual(["v0001", "v0002"]);

    expect(rollback(f.out)).toBe("v0001");
    expect(currentVersion(f.out)).toBe("v0001");
    expect(readCatalog(f.out)!.products).toHaveLength(3);
    expect(() => rollback(f.out)).toThrow(/no earlier version/);
    activateVersion(f.out, "v0002");
    expect(currentVersion(f.out)).toBe("v0002");
    expect(() => activateVersion(f.out, "v0099")).toThrow();
  });

  it("public view hides source paths and hashes", async () => {
    const f = await fixture();
    await run(f);
    const pub = JSON.stringify(toPublic(readCatalog(f.out)!));
    expect(pub).not.toMatch(/One\.jpg|sha256|Rings\//);
    expect(pub).toMatch(/"synthetic":true/);
  });
});

describe("routes", () => {
  it("is disabled without DEMO_CATALOG_DIR, and in production unless explicitly enabled", () => {
    expect(demoCatalogEnabled({})).toBeNull();
    expect(demoCatalogEnabled({ DEMO_CATALOG_DIR: "x", NODE_ENV: "production" })).toBeNull();
    expect(demoCatalogEnabled({ DEMO_CATALOG_DIR: "x", NODE_ENV: "production", ENABLE_DEMO_CATALOG: "true" })).toBe(path.resolve("x"));
    expect(demoCatalogEnabled({ DEMO_CATALOG_DIR: "x" })).toBe(path.resolve("x"));
  });

  it("disabled routes return 404", async () => {
    const app = catalogRoutes(null);
    expect((await app.request("/index.json")).status).toBe(404);
  });

  it("serves the active catalog and only its product images", async () => {
    const f = await fixture();
    await run(f);
    const app = catalogRoutes(f.out);
    const idx = await app.request("/index.json");
    expect(idx.status).toBe(200);
    expect(idx.headers.get("x-robots-tag")).toMatch(/noindex/);
    const body = (await idx.json()) as { products: { images: { asset: string }[] }[] };
    expect(body.products).toHaveLength(3);
    const asset = body.products[0]!.images[0]!.asset;

    const im = await app.request(`/img/${asset}/card.webp?w=400`);
    expect(im.status).toBe(200);
    expect(im.headers.get("content-type")).toBe("image/webp");
    expect((await sharp(Buffer.from(await im.arrayBuffer())).metadata()).width).toBe(400);

    const lifeId = readCatalog(f.out)!.assets.find((a) => a.usage === "lifestyle")!.id;
    for (const url of [`/img/${lifeId}/card.webp`, `/img/${asset}/other.webp`, "/img/..%2F..%2Fsecret/card.webp", "/img/img_zzzz/card.webp", "/versions/v0001.json"]) {
      expect((await app.request(url)).status, url).toBe(404);
    }
  });
});
