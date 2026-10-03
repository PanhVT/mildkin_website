import { getProducts } from "@/lib/catalog";
import { CartView } from "@/components/cart/cart-view";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Giỏ bánh",
  robots: { index: false, follow: false },
};
export default async function CartPage() {
  return (
    <section className="container section">
      <div className="page-intro">
        <span className="eyebrow">A LITTLE BAG OF HAPPINESS</span>
        <h1>
          Giỏ bánh <em>của bạn.</em>
        </h1>
      </div>
      <CartView
        products={await getProducts()}
      />
    </section>
  );
}
