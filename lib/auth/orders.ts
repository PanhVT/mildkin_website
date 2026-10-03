import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { orders, orderItems } from "@/db/schema";
import { expireOrders } from "@/lib/orders/service";
export async function userOrders(
  binding: D1Database,
  userId: string,
  page = 1,
) {
  await expireOrders(binding);
  const offset = (Math.max(1, Math.min(10000, Math.floor(page) || 1)) - 1) * 20;
  return drizzle(binding)
    .select({
      orderCode: orders.orderCode,
      createdAt: orders.createdAt,
      total: orders.total,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(21)
    .offset(offset);
}
export async function userOrder(
  binding: D1Database,
  userId: string,
  code: string,
) {
  if (!/^MK[A-F0-9]{10}$/.test(code)) return null;
  const db = drizzle(binding);
  await expireOrders(binding);
  const order = await db
    .select({
      id: orders.id,
      orderCode: orders.orderCode,
      customerName: orders.customerName,
      phone: orders.phone,
      address: orders.address,
      ward: orders.ward,
      district: orders.district,
      city: orders.city,
      note: orders.note,
      subtotal: orders.subtotal,
      shippingFee: orders.shippingFee,
      shippingMethod: orders.shippingMethod,
      deliveryDistanceMeters: orders.deliveryDistanceMeters,
      total: orders.total,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.orderCode, code), eq(orders.userId, userId)))
    .get();
  if (!order) return null;
  const items = await db
    .select({
      name: orderItems.productNameSnapshot,
      price: orderItems.priceSnapshot,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  return { order, items };
}
