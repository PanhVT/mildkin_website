import { sellerPageEnv } from "@/lib/seller/page-auth";
import { sellerOrders } from "@/lib/seller/data";
import { sellerPreparationSummary } from "@/lib/seller/preparation";
import { PreparationSummary } from "@/components/seller/preparation-summary";
import { OrdersRefresh } from "@/components/seller/orders-refresh";
import {
  Title,
  OrdersTable,
  Pagination,
  queryParams,
  type SearchProps,
} from "@/components/seller/ui";
import { orderStatusLabels } from "@/lib/seller/order-status";
import { statusLabels } from "@/lib/status";
import { orderStatuses, paymentStatuses } from "@/db/schema";
export default async function Page({ searchParams }: SearchProps) {
  const env = await sellerPageEnv(),
    params = queryParams(await searchParams);
  const [data, preparation] = await Promise.all([
    sellerOrders(env.DB, params), sellerPreparationSummary(env.DB),
  ]);
  return (
    <>
      <Title
        title="Đơn hàng"
        subtitle="Theo dõi từng đơn bánh, từ lúc đặt đến khi trao tay."
      />
      <PreparationSummary summary={preparation} />
      <OrdersRefresh />
      <form className="seller-filters">
        <label>
          Tìm đơn
          <input
            name="q"
            placeholder="Mã đơn, tên hoặc số điện thoại"
            defaultValue={params.get("q") || ""}
          />
        </label>
        <label>
          Trạng thái
          <select name="status" defaultValue={params.get("status") || ""}>
            <option value="">Tất cả</option>
            {orderStatuses.filter(s => s !== "PAID").map((s) => (
              <option key={s} value={s}>
                {orderStatusLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label>Thanh toán
          <select name="payment" defaultValue={params.get("payment") || ""}>
            <option value="">Tất cả thanh toán</option>
            {paymentStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
        </label>
        <label>Liên hệ Instagram
          <select name="contact" defaultValue={params.get("contact") || ""}>
            <option value="">Tất cả</option>
            <option value="uncontacted">Chưa liên hệ</option>
            <option value="contacted">Đã liên hệ</option>
          </select>
        </label>
        <button>Lọc đơn</button>
      </form>
      <section className="seller-card">
        <OrdersTable rows={data.rows} />
        <Pagination {...data} params={params} />
      </section>
    </>
  );
}
