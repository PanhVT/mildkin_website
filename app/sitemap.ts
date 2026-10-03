import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { SITE_URL } = await getEnv();
  return SITE_URL
    ? ["/", "/menu", "/about"].map((path) => ({
        url: new URL(path, SITE_URL).toString(),
        changeFrequency: "weekly",
        priority: path === "/" ? 1 : 0.8,
      }))
    : [];
}
