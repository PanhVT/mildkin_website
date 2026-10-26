import type { Metadata } from "next";
import { getProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/products/product-card";
import { groupMenuProducts } from "@/lib/products/line";
import "./menu.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Menu bánh",
  description:
    "Khám phá Original, Chocolate, Matcha, Mixed và Mystery Face cookies của Mildkin.",
};
export default async function MenuPage() {
  const products = await getProducts({ inStockFirst: true });
  const { signature_standard: standardProducts, signature_special: specialProducts, chunky } = groupMenuProducts(products);
  return (
    <section className="container section">
      <div className="page-intro">
        <span className="eyebrow">FROM OUR LITTLE OVEN</span>
        <h1>
          Chọn một chút <em>ngọt ngào.</em>
        </h1>
        <p>
          Một mình thưởng thức hay gửi tặng đều vừa đủ thương.
        </p>
      </div>
      {(standardProducts.length > 0 || specialProducts.length > 0) && <section className="menu-line" aria-labelledby="signature-title">
        <header className="menu-line-heading"><h2 id="signature-title">MILDKIN SIGNATURE</h2><p>Những chiếc bánh nhỏ xinh làm nên Mildkin.</p></header>
        {standardProducts.length > 0 && <section aria-labelledby="standard-title">
        <div className="menu-category"><h3 id="standard-title">STANDARD</h3></div>
        <div className="product-grid">
          {standardProducts.map((product) => (
            <ProductCard key={product.id} product={product} withQuantity />
          ))}
        </div>
        </section>}
      {specialProducts.length > 0 && <section className="menu-special" aria-labelledby="special-title">
        <div className="menu-category"><h3 id="special-title">SPECIAL</h3></div>
        <div className="product-grid">{specialProducts.map((product) => <ProductCard key={product.id} product={product} withQuantity />)}</div>
      </section>}
      </section>}
      {chunky.length > 0 && <section className="menu-line" aria-labelledby="chunky-title">
        <header className="menu-line-heading"><h2 id="chunky-title">CHUNKY COOKIES</h2><p>To hơn, mềm hơn, đầy đặn hơn.</p></header>
        <div className="product-grid">{chunky.map(product => <ProductCard key={product.id} product={product} withQuantity />)}</div>
      </section>}
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
