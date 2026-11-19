import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Developer-only pages (e.g. the virtual try-on prototype) are named `page.dev.tsx`.
 * They are only part of the app in `next dev`, or in a build with ENABLE_TRYON_DEMO=true.
 * In a normal production build the route does not exist, so none of its code
 * (or the MediaPipe library it imports) is compiled into the output.
 */
export default function config(phase: string): NextConfig {
  const devPages = phase === PHASE_DEVELOPMENT_SERVER || process.env.ENABLE_TRYON_DEMO === "true";
  const imageOrigin = new URL(process.env.NEXT_PUBLIC_IMAGE_URL ?? "http://localhost:4100").origin;
  return {
    pageExtensions: devPages ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
    // MediaPipe Tasks Vision always sends usage metrics to Google (odml.pa.googleapis.com)
    // and has no option to turn this off. On the try-on page the browser may only
    // connect to our own origin and the image service, so that request is blocked.
    async headers() {
      if (!devPages) return [];
      return [
        {
          source: "/dev/:path*",
          headers: [{ key: "Content-Security-Policy", value: `connect-src 'self' ${imageOrigin} blob: data:` }],
        },
      ];
    },
    cacheComponents: true,
    partialPrefetching: true,
    // The shared engine ships TypeScript source; let Next compile it.
    transpilePackages: ["@jemsutra/design-engine"],
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
