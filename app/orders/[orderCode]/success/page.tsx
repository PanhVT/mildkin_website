import { orderStatusLabel } from "@/lib/seller/order-status";
import { formatOrderAddress } from "@/lib/address";
import { ShippingDetails } from "@/components/orders/shipping-details";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { requireOrder } from "@/lib/orders/access";
import { formatCurrency } from "@/lib/currency";
import { paymentMethodLabel } from "@/lib/payments/method";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Xác nhận đơn bánh",
  robots: { index: false, follow: false },
};
export default async function SuccessPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const order = await requireOrder((await params).orderCode);
  if (order.paymentMethod !== "COD" && order.paymentStatus !== "PAID")
    redirect(`/orders/${order.orderCode}/payment`);
  const unpaidCod = order.paymentMethod === "COD" && order.paymentStatus !== "PAID";
  const cancelled = order.status === "CANCELLED";
  return (
    <section className="container section success-page">
      <CircleCheck size={56} />
      <span className="eyebrow">THANK YOU, WITH LOVE</span>
      <h1>{cancelled ? "Đơn bánh đã hủy" : unpaidCod ? "Đặt bánh thành công ♡" : "Thanh toán thành công 🎉"}</h1>
      {cancelled ? <p>Đơn <strong>{order.orderCode}</strong> đã được hủy. Bạn không cần thanh toán cho đơn này.</p> : unpaidCod ? <p>
        Cảm ơn {order.customerName}. Bạn sẽ thanh toán khi nhận bánh.<br />
        Bạn chưa cần thanh toán ngay. {order.shippingMethod === "PICKUP" ? "Mildkin sẽ thu tiền khi bạn đến nhận bánh." : "Mildkin sẽ thu tiền khi giao bánh cho bạn."}<br />
        Mã đơn: <strong>{order.orderCode}</strong> · Tổng tiền: <strong>{formatCurrency(order.total)}</strong>
      </p> : <p>
        Cảm ơn {order.customerName}. Mildkin đã nhận được{" "}
        <strong>{formatCurrency(order.total)}</strong>
        <br />
        cho đơn <strong>{order.orderCode}</strong> và sẽ chuẩn bị bánh cho bạn.
      </p>}
      <p>Phương thức thanh toán: <strong>{paymentMethodLabel(order.paymentMethod, order.shippingMethod)}</strong></p>
      <p>Trạng thái đơn hàng: <strong>{orderStatusLabel(order.status, order.paymentMethod)}</strong></p>
      <ShippingDetails order={order} />
      {order.shippingMethod === "DELIVERY" && <div className="notice">
        Gửi đến: {formatOrderAddress(order)}.
      </div>}
      <Link className="button" href="/menu">
        Ghé lại menu bánh
      </Link>
    </section>
  );
}
