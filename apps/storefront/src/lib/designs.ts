import { cacheLife, cacheTag } from "next/cache";
import type { ProductDef } from "@jemsutra/design-engine";
import { MEDUSA_URL } from "./medusa";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

/** Cache tag refreshed by the backend whenever a design is saved in the admin. */
export const DESIGNS_TAG = "designs";

/**
 * Published designs from the backend (edited in the admin "Designs" page).
 * Cached; the backend calls /api/revalidate after every save, so changes show
 * up on the next page load.
 */
export async function getDesigns(): Promise<ProductDef[]> {
  "use cache";
  cacheTag(DESIGNS_TAG);
  try {
    const r = await fetch(`${MEDUSA_URL}/store/designs`, { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const { designs } = (await r.json()) as { designs: ProductDef[] };
    cacheLife("hours");
    return designs;
  } catch (e) {
    // Backend not reachable (e.g. still starting): keep this empty result only briefly.
    cacheLife("seconds");
    console.error(`[designs] Could not load designs from ${MEDUSA_URL}: ${(e as Error).message}`);
    return [];
  }
}

export async function getDesign(styleCode: string): Promise<ProductDef | null> {
  return (await getDesigns()).find((d) => d.styleCode === styleCode) ?? null;
}
