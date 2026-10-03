"use client";
import { Plus, Minus } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/db/schema";
import { useCart } from "@/components/cart/cart-provider";

export function ProductPurchase({ product, withQuantity = false }: { product: Product; withQuantity?: boolean }) {
  const [quantity, setQuantity] = useState(1);
  const { add, items } = useCart();
  const remaining =
    Math.min(20, product.stock) -
    (items.find((i) => i.productId === product.id)?.quantity || 0);
  const unavailable = remaining < quantity;
  return (
      <div className="product-actions">
        {withQuantity && (
          <div className="quantity">
            <button
              aria-label={`Giảm ${product.name}`}
              disabled={quantity <= 1}
              onClick={() => setQuantity(quantity - 1)}
            >
              <Minus size={14} />
            </button>
            <span>{quantity}</span>
            <button
              aria-label={`Tăng ${product.name}`}
              disabled={quantity >= Math.min(20, remaining)}
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus size={14} />
            </button>
          </div>
        )}
        <button
          className="add-button"
          disabled={unavailable}
          onClick={() => add(product.id, quantity)}
        >
          <Plus size={16} />
          {unavailable ? "Đã đủ số lượng" : "Thêm vào giỏ"}
        </button>
      </div>
  );
}
