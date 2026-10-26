import { sellerPageEnv } from "@/lib/seller/page-auth";
import { SellerNavigation } from "@/components/seller/navigation";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await sellerPageEnv();
  return (
    <div className="seller-shell">
      <SellerNavigation />
      <div className="seller-workspace">
        <header className="seller-topbar">
          <span>Tiệm bánh Mildkin</span>
          <span className="seller-badge seller-good">Người bán ♡</span>
        </header>
        <div className="seller-content">{children}</div>
      </div>
    </div>
  );
}
