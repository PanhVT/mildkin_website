import { z } from "zod";
import { packLabelSchema, unitsPerPackSchema } from "./product-validation";
import { PublicError } from "@/lib/http";
import { allowedOrderTransitions } from "./order-status";
import { orderStatuses, paymentStatuses } from "@/db/schema";

const DAY = 86400000;
export const paidWhere =
  "o.payment_status='PAID' AND o.status NOT IN ('PENDING_PAYMENT','CANCELLED') AND o.paid_at IS NOT NULL";
export function dateRange(params: URLSearchParams, now = Date.now()) {
  const today = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
  const midnight = (date: string) => Date.parse(`${date}T00:00:00+07:00`);
  const preset = params.get("range") || "today";
  let from = midnight(today),
    to = from + DAY;
  if (preset === "7") from -= 6 * DAY;
  else if (preset === "30") from -= 29 * DAY;
  else if (preset === "month") from = midnight(`${today.slice(0, 7)}-01`);
  else if (preset === "custom") {
    const dates = z
      .object({ from: z.iso.date(), to: z.iso.date() })
      .safeParse(Object.fromEntries(params));
    if (!dates.success) throw new PublicError("Vui lòng chọn ngày hợp lệ.");
    from = midnight(dates.data.from);
    to = midnight(dates.data.to) + DAY;
  } else if (preset !== "today")
    throw new PublicError("Khoảng ngày không hợp lệ.");
  if (to <= from || to - from > 366 * DAY)
    throw new PublicError("Chọn khoảng ngày tối đa 366 ngày.");
  return { from, to };
}
export interface SellerOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_instagram: string | null;
  instagram_contacted_at: number | null;
  phone: string;
  created_at: number;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string;
  shipping_method: string;
}
const orderColumns =
  "o.id,o.order_code,o.customer_name,o.customer_instagram,o.instagram_contacted_at,o.phone,o.created_at,o.total,o.status,o.payment_status,o.payment_method,o.shipping_method";
export function pageNumber(params: URLSearchParams) {
  const page = Number(params.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw new PublicError("Trang không hợp lệ.");
  return page;
}
export async function sellerOrders(db: D1Database, params: URLSearchParams) {
  const page = pageNumber(params),
    q = (params.get("q") || "").trim().slice(0, 100);
  const status = params.get("status") || "";
  if (
    status &&
    !orderStatuses.includes(status as (typeof orderStatuses)[number])
  )
    throw new PublicError("Bộ lọc không hợp lệ.");
  const payment = params.get("payment") || "";
  if (payment && !paymentStatuses.includes(payment as (typeof paymentStatuses)[number]))
    throw new PublicError("Bộ lọc thanh toán không hợp lệ.");
  const contact = params.get("contact") || "";
  if (!["", "contacted", "uncontacted"].includes(contact)) throw new PublicError("Bộ lọc liên hệ không hợp lệ.");
  const contactWhere = contact === "contacted" ? "o.instagram_contacted_at IS NOT NULL" : contact === "uncontacted" ? "o.instagram_contacted_at IS NULL" : "1=1";
  const where = contactWhere + " AND " +
    "(?='' OR o.payment_status=?) AND (?='' OR o.status=?) AND (?='' OR o.order_code LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\' OR o.phone LIKE ? ESCAPE '\\')";
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const bindings = [payment, payment, status, status, q, search, search, search];
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT ${orderColumns} FROM orders o WHERE ${where} ORDER BY o.created_at DESC,o.id DESC LIMIT 25 OFFSET ?`,
      )
      .bind(...bindings, (page - 1) * 25)
      .all<SellerOrder>(),
    db
      .prepare(`SELECT COUNT(*) n FROM orders o WHERE ${where}`)
      .bind(...bindings)
      .first<{ n: number }>(),
  ]);
  return { rows: rows.results, total: count!.n, page };
}
export async function sellerOrder(db: D1Database, id: string) {
  const order = await db
    .prepare(
      `SELECT ${orderColumns},o.address,o.ward,o.city,o.note,o.subtotal,o.shipping_fee,o.paid_at,o.delivery_assignee,o.delivery_status,u.email FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=?`,
    )
    .bind(id)
    .first<
      SellerOrder & {
        address: string;
        ward: string;
        city: string;
        note: string | null;
        subtotal: number;
        shipping_fee: number;
        paid_at: number | null;
        email: string | null;
        delivery_assignee: string | null;
        delivery_status: import("./delivery-config").DeliveryStatus;
      }
    >();
  if (!order) throw new PublicError("Không tìm thấy đơn hàng.", 404);
  const items = await db
    .prepare(
      "SELECT product_name_snapshot,price_snapshot,quantity FROM order_items WHERE order_id=?",
    )
    .bind(id)
    .all<{
      product_name_snapshot: string;
      price_snapshot: number;
      quantity: number;
    }>();
  return { order, items: items.results };
}
export async function updateSellerOrder(
  db: D1Database,
  id: string,
  input: unknown,
) {
  const parsed = z
    .object({
      status: z.enum(["PREPARING", "SHIPPING", "COMPLETED", "CANCELLED"]),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new PublicError("Trạng thái không hợp lệ.");
  const status = parsed.data.status;
  const order = await db.prepare("SELECT status,payment_status,payment_method,shipping_method,delivery_assignee,delivery_status FROM orders WHERE id=?")
    .bind(id).first<import("./order-status").OrderState & { delivery_assignee: string | null; delivery_status: string }>();
  if (!order) throw new PublicError("Không tìm thấy đơn hàng.", 404);
  if (["SHIPPING", "COMPLETED"].includes(status) && !order.delivery_assignee)
    throw new PublicError(order.shipping_method === "PICKUP" ? "Vui lòng chọn người phụ trách bàn giao trước." : "Vui lòng chọn người phụ trách giao đơn trước.", 409);
  if (!allowedOrderTransitions(order).includes(status))
    throw new PublicError("Không thể chuyển trạng thái. COD phải được xác nhận thu tiền trước khi hoàn thành.", 409);
  const now = Date.now();
  // Sync order and delivery stages in one conditional write, including callers from order detail.
  const deliveryStatus = status === "SHIPPING" ? "IN_DELIVERY" : status === "COMPLETED" ? "COMPLETED" : order.delivery_status;
  const result = await db.prepare(`UPDATE orders SET status=?,updated_at=?,delivery_status=?,
    delivery_started_at=CASE WHEN ?='SHIPPING' THEN COALESCE(delivery_started_at,?) ELSE delivery_started_at END,
    delivered_at=CASE WHEN ?='COMPLETED' THEN COALESCE(delivered_at,?) ELSE delivered_at END
    WHERE id=? AND status=? AND payment_status=? AND shipping_method=? AND payment_method=? AND delivery_assignee IS ? AND delivery_status=?`)
    .bind(status, now, deliveryStatus, status, now, status, now, id, order.status, order.payment_status, order.shipping_method, order.payment_method, order.delivery_assignee, order.delivery_status).run();
  if (!result.meta.changes)
    throw new PublicError(
      "Đơn đã thay đổi hoặc không thể chuyển trạng thái này.",
      409,
    );
  return { success: true };
}
export interface SellerProduct {
  pack_label: string | null;
  units_per_pack: number;
  description: string;
  category: string;
  is_special: number;
  updated_at: number;
  id: string;
  name: string;
  price: number;
  stock: number;
  active: number;
  image_url: string;
  sold: number;
}
export async function sellerProducts(db: D1Database, params: URLSearchParams) {
  const filter = params.get("filter") || "all";
  const filters: Record<string, string> = {
    all: "1=1",
    active: "p.active=1",
    low: "p.stock BETWEEN 1 AND 10",
    empty: "p.stock=0",
  };
  if (!filters[filter]) throw new PublicError("Bộ lọc không hợp lệ.");
  const page = pageNumber(params);
  const rows = await db
    .prepare(
      `SELECT p.id,p.name,p.description,p.pack_label,p.units_per_pack,p.category,p.is_special,p.updated_at,p.price,p.stock,p.active,p.image_url,COALESCE(s.sold,0) sold FROM products p LEFT JOIN (SELECT i.product_id,SUM(i.quantity) sold FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${paidWhere} GROUP BY i.product_id) s ON s.product_id=p.id WHERE ${filters[filter]} ORDER BY p.created_at DESC,p.id LIMIT 25 OFFSET ?`,
    )
    .bind((page - 1) * 25)
    .all<SellerProduct>();
  const count = await db
    .prepare(`SELECT COUNT(*) n FROM products p WHERE ${filters[filter]}`)
    .first<{ n: number }>();
  return { rows: rows.results, total: count!.n, page };
}
export async function updateSellerProduct(
  db: D1Database,
  id: string,
  input: unknown,
) {
  const parsed = z
    .object({
      price: z.number().int().positive().max(100000000),
      stock: z.number().int().min(0).max(1000000),
      active: z.boolean(),
      pack_label: packLabelSchema.optional(),
      units_per_pack: unitsPerPackSchema.optional(),
      expectedStock: z.number().int().min(0),
      expectedPrice: z.number().int().positive(),
      expectedActive: z.boolean(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new PublicError("Giá hoặc tồn kho không hợp lệ.");
  const p = parsed.data;
  const result = await db
    .prepare(
      "UPDATE products SET price=?,stock=?,active=?,pack_label=COALESCE(?,pack_label),units_per_pack=COALESCE(?,units_per_pack),updated_at=? WHERE id=? AND stock=? AND price=? AND active=?",
    )
    .bind(
      p.price,
      p.stock,
      p.active ? 1 : 0,
      p.pack_label ?? null,
      p.units_per_pack ?? null,
      Date.now(),
      id,
      p.expectedStock,
      p.expectedPrice,
      p.expectedActive ? 1 : 0,
    )
    .run();
  if (!result.meta.changes)
    throw new PublicError(
      "Sản phẩm hoặc tồn kho đã thay đổi. Tải lại trang trước khi lưu.",
      409,
    );
  return { success: true };
}
export async function sellerRevenue(db: D1Database, params: URLSearchParams) {
  const { from, to } = dateRange(params);
  const where = `${paidWhere} AND o.paid_at>=? AND o.paid_at<?`;
  const [totals, daily, top] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(o.total),0) revenue,COUNT(*) count,COALESCE(AVG(o.total),0) aov,COALESCE(SUM(o.shipping_fee),0) shipping,COALESCE(SUM(o.subtotal),0) subtotal FROM orders o WHERE ${where}`,
      )
      .bind(from, to)
      .first<{
        revenue: number;
        count: number;
        aov: number;
        shipping: number;
        subtotal: number;
      }>(),
    db
      .prepare(
        `SELECT date(o.paid_at/1000,'unixepoch','+7 hours') day,SUM(o.total) revenue,COUNT(*) count FROM orders o WHERE ${where} GROUP BY day ORDER BY day`,
      )
      .bind(from, to)
      .all<{ day: string; revenue: number; count: number }>(),
    db
      .prepare(
        `SELECT i.product_id,MAX(i.product_name_snapshot) name,SUM(i.quantity) packs,SUM(i.quantity*i.price_snapshot) revenue FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${where} GROUP BY i.product_id ORDER BY revenue DESC LIMIT 10`,
      )
      .bind(from, to)
      .all<{
        product_id: string;
        name: string;
        packs: number;
        revenue: number;
      }>(),
  ]);
  const byDate = new Map(daily.results.map((row) => [row.day, row]));
  const days = [];
  for (let date = from; date < to; date += DAY) {
    const day = new Date(date + 7 * 3600000).toISOString().slice(0, 10);
    days.push(byDate.get(day) || { day, revenue: 0, count: 0 });
  }
  return { totals: totals!, daily: days, top: top.results, from, to };
}
export async function sellerOverview(db: D1Database) {
  const { from, to } = dateRange(new URLSearchParams());
  const [revenue, counts, recent, low] = await Promise.all([
    sellerRevenue(db, new URLSearchParams()),
    db
      .prepare(
        "SELECT COALESCE(SUM(created_at>=? AND created_at<?),0) new_orders,COALESCE(SUM(status IN ('PENDING_PAYMENT','PAID','PREPARING')),0) processing,COALESCE(SUM(payment_status='PENDING' AND status<>'CANCELLED' AND (payment_method='COD' OR (status='PENDING_PAYMENT' AND expires_at>?))),0) pending FROM orders",
      )
      .bind(from, to, Date.now())
      .first<{ new_orders: number; processing: number; pending: number }>(),
    db
      .prepare(
        `SELECT ${orderColumns} FROM orders o ORDER BY created_at DESC,id DESC LIMIT 5`,
      )
      .all<SellerOrder>(),
    db
      .prepare(
        "SELECT id,name,stock FROM products WHERE stock<=10 AND active=1 ORDER BY stock,name LIMIT 10",
      )
      .all<{ id: string; name: string; stock: number }>(),
  ]);
  return {
    revenue: revenue.totals.revenue,
    counts: counts!,
    recent: recent.results,
    low: low.results,
    top: revenue.top,
  };
}
export { sellerPayments } from "./payments";

