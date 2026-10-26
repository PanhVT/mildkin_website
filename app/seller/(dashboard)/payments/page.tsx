import Link from "next/link";
import { sellerPageEnv } from "@/lib/seller/page-auth";
import { sellerPayments } from "@/lib/seller/data";
import {
  Title,
  Kpis,
  Pagination,
  Badge,
  money,
  queryParams,
  type SearchProps,
} from "@/components/seller/ui";
import { formatDate } from "@/lib/status";
export default async function Page({ searchParams }: SearchProps) {
  const env = await sellerPageEnv(),
    params = queryParams(await searchParams),
    data = await sellerPayments(env.DB, params);
  return (
    <>
      <Title
        title="Thanh toán"
        subtitle="Theo dõi chuyển khoản và COD. Doanh thu đã nhận chỉ gồm thanh toán thành công."
      />
      <Kpis
        items={[
          ["Đã nhận hôm nay", money(data.counts.received)],
          ["Thanh toán thành công", data.counts.matched],
          ["Đơn chờ thanh toán", data.pending],
          ["Unmatched / Cần kiểm tra", data.counts.review],
        ]}
      />
      <form className="seller-filters">
        <label>Phương thức<select name="method" defaultValue={params.get("method") || "all"}>
          <option value="all">Tất cả</option><option value="BANK_TRANSFER">Chuyển khoản</option><option value="COD">COD</option>
        </select></label>
        <button>Lọc thanh toán</button>
      </form>
      <section className="seller-card">
        <h2>Thanh toán & thu tiền</h2>
        <div className="seller-table">
          <table>
            <thead>
              <tr>
                {[
                  "Thời gian",
                  "Mã đơn",
                  "Số tiền",
                  "Phương thức",
                  "Nội dung",
                  "Trạng thái",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.created_at)}</td>
                  <td>
                    {p.order_id ? (
                      <Link href={`/seller/orders/${p.order_id}`}>
                        {p.order_code}
                      </Link>
                    ) : (
                      "⚠ Không xác định đơn"
                    )}
                  </td>
                  <td>{money(p.amount)}</td>
                  <td><span className={`seller-badge seller-method-${p.payment_method === "COD" ? "cod" : "bank"}`}>{p.payment_method === "COD" ? "COD" : "Chuyển khoản / SePay"}</span></td>
                  <td className="seller-payment-content">{p.content}</td>
                  <td>
                    <Badge
                      value={
                        p.resolution === "MATCHED"
                          ? "PAID"
                          : p.resolution === "PENDING" ? "PENDING"
                          : p.resolution === "CANCELLED" ? "CANCELLED"
                          : "REVIEW"
                      }
                      label={p.resolution === "PENDING" ? "Chưa thu tiền" : !["MATCHED", "CANCELLED"].includes(p.resolution) ? "Unmatched / Cần kiểm tra" : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.rows.length && (
            <p className="seller-empty">Chưa có thanh toán trong bộ lọc này.</p>
          )}
        </div>
        <Pagination {...data} params={params} />
      </section>
    </>
  );
}
