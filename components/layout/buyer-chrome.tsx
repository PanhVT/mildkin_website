"use client";
import { usePathname } from "next/navigation";
export function BuyerChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return path === "/start" || path === "/seller" || path.startsWith("/seller/")
    ? null
    : children;
}
