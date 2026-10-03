"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
export function Header({ authenticated = false }: { authenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { items } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <>
      <div className="announcement">
        Một chút ngọt dịu, gửi từ căn bếp nhỏ tại Hà Nội <span>♡</span>
      </div>
      <header className="header">
        <div className="container nav-row">
          <Link href="/" className="wordmark" aria-label="Mildkin — Trang chủ">
            <Image
              className="shop-avatar"
              src="/images/avatar.webp"
              alt=""
              width={54}
              height={54}
            />
            mildkin
          </Link>
          <nav
            className={open ? "main-nav open" : "main-nav"}
            aria-label="Điều hướng chính"
          >
            {[
              ["/", "Trang chủ"],
              ["/menu", "Menu bánh"],
              ["/about", "Về Mildkin"],
              [
                authenticated ? "/account" : "/login",
                authenticated ? "Tài khoản" : "Đăng nhập",
              ],
            ].map(([href, label]) => (
              <Link
                onClick={() => setOpen(false)}
                aria-current={pathname === href ? "page" : undefined}
                key={href}
                href={href}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <Link
              href="/cart"
              className="cart-link"
              aria-label={`Giỏ bánh, ${count} gói`}
            >
              <ShoppingBag size={20} />
              <span className="cart-label">Giỏ bánh</span>
              <span className="badge">{count}</span>
            </Link>
            <button
              className="mobile-toggle icon-button"
              aria-label={open ? "Đóng menu" : "Mở menu"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
