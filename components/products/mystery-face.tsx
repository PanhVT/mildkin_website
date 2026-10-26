import type { Product } from "@/db/schema";
import { ProductCard } from "./product-card";

// Retained for callers that used the former banner component.
export function MysteryFace({ product }: { product: Product }) {
  return <ProductCard product={product} withQuantity />;
}
