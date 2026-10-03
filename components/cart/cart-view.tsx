"use client";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from "lucide-react";
import type { Product } from "@/db/schema";
import { useCart } from "./cart-provider";
import { formatCurrency } from "@/lib/currency";
export function CartView({
  products,
}: {
  products: Product[];
}) {
  const { items, ready, setQuantity } = useCart();
  const lines = items.map((i) => ({
    ...i,
    product: products.find((p) => p.id === i.productId),
  }));
  const subtotal = lines.reduce(
    (sum, i) => sum + (i.product?.price || 0) * i.quantity,
    0,
  );
  const invalid = lines.some((i) => !i.product || i.product.stock < i.quantity);
  if (!ready) return <p role="status">Đang mở giỏ bánh…</p>;
  if (!items.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={44} />
        <h2>Giỏ bánh đang chờ bạn.</h2>
        <p>Thêm một chút ngọt ngào cho hôm nay nhé.</p>
        <Link className="button" href="/menu">
          Chọn bánh <ArrowRight size={18} />
        </Link>
      </div>
    );
  return (
    <div className="checkout-grid">
      <div className="cart-lines">
        {lines.map((item) => (
          <article className="cart-line" key={item.productId}>
            <div className="cart-image">
              {item.product && (
                <Image
                  src={item.product.imageUrl}
                  width={120}
                  height={120}
                  alt={item.product.name}
                />
              )}
            </div>
            <div className="cart-line-info">
              <h3>{item.product?.name || "Sản phẩm không còn bán"}</h3>
              <p>3 cookies / pack</p>
              <strong>{formatCurrency(item.product?.price || 0)}</strong>
              {(!item.product || item.product.stock < item.quantity) && (
                <p className="form-error">
                  Không đủ bánh. Vui lòng giảm số lượng hoặc xóa.
                </p>
              )}
              <div className="quantity">
                <button
                  aria-label={`Giảm ${item.product?.name}`}
                  onClick={() => setQuantity(item.productId, item.quantity - 1)}
                >
                  <Minus size={14} />
                </button>
                <span>{item.quantity}</span>
                <button
                  aria-label={`Tăng ${item.product?.name}`}
                  disabled={
                    !item.product ||
                    item.quantity >= Math.min(20, item.product.stock)
                  }
                  onClick={() => setQuantity(item.productId, item.quantity + 1)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <button
              className="icon-button remove"
              aria-label={`Xóa ${item.product?.name || "sản phẩm"}`}
              onClick={() => setQuantity(item.productId, 0)}
            >
              <Trash2 size={18} />
            </button>
          </article>
        ))}
        <Link className="text-link" href="/menu">
          ← Chọn thêm bánh
        </Link>
      </div>
      <aside className="summary">
        <h2>Giỏ bánh của bạn</h2>
        <div className="summary-row">
          <span>Tạm tính</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>Phí giao hàng</span>
          <span>Tính ở bước đặt bánh</span>
        </div>
        <div className="summary-row total">
          <span>Tiền bánh (chưa gồm ship)</span>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>
        {invalid ? (
          <p className="form-error">
            Vui lòng cập nhật các món không còn đủ số lượng.
          </p>
        ) : (
          <Link className="button full-width" href="/checkout">
            Tiến hành đặt bánh <ArrowRight size={17} />
          </Link>
        )}
        <p className="fine-print">
          Giá và số lượng sẽ được kiểm tra lại khi bạn đặt bánh.
        </p>
      </aside>
    </div>
  );
}
