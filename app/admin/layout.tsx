import Link from "next/link";
import { isAdmin } from "@/lib/admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Quản trị",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin()))
    return (
      <section className="container section empty-state">
        <h1>Khu vực quản trị.</h1>
        <p>
          Vui lòng đăng nhập qua Cloudflare Access trên tên miền đã được bảo vệ.
          Liên hệ chủ cửa hàng nếu bạn chưa được cấp quyền.
        </p>
        <Link className="button" href="/">
          Về trang chủ
        </Link>
      </section>
    );
  return (
    <section className="container section">
      <nav className="admin-nav" aria-label="Quản trị">
        <Link href="/admin">Đơn hàng</Link>
        <Link href="/admin/payments">Giao dịch cần đối soát</Link>
      </nav>
      {children}
    </section>
  );
}
