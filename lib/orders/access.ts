import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { sha256, constantTimeEqual } from "@/lib/security";
import { expireOrders } from "./service";
export const orderCookie = (code: string) => `mk_order_${code}`;
export async function accessibleOrder(code: string) {
  if (!/^MK[A-F0-9]{10}$/.test(code)) return null;
  const token = (await cookies()).get(orderCookie(code))?.value;
  if (!token) return null;
  const db = await getDb();
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.orderCode, code))
    .get();
  if (
    !order ||
    !(await constantTimeEqual(order.accessTokenHash, await sha256(token)))
  )
    return null;
  await expireOrders((await getEnv()).DB);
  return (await db.select().from(orders).where(eq(orders.id, order.id)).get())!;
}
export async function requireOrder(code: string) {
  const order = await accessibleOrder(code);
  if (!order) notFound();
  return order;
}
