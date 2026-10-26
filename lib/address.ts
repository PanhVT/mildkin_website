export function formatOrderAddress(order: { address?: string | null; ward?: string | null; district?: string | null; city?: string | null }) {
  return [order.address, order.ward, order.district, order.city]
    .map(part => part?.trim()).filter(Boolean).join(", ");
}
