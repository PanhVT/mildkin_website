import { sellerPageEnv } from "@/lib/seller/page-auth";
import { ProductForm } from "@/components/seller/product-form";
import Link from "next/link";
export default async function Page() {
  await sellerPageEnv();
  return <><Link href="/seller/products">← Sản phẩm & Tồn kho</Link><h1>Thêm sản phẩm</h1><ProductForm /></>;
}
