"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  House,
  Package,
  ChartColumn,
  Store,
  CreditCard,
  Menu,
  X,
  LogOut,
  Truck,
} from "lucide-react";
const links = [
  { href: "/seller", label: "Tổng quan", icon: House },
  { href: "/seller/orders", label: "Đơn hàng", icon: Package },
  { href: "/seller/delivery", label: "Giao hàng & Bàn giao", icon: Truck },
  { href: "/seller/revenue", label: "Doanh thu", icon: ChartColumn },
  { href: "/seller/products", label: "Sản phẩm & Tồn kho", icon: Store },
  { href: "/seller/payments", label: "Thanh toán", icon: CreditCard },
];
export function SellerNavigation() {
  const path = usePathname(),
    [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="seller-menu"
        aria-controls="seller-sidebar"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />} Menu người bán
      </button>
      <aside
        id="seller-sidebar"
        className={`seller-sidebar ${open ? "is-open" : ""}`}
      >
        <Link className="seller-brand" href="/seller">
          mildkin<span>SELLER DASHBOARD</span>
        </Link>
        <nav aria-label="Người bán">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={
                path === href ||
                (href !== "/seller" && path.startsWith(href + "/"))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="seller-sidebar-bottom">
          <Link href="/">← Về trang mua bánh</Link>
          <form action="/api/seller/logout" method="POST">
            <button>
              <LogOut size={18} />
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
