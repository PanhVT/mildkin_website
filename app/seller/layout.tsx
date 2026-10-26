import type { Metadata } from "next";
import "./seller.css";
export const metadata: Metadata = {
  title: "Người bán",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="seller-root">{children}</div>;
}
