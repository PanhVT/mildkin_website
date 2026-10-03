import Image from "next/image";
import { Heart, Sparkles } from "lucide-react";
import type { Product } from "@/db/schema";
import { formatCurrency } from "@/lib/currency";
import { ProductPurchase } from "./product-purchase";

export function MysteryFace({ product }: { product: Product }) {
  return (
    <section className="mystery-face" aria-labelledby="mystery-face-title">
      <div className="mystery-face-image">
        <Image
          src={product.imageUrl}
          alt="Mildkin Mystery Face cookies với nhiều biểu cảm ngẫu nhiên"
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1336px) 50vw, 620px"
        />
      </div>
      <div className="mystery-face-copy">
        <span className="mystery-face-badge"><Sparkles size={14} aria-hidden="true" /> SPECIAL</span>
        <p className="mystery-face-eyebrow">Một chút bất ngờ trong mỗi túi bánh.</p>
        <h2 id="mystery-face-title">Mystery Face</h2>
        <p className="mystery-face-subtitle">Mixed cookies với những gương mặt ngẫu nhiên.</p>
        <p>Ba người bạn Original, Chocolate và Matcha sẽ xuất hiện với những biểu cảm ngẫu nhiên — có hôm vui vẻ, có hôm ngái ngủ, đôi khi lại hơi drama.</p>
        <div className="mystery-face-contents">
          <span>3 cookies / pack · Chỉ có ở Mixed</span>
          <strong>1 Original · 1 Chocolate · 1 Matcha</strong>
        </div>
        <p className="mystery-face-price">{formatCurrency(product.price)} <span>/ pack</span></p>
        <ProductPurchase product={product} withQuantity />
        <p className="mystery-face-note"><Heart size={16} aria-hidden="true" /> Biểu cảm được chọn ngẫu nhiên nên mỗi túi bánh sẽ có một chút bất ngờ riêng ♡</p>
        <p className="mystery-face-disclaimer">Hình minh họa chỉ mang tính tham khảo. Biểu cảm thực tế có thể khác.</p>
      </div>
    </section>
  );
}
