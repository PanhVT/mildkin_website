import { ShippingDetails } from "@/components/orders/shipping-details";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { getDb } from "@/db";
import { orders, orderItems, payments } from "@/db/schema";
import { formatCurrency } from "@/lib/currency";
import { formatDate, statusLabels } from "@/lib/status";
import { StatusControl } from "@/components/admin/status-control";
export default async function OrderDetail({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  try {
    await requireAdmin();
  } catch {
    return null;
  }
  const db = await getDb();
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.orderCode, (await params).orderCode))
    .get();
  if (!order) notFound();
  const [items, transactions] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(payments).where(eq(payments.orderId, order.id)),
  ]);
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">CHI TIẾT ĐƠN HÀNG</span>
        <h1>{order.orderCode}</h1>
        <StatusControl code={order.orderCode} status={order.status} />
      </div>
      <div className="checkout-grid">
        <div>
          <section className="admin-card">
            <h2>Khách hàng</h2>
            <p>
              <strong>{order.customerName}</strong> · {order.phone}
            </p>
            <ShippingDetails order={order} />
            {order.shippingMethod === "DELIVERY" && <p>
              {order.address}, {order.ward}, {order.district}, {order.city}
            </p>}
            <p>Ghi chú: {order.note || "Không có"}</p>
          </section>
          <section className="admin-card">
            <h2>Bánh đã đặt</h2>
            {items.map((item) => (
              <div className="order-item" key={item.id}>
                <span>
                  {item.productNameSnapshot} × {item.quantity}
                </span>
                <span>
                  {formatCurrency(item.priceSnapshot * item.quantity)}
                </span>
              </div>
            ))}
            <div className="summary-row">
              <span>Tạm tính</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>{order.shippingMethod === "PICKUP" ? "Phí nhận hàng" : "Giao hàng"}</span>
              <span>{formatCurrency(order.shippingFee)}</span>
            </div>
            <div className="summary-row total">
              <span>Tổng tiền</span>
              <strong>{formatCurrency(order.total)}</strong>
            </div>
          </section>
        </div>
        <div>
          <section className="admin-card">
            <h2>Thanh toán</h2>
            <p>{statusLabels[order.paymentStatus]}</p>
            <p>Đặt lúc: {formatDate(order.createdAt)}</p>
            <p>Hết hạn: {formatDate(order.expiresAt)}</p>
            <p>
              Thanh toán lúc:{" "}
              {order.paidAt ? formatDate(order.paidAt) : "Chưa thanh toán"}
            </p>
            <p>Cập nhật: {formatDate(order.updatedAt)}</p>
          </section>
          {transactions.map((p) => (
            <section className="admin-card admin-payments" key={p.id}>
              <h2>Giao dịch #{p.providerTransactionId}</h2>
              <p>
                {formatCurrency(p.amount)} · {p.bank}
              </p>
              <p>Nội dung: {p.content}</p>
              <p>Tham chiếu: {p.referenceCode || "—"}</p>
              <p>Tài khoản: {p.account}</p>
              <p>Nhận lúc: {formatDate(p.createdAt)}</p>
              <p>
                {p.resolution === "MATCHED"
                  ? "Đã khớp tự động"
                  : "Cần đối soát thủ công"}
              </p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
