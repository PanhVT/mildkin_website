import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roadDistanceKm } from "@/lib/routing";
import { quoteAddressShipping, resolveShipping } from "@/lib/shipping-server";
import type { Env } from "@/lib/env";
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn(async () => ({ lat: 21.001, lng: 105.841 })) }));
const env = { GEOAPIFY_API_KEY: "test-private", STORE_LAT: "21", STORE_LNG: "105.84" } as Env;
const fetchMock = vi.fn();
const route = (distance: number) => ({ features: [{ properties: { distance, distance_units: "meters" } }] });
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock.mockReset().mockResolvedValue(Response.json(route(4200))));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("road shipping distance", () => {
  it("requests a motorcycle route in store-to-customer order and converts meters", async () => {
    expect(await roadDistanceKm(env, 21.001, 105.841)).toBe(4.2);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe("/v1/routing");
    expect(Object.fromEntries(url.searchParams)).toEqual({ waypoints: "21,105.84|21.001,105.841", mode: "motorcycle", type: "balanced", units: "metric", format: "geojson", apiKey: "test-private" });
    expect(options.cache).toBe("no-store");
  });
  it("charges for the road route even when the coordinates are nearby", async () => {
    const address = { address: "10 Lê Thanh Nghị", ward: "Đồng Tâm", city: "Hà Nội" } as const;
    expect(await quoteAddressShipping(env, address)).toEqual({ available: true, distanceKm: 4.2, fee: 15000 });
    fetchMock.mockResolvedValue(Response.json(route(8000)));
    expect(await quoteAddressShipping(env, address)).toMatchObject({ available: false, distanceKm: 8 });
  });
  it.each([{ features: [] }, route(-1), { features: [{ properties: { distance: 4, distance_units: "miles" } }] }, {}])("rejects unusable routes without a straight-line fallback", async body => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(roadDistanceKm(env, 21.001, 105.841)).rejects.toMatchObject({ status: 503 });
  });
  it("rejects provider errors without exposing secrets", async () => {
    fetchMock.mockResolvedValue(new Response("test-private", { status: 403 }));
    await expect(roadDistanceKm(env, 21.001, 105.841)).rejects.toThrow("Mildkin chưa thể tính phí");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("test-private");
  });
  it("pickup does not call routing", async () => {
    expect(await resolveShipping(env, { shippingMethod: "PICKUP" })).toEqual({ shippingFee: 0, deliveryDistanceMeters: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
