"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Banknote, ShoppingBag, Heart, ReceiptText, Leaf, Cookie, Crown, ArrowUpRight, CalendarDays } from "lucide-react";
import type { RevenueDashboardData } from "@/lib/seller/revenue";
import { money } from "./ui";

const colors = ["secondary", "green-accent", "chart-gold", "chart-blue", "chart-lilac", "chart-olive"].map(name => `var(--seller-${name})`);
const REVENUE_COLOR = "var(--seller-chart-revenue)";
const REVENUE_ACTIVE_COLOR = "var(--seller-chart-revenue-active)";
const ORDER_COLOR = "var(--seller-primary)";
const number = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const dateLabel = (value: string) => value.split("-").reverse().join("/");
const timestamp = (value: number) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);

function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rv-card ${className}`}><div className="rv-card-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="rv-empty"><Cookie size={30} strokeWidth={1.3} aria-hidden="true" /><p>{children}</p></div>;
}
function Change({ value }: { value: number | null }) {
  return <small className={`rv-change ${value === null || value === 0 ? "" : value > 0 ? "is-up" : "is-down"}`}>{value === null ? "Chưa có cơ sở so sánh" : value === 0 ? "— Không đổi so với kỳ trước" : `${value > 0 ? "↑" : "↓"} ${number(Math.abs(value))}% so với kỳ trước`}</small>;
}
function Donut({ values, label, total }: { values: { label: string; value: number; color: string }[]; label: string; total: string }) {
  const sum = values.reduce((n, row) => n + row.value, 0);
  return <div className="rv-donut"><svg viewBox="0 0 200 200" role="img" aria-label={`${label}: ${total}`}>
    <circle cx="100" cy="100" r="78" fill="none" stroke="var(--seller-neutral-bg)" strokeWidth="23" />
    {sum > 0 && values.map((row, i) => <circle key={row.label} cx="100" cy="100" r="78" fill="none" stroke={row.color} strokeWidth="23" pathLength="100" strokeDasharray={`${row.value / sum * 100} ${100 - row.value / sum * 100}`} strokeDashoffset={-values.slice(0, i).reduce((n, v) => n + v.value, 0) / sum * 100} transform="rotate(-90 100 100)"><title>{row.label}: {number(row.value / sum * 100)}%</title></circle>)}
  </svg><div className="rv-donut-center"><span>{label}</span><strong>{total}</strong></div></div>;
}
function Thumbnail({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="rv-thumbnail">{src && !failed ?
    // Product URLs may be R2 or historical external URLs; gracefully fall back on failure.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} /> : <Cookie size={22} aria-label="Mildkin" />}</span>;
}
function Timeline({ rows }: { rows: RevenueDashboardData["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const width = Math.max(600, rows.length * 22), height = 260, left = 66, right = width - 38, top = 32, bottom = 220;
  const maxRevenue = Math.max(1, ...rows.map(row => row.revenue));
  const maxCount = Math.max(1, ...rows.map(row => row.count));
  const step = (right - left) / rows.length;
  const x = (i: number) => left + step * (i + .5);
  const y = (n: number, max: number) => bottom - n / max * (bottom - top);
  const row = active === null ? null : rows[active];
  return <div className="rv-timeline">
    <div className="rv-chart-legend"><span><i style={{ background: REVENUE_COLOR }} />Doanh thu</span><span><i style={{ background: ORDER_COLOR }} />Số đơn hàng</span></div>
    <div className="rv-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: rows.length > 30 ? width : 560 }} aria-label="Doanh thu và số đơn theo ngày" role="img" onMouseLeave={() => setActive(null)}>
      <text x="4" y="15">VNĐ</text><text x={right} y="15">Đơn</text>
      {[0, .25, .5, .75, 1].map(f => <g key={f}><line x1={left} x2={right} y1={y(f, 1)} y2={y(f, 1)} stroke="var(--seller-border)" strokeDasharray="3 5" /><text x={left - 8} y={y(f, 1) + 4} textAnchor="end">{new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(maxRevenue * f)}</text><text x={right + 8} y={y(f, 1) + 4}>{Number.isInteger(maxCount * f) ? maxCount * f : ""}</text></g>)}
      {rows.map((d, i) => <rect key={d.day} x={x(i) - step * .28} y={y(d.revenue, maxRevenue)} width={step * .56} height={bottom - y(d.revenue, maxRevenue)} rx="4" fill={active === i ? REVENUE_ACTIVE_COLOR : REVENUE_COLOR} />)}
      <polyline points={rows.map((d, i) => `${x(i)},${y(d.count, maxCount)}`).join(" ")} fill="none" stroke={ORDER_COLOR} strokeWidth="2.5" />
      {rows.map((d, i) => <g key={d.day} tabIndex={0} role="img" aria-label={`${dateLabel(d.day)}: ${money(d.revenue)}, ${d.count} đơn`} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
        <circle cx={x(i)} cy={y(d.count, maxCount)} r={active === i ? 5 : 3} fill={ORDER_COLOR} />
        <rect x={left + i * step} y={top} width={step} height={bottom - top} fill="transparent" />
        {(i % Math.max(1, Math.ceil(rows.length / (width / 65))) === 0 || i === rows.length - 1) && <text x={x(i)} y="247" textAnchor="middle">{d.day.slice(8)}/{d.day.slice(5, 7)}</text>}
      </g>)}
    </svg></div>
    {row && <div className="rv-timeline-tooltip" role="tooltip"><strong>{dateLabel(row.day)}</strong><span>Doanh thu: {money(row.revenue)}</span><span>Đơn hàng: {row.count}</span></div>}
    <div className="rv-chart-readout" aria-live="polite">{row ? `${dateLabel(row.day)} · ${money(row.revenue)} · ${row.count} đơn` : "Di chuột, chạm hoặc dùng phím Tab để xem chi tiết từng ngày."}</div>
  </div>;
}

export function RevenueDashboard({ initialData }: { initialData: RevenueDashboardData }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState(false);
  const [start, setStart] = useState(initialData.range.start);
  const [end, setEnd] = useState(initialData.range.end);
  const [productMode, setProductMode] = useState<"revenue" | "packs">("revenue");
  const [hourMode, setHourMode] = useState<"revenue" | "count">("revenue");
  async function load(params: URLSearchParams) {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const response = await fetch(`/api/seller/revenue?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : "Không thể tải dữ liệu. Kiểm tra khoảng ngày (tối đa 366 ngày) và thử lại.");
      const next = await response.json() as RevenueDashboardData;
      setData(next); setStart(next.range.start); setEnd(next.range.end); setCustom(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể tải dữ liệu."); }
    finally { busy.current = false; setLoading(false); }
  }
  const products = [...data.products].sort((a, b) => b[productMode] - a[productMode]);
  const productTotal = products.reduce((n, p) => n + p[productMode], 0);
  const paymentTotal = data.payments.reduce((n, p) => n + p.amount, 0);
  const bestHour = Math.max(0, ...data.hours.map(h => h[hourMode]));
  const kpis = [
    { label: "Doanh thu", value: money(data.summary.revenue), change: data.comparisons.revenue, Icon: Banknote },
    { label: "Đơn hàng thành công", value: number(data.summary.count), change: data.comparisons.count, Icon: ShoppingBag },
    { label: "Giá trị đơn trung bình", value: money(data.summary.aov), change: data.comparisons.aov, Icon: ReceiptText },
    { label: "Khách quay lại", value: `${number(data.summary.returningRate)}%`, change: data.comparisons.returningRate, Icon: Heart },
  ];
  return <div className="rv-dashboard">
    <header className="rv-header"><div><div className="rv-eyebrow">MILDKIN / BÁO CÁO BÁN HÀNG</div><h1>Doanh thu <Leaf size={27} strokeWidth={1.5} aria-hidden="true" /></h1><p>Theo dõi doanh thu và hiệu quả bán hàng của Mildkin.</p></div><span className="rv-timezone">Giờ Việt Nam · GMT+7</span></header>
    <div className="rv-filters" aria-label="Khoảng thời gian">
      {[["today", "Hôm nay"], ["7d", "7 ngày"], ["30d", "30 ngày"], ["month", "Tháng này"]].map(([preset, label]) => <button key={preset} disabled={loading} aria-pressed={data.range.preset === ({ "7d": "7", "30d": "30" } as Record<string, string>)[preset] || data.range.preset === preset} onClick={() => load(new URLSearchParams({ preset }))}>{label}</button>)}
      <button className="rv-date-button" disabled={loading} aria-expanded={custom} aria-pressed={data.range.preset === "custom"} onClick={() => setCustom(!custom)}><CalendarDays size={16} />{dateLabel(data.range.start)} – {dateLabel(data.range.end)}</button>
    </div>
    {custom && <form className="rv-custom" onSubmit={e => { e.preventDefault(); void load(new URLSearchParams({ start, end })); }}><label>Từ ngày<input type="date" value={start} max={end} required disabled={loading} onChange={e => setStart(e.target.value)} /></label><label>Đến ngày<input type="date" value={end} min={start} required disabled={loading} onChange={e => setEnd(e.target.value)} /></label><button disabled={loading}>Áp dụng</button><small>Tối đa 366 ngày</small></form>}
    {error && <p role="alert" className="rv-error">{error} <Link href="/seller/login">Đăng nhập</Link></p>}
    <div role="status" className="rv-loading-status">{loading ? "Đang cập nhật báo cáo…" : `Dữ liệu từ ${dateLabel(data.range.start)} đến ${dateLabel(data.range.end)}`}</div>
    <div className={`rv-data ${loading ? "is-loading" : ""}`} aria-busy={loading}>
      <div className="rv-kpis">{kpis.map(({ label, value, change, Icon }) => <section className="rv-card rv-kpi" key={label}><div className="rv-kpi-label"><span>{label}</span><span className="rv-icon"><Icon size={19} strokeWidth={1.6} /></span></div><strong>{value}</strong><Change value={change} /></section>)}</div>
      <div className="rv-main-row">
        <Card title="Doanh thu theo thời gian" action={<span className="rv-muted">Theo ngày</span>}><p className="rv-caption">Doanh thu đã thanh toán, bao gồm phí giao hàng</p>{data.summary.count ? <Timeline key={`${data.range.start}-${data.range.end}`} rows={data.daily} /> : <Empty>Chưa có doanh thu trong khoảng thời gian này.</Empty>}</Card>
        <Card title="Sản phẩm bán chạy" action={<select aria-label="Xếp hạng sản phẩm" value={productMode} onChange={e => setProductMode(e.target.value as typeof productMode)}><option value="revenue">Theo doanh thu</option><option value="packs">Theo số lượng</option></select>}>
          {products.length ? <div className="rv-products"><Donut values={products.map((p, i) => ({ label: p.name, value: p[productMode], color: colors[i % colors.length] }))} label={productMode === "revenue" ? "Tổng doanh thu" : "Tổng đã bán"} total={productMode === "revenue" ? money(productTotal) : `${number(productTotal)} pack`} /><ul className="rv-product-legend">{products.map((p, i) => <li key={p.product_id}><Thumbnail key={p.image_url} src={p.image_url} name={p.name} /><div><strong><i style={{ background: colors[i % colors.length] }} />{p.name}</strong><small>{productMode === "revenue" ? money(p.revenue) : `${number(p.packs)} pack`}</small></div><b>{number(productTotal ? p[productMode] / productTotal * 100 : 0)}%</b></li>)}</ul></div> : <Empty>Chưa có dữ liệu sản phẩm.</Empty>}
          <p className="rv-caption">Giá sản phẩm tại thời điểm mua · Không gồm phí giao hàng</p>
        </Card>
      </div>
      <div className="rv-middle-row">
        <Card title="Đơn hàng gần đây" action={<Link className="rv-all" href="/seller/orders">Xem tất cả →</Link>}>
          {data.recent.length ? <div className="rv-table"><table><thead><tr>{["#Đơn hàng", "Khách hàng", "Sản phẩm", "Tổng tiền", "Trạng thái", "Thời gian"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.recent.map(o => <tr key={o.id}><td><Link href={`/seller/orders/${o.id}`}>#{o.order_code}</Link></td><td>{o.customer_name}</td><td className="rv-order-products">{o.products || "—"}</td><td><strong>{money(o.total)}</strong></td><td><span className="rv-success">Thành công</span></td><td>{timestamp(o.paid_at)}</td></tr>)}</tbody></table></div> : <Empty>Chưa có đơn hàng.</Empty>}
          <p className="rv-caption">5 đơn thanh toán thành công mới nhất trong kỳ</p>
        </Card>
        <Card title="Tần suất mua trung bình" className="rv-apf"><p className="rv-caption">Số đơn trung bình trên mỗi khách hàng</p><div className="rv-feature-value">{number(data.summary.apf)}<span>đơn / khách</span><Heart size={24} strokeWidth={1.4} aria-hidden="true" /></div><dl><div><dt>Khách mua lại</dt><dd>{number(data.summary.returningRate)}%</dd></div><div><dt>Khách đã mua</dt><dd>{number(data.summary.customers)}</dd></div><div><dt>Chu kỳ mua lại trung bình</dt><dd>{data.summary.repurchaseDays === null ? "Chưa đủ dữ liệu" : `${number(data.summary.repurchaseDays)} ngày`}</dd></div></dl><p className="rv-caption">Tính từ các lần mua thành công trong khoảng ngày đã chọn.</p></Card>
        <Card title="Phương thức thanh toán">{data.payments.length ? <><Donut values={data.payments.map((p, i) => ({ label: p.provider, value: p.amount, color: colors[i % colors.length] }))} label="Tổng thanh toán" total={money(paymentTotal)} /><ul className="rv-payment-legend">{data.payments.map((p, i) => <li key={p.provider}><span><i style={{ background: colors[i % colors.length] }} />{p.provider.toLowerCase() === "sepay" ? "Chuyển khoản / SePay" : p.provider.toLowerCase() === "cod" ? "COD" : p.provider}</span><strong>{number(paymentTotal ? p.amount / paymentTotal * 100 : 0)}%</strong></li>)}</ul></> : <Empty>Chưa có thanh toán đã khớp.</Empty>}<p className="rv-caption">Chỉ gồm giao dịch khớp với đơn thành công</p></Card>
      </div>
      <div className="rv-bottom-row">
        <Card title="Khung giờ bán tốt" action={<select aria-label="Thống kê khung giờ" value={hourMode} onChange={e => setHourMode(e.target.value as typeof hourMode)}><option value="revenue">Theo doanh thu</option><option value="count">Theo số đơn</option></select>}>
          {bestHour > 0 ? <><div className="rv-hours">{data.hours.map(h => <div className="rv-hour" key={h.slot} tabIndex={0} aria-label={`${h.label}: ${money(h.revenue)}, ${h.count} đơn`}><div className="rv-hour-bar" style={{ height: `${h[hourMode] / bestHour * 100}%`, background: h[hourMode] === bestHour ? "var(--seller-secondary)" : "var(--seller-green-accent)" }}>{h[hourMode] === bestHour && <Crown size={20} aria-label="Khung giờ bán tốt nhất" />}</div><span>{h.label}</span><div className="rv-hour-tooltip"><strong>{h.label}</strong><br />Doanh thu: {money(h.revenue)}<br />{h.count} đơn</div></div>)}</div><p className="rv-caption">Theo giờ thanh toán · {hourMode === "revenue" ? "Doanh thu (VNĐ)" : "Số đơn thành công"} · Di chuột hoặc chạm để xem chi tiết</p></> : <Empty>Chưa có doanh thu trong khoảng thời gian này.</Empty>}
        </Card>
        <Card title="Tỷ lệ thanh toán thành công" className="rv-payment-rate"><span className="rv-icon"><ArrowUpRight size={23} /></span><div className="rv-rate">{number(data.paymentSuccess.rate)}<span>%</span></div><p><strong>{data.paymentSuccess.successful}</strong> / {data.paymentSuccess.eligible} đơn</p><p className="rv-caption">Trong các đơn tạo ở kỳ này, tỷ lệ đã thanh toán thành công tính đến cuối kỳ. Đơn chờ, hết hạn và hủy vẫn nằm trong tổng đơn.</p></Card>
      </div>
    </div>
    <footer className="rv-footer"><Leaf size={14} aria-hidden="true" />Một chút ngọt ngào, mỗi ngày một bước tiến.</footer>
  </div>;
}
