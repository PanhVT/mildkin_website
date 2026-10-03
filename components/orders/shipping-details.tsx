import { formatCurrency } from "@/lib/currency";
import { formatDistance, pickupDescription } from "@/lib/shipping";
export function ShippingDetails({ order }: { order: { shippingMethod: string; shippingFee: number; deliveryDistanceMeters: number | null } }) {
  const pickup = order.shippingMethod === "PICKUP";
  return <div className="shipping-details">
    <p><strong>{pickup ? "Tự đến NEU lấy hàng" : "Giao hàng"}</strong></p>
    {!pickup && order.deliveryDistanceMeters !== null && <p>Khoảng cách: {formatDistance(order.deliveryDistanceMeters / 1000)} km</p>}
    <p>{pickup ? "Phí nhận hàng" : "Phí ship"}: {formatCurrency(order.shippingFee)}</p>
    {pickup && <p>{pickupDescription}</p>}
  </div>;
}
