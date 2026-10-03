"use client";
import Image from "next/image";
import type { Product } from "@/db/schema";
import { formatCurrency } from "@/lib/currency";
import { ProductPurchase } from "./product-purchase";
export function ProductCard({
  product,
  withQuantity = false,
}: {
  product: Product;
  withQuantity?: boolean;
}) {
  return (
    <article className={`product-card flavor-${product.flavor}`}>
      <div className="product-image">
        <Image
          src={product.imageUrl}
          alt={`Cookies ${product.name}, gói 3 bánh`}
          fill
          sizes="(max-width: 600px) 46vw, (max-width: 1000px) 45vw, 25vw"
        />
        {product.seasonal && <span className="product-tag">Mùa này có</span>}
        {product.stock === 0 && <span className="product-tag">Hết bánh</span>}
        <span className="pack-label">3 cookies / pack</span>
      </div>
      <div className="product-heading">
        <h3>{product.name}</h3>
        <span>{formatCurrency(product.price)}</span>
      </div>
      <p>{product.description}</p>
      <ProductPurchase product={product} withQuantity={withQuantity} />
    </article>
  );
}
