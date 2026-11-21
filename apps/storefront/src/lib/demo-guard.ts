/**
 * DEMO catalog request rules, used by `src/proxy.ts` BEFORE any page renders.
 *
 * Why here and not in the pages: with Cache Components the page shell is streamed
 * first, which fixes the HTTP status at 200; a `notFound()` inside the page can then
 * only show the not-found UI. Deciding in Proxy gives a genuine 404.
 *
 * Pure functions (no Next.js imports) so they can be unit-tested. Deliberately
 * self-contained (no demo catalog module imported), because Proxy is part of every
 * production build: it should carry these route rules and nothing else.
 */

/** Must match DEMO_CATEGORIES in catalog-shared.ts (a unit test checks this). */
export const DEMO_ROUTE_CATEGORIES = ["rings", "earrings", "necklaces", "sets"] as const;

/** Demo product slugs: "demo-rng-001-blue-halo-ring" (see services/image/src/catalog/schema.ts slugFor). */
export const DEMO_SLUG_RE = /^demo-(rng|ear|nck|set)-\d{3}(-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 80;

export type DemoRouteDecision =
  | { action: "allow" }
  | { action: "check-slug"; slug: string }
  | { action: "not-found"; reason: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Is the demo catalog allowed for this request?
 * - `next dev`: yes.
 * - production server: only when ENABLE_DEMO_CATALOG=true AND the request is for a
 *   loopback host. A stray environment variable on a deployed site therefore does
 *   not expose the demo (and no catalog data is deployed anyway).
 */
export function demoAllowed(env: { NODE_ENV?: string; ENABLE_DEMO_CATALOG?: string }, hostname: string): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.ENABLE_DEMO_CATALOG === "true" && LOOPBACK.has(hostname.toLowerCase());
}

/**
 * The host name the request was addressed to, from the Host header (and any
 * X-Forwarded-Host set by a proxy in front). Next.js's own `nextUrl.hostname` reflects
 * the server's bind address under `next start`, so it can't be used for this check.
 * When either header names a non-loopback host, that host is returned.
 */
export function requestHostname(host: string | null, forwardedHost: string | null): string {
  const strip = (h: string) => {
    const v = h.split(",")[0]!.trim().toLowerCase();
    if (v.startsWith("[")) return v.slice(0, v.indexOf("]") + 1); // [::1]:3000 -> [::1]
    return v.split(":")[0]!;
  };
  const names = [forwardedHost, host].filter((h): h is string => !!h && !!h.trim()).map(strip);
  return names.find((n) => !LOOPBACK.has(n)) ?? names[0] ?? "";
}

/** Decide what to do with a /demo request path (already URL-decoded by Next.js). */
export function demoRouteDecision(pathname: string): DemoRouteDecision {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/demo/catalog") return { action: "allow" };
  const parts = path.split("/"); // ["", "demo", "catalog", ...]
  if (parts[1] !== "demo" || parts[2] !== "catalog") return { action: "not-found", reason: "not a demo catalog page" };
  if (parts.length === 4) {
    return (DEMO_ROUTE_CATEGORIES as readonly string[]).includes(parts[3]!)
      ? { action: "allow" }
      : { action: "not-found", reason: "unknown category" };
  }
  if (parts.length === 5 && parts[3] === "item") {
    const slug = parts[4]!;
    if (slug.length > MAX_SLUG_LENGTH || !DEMO_SLUG_RE.test(slug)) return { action: "not-found", reason: "malformed product slug" };
    return { action: "check-slug", slug };
  }
  return { action: "not-found", reason: "unknown demo path" };
}
