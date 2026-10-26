import Link from "next/link";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { hasSellerSession, SELLER_COOKIE } from "@/lib/seller/auth";
export default async function Page() {
  const seller = await hasSellerSession(
    await getEnv(),
    (await cookies()).get(SELLER_COOKIE)?.value,
  );
  return (
    <section
      className="container"
      style={{
        minHeight: "90svh",
        display: "grid",
        alignContent: "center",
        gap: 24,
        maxWidth: 760,
        paddingBlock: 48,
      }}
    >
      <Link href="/" className="wordmark">
        mildkin ♡
      </Link>
      <h1>Bạn muốn tiếp tục với vai trò nào?</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 20,
        }}
      >
        <Link
          className="card"
          href="/"
          style={{ padding: 32, background: "#FAB6B6", borderRadius: 24 }}
        >
          <h2>Mua bánh</h2>
          <p>Dành cho khách hàng</p>
          <p>Chọn bánh, đặt hàng — không cần đăng nhập →</p>
        </Link>
        <Link
          className="card"
          href={seller ? "/seller" : "/seller/login"}
          style={{ padding: 32, background: "#e4eedb", borderRadius: 24 }}
        >
          <h2>Người bán</h2>
          <p>Quản lý cửa hàng Mildkin</p>
          <p>Đơn hàng, doanh thu và tồn kho →</p>
        </Link>
      </div>
    </section>
  );
}
