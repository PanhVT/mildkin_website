"use client";
import Image from "next/image";
import type { Product } from "@/db/schema";
import { formatCurrency } from "@/lib/currency";
import { ProductPurchase } from "./product-purchase";
import { displayPackLabel } from "@/lib/products/pack-label";
export function ProductCard({
  product,
  withQuantity = false,
}: {
  product: Product;
  withQuantity?: boolean;
}) {
  return (
    <article className={`product-card flavor-${product.flavor}${product.stock <= 0 ? " is-sold-out" : ""}${product.isSpecial ? " is-special" : ""}`}>
      <div className="product-image">
        <Image
          src={product.imageUrl}
          alt={`Cookies ${product.name}, ${displayPackLabel(product.packLabel)}`}
          fill
          sizes="(max-width: 600px) 46vw, (max-width: 1000px) 45vw, 25vw"
        />
        {product.stock <= 0 ? <><span className="sold-out-overlay" aria-hidden="true" /><span className="product-tag">Hết hàng</span></> : product.seasonal && <span className="product-tag">Mùa này có</span>}
        <span className="absolute bottom-3 left-3 z-10 whitespace-nowrap rounded-full bg-[#FFF8EF]/85 px-3 py-1.5 text-[10px] leading-4 font-semibold text-[#5C3B1E] shadow-[0_2px_8px_rgba(92,59,30,0.12)] backdrop-blur-sm sm:text-xs">
          {displayPackLabel(product.packLabel)}
        </span>
      </div>
      {product.isSpecial && <span className="special-badge">SPECIAL</span>}
      <div className="product-heading">
        <h3>{product.name}</h3>
        <span>{formatCurrency(product.price)}</span>
      </div>
      <p>{product.description}</p>
      <ProductPurchase product={product} withQuantity={withQuantity} />
    </article>
  );
}
