import { PRODUCT_BY_STYLE, type ProductDef } from "@jemsutra/design-engine";

/**
 * Design definitions come from the backend (edited in the admin), including
 * drafts so the admin can preview them. Cached briefly; if the backend can't be
 * reached, the bundled starter catalog is used so images keep working.
 */
const MEDUSA_URL = process.env.MEDUSA_URL ?? "http://localhost:9000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const TTL_MS = 30_000;

interface Entry {
  def: ProductDef | null;
  version: string;
  at: number;
}
const cache = new Map<string, Entry>();
let warned = false;

export async function getDesign(styleCode: string): Promise<{ def: ProductDef; version: string } | null> {
  if (!/^[A-Z]{2,4}\d{3,5}$/.test(styleCode)) return null;
  const hit = cache.get(styleCode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.def ? { def: hit.def, version: hit.version } : null;

  try {
    if (!INTERNAL_API_KEY) throw new Error("INTERNAL_API_KEY not set");
    const r = await fetch(`${MEDUSA_URL}/internal/designs/${styleCode}`, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (r.status === 404) {
      cache.set(styleCode, { def: null, version: "", at: Date.now() });
      return null;
    }
    if (!r.ok) throw new Error(`backend responded ${r.status}`);
    const body = (await r.json()) as { design: ProductDef; updated_at?: string };
    const entry = { def: body.design, version: String(body.updated_at ?? ""), at: Date.now() };
    cache.set(styleCode, entry);
    return { def: entry.def, version: entry.version };
  } catch (e) {
    if (!warned) {
      console.warn(`[designs] Using bundled starter catalog (${(e as Error).message})`);
      warned = true;
    }
    const def = PRODUCT_BY_STYLE[styleCode];
    return def ? { def, version: "bundled" } : null;
  }
}
