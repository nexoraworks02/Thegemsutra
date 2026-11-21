import { connection } from "next/server";
import { IMAGE_URL } from "./media";
import { isDemoCatalogEnabled, type DemoCatalog } from "./catalog-shared";

/**
 * The active DEMO catalog from the image service, or null when it is disabled,
 * not imported yet, or unreachable. Read fresh on every request (development data:
 * a re-import or rollback shows up on the next page load). Call it inside <Suspense>.
 */
export async function getDemoCatalog(): Promise<DemoCatalog | null> {
  await connection();
  if (!isDemoCatalogEnabled()) return null;
  try {
    const r = await fetch(`${IMAGE_URL}/catalog/index.json`, { cache: "no-store" });
    if (!r.ok) return null;
    const data = (await r.json()) as DemoCatalog;
    if (data.schema !== "thegemsutra.catalog" || data.environment !== "demo" || !Array.isArray(data.products)) return null;
    return data;
  } catch {
    return null;
  }
}
