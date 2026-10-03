import { ShippingDetails } from "@/components/orders/shipping-details";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { requireOrder } from "@/lib/orders/access";
import { formatCurrency } from "@/lib/currency";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Đã nhận thanh toán",
  robots: { index: false, follow: false },
};
export default async function SuccessPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const order = await requireOrder((await params).orderCode);
  if (order.paymentStatus !== "PAID")
    redirect(`/orders/${order.orderCode}/payment`);
  return (
    <section className="container section success-page">
      <CircleCheck size={56} />
      <span className="eyebrow">THANK YOU, WITH LOVE</span>
      <h1>Thanh toán thành công 🎉</h1>
      <p>
        Cảm ơn {order.customerName}. Mildkin đã nhận được{" "}
        <strong>{formatCurrency(order.total)}</strong>
        <br />
        cho đơn <strong>{order.orderCode}</strong> và sẽ chuẩn bị bánh cho bạn.
      </p>
      <ShippingDetails order={order} />
      {order.shippingMethod === "DELIVERY" && <div className="notice">
        Gửi đến: {order.address}, {order.ward}, {order.district}, {order.city}.
      </div>}
      <Link className="button" href="/menu">
        Ghé lại menu bánh
      </Link>
    </section>
  );
}
