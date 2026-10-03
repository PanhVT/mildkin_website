import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { userOrders } from "@/lib/auth/orders";
import { getEnv } from "@/lib/env";
import { formatDate } from "@/lib/status";
import { ProfileForm } from "@/components/auth/profile-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { OrderHistory } from "@/components/auth/order-history";
export default async function AccountPage() {
  const user = await requireUser();
  const rows = await userOrders((await getEnv()).DB, user.id);
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">GÓC NHỎ CỦA BẠN</span>
        <h1>Xin chào, {user.name.split(/\s+/).at(-1)}</h1>
        <p>Những đơn bánh và một chút ngọt ngào dành riêng cho bạn.</p>
      </div>
      <div className="account-grid">
        <section className="account-card">
          <h2>Thông tin của bạn</h2>
          <p className="account-email">{user.email}</p>
          <p className="auth-help">
            Tham gia Mildkin: {formatDate(user.createdAt)}
          </p>
          <ProfileForm name={user.name} phone={user.phone || ""} />
        </section>
        <section className="account-card account-welcome">
          <h2>Đơn hàng của bạn</h2>
          <p>Xem lại những hương vị đã chọn và theo dõi đơn bánh của bạn.</p>
          <Link className="button" href="/account/orders">
            Xem tất cả đơn bánh
          </Link>
          <LogoutButton />
        </section>
      </div>
      <section className="account-recent">
        <h2>Đơn bánh gần đây</h2>
        <OrderHistory rows={rows.slice(0, 3)} />
      </section>
    </>
  );
}
