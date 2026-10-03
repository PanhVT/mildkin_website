import { accessibleOrder } from "@/lib/orders/access";
import { apiError, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderCode: string }> },
) {
  try {
    const order = await accessibleOrder((await params).orderCode);
    return order
      ? json({ orderCode: order.orderCode, paymentStatus: order.paymentStatus })
      : json({ error: "Không tìm thấy đơn hàng." }, 404);
  } catch (error) {
    return apiError(error);
  }
}
