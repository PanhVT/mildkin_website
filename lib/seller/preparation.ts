export interface PreparationProduct {
  productId: string;
  name: string;
  quantity: number;
  totalPieces: number;
  unitsPerPack: number;
  imageUrl: string | null;
  packLabel: string | null;
}
export interface PreparationSummary {
  products: PreparationProduct[];
  productTypes: number;
  totalItems: number;
  totalPieces: number;
}

// Called behind sellerPageEnv/requireSeller. No list filters or pagination:
// production always covers ALL PREPARING orders, regardless of payment method.
export async function sellerPreparationSummary(db: D1Database): Promise<PreparationSummary> {
  const { results: products } = await db.prepare(`
    SELECT i.product_id AS productId, MAX(i.product_name_snapshot) AS name,
      SUM(i.quantity) AS quantity, SUM(i.quantity * p.units_per_pack) AS totalPieces,
      p.units_per_pack AS unitsPerPack, p.image_url AS imageUrl, p.pack_label AS packLabel
    FROM orders o JOIN order_items i ON i.order_id=o.id
    JOIN products p ON p.id=i.product_id
    WHERE o.status='PREPARING'
    GROUP BY i.product_id,p.image_url,p.pack_label,p.units_per_pack
    ORDER BY totalPieces DESC,name COLLATE NOCASE ASC,i.product_id ASC
  `).all<PreparationProduct>();
  // Current numeric product configuration determines pieces; pack labels are never parsed.
  return { products, productTypes: products.length, totalItems: products.reduce((sum, p) => sum + p.quantity, 0), totalPieces: products.reduce((sum, p) => sum + p.totalPieces, 0) };
}
