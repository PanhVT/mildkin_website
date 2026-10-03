import { describe, expect, it } from "vitest";
import { calculateShippingFee, haversineDistanceKm, quoteShipping, shippingConfig } from "@/lib/shipping";
import { customerSchema } from "@/lib/validation";

describe("NEU shipping tariff", () => {
  it.each([
    [0, 0], [1.999, 0], [2, 0], [2.001, 10000], [4, 10000],
    [4.001, 15000], [6, 15000], [6.001, 20000], [7, 20000],
    [7.001, 25000], [7.95, 25000], [7.999, 25000], [8, null], [8.001, null],
  ])("%s km costs %s", (km, fee) => expect(calculateShippingFee(km)).toBe(fee));
  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid distance %s", (km) => {
    expect(() => calculateShippingFee(km)).toThrow();
  });
  it("calculates Haversine, including identical and antipodal points", () => {
    expect(haversineDistanceKm(0, 0, 0, 0)).toBe(0);
    expect(haversineDistanceKm(0, 0, 0, 1)).toBeCloseTo(111.1949, 3);
    expect(haversineDistanceKm(0, 0, 0, 180)).toBeCloseTo(20015.0868, 3);
    expect(haversineDistanceKm(30, 40, 31, 41)).toBeCloseTo(haversineDistanceKm(31, 41, 30, 40), 8);
    expect(() => haversineDistanceKm(91, 0, 0, 0)).toThrow();
    expect(() => haversineDistanceKm(0, 0, NaN, 0)).toThrow();
  });
  it.each([{}, { STORE_LAT: " ", STORE_LNG: "0" }, { STORE_LAT: "NaN", STORE_LNG: "0" }, { STORE_LAT: "91", STORE_LNG: "0" }, { STORE_LAT: "0", STORE_LNG: "181" }])("rejects missing/invalid store config", (env) => {
    expect(() => shippingConfig(env)).toThrow("Mildkin chưa thể tính phí");
  });
  it("quotes an unavailable destination without a magic fee", () => {
    expect(quoteShipping({ STORE_LAT: "0", STORE_LNG: "0" }, 1, 0)).toMatchObject({ available: false, fee: null, reason: "OUT_OF_RANGE" });
  });
  it("does not round before choosing a fee", () => {
    const lat = 7.9999 / 6371 * 180 / Math.PI;
    expect(quoteShipping({ STORE_LAT: "0", STORE_LNG: "0" }, lat, 0)).toMatchObject({ available: true, fee: 25000 });
  });
});
describe("shipping validation", () => {
  const customer = { customerName: "Khách thử", phone: "0912345678", shippingMethod: "PICKUP" };
  it("pickup needs neither delivery address nor coordinates", () => {
    expect(customerSchema.safeParse(customer).success).toBe(true);
  });
  it("delivery requires an address", () => {
    expect(customerSchema.safeParse({ ...customer, shippingMethod: "DELIVERY" }).success).toBe(false);
  });
  it("strips obsolete GPS fields from checkout input", () => {
    const parsed = customerSchema.parse({ ...customer, customerLat: 91, customerLng: 200 });
    expect(parsed).not.toHaveProperty("customerLat");
    expect(parsed).not.toHaveProperty("customerLng");
  });
});
