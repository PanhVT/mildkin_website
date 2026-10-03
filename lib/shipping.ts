import { PublicError } from "./http";

export type ShippingMethod = "DELIVERY" | "PICKUP";
export type ShippingQuote =
  | { available: true; distanceKm: number; fee: number }
  | { available: false; distanceKm: number; fee: null; reason: "OUT_OF_RANGE" };
export const shippingUnavailableMessage = "Mildkin chưa thể tính phí giao hàng lúc này. Bạn có thể chọn nhận bánh tại NEU.";
export const outOfRangeMessage = "Địa chỉ của bạn nằm ngoài khu vực giao hàng của Mildkin.";
export const pickupDescription = "Sau khi đặt hàng, Mildkin sẽ xác nhận thời gian và điểm nhận cụ thể với bạn.";

export function calculateShippingFee(distanceKm: number): number | null {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new PublicError("Khoảng cách không hợp lệ.");
  if (distanceKm <= 2) return 0;
  if (distanceKm <= 4) return 10000;
  if (distanceKm <= 6) return 15000;
  if (distanceKm <= 7) return 20000;
  if (distanceKm < 8) return 25000;
  return null;
}
function validCoordinates(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
export function haversineDistanceKm(storeLat: number, storeLng: number, customerLat: number, customerLng: number) {
  if (!validCoordinates(storeLat, storeLng) || !validCoordinates(customerLat, customerLng)) throw new PublicError("Tọa độ không hợp lệ.");
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(rad(customerLat - storeLat) / 2) ** 2 +
    Math.cos(rad(storeLat)) * Math.cos(rad(customerLat)) * Math.sin(rad(customerLng - storeLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function shippingConfig(env: { STORE_LAT?: string; STORE_LNG?: string }) {
  const storeLat = Number(env.STORE_LAT);
  const storeLng = Number(env.STORE_LNG);
  if (!env.STORE_LAT?.trim() || !env.STORE_LNG?.trim() || !validCoordinates(storeLat, storeLng)) {
    throw new PublicError(shippingUnavailableMessage, 503);
  }
  return { storeLat, storeLng };
}
export function quoteShipping(env: { STORE_LAT?: string; STORE_LNG?: string }, customerLat: number, customerLng: number): ShippingQuote {
  const { storeLat, storeLng } = shippingConfig(env);
  const distanceKm = haversineDistanceKm(storeLat, storeLng, customerLat, customerLng);
  const fee = calculateShippingFee(distanceKm);
  return fee === null
    ? { available: false, distanceKm, fee: null, reason: "OUT_OF_RANGE" }
    : { available: true, distanceKm, fee };
}
export function formatDistance(distanceKm: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(distanceKm);
}
