import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { orders, payments } from "@/db/schema";
import { type Env } from "@/lib/env";
import { readBody, parseJson, PublicError, json, apiError } from "@/lib/http";
import { verifyWebhook } from "./verifyWebhook";
import { webhookSchema } from "./payload";
import { extractOrderCode } from "./extractOrderCode";
import { getBank } from "./banks";
export async function handleWebhook(request: Request, env: Env) {
  try {
    const raw = await readBody(request, 32768);
    if (
      !(await verifyWebhook(
        request.headers,
        raw,
        env.SEPAY_WEBHOOK_SECRET || "",
        env.SEPAY_WEBHOOK_AUTH || "hmac",
      ))
    )
      return json({ success: false }, 401);
    const parsed = webhookSchema.safeParse(parseJson(raw));
    if (!parsed.success) throw new PublicError("Malformed webhook");
    const payload = parsed.data;
    if (payload.transferType !== "in") return json({ success: true });
    // Multiple different codes, even across the two fields, require manual review.
    const code = extractOrderCode(`${payload.content} ${payload.code || ""}`);
    const db = drizzle(env.DB);
    const order = code
      ? await db.select().from(orders).where(eq(orders.orderCode, code)).get()
      : undefined;
    let bank = payload.gateway;
    try {
      bank = getBank(payload.gateway).code;
    } catch {
      /* Unknown banks remain unmatched for review. */
    }
    // Trigger atomically matches bank/account/amount/state/expiry. Unique transaction ID makes retries no-ops.
    await db
      .insert(payments)
      .values({
        id: crypto.randomUUID(),
        orderId: order?.id ?? null,
        provider: "sepay",
        providerTransactionId: String(payload.id),
        amount: payload.transferAmount,
        bank,
        account: payload.accountNumber,
        content: payload.content,
        referenceCode: payload.referenceCode || null,
        rawPayload: raw,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: payments.providerTransactionId });
    return json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
