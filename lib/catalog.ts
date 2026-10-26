import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { products } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { expireOrders } from "@/lib/orders/service";
export async function getProducts(options: { inStockFirst?: boolean } = {}) {
  return getCatalogProducts((await getEnv()).DB, options);
}
export async function getFeaturedProducts() {
  return getHomepageProducts((await getEnv()).DB);
}
export async function getHomepageProducts(db: D1Database) {
  await expireOrders(db);
  return drizzle(db)
    .select()
    .from(products)
    .where(and(eq(products.active, true), gt(products.stock, 0)))
    .orderBy(products.createdAt, products.id)
    .limit(4);
}
export async function getCatalogProducts(db: D1Database, { inStockFirst = false }: { inStockFirst?: boolean } = {}) {
  await expireOrders(db);
  return drizzle(db)
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(...(inStockFirst ? [sql`CASE WHEN ${products.stock} > 0 THEN 0 ELSE 1 END`] : []), products.createdAt, products.id);
}
