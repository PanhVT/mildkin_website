import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { getEnv } from "@/lib/env";
import { updateSellerOrder } from "@/lib/seller/data";
import { revalidatePath } from "next/cache";
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
    const order = await env.DB.prepare("SELECT id,payment_status FROM orders WHERE order_code=?")
      .bind((await params).orderCode).first<{ id: string; payment_status: string }>();
    if (!order || order.payment_status !== "PAID") throw new PublicError("Đơn chưa thanh toán hoặc đã thay đổi. Vui lòng tải lại trang.", 409);
    // Legacy admin writes must enforce the same assignment and delivery sync rules.
    const result = await updateSellerOrder(env.DB, order.id, { status });
    revalidatePath("/seller", "layout");
    revalidatePath("/admin", "layout");
    revalidatePath("/account/orders", "layout");
    revalidatePath("/orders/[orderCode]/success", "page");
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
