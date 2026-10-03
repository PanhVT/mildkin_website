import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users, sessions } from "@/db/schema";
import { PublicError } from "@/lib/http";
import { sha256 } from "@/lib/security";
import { hashPassword, verifyPassword, dummyPasswordCheck } from "./password";
import { registerSchema, loginSchema, profileSchema } from "./validation";
import { createSession, newSession } from "./session";
export async function registerUser(
  binding: D1Database,
  input: unknown,
  oldToken?: string,
) {
  const result = registerSchema.safeParse(input);
  if (!result.success) throw new PublicError(result.error.issues[0].message);
  const { email, name, phone, password } = result.data;
  const db = drizzle(binding);
  if (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()
  )
    throw new PublicError("Email này đã được sử dụng.", 409);
  const { hash, salt } = await hashPassword(password);
  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    phone: phone || null,
    createdAt: now,
    updatedAt: now,
  };
  const session = await newSession(user.id);
  try {
    await db.batch([
      db
        .insert(users)
        .values({ ...user, passwordHash: hash, passwordSalt: salt }),
      db
        .delete(sessions)
        .where(eq(sessions.tokenHash, await sha256(oldToken || ""))),
      db.insert(sessions).values(session.row),
    ]);
  } catch (error) {
    if (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()
    )
      throw new PublicError("Email này đã được sử dụng.", 409);
    throw error;
  }
  return { user, session };
}
export async function loginUser(
  binding: D1Database,
  input: unknown,
  oldToken?: string,
) {
  const result = loginSchema.safeParse(input);
  const invalid = () => new PublicError("Email hoặc mật khẩu chưa đúng.", 401);
  if (!result.success) throw invalid();
  const { email, password } = result.data;
  const stored = await drizzle(binding)
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (!stored) {
    await dummyPasswordCheck(password);
    throw invalid();
  }
  if (
    !(await verifyPassword(password, stored.passwordHash, stored.passwordSalt))
  )
    throw invalid();
  const session = await createSession(binding, stored.id, oldToken);
  return {
    user: {
      id: stored.id,
      name: stored.name,
      email: stored.email,
      phone: stored.phone,
      createdAt: stored.createdAt,
    },
    session,
  };
}
export async function updateProfile(
  binding: D1Database,
  userId: string,
  input: unknown,
) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new PublicError(parsed.error.issues[0].message);
  await drizzle(binding)
    .update(users)
    .set({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      updatedAt: Date.now(),
    })
    .where(eq(users.id, userId));
}
