/**
 * DEMO catalog import (local development only).
 *
 *   npm run catalog:import -w @jemsutra/image-service -- --source <folder> [--source <folder> ...]
 *       [--overrides catalog/overrides.demo.json] [--out .demo-catalog] [--dry-run] [--json]
 *   npm run catalog:import -w @jemsutra/image-service -- --status
 *   npm run catalog:import -w @jemsutra/image-service -- --rollback
 *   npm run catalog:import -w @jemsutra/image-service -- --activate v0001
 *
 * Source folders are only read. Output goes to --out (git-ignored), one numbered
 * version per import; `current.json` says which version the image service serves.
 * Exit status: 0 = ok, 1 = problems found, 2 = usage error.
 */
import path from "node:path";
import { DEMO_NOTE, activateVersion, currentVersion, listVersions, readCatalog, rollback, runImport } from "../src/catalog/import";

const args = process.argv.slice(2);
const usage = () => {
  console.error("Usage: catalog:import -- --source <folder> [--source <folder> ...] [--overrides <file>] [--out <folder>] [--dry-run] [--json]\n       catalog:import -- --status | --rollback | --activate vNNNN [--out <folder>]");
  process.exit(2);
};

const sources: string[] = [];
let overrides = "catalog/overrides.demo.json";
let out = ".demo-catalog";
let dryRun = false, json = false, status = false, doRollback = false;
let activate: string | null = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  const next = () => args[++i] ?? usage();
  if (a === "--source") sources.push(next() as string);
  else if (a === "--overrides") overrides = next() as string;
  else if (a === "--out") out = next() as string;
  else if (a === "--dry-run") dryRun = true;
  else if (a === "--json") json = true;
  else if (a === "--status") status = true;
  else if (a === "--rollback") doRollback = true;
  else if (a === "--activate") activate = next() as string;
  else usage();
}

const outDir = path.resolve(out);
if (status) {
  const cur = currentVersion(outDir);
  const c = readCatalog(outDir);
  console.log(`Output: ${outDir}\nVersions: ${listVersions(outDir).join(", ") || "(none)"}\nActive: ${cur ?? "(none)"}${c ? ` - ${c.products.length} demo products, dataset ${c.dataset}` : ""}`);
  process.exit(0);
}
if (doRollback || activate) {
  try {
    const v = doRollback ? rollback(outDir) : (activateVersion(outDir, activate!), activate!);
    console.log(`Active version is now ${v}. Restart is not needed; the image service reads current.json on each request.`);
    process.exit(0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
if (sources.length === 0) usage();

const report = await runImport({ sources, overridesPath: path.resolve(overrides), outDir, dryRun });
if (json) console.log(JSON.stringify(report, null, 2));
else {
  const icon = { error: "ERROR  ", warning: "WARNING", info: "INFO   " } as const;
  const s = report.stats;
  console.log(`Demo catalog import${dryRun ? " (dry run - nothing written)" : ""}`);
  console.log(`Files scanned: ${s.filesScanned} · unique: ${s.uniqueImages} · duplicates: ${s.duplicates.length} · excluded: ${s.excluded} · lifestyle: ${s.lifestyle}`);
  console.log(`Products: ${s.products} · images generated: ${s.imagesGenerated} · unassigned unique images: ${s.unassigned.length}`);
  for (const i of report.issues.filter((x) => x.severity !== "info")) console.log(`  ${icon[i.severity]} ${i.field}: ${i.message}`);
  const infos = report.issues.filter((x) => x.severity === "info").length;
  if (infos) console.log(`  (${infos} info notes - use --json to see them)`);
  if (report.diff) {
    const d = report.diff;
    console.log(`Changes vs active version: +${d.added.length} added, -${d.removed.length} removed, ${d.changed.length} details changed, ${d.imagesChanged.length} images changed, ${d.unchanged} unchanged`);
  }
  if (report.stats.flagged.length) {
    console.log(`Flagged for replacement / review (${report.stats.flagged.length}):`);
    for (const f of report.stats.flagged) console.log(`  - ${f}`);
  }
  const result = !report.ok
    ? "import refused. Fix the errors above."
    : report.unchanged
      ? `ok - no changes; version ${report.version} stays active (nothing written).`
      : report.version
        ? `ok - version ${report.version} is now active.`
        : "ok.";
  console.log(`RESULT: ${result}`);
  console.log(DEMO_NOTE);
}
process.exit(report.ok ? 0 : 1);
