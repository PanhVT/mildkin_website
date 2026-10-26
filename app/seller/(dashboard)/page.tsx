import Link from "next/link";
import { sellerPageEnv } from "@/lib/seller/page-auth";
import { sellerOverview } from "@/lib/seller/data";
import { Title, Kpis, OrdersTable, money } from "@/components/seller/ui";
export default async function Page() {
  const env = await sellerPageEnv(),
    data = await sellerOverview(env.DB);
  return (
    <>
      <Title
        title="Tổng quan"
        subtitle="Hôm nay shop đang thế nào? Một ngày mới, những mẻ bánh mới."
      />
      <Kpis
        items={[
          ["Doanh thu hôm nay", money(data.revenue)],
          ["Đơn mới hôm nay", data.counts.new_orders],
          ["Đơn cần xử lý", data.counts.processing],
          ["Đơn chờ thanh toán", data.counts.pending],
        ]}
      />
      <section className="seller-card">
        <div className="seller-section-heading">
          <h2>Đơn hàng gần đây</h2>
          <Link href="/seller/orders">Xem tất cả →</Link>
        </div>
        <OrdersTable rows={data.recent} />
      </section>
      <div className="seller-columns">
        <section className="seller-card">
          <h2>Sản phẩm sắp hết</h2>
          {data.low.map((p) => (
            <p className="seller-list-row" key={p.id}>
              <span>{p.name}</span>
              <strong className={`seller-badge seller-stock-${p.stock === 0 ? "out" : "low"}`}>
                {p.stock === 0 ? "Hết hàng" : `Còn ${p.stock} pack`}
              </strong>
            </p>
          ))}
          {!data.low.length && (
            <p className="seller-empty">Chưa có sản phẩm sắp hết.</p>
          )}
          <Link href="/seller/products">Quản lý tồn kho →</Link>
        </section>
        <section className="seller-card">
          <h2>Top sản phẩm hôm nay</h2>
          {data.top.map((p, i) => (
            <p className="seller-list-row" key={p.product_id}>
              <span>
                {i + 1}. {p.name}
              </span>
              <strong>{p.packs} pack</strong>
            </p>
          ))}
          {!data.top.length && (
            <p className="seller-empty">
              Chưa có sản phẩm được thanh toán hôm nay.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
