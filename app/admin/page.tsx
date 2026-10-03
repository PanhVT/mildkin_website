import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { getDb } from "@/db";
import { orders, orderStatuses } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { expireOrders } from "@/lib/orders/service";
import { formatCurrency } from "@/lib/currency";
import { formatDate, statusLabels } from "@/lib/status";
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  // Also verify here: layouts alone are not authorization boundaries in App Router.
  try {
    await requireAdmin();
  } catch {
    return null;
  }
  await expireOrders((await getEnv()).DB);
  const query = await searchParams;
  const page = Math.min(10000, Math.max(1, Number(query.page) || 1));
  const status = orderStatuses.find((s) => s === query.status);
  const rows = await (
    await getDb()
  )
    .select()
    .from(orders)
    .where(status ? eq(orders.status, status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(31)
    .offset((Math.floor(page) - 1) * 30);
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">MILDKIN ADMIN</span>
        <h1>Đơn hàng.</h1>
      </div>
      <form>
        <label htmlFor="status-filter" className="sr-only">
          Lọc trạng thái
        </label>
        <select
          id="status-filter"
          name="status"
          defaultValue={status || ""}
          className="admin-filter"
        >
          <option value="">Tất cả trạng thái</option>
          {orderStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>{" "}
        <button className="button">Lọc đơn</button>
      </form>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Số điện thoại</th>
              <th>Tổng tiền</th>
              <th>Thanh toán</th>
              <th>Đơn hàng</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.orderCode}`}>
                    {o.orderCode}
                  </Link>
                </td>
                <td>{o.customerName}</td>
                <td>{o.phone}</td>
                <td>{formatCurrency(o.total)}</td>
                <td>{statusLabels[o.paymentStatus]}</td>
                <td>{statusLabels[o.status]}</td>
                <td>{formatDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty-state">Chưa có đơn hàng phù hợp.</p>}
      <div className="pagination">
        {page > 1 ? (
          <Link href={`/admin?page=${page - 1}&status=${status || ""}`}>
            ← Trang trước
          </Link>
        ) : (
          <span />
        )}
        {rows.length > 30 && (
          <Link href={`/admin?page=${page + 1}&status=${status || ""}`}>
            Trang sau →
          </Link>
        )}
      </div>
    </>
  );
}
