import { getProducts } from "@/lib/catalog";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import Link from "next/link";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Đặt bánh",
  robots: { index: false, follow: false },
};
export default async function CheckoutPage() {
  const user = await getCurrentUser();
  return (
    <section className="container section">
      <div className="page-intro">
        <span className="eyebrow">ALMOST AT YOUR DOOR</span>
        <h1>
          Một chút ngọt, <em>sắp đến rồi.</em>
        </h1>
      </div>
      <CheckoutForm
        customer={
          user ? { name: user.name, phone: user.phone || "" } : undefined
        }
        products={await getProducts()}
      />
      {!user && (
        <p className="checkout-login-note">
          <Link href="/login?next=/checkout">Đăng nhập</Link> để lưu đơn bánh,
          hoặc tiếp tục đặt bánh không cần tài khoản.
        </p>
      )}
    </section>
  );
}
