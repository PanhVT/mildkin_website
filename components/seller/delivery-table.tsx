import Link from "next/link";
import type { DeliveryOrder } from "@/lib/seller/delivery";
import { deliveryStatusLabel } from "@/lib/seller/delivery-config";
import { DeliveryControls } from "./delivery-controls";
import { Badge, money } from "./ui";

const columns = ["Mã đơn", "Khách hàng", "Hình thức nhận", "Địa chỉ / Điểm nhận", "Thanh toán", "Trạng thái đơn", "Giao / bàn giao", "Người phụ trách", "Thao tác"];

export function DeliveryTable({ orders }: { orders: DeliveryOrder[] }) {
  if (!orders.length) return <p className="seller-card seller-empty">Chưa có đơn giao/bàn giao phù hợp.</p>;
  return <div className="delivery-table-scroll" role="region" aria-label="Danh sách giao hàng và bàn giao" tabIndex={0}>
    <table className="delivery-table">
      <caption className="delivery-sr-only">Danh sách đơn giao hàng và bàn giao tại NEU</caption>
      <thead><tr>{columns.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{orders.map(order => {
        const pickup = order.shipping_method === "PICKUP";
        const address = pickup ? "NEU" : [order.address, order.ward, order.district, order.city].filter(Boolean).join(", ");
        return <tr key={order.id}>
          <td data-label="Mã đơn" className="delivery-code-cell"><div>
            <Link className="delivery-order-code" href={`/seller/orders/${encodeURIComponent(order.id)}`}>{order.order_code}</Link>
            <small className="delivery-muted">{money(order.total)}</small>
          </div></td>
          <td data-label="Khách hàng"><div><strong>{order.customer_name}</strong><a className="delivery-muted" href={`tel:${order.phone}`}>{order.phone}</a></div></td>
          <td data-label="Hình thức nhận"><span className={`seller-badge delivery-fulfillment ${pickup ? "is-pickup" : ""}`}>{pickup ? "Nhận tại NEU" : "Giao tận nơi"}</span></td>
          <td data-label="Địa chỉ / Điểm nhận"><span className="delivery-address" title={address}>{address}</span></td>
          <td data-label="Thanh toán"><div><span className={`delivery-payment-method seller-badge seller-method-${order.payment_method === "COD" ? "cod" : "bank"}`}>{order.payment_method === "COD" ? "COD" : "Chuyển khoản"}</span><Badge value={order.payment_status} /></div></td>
          <td data-label="Trạng thái đơn"><Badge value={order.status} order paymentMethod={order.payment_method} /></td>
          <td data-label="Giao / bàn giao"><span className={`seller-badge delivery-stage-${order.delivery_status.toLowerCase()}`}>{deliveryStatusLabel(order.delivery_status, pickup)}</span></td>
          <DeliveryControls order={order} table />
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
