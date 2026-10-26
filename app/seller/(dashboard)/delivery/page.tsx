import { sellerPageEnv } from "@/lib/seller/page-auth";
import { deliveryDashboard } from "@/lib/seller/delivery";
import { DELIVERY_ASSIGNEES, DELIVERY_STATUSES, deliveryStatusLabel } from "@/lib/seller/delivery-config";
import { DeliveryNotice } from "@/components/seller/delivery-controls";
import { DeliveryTable } from "@/components/seller/delivery-table";
import { OrdersRefresh } from "@/components/seller/orders-refresh";
import { Title, Kpis, Pagination, queryParams, type SearchProps } from "@/components/seller/ui";

export default async function Page({ searchParams }: SearchProps) {
  const env = await sellerPageEnv(), params = queryParams(await searchParams);
  const data = await deliveryDashboard(env.DB, params);
  return <>
    <Title title="Giao hàng & Bàn giao" subtitle="Phân công người phụ trách và theo dõi trạng thái giao đơn." />
    <OrdersRefresh />
    <DeliveryNotice />
    <Kpis accents={["neutral", "warning", "info", "sage"]} items={[["Chưa phân công", data.kpis.UNASSIGNED], ["Chờ giao / chờ nhận", data.kpis.WAITING], ["Đang giao", data.kpis.IN_DELIVERY], ["Đã hoàn tất", data.kpis.COMPLETED]]} />
    <p className="delivery-scope">Đơn đang chuẩn bị, đang giao và lịch sử hoàn tất trong 30 ngày. KPI và số đơn theo người phụ trách độc lập với bộ lọc bên dưới.</p>
    <section className="seller-card">
      <h2>Theo người phụ trách</h2>
      <div className="delivery-workload">{data.workload.map(person => <div key={person.name}>
        <span>{person.name}</span><strong>{person.count} đơn</strong><small>{person.delivering} đang giao</small>
      </div>)}</div>
    </section>
    <form className="seller-filters">
      <label>Tìm đơn<input name="q" placeholder="Mã đơn, tên hoặc số điện thoại" defaultValue={params.get("q") || ""} maxLength={100} /></label>
      <label>Trạng thái<select name="status" defaultValue={params.get("status") || ""}>
        <option value="">Tất cả</option>{DELIVERY_STATUSES.map(s => <option key={s} value={s}>{s === "WAITING" ? "Chờ giao / chờ nhận" : s === "COMPLETED" ? "Đã hoàn tất" : deliveryStatusLabel(s)}</option>)}
      </select></label>
      <label>Người phụ trách<select name="assignee" defaultValue={params.get("assignee") || ""}><option value="">Tất cả</option>{DELIVERY_ASSIGNEES.map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Nhận hàng<select name="fulfillment" defaultValue={params.get("fulfillment") || ""}><option value="">Tất cả</option><option value="DELIVERY">Giao tận nơi</option><option value="PICKUP">Nhận tại NEU</option></select></label>
      <button>Lọc đơn</button>
    </form>
    <DeliveryTable orders={data.rows} />
    <Pagination {...data} params={params} />
  </>;
}
