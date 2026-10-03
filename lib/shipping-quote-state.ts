import type { DeliveryAddress } from "./validation";
import type { ShippingQuote } from "./shipping";
export type AddressQuote = { addressKey: string; quote: ShippingQuote };
export function addressQuoteKey(address: DeliveryAddress) {
  return JSON.stringify([address.address, address.ward, address.district, address.city]);
}
export function usableAddressQuote(saved: AddressQuote | null, address: DeliveryAddress) {
  return saved?.addressKey === addressQuoteKey(address) ? saved.quote : null;
}
