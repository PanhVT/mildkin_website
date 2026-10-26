// Reuse existing category/is_special columns. COOKIE is the legacy Signature line.
export const PRODUCT_LINES = [
  { value: "signature_standard", label: "Mildkin Signature — Standard", category: "COOKIE", isSpecial: false },
  { value: "signature_special", label: "Mildkin Signature — Special", category: "COOKIE", isSpecial: true },
  { value: "chunky", label: "Chunky Cookies", category: "CHUNKY", isSpecial: false },
] as const;
export type ProductLine = typeof PRODUCT_LINES[number]["value"];
export function productLine(category: string, isSpecial: boolean): ProductLine {
  return category === "CHUNKY" ? "chunky" : isSpecial ? "signature_special" : "signature_standard";
}
export function productLineLabel(category: string, isSpecial: boolean) {
  return PRODUCT_LINES.find(line => line.value === productLine(category, isSpecial))!.label;
}
export function groupMenuProducts<T extends { category: string; isSpecial: boolean }>(products: T[]) {
  const groups: Record<ProductLine, T[]> = { signature_standard: [], signature_special: [], chunky: [] };
  // Preserve the server query's stock-first, created_at/id order within each group.
  for (const product of products) groups[productLine(product.category, product.isSpecial)].push(product);
  return groups;
}
