import { NextResponse, type NextRequest } from "next/server";
import { demoAllowed, demoRouteDecision, requestHostname } from "@/lib/demo-guard";

/**
 * Runs only for /demo/* (see matcher). Gives the DEMO catalog genuine HTTP 404s and a
 * second isolation layer:
 * - not allowed for this request (production without the explicit local opt-in, or a
 *   non-loopback host) -> 404;
 * - unknown category, malformed or unknown product slug -> 404.
 * The 404 is produced by rewriting to a path with no route, which renders the site's
 * normal not-found page with status 404 (the address bar keeps the requested URL).
 */
const IMAGE_URL = process.env.NEXT_PUBLIC_IMAGE_URL ?? "http://localhost:4100";
const NOT_FOUND_PATH = "/_demo-not-found";

function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { headers: { "X-Robots-Tag": "noindex, nofollow" } });
}

export async function proxy(request: NextRequest) {
  const host = requestHostname(request.headers.get("host"), request.headers.get("x-forwarded-host"));
  if (!demoAllowed(process.env, host)) return notFound(request);
  const decision = demoRouteDecision(request.nextUrl.pathname);
  if (decision.action === "not-found") return notFound(request);
  if (decision.action === "check-slug") {
    try {
      // Tiny existence check (no product data); short timeout so a slow image service never blocks the page.
      const r = await fetch(`${IMAGE_URL}/catalog/exists/${decision.slug}`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
      if (r.status === 404) return notFound(request);
    } catch {
      // Image service unreachable: let the page render its "No demo catalog loaded" message.
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/demo", "/demo/:path*"],
};
