import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { getEnv } from "@/lib/env";
import {
  json,
  apiError,
  readBody,
  parseJson,
  requireSameOrigin,
  PublicError,
} from "@/lib/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderCode: string }> },
) {
  try {
    await requireAdmin();
    const env = await getEnv();
    requireSameOrigin(request, env.SITE_URL);
    const parsed = z
      .object({ status: z.enum(["PREPARING", "SHIPPING", "COMPLETED"]) })
      .safeParse(parseJson(await readBody(request)));
    if (!parsed.success) throw new PublicError("Trạng thái không hợp lệ.");
    const { status } = parsed.data;
    const prior = {
      PREPARING: "PAID",
      SHIPPING: "PREPARING",
      COMPLETED: "SHIPPING",
    }[status];
    const result = await env.DB.prepare(
      "UPDATE orders SET status=?, updated_at=? WHERE order_code=? AND status=? AND payment_status='PAID'",
    )
      .bind(status, Date.now(), (await params).orderCode, prior)
      .run();
    if (!result.meta.changes)
      throw new PublicError(
        "Trạng thái đơn đã thay đổi. Vui lòng tải lại trang.",
        409,
      );
    return json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
