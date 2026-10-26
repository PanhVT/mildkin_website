import Image from "next/image";
import type { PreparationSummary as Summary } from "@/lib/seller/preparation";

export function PreparationSummary({ summary }: { summary: Summary }) {
  return <section className="seller-card seller-preparation" aria-labelledby="preparation-title">
    <header className="seller-preparation-heading">
      <div>
        <h2 id="preparation-title">Cần chuẩn bị</h2>
        <p>Số lượng bánh cần làm từ các đơn đang chuẩn bị.</p>
      </div>
      {summary.productTypes > 0 && <span>{summary.productTypes} loại sản phẩm · {summary.totalPieces} cái bánh</span>}
    </header>
    {summary.products.length === 0 ? <p className="seller-empty">Hiện chưa có bánh nào cần chuẩn bị ♡</p> :
      <ul className="seller-preparation-grid">
        {summary.products.map(p => <li key={p.productId} className="seller-preparation-product">
          <div className="seller-preparation-image">
            {p.imageUrl ? <Image src={p.imageUrl} alt={p.name} width={72} height={72} /> : <span role="img" aria-label="Bánh Mildkin">🍪</span>}
          </div>
          <div>
            <h3>{p.name}</h3>
            <p><strong>{p.totalPieces} cái</strong></p>
            <p>{p.quantity} gói × {p.unitsPerPack} cái</p>
            {p.packLabel && <small>{p.packLabel}</small>}
          </div>
        </li>)}
      </ul>}
    {summary.products.length > 0 && <p className="seller-preparation-total">Tổng cộng: <strong>{summary.totalPieces} cái bánh</strong></p>}
  </section>;
}
