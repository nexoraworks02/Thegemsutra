import type { MetadataRoute } from "next";

/**
 * robots.txt. Developer-only (/dev) and DEMO catalog (/demo) pages are never meant
 * for search engines; in a normal production build those routes do not even exist.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/demo/", "/dev/"] },
  };
}
