import Image from "next/image";
import { sellerPageEnv } from "@/lib/seller/page-auth";
import { sellerProducts } from "@/lib/seller/data";
import {
  Title,
  Pagination,
  money,
  queryParams,
  type SearchProps,
} from "@/components/seller/ui";
import { ProductForm } from "@/components/seller/product-form";
import Link from "next/link";
import { displayPackLabel } from "@/lib/products/pack-label";
import { productLineLabel } from "@/lib/products/line";
export default async function Page({ searchParams }: SearchProps) {
  const env = await sellerPageEnv(),
    params = queryParams(await searchParams),
    data = await sellerProducts(env.DB, params);
  return (
    <>
      <Title
        title="Sản phẩm & Tồn kho"
        subtitle="Tồn kho là số pack còn có thể bán, đã trừ hàng giữ chỗ cho đơn hiện tại."
      />
      <Link className="seller-create-product" href="/seller/products/new">+ Thêm sản phẩm</Link>
      <form className="seller-filters">
        <label>
          Tình trạng
          <select name="filter" defaultValue={params.get("filter") || "all"}>
            {[
              ["all", "Tất cả"],
              ["active", "Đang bán"],
              ["low", "Sắp hết"],
              ["empty", "Hết hàng"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button>Lọc sản phẩm</button>
      </form>
      <div className="seller-products">
        {data.rows.map((p) => (
          <section
            className="seller-card"
            key={`${p.id}-${p.stock}-${p.updated_at}`}
          >
            <div className="seller-product-heading">
              <Image src={p.image_url} alt={p.name} width={88} height={88} />
              <div>
                <h2>{p.name}</h2>
                <p className="seller-product-description">{p.description}</p>
                <p>Quy cách: {displayPackLabel(p.pack_label)}</p>
                <p>{productLineLabel(p.category, Boolean(p.is_special))}</p>
                <p>
                  {money(p.price)} · Đã bán {p.sold} pack
                </p>
                <span className={`seller-badge seller-stock-${p.stock === 0 ? "out" : p.stock <= 10 ? "low" : "in"}`}>
                  {p.stock === 0
                    ? "Hết hàng"
                    : p.stock <= 10
                      ? "Sắp hết"
                      : `Còn ${p.stock} pack`}
                </span>{" "}
                <span className={`seller-badge ${p.active ? "seller-good" : "seller-neutral"}`}>
                  {p.active ? "Đang bán" : "Tạm ẩn"}
                </span>
              </div>
            </div>
            <details><summary>Sửa sản phẩm</summary><ProductForm product={p} /></details>
          </section>
        ))}
      </div>
      {!data.rows.length && (
        <p className="seller-empty">Không có sản phẩm phù hợp.</p>
      )}
      <Pagination {...data} params={params} />
    </>
  );
}
