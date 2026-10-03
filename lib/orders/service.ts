import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { orders, orderItems, products } from "@/db/schema";
import { type Env } from "@/lib/env";
import { checkoutSchema } from "@/lib/validation";
import { sha256 } from "@/lib/security";
import { PublicError } from "@/lib/http";
import { resolveShipping } from "@/lib/shipping-server";
import { calculateOrderTotal } from "./calculateOrder";
import { generateOrderCode } from "./generateOrderCode";
import { getBank } from "@/lib/payments/sepay/banks";
import { getSession } from "@/lib/auth/session";

export async function expireOrders(db: D1Database, now = Date.now()) {
  // Database trigger returns reservations exactly once when status changes to CANCELLED.
  await db
    .prepare(
      "UPDATE orders SET payment_status='EXPIRED', status='CANCELLED', updated_at=? WHERE payment_status='PENDING' AND expires_at <= ?",
    )
    .bind(now, now)
    .run();
}
export async function createOrder(
  env: Env,
  input: unknown,
  sessionToken?: string,
) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success)
    throw new PublicError("Vui lòng kiểm tra thông tin giao hàng và giỏ bánh.");
  const { items, checkoutToken, ...customer } = parsed.data;
  const db = drizzle(env.DB);
  const accessTokenHash = await sha256(checkoutToken);
  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.accessTokenHash, accessTokenHash))
    .get();
  if (existing) return { order: existing, token: checkoutToken };
  if (
    env.PAYMENT_PROVIDER !== "sepay" ||
    !["hmac", "apikey"].includes(env.SEPAY_WEBHOOK_AUTH || "hmac") ||
    !env.SEPAY_BANK_CODE ||
    !/^\d{6,30}$/.test(env.SEPAY_BANK_ACCOUNT || "") ||
    !env.SEPAY_ACCOUNT_HOLDER ||
    !env.SEPAY_WEBHOOK_SECRET ||
    env.SEPAY_WEBHOOK_SECRET.length < 24
  ) {
    throw new PublicError(
      "Mildkin đang chuẩn bị cổng thanh toán. Bạn vui lòng quay lại sau nhé.",
      503,
    );
  }
  const bank = getBank(env.SEPAY_BANK_CODE);
  await expireOrders(env.DB);
  const catalog = await db
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        items.map((i) => i.productId),
      ),
    );
  const lines = items.map((item) => {
    const product = catalog.find((p) => p.id === item.productId);
    if (!product?.active || product.stock < item.quantity)
      throw new PublicError(
        "Một vài loại bánh đã hết hoặc không đủ số lượng. Bạn hãy cập nhật giỏ bánh nhé.",
        409,
      );
    return { ...item, price: product.price, name: product.name };
  });
  const shipping = await resolveShipping(env, customer);
  const totals = calculateOrderTotal(lines, shipping.shippingFee);
  const now = Date.now();
  // Only a verified server-side session can associate an order with an account.
  const currentUser = (await getSession(env.DB, sessionToken))?.user;
  const order = {
    id: crypto.randomUUID(),
    orderCode: generateOrderCode(),
    accessTokenHash,
    userId: currentUser?.id ?? null,
    ...customer,
    city: customer.city || "Hà Nội",
    ...(customer.shippingMethod === "PICKUP" ? { address: "", ward: "", district: "" } : {}),
    deliveryDistanceMeters: shipping.deliveryDistanceMeters,
    ...totals,
    bankCode: bank.code,
    bankAccount: env.SEPAY_BANK_ACCOUNT!,
    accountHolder: env.SEPAY_ACCOUNT_HOLDER,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 15 * 60 * 1000,
  };
  try {
    // D1 batch is atomic. Item triggers validate the current price/stock and reserve stock.
    await db.batch([
      db.insert(orders).values(order),
      db.insert(orderItems).values(
        lines.map((line) => ({
          id: crypto.randomUUID(),
          orderId: order.id,
          productId: line.productId,
          productNameSnapshot: line.name,
          priceSnapshot: line.price,
          quantity: line.quantity,
        })),
      ),
    ]);
  } catch (error) {
    const retry = await db
      .select()
      .from(orders)
      .where(eq(orders.accessTokenHash, accessTokenHash))
      .get();
    if (retry) return { order: retry, token: checkoutToken };
    if (
      error instanceof Error &&
      /stock_or_price_changed|UNIQUE constraint/.test(
        error.message + String(error.cause),
      )
    )
      throw new PublicError(
        "Giỏ bánh vừa thay đổi. Vui lòng tải lại và thử lại nhé.",
        409,
      );
    throw error;
  }
  return { order, token: checkoutToken };
}
