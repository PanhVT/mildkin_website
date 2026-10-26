import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { hasSellerSession, SELLER_COOKIE } from "@/lib/seller/auth";
import { SellerLogin } from "@/components/seller/controls";
export default async function Page() {
  if (
    await hasSellerSession(
      await getEnv(),
      (await cookies()).get(SELLER_COOKIE)?.value,
    )
  )
    redirect("/seller");
  return (
    <div className="seller-login">
      <section className="seller-card">
        <Link href="/start" className="seller-brand">
          mildkin
        </Link>
        <p>GÓC NHỎ CỦA NGƯỜI BÁN</p>
        <h1>Chào mừng trở lại ♡</h1>
        <p>Đăng nhập để chăm sóc cửa hàng hôm nay.</p>
        <SellerLogin />
        <Link href="/">← Tiếp tục mua bánh</Link>
      </section>
    </div>
  );
}
