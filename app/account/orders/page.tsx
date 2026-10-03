import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { userOrders } from "@/lib/auth/orders";
import { getEnv } from "@/lib/env";
import { OrderHistory } from "@/components/auth/order-history";
export const metadata = { title: "Đơn bánh của bạn" };
export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("/account/orders");
  const query = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.page)) || 1),
  );
  const rows = await userOrders((await getEnv()).DB, user.id, page);
  return (
    <>
      <div className="page-intro">
        <Link className="text-link" href="/account">
          ← Góc nhỏ của bạn
        </Link>
        <h1>Đơn bánh của bạn</h1>
      </div>
      <OrderHistory rows={rows.slice(0, 20)} />
      <nav className="pagination" aria-label="Phân trang đơn bánh">
        <span>
          {page > 1 && (
            <Link href={`/account/orders?page=${page - 1}`}>← Trang trước</Link>
          )}
        </span>
        <span>Trang {page}</span>
        <span>
          {rows.length > 20 && (
            <Link href={`/account/orders?page=${page + 1}`}>Trang sau →</Link>
          )}
        </span>
      </nav>
    </>
  );
}
