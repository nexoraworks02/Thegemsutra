import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Developer-only pages (e.g. the virtual try-on prototype) are named `page.dev.tsx`.
 * They are only part of the app in `next dev`, or in a build with ENABLE_TRYON_DEMO=true.
 * In a normal production build the route does not exist, so none of its code
 * (or the MediaPipe library it imports) is compiled into the output.
 */
/** Environment variables that hosting / CI platforms set during builds. */
const DEPLOY_PLATFORM_VARS = ["VERCEL", "NETLIFY", "CF_PAGES", "RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "K_SERVICE", "AWS_EXECUTION_ENV", "HEROKU_APP_ID", "CI"];

export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const devPages = isDev || process.env.ENABLE_TRYON_DEMO === "true";
  // DEMO catalog pages (`page.demo.tsx`, `layout.demo.tsx` under /demo): temporary test
  // products. Same rule, separate switch: absent from a normal production build.
  const demoCatalog = isDev || process.env.ENABLE_DEMO_CATALOG === "true";
  // The demo catalog is for local machines only: a deployment build with the flag fails
  // instead of shipping demo pages (a stray variable can't expose them).
  if (!isDev && process.env.ENABLE_DEMO_CATALOG === "true") {
    const platform = DEPLOY_PLATFORM_VARS.find((v) => process.env[v]);
    if (platform) {
      throw new Error(`ENABLE_DEMO_CATALOG=true is for local builds only; refusing to build on a hosting platform (${platform} is set). Remove the variable.`);
    }
  }
  const imageOrigin = new URL(process.env.NEXT_PUBLIC_IMAGE_URL ?? "http://localhost:4100").origin;
  return {
    pageExtensions: [...(devPages ? ["dev.tsx"] : []), ...(demoCatalog ? ["demo.tsx"] : []), "tsx", "ts", "jsx", "js"],
    async headers() {
      const rules = [];
      // MediaPipe Tasks Vision always sends usage metrics to Google (odml.pa.googleapis.com)
      // and has no option to turn this off. On the try-on page the browser may only
      // connect to our own origin and the image service, so that request is blocked.
      if (devPages) {
        rules.push({
          source: "/dev/:path*",
          headers: [{ key: "Content-Security-Policy", value: `connect-src 'self' ${imageOrigin} blob: data:` }],
        });
      }
      if (demoCatalog) {
        rules.push({ source: "/demo/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] });
      }
      return rules;
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
