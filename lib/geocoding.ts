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

function addressQueries(input: DeliveryAddress) {
  const full = buildFullAddress(input);
  const address = normalized(input.address.split(",")[0]);
  const alleys = [...address.matchAll(/(?:^|\s)(ngõ|ngo|ngách|ngach)\s+(\d+[a-z]?(?:[/-]\d+[a-z]?)*)(?=\s|$)/giu)];
  const last = alleys[alleys.length - 1];
  if (!last) return [full];
  const street = address.slice(last.index + last[0].length).trim();
  if (!street || /^\d/.test(street)) return [full];
  // Keep the outer alley number, including when ngõ precedes ngách.
  const outer = [...alleys].reverse().find(match => comparable(match[1]) === "ngo") ?? last;
  return [...new Set([
    full,
    buildFullAddress({ ...input, address: `${outer[2]} ${street}` }),
    buildFullAddress({ ...input, address: street, ward: "" }),
  ])];
}

const precisionScores = new Map([
  ["building", 5], ["amenity", 5], ["street", 4], ["suburb", 3], ["district", 2],
]);
const candidateSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  formatted: z.string().nullish(), country_code: z.string().nullish(),
  city: z.string().nullish(), state: z.string().nullish(),
  district: z.string().nullish(), county: z.string().nullish(), suburb: z.string().nullish(), ward: z.string().nullish(),
  result_type: z.string().nullish(),
  rank: z.object({
    confidence: z.number().min(0).max(1).nullish(),
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
    for (const query of addressQueries(input)) {
      const url = new URL("https://api.geoapify.com/v1/geocode/search");
      url.search = new URLSearchParams({
        text: query, format: "json", filter: "countrycode:vn",
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
        const country = row.country_code ? comparable(row.country_code) : "";
        if (country && country !== "vn") { rejected.country++; return []; }
        const components = [row.city, row.state, row.county, row.district, row.suburb, row.formatted]
          .flatMap(value => value?.split(",") ?? []);
        const hanoi = components.some(isHanoi);
        if (!hanoi) { rejected.hanoi++; return []; }
        // District is the coarsest usable fallback. Never use city/state/country centroids.
        const precision = precisionScores.get(row.result_type ?? "");
        if (!precision) { rejected.precision++; return []; }
        // Administrative labels vary by provider; mismatches lower rank, not eligibility.
        const districtMatch = [row.district, row.county, row.suburb].some(v => v && comparable(v) === comparable(input.district));
        const wardMatch = [row.ward, row.suburb, row.district].some(v => v && comparable(v) === comparable(input.ward));
        return [{ row, country: country === "vn" ? 1 : 0, hanoi: Number(hanoi),
          district: Number(districtMatch), ward: Number(wardMatch), precision,
          confidence: row.rank?.confidence ?? 0,
          distance: haversineDistanceKm(storeLat, storeLng, row.lat, row.lon) }];
      });
      // Counts and fixed reason keys only; no provider values or customer data.
      console.warn("Geoapify selection debug", {
        status: response.status,
        resultCount: data.results.length,
        candidateCount: candidates.length,
        rejected,
      });
      candidates.sort((a, b) => b.country - a.country || b.hanoi - a.hanoi || b.district - a.district || b.ward - a.ward
        || b.precision - a.precision || b.confidence - a.confidence || a.distance - b.distance);
      const selected = candidates[0]?.row;
      // Every eligible type is usable: do not spend more requests after a success.
      if (selected) return { lat: selected.lat, lng: selected.lon, displayName: selected.formatted ?? undefined };
    }
    throw new PublicError("Không tìm thấy địa chỉ này. Bạn hãy kiểm tra lại địa chỉ giao hàng nhé.", 422, "ADDRESS_NOT_FOUND");
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
