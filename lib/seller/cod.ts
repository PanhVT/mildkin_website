import { PublicError } from "@/lib/http";

// Called only after requireSeller + requireSameOrigin in the seller handler.
export async function collectCod(db: D1Database, id: string) {
  const now = Date.now();
  // Guard and insert are one statement. The settlement trigger updates the order atomically.
  // Deterministic transaction ID makes retries/concurrent clicks create only one receipt.
  await db.prepare(`INSERT INTO payments
    (id,order_id,provider,provider_transaction_id,amount,bank,account,content,raw_payload,created_at)
    SELECT 'cod:'||id,id,'cod','cod:'||id,total,'','','Thu tiền COD '||order_code,'{}',?
    FROM orders WHERE id=? AND payment_method='COD' AND payment_status='PENDING'
      AND status IN ('PREPARING','SHIPPING','COMPLETED')
    ON CONFLICT(provider_transaction_id) DO NOTHING`).bind(now, id).run();
  const order = await db.prepare("SELECT id,payment_method,payment_status,paid_at,status FROM orders WHERE id=?")
    .bind(id).first<{ id: string; payment_method: string; payment_status: string; paid_at: number | null; status: string }>();
  if (!order) throw new PublicError("Không tìm thấy đơn hàng.", 404);
  if (order.payment_method !== "COD") throw new PublicError("Chỉ xác nhận thu tiền cho đơn COD.", 409);
  if (order.payment_status !== "PAID") throw new PublicError("Không thể thu tiền cho đơn đã hủy hoặc trạng thái không hợp lệ.", 409);
  return { order };
}
