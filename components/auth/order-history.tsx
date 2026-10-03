import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { formatDate, statusLabels } from "@/lib/status";
import type { userOrders } from "@/lib/auth/orders";
export function OrderHistory({
  rows,
}: {
  rows: Awaited<ReturnType<typeof userOrders>>;
}) {
  if (!rows.length)
    return (
      <div className="empty-state">
        <h2>Bạn chưa có đơn bánh nào.</h2>
        <Link href="/menu" className="button">
          Gặp các bạn trong giỏ bánh
        </Link>
      </div>
    );
  return (
    <div className="account-orders">
      {rows.map((order) => (
        <article className="account-order-card" key={order.orderCode}>
          <div>
            <h3>{order.orderCode}</h3>
            <p>{formatDate(order.createdAt)}</p>
          </div>
          <dl>
            <div>
              <dt>Tổng tiền</dt>
              <dd>{formatCurrency(order.total)}</dd>
            </div>
            <div>
              <dt>Thanh toán</dt>
              <dd>{statusLabels[order.paymentStatus]}</dd>
            </div>
            <div>
              <dt>Đơn hàng</dt>
              <dd>{statusLabels[order.status]}</dd>
            </div>
          </dl>
          <Link
            href={`/account/orders/${order.orderCode}`}
            className="text-link"
          >
            Xem đơn <span className="sr-only">{order.orderCode}</span> →
          </Link>
        </article>
      ))}
    </div>
  );
}
