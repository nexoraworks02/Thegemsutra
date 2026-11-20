/**
 * Necklace asset intake checker (read-only).
 *
 * Usage:
 *   npm run assets:check -w @jemsutra/image-service -- <manifest.json | asset-folder> [--json]
 *
 * Exit status: 0 = structurally valid (warnings allowed), 1 = problems found, 2 = usage error.
 * Passing is NOT a manufacturing approval and never makes a product publishable.
 */
import { checkNecklaceAssets } from "../src/necklace-assets/intake";

const args = process.argv.slice(2);
const json = args.includes("--json");
const targets = args.filter((a) => a !== "--json");

if (targets.length !== 1 || targets[0] === "--help" || targets[0] === "-h") {
  console.error("Usage: npm run assets:check -w @jemsutra/image-service -- <manifest.json | asset-folder> [--json]");
  process.exit(2);
}

const report = await checkNecklaceAssets(targets[0]!);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const icon = { error: "ERROR  ", warning: "WARNING", info: "INFO   " } as const;
  console.log(`Necklace asset check: ${report.manifestPath ?? targets[0]}`);
  console.log(`Kind: ${report.kind} · files checked: ${report.filesChecked}`);
  for (const i of report.issues) console.log(`  ${icon[i.severity]} ${i.field}: ${i.message}`);
  const errors = report.issues.filter((i) => i.severity === "error").length;
  const warnings = report.issues.filter((i) => i.severity === "warning").length;
  console.log(report.structureValid ? `RESULT: structurally valid (${warnings} warning(s)).` : `RESULT: ${errors} error(s), ${warnings} warning(s). Fix the errors above.`);
  console.log(report.note);
}
process.exit(report.structureValid ? 0 : 1);
