import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFullAddress, geocodeAddress as actualGeocodeAddress } from "@/lib/geocoding";
import { addressQuoteKey, usableAddressQuote } from "@/lib/shipping-quote-state";
async function geocodeAddress(...args: Parameters<typeof actualGeocodeAddress>) {
  const pending = actualGeocodeAddress(...args).then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  const outcome = await pending;
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}
const address = { address: "số 10 ngách 28 ngõ 67 Lê Thanh Nghị", ward: "Đồng Tâm", city: "Hà Nội" as const };
const result = { lat: 21.002, lon: 105.844, formatted: "Lê Thanh Nghị, Hà Nội", country_code: "vn", city: "Hà Nội", district: "Hai Bà Trưng", result_type: "building", rank: { confidence: 0.6, confidence_city_level: 1 } };
const env = { GEOAPIFY_API_KEY: "test-secret-only", STORE_LAT: "21.000127", STORE_LNG: "105.843153" };
const fetchMock = vi.fn();
const respondWith = (results: unknown[]) => fetchMock.mockImplementation(() => Promise.resolve(Response.json({ results })));
const queries = () => fetchMock.mock.calls.map(([url]) => url.searchParams.get("text"));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetchMock.mockReset().mockImplementation(() => Promise.resolve(Response.json({ results: [result] }))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Geoapify geocoding", () => {
  it("shares three outbound attempts between fallback and transient retries", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(Response.json({ results: [result] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(queries()[0]).not.toBe(queries()[1]);
    expect(queries()[1]).toBe(queries()[2]);
  });
  it("never starts another fallback after the shared budget is exhausted", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    respondWith([]);
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("stops after a successful simplified address", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ results: [result] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("builds a full Vietnamese address without duplicated components", () => {
    expect(buildFullAddress(address)).toBe("số 10 ngách 28 ngõ 67 Lê Thanh Nghị, Đồng Tâm, Hà Nội, Việt Nam");
    expect(buildFullAddress({ ...address, address: "10 Lê Thanh Nghị, Hà Nội" })).toBe("10 Lê Thanh Nghị, Hà Nội, Đồng Tâm, Việt Nam");
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
  it("returns the exact address immediately and logs only safe selection diagnostics", async () => {
    expect(await geocodeAddress(address, env)).toEqual({ lat: result.lat, lng: result.lon, displayName: result.formatted });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Geoapify selection debug", {
      status: 200, resultCount: 1, candidateCount: 1, rejected: { invalid: 0, country: 0, hanoi: 0, precision: 0 },
    });
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    for (const privateValue of [address.address, address.ward, result.formatted, env.GEOAPIFY_API_KEY, fetchMock.mock.calls[0][0].href]) {
      expect(logs).not.toContain(privateValue);
    }
  });
  it("uses distinct fallback queries without retrying an empty identical query", async () => {
    respondWith([]);
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    expect(queries()).toEqual([buildFullAddress(address), "67 Lê Thanh Nghị, Đồng Tâm, Hà Nội, Việt Nam", "Lê Thanh Nghị, Đồng Tâm, Hà Nội, Việt Nam"]);
  });
  it.each([{}, { GEOAPIFY_API_KEY: " " }, { ...env, STORE_LAT: "invalid" }])("rejects invalid configuration without fetching", async config => {
    await expect(geocodeAddress(address, config)).rejects.toMatchObject({ code: "GEOCODER_CONFIG" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([429, 500, 302])("maps HTTP %s to a generic code", async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: status === 429 ? "GEOCODER_RATE_LIMIT" : "GEOCODER_HTTP" });
    expect(fetchMock).toHaveBeenCalledTimes(status === 302 ? 1 : 3);
  });
  it.each(["AbortError", "TimeoutError", "TypeError"])("classifies %s safely", async name => {
    fetchMock.mockRejectedValue(new DOMException(buildFullAddress(address) + env.GEOAPIFY_API_KEY, name));
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: name === "TypeError" ? "GEOCODER_NETWORK" : "GEOCODER_TIMEOUT" });
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).not.toContain(address.address);
    expect(logs).not.toContain(env.GEOAPIFY_API_KEY);
  });
  it.each([
    [], [{ ...result, country_code: "us" }], [{ ...result, city: "Đà Nẵng", formatted: "Đà Nẵng" }],
    ...["city", "state", "country", "unknown", "__proto__"].map(result_type => [{ ...result, result_type }]),
    [{ ...result, lat: 91 }], [{ ...result, lon: 181 }], [null],
  ].map(results => ({ results })))("rejects empty or unsuitable results", async ({ results }) => {
    respondWith(results);
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND", status: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each(["building", "amenity", "street", "suburb", "district"])("accepts a Hanoi %s despite missing administrative fields and modest confidence", async result_type => {
    fetchMock.mockResolvedValue(Response.json({ results: [{ lat: result.lat, lon: result.lon, state: "Thành phố Hà Nội", result_type, rank: { confidence: 0.3 } }] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["city", "state", "county", "district", "suburb", "formatted"])("detects Hanoi in %s", async field => {
    respondWith([{ lat: result.lat, lon: result.lon, result_type: "street", [field]: "Thành phố Hà Nội" }]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("uses formatted Hanoi even when other administrative fields are populated", async () => {
    respondWith([{ ...result, city: "Hai Bà Trưng", state: "", formatted: "Lê Thanh Nghị, Ha Noi, Việt Nam" }]);
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
    respondWith([null, { ...result, country_code: "us" }, { ...result, city: "Đà Nẵng", formatted: "Đà Nẵng" }, { ...result, result_type: "city" }]);
    await expect(geocodeAddress(address, env)).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    expect(console.warn).toHaveBeenCalledWith("Geoapify selection debug", { status: 200, resultCount: 4, candidateCount: 0, rejected: { invalid: 1, country: 1, hanoi: 1, precision: 1 } });
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    for (const privateValue of [address.address, address.ward, result.formatted, env.GEOAPIFY_API_KEY, "https://", "Đà Nẵng"]) {
      expect(logs).not.toContain(privateValue);
    }
  });
  it("selects a ward match over the first candidate and skips malformed entries", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [null, { ...result, suburb: "Bách Khoa", lat: 21 }, { ...result, suburb: "Đồng Tâm" }] }));
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("prefers rank.confidence over city confidence and proximity", async () => {
    respondWith([{ ...result, lat: 21, rank: { confidence: 0.4, confidence_city_level: 1 } }, { ...result, rank: { confidence: 0.8, confidence_city_level: 0.1 } }]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("uses proximity to the configured store to break equal ranks", async () => {
    respondWith([{ ...result, lat: 21.1 }, result]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
    expect(await geocodeAddress(address, { ...env, STORE_LAT: "21.1" })).toMatchObject({ lat: 21.1 });
  });
  it("prefers explicit Vietnam before administrative matches and precision", async () => {
    respondWith([{ ...result, country_code: null, lat: 21 }, { ...result, district: null, result_type: "district" }]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("ignores legacy district input when ranking ward matches", async () => {
    respondWith([{ ...result, district: "Cầu Giấy", suburb: "Đồng Tâm", lat: 21 }, { ...result, district: " QUẬN HAI BA TRUNG ", result_type: "district" }]);
    expect(await geocodeAddress({ ...address, district: "Hai Bà Trưng" }, env)).toMatchObject({ lat: 21 });
  });
  it("ranks a normalized ward match before precision and confidence", async () => {
    respondWith([{ ...result, suburb: "Bách Khoa", lat: 21, rank: { confidence: 1 } }, { ...result, suburb: " Phường  Dong Tam ", result_type: "street", rank: { confidence: 0.2 } }]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("does not reject mismatched ward or district labels", async () => {
    respondWith([{ ...result, district: "Quận khác", suburb: "Phường khác" }]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([["district", "suburb"], ["suburb", "street"], ["street", "building"], ["street", "amenity"]])("prefers %s < %s precision before confidence and proximity", async (coarse, precise) => {
    respondWith([{ ...result, lat: 21, result_type: coarse, rank: { confidence: 1 } }, { ...result, result_type: precise, rank: { confidence: 0.2 } }]);
    expect(await geocodeAddress(address, env)).toMatchObject({ lat: result.lat });
  });
  it("only considers the requested five candidates", async () => {
    respondWith([...Array(5).fill({ ...result, country_code: "us" }), result]);
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
  it.each(["address", "ward", "city"] as const)("invalidates after %s changes, including stale async replies", (field) => {
    expect(usableAddressQuote(saved, { ...address, [field]: "Đã đổi" })).toBeNull();
  });
});
