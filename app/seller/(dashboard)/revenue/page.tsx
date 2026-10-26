import { sellerPageEnv } from "@/lib/seller/page-auth";
import { revenueDashboard } from "@/lib/seller/revenue";
import { queryParams, type SearchProps } from "@/components/seller/ui";
import { RevenueDashboard } from "@/components/seller/revenue-dashboard";
import { PublicError } from "@/lib/http";
import "./revenue.css";

export default async function Page({ searchParams }: SearchProps) {
  const env = await sellerPageEnv();
  let data;
  try {
    data = await revenueDashboard(env.DB, queryParams(await searchParams));
  } catch (error) {
    if (!(error instanceof PublicError)) throw error;
    return <section className="seller-card"><h1>Doanh thu</h1><p role="alert">{error.message}</p><a href="/seller/revenue">Chọn lại khoảng thời gian →</a></section>;
  }
  return <RevenueDashboard initialData={data} />;
}
