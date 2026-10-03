import { ShippingDetails } from "@/components/orders/shipping-details";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { userOrder } from "@/lib/auth/orders";
import { getEnv } from "@/lib/env";
import { formatCurrency } from "@/lib/currency";
import { formatDate, statusLabels } from "@/lib/status";
export const metadata = { title: "Chi tiết đơn bánh" };
export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const user = await requireUser(`/account/orders/${orderCode}`);
  const result = await userOrder((await getEnv()).DB, user.id, orderCode);
  if (!result) notFound();
  const { order, items } = result;
  return (
    <>
      <div className="page-intro">
        <Link href="/account/orders" className="text-link">
          ← Đơn bánh của bạn
        </Link>
        <h1>Đơn {order.orderCode}</h1>
        <p>Đặt lúc {formatDate(order.createdAt)}</p>
      </div>
      <div className="account-grid">
        <section className="account-card">
          <h2>Những chiếc bánh bạn chọn</h2>
          {items.map((item, index) => (
            <div key={index} className="order-item">
              <span>
                {item.name} × {item.quantity}
                <br />
                <small>{formatCurrency(item.price)} / gói</small>
              </span>
              <strong>{formatCurrency(item.price * item.quantity)}</strong>
            </div>
          ))}
          <div className="summary-row">
            <span>Tiền bánh</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>{order.shippingMethod === "PICKUP" ? "Phí nhận hàng" : "Phí giao hàng"}</span>
            <span>{formatCurrency(order.shippingFee)}</span>
          </div>
          <div className="summary-row total">
            <span>Tổng cộng</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>
        </section>
        <section className="account-card">
          <h2>Thông tin nhận bánh</h2>
          <ShippingDetails order={order} />
          <p>
            {order.customerName} · {order.phone}
          </p>
          {order.shippingMethod === "DELIVERY" && <p>
            {[order.address, order.ward, order.district, order.city].join(", ")}
          </p>}
          {order.note && <p>Ghi chú: {order.note}</p>}
          <dl className="account-status">
            <div>
              <dt>Thanh toán</dt>
              <dd>{statusLabels[order.paymentStatus]}</dd>
            </div>
            <div>
              <dt>Đơn hàng</dt>
              <dd>{statusLabels[order.status]}</dd>
            </div>
          </dl>
          {order.paymentStatus === "PENDING" && (
            <p className="notice">
              Để thanh toán, hãy dùng trang QR đã mở khi đặt đơn trên thiết bị
              đó. Trang này chỉ hiển thị lịch sử đơn bánh.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
