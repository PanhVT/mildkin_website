import type { Env } from "./env";
import { deliveryAddressSchema, type DeliveryAddress } from "./validation";
import { geocodeAddress } from "./geocoding";
import { PublicError } from "./http";
import { quoteShippingDistance, shippingConfig, outOfRangeMessage, type ShippingMethod } from "./shipping";
import { roadDistanceKm } from "./routing";

export async function quoteAddressShipping(env: Env, address: DeliveryAddress) {
  shippingConfig(env);
  const coords = await geocodeAddress(address, env);
  return quoteShippingDistance(await roadDistanceKm(env, coords.lat, coords.lng));
}

export async function resolveShipping(env: Env, input: { shippingMethod: ShippingMethod; address?: string; ward?: string; district?: string; city?: string }) {
  if (input.shippingMethod === "PICKUP") return { shippingFee: 0, deliveryDistanceMeters: null };
  const parsed = deliveryAddressSchema.safeParse(input);
  if (!parsed.success) throw new PublicError("Vui lòng điền đầy đủ địa chỉ giao hàng.");
  const quote = await quoteAddressShipping(env, parsed.data);
  if (!quote.available) throw new PublicError(outOfRangeMessage, 422);
  return { shippingFee: quote.fee, deliveryDistanceMeters: Math.round(quote.distanceKm * 1000) };
}
