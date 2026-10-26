import Link from "next/link";
import { orderStatusLabel } from "@/lib/seller/order-status";
import { formatDate, statusLabels } from "@/lib/status";
import type { SellerOrder } from "@/lib/seller/data";
import { paymentMethodLabel } from "@/lib/payments/method";
export const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
export function Title({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="seller-title">
      <p>MILDKIN • NGƯỜI BÁN</p>
      <h1>{title}</h1>
      <span>{subtitle}</span>
    </div>
  );
}
export function Kpis({ items, accents = ["revenue", "sage", "warning", "pending"] }: { items: [string, string | number][]; accents?: ("revenue" | "sage" | "warning" | "pending" | "neutral" | "info")[] }) {
  return (
    <div className="seller-kpis">
      {items.map(([label, value], index) => (
        <div className="seller-card" data-accent={accents[index] || "sage"} key={label}>
          <p>{label}</p>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
export function Badge({ value, order = false, paymentMethod, label }: { value: string; order?: boolean; paymentMethod?: string; label?: string }) {
  return (
    <span
      className={`seller-badge seller-status-${value.toLowerCase()} ${value === "PAID" || value === "MATCHED" || value === "COMPLETED" ? "seller-good" : ""}`}
    >
      {label || (order ? orderStatusLabel(value, paymentMethod) : statusLabels[value]) || value}
    </span>
  );
}
export function OrdersTable({ rows }: { rows: SellerOrder[] }) {
  return (
    <div className="seller-table">
      <table>
        <thead>
          <tr>
            {[
              "Mã đơn",
              "Khách hàng",
              "Ngày",
              "Nhận hàng",
              "Thanh toán",
              "Trạng thái",
              "Tổng tiền",
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/seller/orders/${o.id}`}>{o.order_code}</Link>
              </td>
              <td>{o.customer_name || "Khách vãng lai"}
                <div className="seller-instagram-summary">
                  {o.customer_instagram && <small>@{o.customer_instagram}</small>}
                  <span className={`seller-badge ${o.instagram_contacted_at == null ? "" : "seller-good"}`}>{o.instagram_contacted_at == null ? "Chưa liên hệ" : "Đã liên hệ"}</span>
                </div>
              </td>
              <td>{formatDate(o.created_at)}</td>
              <td>
                {o.shipping_method === "PICKUP" ? "Tại NEU" : "Giao hàng"}
              </td>
              <td>
                <small>{paymentMethodLabel(o.payment_method, o.shipping_method)}</small><br />
                {o.payment_method === "COD" && o.payment_status === "PENDING" ? <span className="seller-badge">Chưa thu tiền</span> : <Badge value={o.payment_status} />}
              </td>
              <td>
                <Badge value={o.status} order paymentMethod={o.payment_method} />
              </td>
              <td>{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="seller-empty">Chưa có đơn hàng phù hợp.</p>
      )}
    </div>
  );
}
export function Pagination({
  page,
  total,
  params,
}: {
  page: number;
  total: number;
  params: URLSearchParams;
}) {
  const href = (p: number) => {
    const q = new URLSearchParams(params);
    q.set("page", String(p));
    return `?${q}`;
  };
  return (
    <nav className="seller-pagination" aria-label="Phân trang">
      {page > 1 && <Link href={href(page - 1)}>← Trước</Link>}
      <span>
        Trang {page} · {total} kết quả
      </span>
      {page * 25 < total && <Link href={href(page + 1)}>Tiếp →</Link>}
    </nav>
  );
}
export function queryParams(
  input: Record<string, string | string[] | undefined>,
) {
  return new URLSearchParams(
    Object.entries(input).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v]] : [],
    ),
  );
}
export type SearchProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
