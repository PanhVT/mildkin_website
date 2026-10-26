import { z } from "zod";
import { PublicError } from "@/lib/http";
import { formatCurrency } from "@/lib/currency";
import type { SellerOrder } from "./data";

export function canCopyConfirmation(order: Pick<SellerOrder, "status" | "payment_status" | "payment_method">) {
  return ["PREPARING", "SHIPPING", "COMPLETED"].includes(order.status)
    && (order.payment_method === "COD" || order.payment_status === "PAID");
}
export function confirmationMessage(order: SellerOrder, items: { product_name_snapshot: string; quantity: number }[]) {
  if (!canCopyConfirmation(order)) throw new PublicError("Đơn chưa được xác nhận", 409);
  const stage = order.status === "PREPARING" ? "đã được xác nhận và đang được chuẩn bị" : order.status === "SHIPPING" ? "đang được giao" : "đã hoàn thành";
  const payment = order.payment_status === "PAID" ? "Đã thanh toán" : "Thanh toán khi nhận hàng";
  return `Mildkin xin chào ${order.customer_name} 🌷

Đơn ${order.order_code} của bạn ${stage}.

Đơn hàng:
${items.map(item => `- ${item.product_name_snapshot} × ${item.quantity}`).join("\n")}

Tổng tiền: ${formatCurrency(order.total)}
Hình thức nhận: ${order.shipping_method === "PICKUP" ? "Nhận bánh tại NEU" : "Giao tận nơi"}
Thanh toán: ${payment}

Cảm ơn bạn đã đặt bánh tại Mildkin ♡`;
}
// Called only after requireSeller in the seller handler. Touch contact metadata only.
export async function updateInstagramContact(db: D1Database, id: string, input: unknown) {
  const parsed = z.object({ contacted: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) throw new PublicError("Trạng thái liên hệ không hợp lệ.");
  const row = await db.prepare("UPDATE orders SET instagram_contacted_at=CASE WHEN ?=1 THEN COALESCE(instagram_contacted_at,?) ELSE NULL END WHERE id=? RETURNING instagram_contacted_at")
    .bind(parsed.data.contacted ? 1 : 0, Date.now(), id).first<{ instagram_contacted_at: number | null }>();
  if (!row) throw new PublicError("Không tìm thấy đơn hàng.", 404);
  return row;
}
