import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(), limitShippingQuote: vi.fn(), geocode: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/lib/rate-limit", () => ({ limitShippingQuote: mocks.limitShippingQuote }));
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: mocks.geocode }));
const address = { address: "10 Lê Thanh Nghị", ward: "Đồng Tâm", district: "Hai Bà Trưng", city: "Hà Nội" };
import { POST } from "@/app/api/shipping/quote/route";
import { PublicError } from "@/lib/http";
const request = (body: unknown, origin = "https://test.example") => new Request("https://test.example/api/shipping/quote", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  mocks.getEnv.mockResolvedValue({ SITE_URL: "https://test.example", STORE_LAT: "0", STORE_LNG: "0" });
  mocks.limitShippingQuote.mockReset();
  mocks.geocode.mockReset().mockResolvedValue({ lat: 3.2 / (6371 * Math.PI / 180), lng: 0 });
});
describe("shipping quote API", () => {
  it("returns a server quote without caching or trusting a supplied distance", async () => {
    const response = await POST(request({ ...address, customerLat: 0, customerLng: 0, distanceKm: 0, shippingFee: 0 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("private, no-store");
    expect(await response.json()).toMatchObject({ available: true, fee: 10000 });
    expect(mocks.limitShippingQuote).toHaveBeenCalledOnce();
  });
  it("returns OUT_OF_RANGE exactly at 8 km", async () => {
    mocks.geocode.mockResolvedValue({ lat: 8 / (6371 * Math.PI / 180), lng: 0 });
    const response = await POST(request(address));
    expect(await response.json()).toEqual({ available: false, distanceKm: 8, fee: null, reason: "OUT_OF_RANGE" });
  });
  it("rejects old coordinate-only input and missing address", async () => {
    expect((await POST(request({ customerLat: 91, customerLng: 0 }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
  });
  it("returns 422 when geocoding cannot locate the address", async () => {
    mocks.geocode.mockRejectedValue(new PublicError("Không tìm thấy địa chỉ", 422, "ADDRESS_NOT_FOUND"));
    const response = await POST(request(address));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Không tìm thấy địa chỉ") });
  });
  it("requires same origin", async () => {
    expect((await POST(request({}, "https://other.example"))).status).toBe(403);
  });
  it("returns a friendly error for unconfigured delivery", async () => {
    mocks.getEnv.mockResolvedValue({ SITE_URL: "https://test.example" });
    const response = await POST(request(address));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("nhận bánh tại NEU") });
  });
  it("preserves rate-limit responses", async () => {
    mocks.limitShippingQuote.mockRejectedValue(new PublicError("Thử lại sau", 429));
    expect((await POST(request(address))).status).toBe(429);
  });
});
