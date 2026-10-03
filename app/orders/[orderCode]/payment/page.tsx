import { ShippingDetails } from "@/components/orders/shipping-details";
import { redirect } from "next/navigation";
import { requireOrder } from "@/lib/orders/access";
import { createQRUrl } from "@/lib/payments/sepay/createQRUrl";
import { getBank } from "@/lib/payments/sepay/banks";
import { PaymentPanel } from "@/components/payment/payment-panel";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Thanh toán",
  robots: { index: false, follow: false },
};
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const order = await requireOrder((await params).orderCode);
  if (order.paymentStatus === "PAID")
    redirect(`/orders/${order.orderCode}/success`);
  return (
    <section className="container section">
      <div className="page-intro">
        <span className="eyebrow">ONE LAST LITTLE STEP</span>
        <h1>
          Thanh toán <em>đơn bánh.</em>
        </h1>
        <p>Quét mã, chuyển khoản và để Mildkin lo phần còn lại.</p>
      </div>
      <ShippingDetails order={order} />
      <PaymentPanel
        code={order.orderCode}
        total={order.total}
        expiresAt={order.expiresAt}
        bank={getBank(order.bankCode).name}
        account={order.bankAccount}
        holder={order.accountHolder}
        qrUrl={createQRUrl(
          order.bankCode,
          order.bankAccount,
          order.total,
          order.orderCode,
        )}
        initialStatus={order.paymentStatus}
      />
    </section>
  );
}
