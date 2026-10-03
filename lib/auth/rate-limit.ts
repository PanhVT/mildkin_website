import { sha256 } from "@/lib/security";
import { PublicError } from "@/lib/http";
export async function limitAuth(
  db: D1Database,
  request: Request,
  action: "login" | "register",
  email?: string,
) {
  const now = Date.now();
  const windowMs = action === "register" ? 3600000 : 900000;
  const bucket = Math.floor(now / windowMs);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const keys = [{ value: `ip:${ip}`, max: action === "register" ? 5 : 30 }];
  if (email) keys.push({ value: `email:${email}`, max: 10 });
  await db
    .prepare("DELETE FROM request_limits WHERE expires_at < ?")
    .bind(now)
    .run();
  for (const key of keys) {
    const id = await sha256(`auth:${action}:${bucket}:${key.value}`);
    const result = await db
      .prepare(
        "INSERT INTO request_limits (id, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
      )
      .bind(id, (bucket + 1) * windowMs)
      .first<{ attempts: number }>();
    if (!result || result.attempts > key.max)
      throw new PublicError(
        "Bạn đã thử nhiều lần. Vui lòng thử lại sau ít phút.",
        429,
      );
  }
}
