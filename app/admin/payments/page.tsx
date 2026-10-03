import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { payments, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/status";
export default async function ReviewPayments({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    await requireAdmin();
  } catch {
    return null;
  }
  const page = Math.floor(
    Math.max(1, Math.min(10000, Number((await searchParams).page) || 1)),
  );
  const rows = await (
    await getDb()
  )
    .select({ payment: payments, code: orders.orderCode })
    .from(payments)
    .leftJoin(orders, eq(payments.orderId, orders.id))
    .where(eq(payments.resolution, "REVIEW"))
    .orderBy(desc(payments.createdAt))
    .limit(31)
    .offset((page - 1) * 30);
  return (
    <>
      <div className="page-intro">
        <h1>Giao dịch cần đối soát.</h1>
        <p>
          Các giao dịch sai số tiền, sai ngân hàng/tài khoản, không tìm thấy
          đơn, đơn đã trả tiền hoặc hết hạn. Kiểm tra sao kê và liên hệ khách để
          xử lý hoàn tiền; màn hình này không sửa trạng thái thanh toán.
        </p>
      </div>
      {rows.slice(0, 30).map(({ payment: p, code }) => (
        <article className="admin-card admin-payments" key={p.id}>
          <h2>
            #{p.providerTransactionId} · {formatCurrency(p.amount)}
          </h2>
          <p>
            {p.bank} · {p.account} · {formatDate(p.createdAt)}
          </p>
          <p>{p.content}</p>
          <p>Tham chiếu: {p.referenceCode || "—"}</p>
          {code ? (
            <Link className="text-link" href={`/admin/orders/${code}`}>
              Xem đơn {code} →
            </Link>
          ) : (
            <p>Không tìm thấy mã đơn hợp lệ.</p>
          )}
        </article>
      ))}
      {!rows.length && <p>Không có giao dịch cần đối soát.</p>}
      <div className="pagination">
        {page > 1 ? (
          <Link href={`/admin/payments?page=${page - 1}`}>← Trang trước</Link>
        ) : (
          <span />
        )}
        {rows.length > 30 && (
          <Link href={`/admin/payments?page=${page + 1}`}>Trang sau →</Link>
        )}
      </div>
    </>
  );
}
