import { InstagramContact } from "@/components/seller/instagram-contact";
import { canCopyConfirmation } from "@/lib/seller/instagram";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sellerPageEnv } from "@/lib/seller/page-auth";
import { sellerOrder } from "@/lib/seller/data";
import { PublicError } from "@/lib/http";
import { Title, Badge, money } from "@/components/seller/ui";
import { OrderStatusControls } from "@/components/seller/order-status-controls";
import { DeliveryControls, DeliveryNotice } from "@/components/seller/delivery-controls";
import { paymentMethodLabel } from "@/lib/payments/method";
import { formatDate } from "@/lib/status";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const env = await sellerPageEnv();
  const data = await sellerOrder(env.DB, (await params).id).catch((e) => {
    if (e instanceof PublicError && e.status === 404) notFound();
    throw e;
  });
  const o = data.order;
  return (
    <>
      <Link href="/seller/orders">← Tất cả đơn hàng</Link>
      <DeliveryNotice />
      <Title
        title={`Đơn ${o.order_code}`}
        subtitle={formatDate(o.created_at)}
      />
      <div className="seller-columns">
        <section className="seller-card">
          <h2>Thông tin khách</h2>
          <p>{o.customer_name || "Khách vãng lai"}</p>
          <p>{o.phone}</p>
          {o.email && <p>{o.email}</p>}
          <h3>Nhận hàng</h3>
          <p>
            {o.shipping_method === "PICKUP"
              ? "Nhận hàng tại NEU"
              : [o.address, o.ward, o.city].filter(Boolean).join(", ")}
          </p>
          {o.note && <p>Ghi chú: {o.note}</p>}
        </section>
        <section className="seller-card">
          <h2>Thanh toán</h2>
          <p>Phương thức: {paymentMethodLabel(o.payment_method, o.shipping_method)}</p>
          {o.payment_method === "COD" && o.payment_status === "PENDING" ? <span className="seller-badge">Chưa thu tiền</span> : <Badge value={o.payment_status} />}

          {o.paid_at && <p>Thanh toán lúc {formatDate(o.paid_at)}</p>}
          {["PREPARING", "SHIPPING"].includes(o.status) && <>
            <h3>Phân công giao / bàn giao</h3>
            <DeliveryControls order={o} assignmentOnly />
          </>}
          <h3>Trạng thái đơn</h3>
          <Badge value={o.status} order paymentMethod={o.payment_method} />
          <OrderStatusControls id={o.id} order={o} />
        </section>
      </div>
      <InstagramContact key={`${o.id}-${o.instagram_contacted_at}`} id={o.id} username={o.customer_instagram} contactedAt={o.instagram_contacted_at} confirmed={canCopyConfirmation(o)} />
      <section className="seller-card">
        <h2>Sản phẩm</h2>
        <div className="seller-table">
          <table>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i, n) => (
                <tr key={n}>
                  <td>{i.product_name_snapshot}</td>
                  <td>{i.quantity}</td>
                  <td>{money(i.price_snapshot)}</td>
                  <td>{money(i.quantity * i.price_snapshot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="seller-list-row">
          <span>Tiền bánh</span>
          <strong>{money(o.subtotal)}</strong>
        </p>
        <p className="seller-list-row">
          <span>Phí giao hàng</span>
          <strong>{money(o.shipping_fee)}</strong>
        </p>
        <p className="seller-list-row">
          <span>Tổng tiền</span>
          <strong>{money(o.total)}</strong>
        </p>
      </section>
    </>
  );
}
