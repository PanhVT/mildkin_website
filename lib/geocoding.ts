import { z } from "zod";
import type { DeliveryAddress } from "./validation";
import type { Env } from "./env";
import { PublicError } from "./http";
import { fetchGeocoder, fetchErrorName } from "./geocoder-fetch";
import { shippingConfig, haversineDistanceKm } from "./shipping";

export type GeocodeResult = { lat: number; lng: number; displayName?: string };
export const geocodingUnavailable = "Chưa thể xác định địa chỉ lúc này. Bạn vui lòng thử lại sau.";
const normalized = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");
const comparable = (value: string) => normalized(value).toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/^(quan|huyen|thanh pho|tp\.?|phuong|xa)\s+/, "");

export function buildFullAddress(input: DeliveryAddress) {
  const parts = [input.address, input.ward, input.district, input.city, "Việt Nam"]
    .flatMap((value) => value.split(",")).map(normalized).filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = comparable(part);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(", ");
}

const candidateSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  formatted: z.string().nullish(), country_code: z.string().nullish(),
  city: z.string().nullish(), state: z.string().nullish(),
  district: z.string().nullish(), county: z.string().nullish(), suburb: z.string().nullish(),
  result_type: z.string().nullish(),
  rank: z.object({
    confidence: z.number().min(0).max(1).nullish(),
    confidence_city_level: z.number().min(0).max(1).nullish(),
  }).nullish(),
});
const isHanoi = (value: string) => ["ha noi", "hanoi"].includes(comparable(value));

export async function geocodeAddress(input: DeliveryAddress, env: Pick<Env, "GEOAPIFY_API_KEY" | "STORE_LAT" | "STORE_LNG">): Promise<GeocodeResult> {
  let stage = "configuration";
  let status: number | undefined;
  try {
    const apiKey = env.GEOAPIFY_API_KEY?.trim();
    if (!apiKey) throw new PublicError(geocodingUnavailable, 503, "GEOCODER_CONFIG");
    const { storeLat, storeLng } = shippingConfig(env);
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.search = new URLSearchParams({
      text: buildFullAddress(input), format: "json", filter: "countrycode:vn",
      bias: `proximity:${storeLng},${storeLat}`, lang: "vi", limit: "5", apiKey,
    }).toString();
    stage = "fetch";
    const response = await fetchGeocoder(url);
    status = response.status;
    if (!response.ok) throw new PublicError(geocodingUnavailable, status === 429 ? 429 : 503, status === 429 ? "GEOCODER_RATE_LIMIT" : "GEOCODER_HTTP");
    stage = "response";
    const data = z.object({ results: z.array(z.unknown()) }).parse(await response.json());
    const rejected = { invalid: 0, country: 0, hanoi: 0, precision: 0 };
    const candidates = data.results.slice(0, 5).flatMap((value) => {
      const parsed = candidateSchema.safeParse(value);
      if (!parsed.success) { rejected.invalid++; return []; }
      const row = parsed.data;
      if (row.country_code && row.country_code.toLowerCase() !== "vn") { rejected.country++; return []; }
      const administrative = [row.city, row.state, row.county].filter((v): v is string => !!v);
      // A county can be a district, not the city. Missing city/state may fall
      // back to formatted components, but an explicit different city may not.
      const hanoi = administrative.some(isHanoi) || (!row.city && !row.state && (row.formatted || "").split(",").some(isHanoi));
      if (!hanoi) { rejected.hanoi++; return []; }
      // Streets/suburbs are usable fallbacks; a city/country centroid is not a delivery address.
      if (!["building", "amenity", "street", "suburb"].includes(row.result_type || "")) { rejected.precision++; return []; }
      const districtMatch = [row.district, row.county, row.suburb].some(v => v && comparable(v) === comparable(input.district));
      return [{ row, country: row.country_code?.toLowerCase() === "vn" ? 1 : 0, district: districtMatch ? 1 : 0,
        cityConfidence: row.rank?.confidence_city_level ?? 0.5,
        distance: haversineDistanceKm(storeLat, storeLng, row.lat, row.lon) }];
    });
    candidates.sort((a, b) => b.country - a.country || b.district - a.district || b.cityConfidence - a.cityConfidence || a.distance - b.distance);
    const selected = candidates[0]?.row;
    if (!selected) {
      // Counts and fixed reason keys only; no provider values or customer data.
      console.warn("Geocoding selection failed", { provider: "geoapify", resultCount: data.results.length, inspectedCount: Math.min(5, data.results.length), rejected });
      throw new PublicError("Không tìm thấy địa chỉ này. Bạn hãy kiểm tra lại địa chỉ giao hàng nhé.", 422, "ADDRESS_NOT_FOUND");
    }
    return { lat: selected.lat, lng: selected.lon, displayName: selected.formatted ?? undefined };
  } catch (error) {
    const code = error instanceof PublicError && error.code ? error.code
      : stage === "configuration" ? "GEOCODER_CONFIG"
      : (error instanceof Error || error instanceof DOMException) && ["TimeoutError", "AbortError"].includes(error.name) ? "GEOCODER_TIMEOUT"
      : stage === "fetch" ? "GEOCODER_NETWORK" : "GEOCODER_HTTP";
    // Never log exception text, request URL, response body, address or API key.
    console.warn("Geocoding failed", { provider: "geoapify", code, status, errorName: fetchErrorName(error) });
    if (error instanceof PublicError && error.code) throw error;
    throw new PublicError(geocodingUnavailable, 503, code);
  }
}
