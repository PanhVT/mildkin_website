import { expect, it } from "vitest";
import { formatOrderAddress } from "@/lib/address";
import { customerSchema, deliveryAddressSchema } from "@/lib/validation";
import { buildFullAddress } from "@/lib/geocoding";
const address = { address: "10 ngách 28 ngõ 67 Lê Thanh Nghị", ward: "Đồng Tâm", city: "Hà Nội" as const };
it("accepts DELIVERY and shipping quote without district", () => {
  expect(deliveryAddressSchema.parse(address)).toEqual(address);
  expect(customerSchema.parse({ ...address, shippingMethod: "DELIVERY", customerName: "Khách thử", customerInstagram: "@Test.Buyer", phone: "0912345678" }).district).toBe("");
});
it("requires the three delivery address fields but not for pickup", () => {
  const customer = { customerName: "Khách thử", customerInstagram: "@Test.Buyer", phone: "0912345678" };
  expect(customerSchema.safeParse({ ...customer, shippingMethod: "PICKUP" }).success).toBe(true);
  for (const field of ["address", "ward", "city"]) {
    expect(customerSchema.safeParse({ ...customer, ...address, shippingMethod: "DELIVERY", [field]: undefined }).success).toBe(false);
  }
});
it("does not include legacy district in the geocoder query", () => {
  expect(buildFullAddress({ ...address, district: "Hai Bà Trưng" })).toBe("10 ngách 28 ngõ 67 Lê Thanh Nghị, Đồng Tâm, Hà Nội, Việt Nam");
});
it("preserves an old order's district when displaying its address", () => {
  expect(formatOrderAddress({ ...address, district: "Hai Bà Trưng" })).toBe("10 ngách 28 ngõ 67 Lê Thanh Nghị, Đồng Tâm, Hai Bà Trưng, Hà Nội");
});
it.each([null, undefined, "", "  "])("renders a missing district without extra commas: %s", district => {
  expect(formatOrderAddress({ ...address, district })).toBe("10 ngách 28 ngõ 67 Lê Thanh Nghị, Đồng Tâm, Hà Nội");
});
