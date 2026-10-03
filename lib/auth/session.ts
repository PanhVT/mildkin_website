import { and, eq, gt, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sessions, users } from "@/db/schema";
import { sha256 } from "@/lib/security";
export const SESSION_COOKIE = "mildkin_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export type PublicUser = Pick<
  typeof users.$inferSelect,
  "id" | "name" | "email" | "phone" | "createdAt"
>;
export const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  createdAt: users.createdAt,
};
export function sessionCookieOptions(
  production = process.env.NODE_ENV === "production",
) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
export function requestSessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
export async function newSession(userId: string, now = Date.now()) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    token,
    row: {
      id: crypto.randomUUID(),
      userId,
      tokenHash: await sha256(token),
      expiresAt: now + SESSION_SECONDS * 1000,
      createdAt: now,
      lastSeenAt: now,
    },
  };
}
export async function createSession(
  binding: D1Database,
  userId: string,
  oldToken?: string,
) {
  const db = drizzle(binding);
  const session = await newSession(userId);
  await db.batch([
    db
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256(oldToken || ""))),
    db.insert(sessions).values(session.row),
  ]);
  return session;
}
export async function getSession(
  binding: D1Database,
  token?: string,
  now = Date.now(),
) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = drizzle(binding);
  const found = await db
    .select({
      user: publicUserColumns,
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, await sha256(token)),
        gt(sessions.expiresAt, now),
      ),
    )
    .get();
  if (!found) return null;
  if ((found.lastSeenAt || 0) < now - 60 * 60 * 1000)
    await db
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, found.sessionId));
  return found;
}
export async function deleteSession(binding: D1Database, token?: string) {
  if (token)
    await drizzle(binding)
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256(token)));
}
export async function cleanExpiredSessions(
  binding: D1Database,
  now = Date.now(),
) {
  await drizzle(binding).delete(sessions).where(lt(sessions.expiresAt, now));
}
