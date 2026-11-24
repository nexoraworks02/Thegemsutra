/**
 * M2 TEST ENVIRONMENT ONLY - security test fixtures. Run through: npm run m2test -- fixtures
 *
 * Creates (once) two clearly labelled TEST products in the isolated test database:
 * - "M2 TEST fixture - standard item": an ordinary (non-personalised) product, synthetic price.
 * - "M2 TEST fixture - legacy personalised variant": models the 14 legacy per-metal variants
 *   that exist in the development database (SKU "JS0001-14KR", personalised product metadata),
 *   so the security tests can prove they can't be bought through the standard cart routes.
 * Nothing here is demo-catalog data. Refuses to run outside jemsutra_m2test (shared guard).
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { assertM2TestDatabase } from "../lib/m2test-guard";

const FIXTURES = [
  {
    handle: "m2test-fixture-standard-item",
    title: "M2 TEST fixture - standard item",
    metadata: { kind: "standard", test_fixture: true },
    option: "Test option",
    values: ["A", "B"],
    variants: [
      { title: "Test option A", sku: "M2TEST-STD-A", value: "A", amount: 1111 },
      { title: "Test option B", sku: "M2TEST-STD-B", value: "B", amount: 2222 },
    ],
  },
  {
    handle: "m2test-fixture-legacy-personalised",
    title: "M2 TEST fixture - legacy personalised variant",
    metadata: { personalised: true, style_code: "JS0001", test_fixture: true },
    option: "Metal",
    values: ["14KR"],
    variants: [{ title: "14K Rose Gold (legacy fixture)", sku: "JS0001-14KR", value: "14KR", amount: 3333 }],
  },
];

export default async function createFixtures({ container }: ExecArgs) {
  await assertM2TestDatabase();
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannels = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "Default Sales Channel" });
  const [profile] = await container.resolve(Modules.FULFILLMENT).listShippingProfiles({ type: "default" });

  for (const f of FIXTURES) {
    const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: f.handle } });
    if (data.length) {
      console.log(`exists: ${f.handle}`);
      continue;
    }
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: f.title,
            handle: f.handle,
            status: ProductStatus.PUBLISHED,
            description: "Synthetic security-test fixture (M2 test environment only).",
            metadata: f.metadata,
            shipping_profile_id: profile?.id,
            options: [{ title: f.option, values: f.values }],
            variants: f.variants.map((v) => ({
              title: v.title,
              sku: v.sku,
              manage_inventory: false,
              options: { [f.option]: v.value },
              prices: [{ amount: v.amount, currency_code: "pkr" }],
            })),
            sales_channels: salesChannels[0] ? [{ id: salesChannels[0].id }] : [],
          },
        ],
      },
    });
    console.log(`created: ${f.handle}`);
  }
}
