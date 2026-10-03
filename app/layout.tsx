import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/cart-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { site } from "@/config/site";
import "./globals.css";
import localFont from "next/font/local";
import { getCurrentUser } from "@/lib/auth/current-user";
const brandFont = localFont({
  src: [
    { path: "../public/fonts/be-vietnam-pro-400.ttf", weight: "400" },
    { path: "../public/fonts/be-vietnam-pro-600.ttf", weight: "600" },
    { path: "../public/fonts/be-vietnam-pro-800.ttf", weight: "800" },
  ],
  variable: "--font-brand",
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "Mildkin Cookies | Butter Cookies in Hanoi",
    template: "%s | Mildkin Cookies",
  },
  description: site.description,
  openGraph: {
    title: "Mildkin Cookies | Butter Cookies in Hanoi",
    description: site.description,
    locale: "vi_VN",
    type: "website",
  },
  icons: { icon: "/icon.png" },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      className={brandFont.variable}
    >
      <body>
        <CartProvider>
          <a href="#main" className="skip-link">
            Đến nội dung chính
          </a>
          <Header authenticated={Boolean(await getCurrentUser())} />
          <main id="main">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
