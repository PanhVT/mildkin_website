import { z } from "zod";
import { PublicError } from "@/lib/http";
import { updateSellerOrder, pageNumber, type SellerOrder } from "./data";
import { DELIVERY_ASSIGNEES, DELIVERY_STATUSES, type DeliveryStatus } from "./delivery-config";

export interface DeliveryOrder extends Omit<SellerOrder, "customer_instagram" | "instagram_contacted_at"> {
  address: string; ward: string; district: string; city: string;
  delivery_assignee: string | null; delivery_status: DeliveryStatus;
  assigned_at: number | null; delivery_started_at: number | null; delivered_at: number | null;
}
// Operational orders plus a bounded 30-day completion history. Excludes expired payments.
const scope = "payment_status!='EXPIRED' AND (status IN ('PREPARING','SHIPPING') OR (status='COMPLETED' AND COALESCE(delivered_at,updated_at)>=?))";
export async function deliveryDashboard(db: D1Database, params = new URLSearchParams(), now = Date.now()) {
  const page = pageNumber(params), cutoff = now - 30 * 86400000;
  const status = params.get("status") || "", assignee = params.get("assignee") || "", fulfillment = params.get("fulfillment") || "";
  if ((status && !DELIVERY_STATUSES.includes(status as DeliveryStatus)) ||
    (assignee && !DELIVERY_ASSIGNEES.includes(assignee as typeof DELIVERY_ASSIGNEES[number])) ||
    (fulfillment && !["DELIVERY", "PICKUP"].includes(fulfillment))) throw new PublicError("Bộ lọc giao/bàn giao không hợp lệ.");
  const q = (params.get("q") || "").trim().slice(0, 100), search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = `${scope} AND (?='' OR delivery_status=?) AND (?='' OR delivery_assignee=?) AND (?='' OR shipping_method=?)
    AND (?='' OR order_code LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')`;
  const bindings = [cutoff, status, status, assignee, assignee, fulfillment, fulfillment, q, search, search, search];
  // A single D1 batch provides a consistent view; no per-order queries.
  const [kpis, workload, orders, count] = await db.batch([
    db.prepare(`SELECT delivery_status,COUNT(*) n FROM orders WHERE ${scope} GROUP BY delivery_status`).bind(cutoff),
    db.prepare(`SELECT delivery_assignee,COUNT(*) n,SUM(delivery_status='IN_DELIVERY') delivering FROM orders
      WHERE status IN ('PREPARING','SHIPPING') AND payment_status!='EXPIRED' AND delivery_status!='COMPLETED' AND delivery_assignee IS NOT NULL GROUP BY delivery_assignee`),
    db.prepare(`SELECT id,order_code,customer_name,phone,created_at,total,status,payment_status,payment_method,shipping_method,
      address,ward,district,city,delivery_assignee,delivery_status,assigned_at,delivery_started_at,delivered_at FROM orders WHERE ${where}
      ORDER BY CASE delivery_status WHEN 'UNASSIGNED' THEN 0 WHEN 'WAITING' THEN 1 WHEN 'IN_DELIVERY' THEN 2 ELSE 3 END,created_at DESC,id DESC LIMIT 25 OFFSET ?`).bind(...bindings, (page - 1) * 25),
    db.prepare(`SELECT COUNT(*) n FROM orders WHERE ${where}`).bind(...bindings),
  ]);
  return {
    kpis: Object.fromEntries(DELIVERY_STATUSES.map(s => [s, (kpis.results as unknown as { delivery_status: string; n: number }[]).find(r => r.delivery_status === s)?.n ?? 0])) as Record<DeliveryStatus, number>,
    workload: DELIVERY_ASSIGNEES.map(name => {
      const row = (workload.results as unknown as { delivery_assignee: string; n: number; delivering: number }[]).find(r => r.delivery_assignee === name);
      return { name, count: row?.n ?? 0, delivering: row?.delivering ?? 0 };
    }),
    rows: orders.results as unknown as DeliveryOrder[], total: Number((count.results[0] as { n?: number } | undefined)?.n ?? 0), page,
  };
}

export async function updateDelivery(db: D1Database, id: string, input: unknown) {
  const parsed = z.discriminatedUnion("action", [
    z.object({ action: z.literal("assign"), assignee: z.enum(DELIVERY_ASSIGNEES), expectedAssignee: z.string().nullable(), expectedStatus: z.enum(DELIVERY_STATUSES), confirmReassign: z.boolean().optional() }).strict(),
    z.object({ action: z.literal("status"), status: z.enum(["IN_DELIVERY", "COMPLETED"]) }).strict(),
  ]).safeParse(input);
  if (!parsed.success) throw new PublicError("Người phụ trách hoặc thao tác giao/bàn giao không hợp lệ.");
  const p = parsed.data;
  if (p.action === "status") return updateSellerOrder(db, id, { status: p.status === "IN_DELIVERY" ? "SHIPPING" : "COMPLETED" });
  const order = await db.prepare("SELECT status,delivery_status,delivery_assignee,assigned_at,payment_status FROM orders WHERE id=?").bind(id).first<{
    status: string; delivery_status: string; delivery_assignee: string | null; assigned_at: number | null; payment_status: string;
  }>();
  if (!order) throw new PublicError("Không tìm thấy đơn hàng.", 404);
  if (!["PREPARING", "SHIPPING"].includes(order.status) || order.delivery_status === "COMPLETED" || order.payment_status === "EXPIRED") throw new PublicError("Đơn này không thể đổi người phụ trách.", 409);
  if (order.delivery_status !== p.expectedStatus || order.delivery_assignee !== p.expectedAssignee) throw new PublicError("Phân công đã thay đổi. Tải lại rồi thử lại.", 409);
  if (order.delivery_status === "IN_DELIVERY" && p.assignee !== order.delivery_assignee && !p.confirmReassign) throw new PublicError("Đơn đang được giao. Bạn có chắc muốn đổi người phụ trách?", 409);
  if (p.assignee === order.delivery_assignee) return { success: true };
  const result = await db.prepare(`UPDATE orders SET delivery_assignee=?,delivery_status=CASE WHEN delivery_status='UNASSIGNED' THEN 'WAITING' ELSE delivery_status END,
    assigned_at=COALESCE(assigned_at,?),updated_at=? WHERE id=? AND status=? AND payment_status=? AND delivery_status=? AND delivery_assignee IS ?`)
    .bind(p.assignee, Date.now(), Date.now(), id, order.status, order.payment_status, order.delivery_status, order.delivery_assignee).run();
  if (!result.meta.changes) throw new PublicError("Đơn đã thay đổi. Tải lại rồi thử lại.", 409);
  return { success: true };
}
