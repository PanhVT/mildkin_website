import { SignJWT, jwtVerify } from "jose";
import type { Env } from "@/lib/env";
import { verifyPassword } from "@/lib/auth/password";
import { constantTimeEqual, sha256 } from "@/lib/security";
import { PublicError } from "@/lib/http";

export const SELLER_COOKIE = "mildkin_seller_session";
export const SELLER_SECONDS = 8 * 60 * 60;
export const sellerCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SELLER_SECONDS,
});
export function sellerToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${SELLER_COOKIE}=`))
    ?.slice(SELLER_COOKIE.length + 1);
}
function key(env: Env) {
  if (
    !env.SELLER_USERNAME ||
    !env.SELLER_PASSWORD_HASH ||
    !env.SELLER_SESSION_SECRET ||
    env.SELLER_SESSION_SECRET.length < 32
  )
    throw new PublicError("Khu vực người bán chưa được cấu hình.", 503);
  return new TextEncoder().encode(env.SELLER_SESSION_SECRET);
}
export async function sellerCredentials(
  env: Env,
  username: string,
  password: string,
) {
  key(env);
  const [algorithm, cost, hash, salt] = env.SELLER_PASSWORD_HASH!.split("$");
  const valid = await verifyPassword(
    password,
    `${algorithm}$${cost}$${hash}`,
    salt || "",
  );
  return (await constantTimeEqual(username, env.SELLER_USERNAME!)) && valid;
}
export async function createSellerSession(env: Env) {
  const token = await new SignJWT({ role: "seller" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(env.SELLER_USERNAME!)
    .setIssuer("mildkin-seller")
    .setAudience("seller")
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${SELLER_SECONDS}s`)
    .sign(key(env));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM seller_sessions WHERE expires_at <= ?").bind(
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO seller_sessions(token_hash, expires_at) VALUES (?, ?)",
    ).bind(await sha256(token), Date.now() + SELLER_SECONDS * 1000),
  ]);
  return token;
}
export async function hasSellerSession(env: Env, token?: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(env), {
      algorithms: ["HS256"],
      issuer: "mildkin-seller",
      audience: "seller",
    });
    if (payload.role !== "seller" || payload.sub !== env.SELLER_USERNAME)
      return false;
  } catch {
    return false;
  }
  return Boolean(
    await env.DB.prepare(
      "SELECT token_hash FROM seller_sessions WHERE token_hash=? AND expires_at>?",
    )
      .bind(await sha256(token), Date.now())
      .first(),
  );
}
export async function requireSeller(env: Env, token?: string) {
  if (!(await hasSellerSession(env, token)))
    throw new PublicError("Bạn cần đăng nhập người bán.", 401);
}
