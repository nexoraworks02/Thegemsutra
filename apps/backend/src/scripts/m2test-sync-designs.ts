/**
 * M2 TEST ENVIRONMENT ONLY - copy design definitions into the isolated test database.
 *
 * Run through the launcher (never directly):  npm run m2test -- designs
 * The launcher reads the published design definitions from the development database with a
 * READ ONLY transaction and passes them in a temporary JSON file (M2TEST_DESIGNS_FILE). Only
 * the product definition JSON is copied - no customers, carts, orders or other records.
 *
 * Fail-closed, independent of the launcher: this script refuses to run unless the database it
 * is connected to reports port 5433, database "jemsutra_m2test" and carries the M2 sentinel.
 */
import { readFileSync } from "node:fs";
import type { ExecArgs } from "@medusajs/framework/types";
import type { ProductDef } from "@jemsutra/design-engine";
import { getDesign, saveDesign } from "../lib/designs";
import { assertM2TestDatabase } from "../lib/m2test-guard";

export default async function syncDesigns({ container }: ExecArgs) {
  await assertM2TestDatabase();
  const file = process.env.M2TEST_DESIGNS_FILE;
  if (!file) throw new Error("M2TEST_DESIGNS_FILE is not set (run through `npm run m2test -- designs`).");
  const designs = JSON.parse(readFileSync(file, "utf8")) as { status: "published" | "draft"; definition: ProductDef }[];

  for (const d of designs) {
    const existing = await getDesign(container, d.definition.styleCode);
    // Same validation and Medusa product sync as an admin save (single "Made to order" variant).
    await saveDesign(container, { definition: d.definition, status: d.status }, { create: !existing, artworkCheck: "if-reachable" });
    console.log(`${existing ? "updated" : "created"} ${d.definition.styleCode} (${d.status})`);
  }
}
