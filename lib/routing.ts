import { z } from "zod";
import type { Env } from "./env";
import { PublicError } from "./http";
import { fetchGeocoderWithRetry, fetchErrorName } from "./geocoder-fetch";
import { shippingConfig, shippingUnavailableMessage } from "./shipping";

const routeSchema = z.object({
  features: z.array(z.object({ properties: z.object({
    distance: z.number().finite().nonnegative(),
    distance_units: z.literal("meters"),
  }) })).min(1),
});

// Geoapify waypoints use latitude,longitude; metric route distances are meters.
export async function roadDistanceKm(env: Pick<Env, "GEOAPIFY_API_KEY" | "STORE_LAT" | "STORE_LNG">, lat: number, lng: number) {
  let status: number | undefined;
  try {
    const { storeLat, storeLng } = shippingConfig(env);
    const apiKey = env.GEOAPIFY_API_KEY?.trim();
    if (!apiKey) throw new PublicError(shippingUnavailableMessage, 503, "ROUTING_CONFIG");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new PublicError(shippingUnavailableMessage, 503, "ROUTING_COORDINATES");
    }
    const url = new URL("https://api.geoapify.com/v1/routing");
    url.search = new URLSearchParams({
      waypoints: `${storeLat},${storeLng}|${lat},${lng}`,
      mode: "motorcycle", type: "balanced", units: "metric", format: "geojson", apiKey,
    }).toString();
    const response = await fetchGeocoderWithRetry(url);
    status = response.status;
    if (!response.ok) throw new PublicError(shippingUnavailableMessage, status === 429 ? 429 : 503, "ROUTING_HTTP");
    const data = routeSchema.parse(await response.json());
    return data.features[0].properties.distance / 1000;
  } catch (error) {
    // Fixed metadata only: never log coordinates, URLs, API keys or response bodies.
    console.warn("Routing failed", { provider: "geoapify", status, errorName: fetchErrorName(error) });
    if (error instanceof PublicError) throw error;
    throw new PublicError(shippingUnavailableMessage, 503, "ROUTING_UNAVAILABLE");
  }
}
