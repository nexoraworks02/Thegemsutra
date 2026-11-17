/**
 * One-time import for databases seeded before the design table existed:
 * copies the starter designs into the design table and links their products.
 *
 * Run: npx medusa exec ./src/scripts/import-designs.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { PRODUCTS } from "@jemsutra/design-engine";
import { getDesign, saveDesign } from "../lib/designs";

export default async function importDesigns({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  for (const p of PRODUCTS) {
    if (await getDesign(container, p.styleCode)) {
      logger.info(`${p.styleCode} already imported`);
      continue;
    }
    const saved = await saveDesign(container, { definition: p, status: "published" }, { create: true });
    logger.info(`Imported ${p.styleCode} (${p.name}) -> product ${saved.product_id}`);
  }
}
