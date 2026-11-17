/**
 * THEJEMSUTRA seed: Pakistan-first store (decision D1).
 *
 * - Store currencies: PKR (default), USD (for the later international store)
 * - Region "Pakistan" (PKR), manual payment provider (works as cash on delivery for now)
 * - Stock location: Lahore Workshop (made-to-order, no stock tracking)
 * - Shipping: free standard delivery, paid express
 * - Products: one Medusa product per design, one variant per metal (base price in PKR).
 *   Stones, engraving, size and packaging are priced by @jemsutra/design-engine and
 *   stored as line-item metadata at checkout.
 *
 * Run (after DATABASE_URL is set and migrations ran):  npm run seed
 */
import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { METAL_BY_CODE, PRODUCTS, configToQuery, defaultConfig } from "@jemsutra/design-engine";

type ApiKey = { id: string };

const IMAGE_URL = process.env.IMAGE_SERVICE_URL ?? "http://localhost:4100";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: { supported_currencies: { currency_code: string; is_default?: boolean }[]; store_id: string }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map((c) => ({
          currency_code: c.currency_code,
          is_default: c.is_default ?? false,
        })),
      },
    }));
    return new WorkflowResponse(updateStoresStep(normalizedInput));
  },
);

export default async function seedStore({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  const countries = ["pk"];

  logger.info("Seeding store...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({ name: "Default Sales Channel" });
  if (!defaultSalesChannel.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    });
    defaultSalesChannel = result;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [{ currency_code: "pkr", is_default: true }, { currency_code: "usd" }],
    },
  });
  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { name: "THEJEMSUTRA", default_sales_channel_id: defaultSalesChannel[0].id } },
  });

  logger.info("Seeding region...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [{ name: "Pakistan", currency_code: "pkr", countries, payment_providers: ["pp_system_default"] }],
    },
  });
  const region = regionResult[0];

  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({ country_code, provider_id: "tp_system" })),
  });

  logger.info("Seeding workshop location...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(container).run({
    input: { locations: [{ name: "Lahore Workshop", address: { city: "Lahore", country_code: "PK", address_1: "" } }] },
  });
  const stockLocation = stockLocationResult[0];
  await updateStoresWorkflow(container).run({
    input: { selector: { id: store.id }, update: { default_location_id: stockLocation.id } },
  });
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });

  logger.info("Seeding delivery options...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({ type: "default" });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
    shippingProfile = result[0];
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Pakistan delivery",
    type: "shipping",
    service_zones: [{ name: "Pakistan", geo_zones: [{ country_code: "pk", type: "country" }] }],
  });
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });

  const storeRules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
    { attribute: "is_return", value: "false", operator: "eq" as const },
  ];
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Free Delivery",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: { label: "Standard", description: "Free delivery in 3-5 working days after your piece is made.", code: "standard" },
        prices: [{ currency_code: "pkr", amount: 0 }, { region_id: region.id, amount: 0 }],
        rules: storeRules,
      },
      {
        name: "Express Delivery",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: { label: "Express", description: "1-2 working days in major cities.", code: "express" },
        prices: [{ currency_code: "pkr", amount: 500 }, { region_id: region.id, amount: 500 }],
        rules: storeRules,
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [defaultSalesChannel[0].id] },
  });

  logger.info("Seeding publishable API key...");
  const { data } = await query.graph({ entity: "api_key", fields: ["id"], filters: { type: "publishable" } });
  let publishableApiKey: ApiKey | null = data?.[0] ?? null;
  if (!publishableApiKey) {
    const {
      result: [created],
    } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "THEJEMSUTRA Storefront", type: "publishable", created_by: "" }] },
    });
    publishableApiKey = created as ApiKey;
  }
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [defaultSalesChannel[0].id] },
  });

  logger.info("Seeding designs...");
  const { result: categories } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [
        { name: "Rings", is_active: true },
        { name: "Necklaces", is_active: true },
        { name: "Bracelets", is_active: true },
        { name: "Earrings", is_active: true },
      ],
    },
  });
  const categoryFor = (type: string) =>
    categories.find((c) => c.name.toLowerCase() === `${type}s`)?.id ?? categories[0].id;

  await createProductsWorkflow(container).run({
    input: {
      products: PRODUCTS.map((p) => {
        const imageQuery = configToQuery(p, defaultConfig(p), { include: "visual" }).toString();
        const metalNames = p.metals.map((m) => METAL_BY_CODE[m.metal]!.name);
        return {
          title: p.name,
          handle: p.slug,
          description: p.description,
          status: ProductStatus.PUBLISHED,
          category_ids: [categoryFor(p.type)],
          shipping_profile_id: shippingProfile!.id,
          thumbnail: `${IMAGE_URL}/img/${p.styleCode}/${p.slug}.webp?${imageQuery}&w=600`,
          images: [{ url: `${IMAGE_URL}/img/${p.styleCode}/${p.slug}.webp?${imageQuery}&w=1200` }],
          metadata: { style_code: p.styleCode, personalised: true, sale_percent: p.salePercent ?? 0 },
          options: [{ title: "Metal", values: metalNames }],
          variants: p.metals.map((m) => ({
            title: METAL_BY_CODE[m.metal]!.name,
            sku: `${p.styleCode}-${m.metal}`,
            manage_inventory: false, // made to order
            options: { Metal: METAL_BY_CODE[m.metal]!.name },
            metadata: { metal_code: m.metal },
            prices: [{ amount: m.price, currency_code: "pkr" }],
          })),
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        };
      }),
    },
  });

  // Made-to-order variants don't track stock; this only covers any stocked add-ons.
  const { data: inventoryItems } = await query.graph({ entity: "inventory_item", fields: ["id"] });
  const inventoryLevels: CreateInventoryLevelInput[] = inventoryItems.map((item) => ({
    location_id: stockLocation.id,
    stocked_quantity: 1000,
    inventory_item_id: item.id,
  }));
  if (inventoryLevels.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: inventoryLevels } });
  }

  logger.info(`Done. Publishable API key id: ${publishableApiKey.id}`);
}
