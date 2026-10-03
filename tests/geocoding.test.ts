import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFullAddress, geocodeAddress } from "@/lib/geocoding";
import { addressQuoteKey, usableAddressQuote } from "@/lib/shipping-quote-state";
const address = { address: "số 10 ngách 28 ngõ 67 Lê Thanh Nghị", ward: "Đồng Tâm", district: "Hai Bà Trưng", city: "Hà Nội" as const };
const result = { lat: 21.002, lon: 105.844, formatted: "Lê Thanh Nghị, Hà Nội", country_code: "vn", city: "Hà Nội", district: "Hai Bà Trưng", result_type: "building", rank: { confidence: 0.6, confidence_city_level: 1 } };
const env = { GEOAPIFY_API_KEY: "test-secret-only", STORE_LAT: "21.000127", STORE_LNG: "105.843153" };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetchMock.mockReset().mockImplementation(() => Promise.resolve(Response.json({ results: [result] }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Geoapify geocoding", () => {
  it("builds a full Vietnamese address without duplicated components", () => {
    expect(buildFullAddress(address)).toBe("số 10 ngách 28 ngõ 67 Lê Thanh Nghị, Đồng Tâm, Hai Bà Trưng, Hà Nội, Việt Nam");
    expect(buildFullAddress({ ...address, address: "10 Lê Thanh Nghị, Hà Nội" })).toBe("10 Lê Thanh Nghị, Hà Nội, Đồng Tâm, Hai Bà Trưng, Việt Nam");
  });
  it("uses server configuration, lon/lat bias and re-geocodes every request", async () => {
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat, lng: result.lon });
    await geocodeAddress(address, env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.origin + url.pathname).toBe("https://api.geoapify.com/v1/geocode/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ text: buildFullAddress(address), format: "json", filter: "countrycode:vn", bias: "proximity:105.843153,21.000127", lang: "vi", limit: "5", apiKey: env.GEOAPIFY_API_KEY });
    expect(options).toMatchObject({ method: "GET", headers: { Accept: "application/json" }, redirect: "manual", signal: expect.any(AbortSignal) });
  });
  it.each([{}, { GEOAPIFY_API_KEY: " " }, { ...env, STORE_LAT: "invalid" }])("rejects invalid configuration without fetching", async config => {
    await expect(geocodeAddress(address, config)).rejects.toMatchObject({ code: "GEOCODER_CONFIG" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([429, 500, 302])("maps HTTP %s to a generic code", async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: status === 429 ? "GEOCODER_RATE_LIMIT" : "GEOCODER_HTTP" });
  });
  it.each(["AbortError", "TimeoutError", "TypeError"])("classifies %s safely", async name => {
    fetchMock.mockRejectedValue(new DOMException(buildFullAddress(address) + env.GEOAPIFY_API_KEY, name));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: name === "TypeError" ? "GEOCODER_NETWORK" : "GEOCODER_TIMEOUT" });
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).not.toContain(address.address);
    expect(logs).not.toContain(env.GEOAPIFY_API_KEY);
  });
  it.each([
    [], [{ ...result, country_code: "us" }], [{ ...result, city: "Đà Nẵng" }],
    [{ ...result, result_type: "city" }], [{ ...result, lat: 91 }],
  ].map(results => ({ results })))("rejects empty or unsuitable results", async ({ results }) => {
    fetchMock.mockResolvedValue(Response.json({ results }));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND", status: 422 });
  });
  it.each(["street", "suburb"])("accepts a Hanoi %s despite missing administrative fields and modest confidence", async result_type => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ lat: result.lat, lon: result.lon, state: "Thành phố Hà Nội", result_type, rank: { confidence: 0.3 } }] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("uses confidence to rank rather than reject a Hanoi street", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ ...result, result_type: "street", rank: { confidence_city_level: 0.1 } }] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("accepts nullable fields and Hanoi in formatted when only a county is provided", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ ...result, city: null, state: null, county: "Hai Bà Trưng", district: null, rank: null }] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("logs only counts and rejection reasons for unsuitable results", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [null, { ...result, country_code: "us" }, { ...result, city: "Đà Nẵng" }, { ...result, result_type: "city" }] }));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    expect(console.warn).toHaveBeenCalledWith("Geocoding selection failed", { provider: "geoapify", resultCount: 4, inspectedCount: 4, rejected: { invalid: 1, country: 1, hanoi: 1, precision: 1 } });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(result.formatted);
  });
  it("selects a district match over the first candidate and skips malformed entries", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [null, { ...result, district: "Cầu Giấy", lat: 21 }, result] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("prefers city confidence then proximity among district matches", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ ...result, lat: 21.1 }, { ...result, lat: 21, rank: { confidence_city_level: 0.6 } }, result] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("only considers the requested five candidates", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [...Array(5).fill({ ...result, country_code: "us" }), result] }));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
  });
  it("handles a malformed provider response without logging its body", async () => {
    fetchMock.mockResolvedValue(Response.json({ secret: env.GEOAPIFY_API_KEY }));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "GEOCODER_HTTP" });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(env.GEOAPIFY_API_KEY);
  });
});
describe("address-bound quote invalidation", () => {
  const saved = { addressKey: addressQuoteKey(address), quote: { available: true as const, distanceKm: 1, fee: 0 } };
  it("keeps a quote for the same address", () => expect(usableAddressQuote(saved, address)).toEqual(saved.quote));
  it.each(["address", "ward", "district", "city"] as const)("invalidates after %s changes, including stale async replies", (field) => {
    expect(usableAddressQuote(saved, { ...address, [field]: "Đã đổi" })).toBeNull();
  });
});
