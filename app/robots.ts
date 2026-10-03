import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { SITE_URL } = await getEnv();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/menu"],
      disallow: [
        "/admin",
        "/api/",
        "/orders/",
        "/checkout",
        "/cart",
        "/account",
        "/login",
        "/register",
      ],
    },
    ...(SITE_URL
      ? { sitemap: new URL("/sitemap.xml", SITE_URL).toString() }
      : {}),
  };
}
