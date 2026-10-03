import type { Metadata } from "next";
import { getProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/products/product-card";
import { MysteryFace } from "@/components/products/mystery-face";
import "./menu.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Menu bánh",
  description:
    "Khám phá Original, Chocolate, Matcha, Mixed và Mystery Face cookies của Mildkin.",
};
export default async function MenuPage() {
  const products = await getProducts();
  const standardProducts = products.filter(
    (product) => product.slug !== "mixed-mystery-face",
  );
  const mysteryFace = products.find(
    (product) => product.slug === "mixed-mystery-face",
  );
  return (
    <section className="container section">
      <div className="page-intro">
        <span className="eyebrow">MENU · BAKED WITH LOVE & BUTTER</span>
        <h1>
          Hôm nay, bạn thích <em>vị nào?</em>
        </h1>
        <p>
          Mỗi gói 3 chiếc cookies nhỏ xinh. Một mình thưởng thức hay gửi tặng
          đều vừa đủ thương.
        </p>
        <p className="menu-pack">Butter Cookies · 3 cookies / pack</p>
      </div>
      <section aria-labelledby="standard-title">
        <div className="menu-category">
          <h2 id="standard-title">Standard</h2>
          <p>Những người bạn quen thuộc của Mildkin.</p>
        </div>
        <div className="product-grid">
          {standardProducts.map((product) => (
            <ProductCard key={product.id} product={product} withQuantity />
          ))}
        </div>
      </section>
      {mysteryFace && <MysteryFace product={mysteryFace} />}
      {!products.length && (
        <p className="empty-state">
          Mẻ bánh mới đang được chuẩn bị. Bạn ghé lại sau nhé.
        </p>
      )}
      <p className="image-disclaimer">
        Ảnh minh họa. Hình gấu, thỏ, mèo được phối theo mẻ. Bánh có bơ, lúa mì
        và có thể chứa trứng, sữa; hãy liên hệ Mildkin nếu bạn có dị ứng.
      </p>
    </section>
  );
}
