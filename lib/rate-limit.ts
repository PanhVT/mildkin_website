import { sha256 } from "./security";
import { PublicError } from "./http";
export async function limitCheckout(db: D1Database, request: Request) {
  return limitRequests(db, request, "checkout", 10);
}
export async function limitShippingQuote(db: D1Database, request: Request) {
  return limitRequests(db, request, "shipping-quote", 30);
}
async function limitRequests(db: D1Database, request: Request, scope: string, maximum: number) {
  const now = Date.now();
  const window = Math.floor(now / 300000);
  // Cloudflare overwrites this header on deployed requests. No IP addresses are persisted.
  const key = await sha256(
    `${scope}:${window}:${request.headers.get("cf-connecting-ip") || "local"}`,
  );
  await db
    .prepare("DELETE FROM request_limits WHERE expires_at < ?")
    .bind(now)
    .run();
  const row = await db
    .prepare(
      "INSERT INTO request_limits (id, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
    )
    .bind(key, (window + 1) * 300000)
    .first<{ attempts: number }>();
  if (!row || row.attempts > maximum)
    throw new PublicError(
      "Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau 5 phút.",
      429,
    );
}
