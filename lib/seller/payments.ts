import { PublicError } from "@/lib/http";
import { dateRange, pageNumber, paidWhere } from "./data";

export async function sellerPayments(db: D1Database, params: URLSearchParams) {
  const { from, to } = dateRange(new URLSearchParams());
  const page = pageNumber(params);
  const method = params.get("method") || "all";
  if (!["all", "BANK_TRANSFER", "COD"].includes(method)) throw new PublicError("Phương thức thanh toán không hợp lệ.");
  // Uncollected COD entries are order projections, not fabricated payment records.
  // Once a receipt exists, only that real payment appears.
  const ledger = `WITH ledger AS (
    SELECT p.id,p.created_at,p.amount,p.content,p.resolution,p.provider,
      CASE WHEN p.provider='cod' THEN 'COD' ELSE 'BANK_TRANSFER' END payment_method,
      o.order_code,o.id order_id,
      CASE WHEN p.resolution='MATCHED' AND ${paidWhere} THEN 1 ELSE 0 END settled
    FROM payments p LEFT JOIN orders o ON o.id=p.order_id
    UNION ALL
    SELECT 'cod-pending:'||o.id,o.created_at,o.total,'Thu tiền khi nhận bánh',
      CASE WHEN o.status='CANCELLED' THEN 'CANCELLED' ELSE 'PENDING' END,
      'cod','COD',o.order_code,o.id,0
    FROM orders o WHERE o.payment_method='COD' AND o.payment_status<>'PAID'
  )`;
  const filter = "(?='all' OR payment_method=?)";
  const results = await db.batch([
    db.prepare(`${ledger} SELECT * FROM ledger WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?`).bind(method, method, (page - 1) * 25),
    db.prepare(`${ledger} SELECT COALESCE(SUM(CASE WHEN settled=1 AND created_at>=? AND created_at<? THEN amount ELSE 0 END),0) received,COALESCE(SUM(settled),0) matched,COALESCE(SUM(resolution='REVIEW'),0) review FROM ledger WHERE ${filter}`).bind(from, to, method, method),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE payment_status='PENDING' AND status<>'CANCELLED' AND (payment_method='COD' OR (status='PENDING_PAYMENT' AND expires_at>?)) AND (?='all' OR payment_method=?)").bind(Date.now(), method, method),
    db.prepare(`${ledger} SELECT COUNT(*) n FROM ledger WHERE ${filter}`).bind(method, method),
  ]);
  return {
    rows: results[0].results as unknown as { id: string; created_at: number; amount: number; content: string; resolution: string; provider: string; payment_method: string; order_code: string | null; order_id: string | null }[],
    counts: results[1].results[0] as unknown as { received: number; matched: number; review: number },
    pending: (results[2].results[0] as { n: number }).n,
    total: (results[3].results[0] as { n: number }).n,
    page,
  };
}
