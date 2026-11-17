import { model } from "@medusajs/framework/utils";

/**
 * A personalisable design (one row per style code). `definition` holds the full
 * option model (metals, stone slots, engraving, sizes, packaging) in the
 * @jemsutra/design-engine ProductDef format.
 */
const Design = model.define("design", {
  id: model.id({ prefix: "dsgn" }).primaryKey(),
  style_code: model.text().unique(),
  status: model.enum(["draft", "published"]).default("draft"),
  definition: model.json(),
  product_id: model.text().nullable(),
});

export default Design;
