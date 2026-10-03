import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { expireOrders } from "@/lib/orders/service";
export async function getProducts() {
  await expireOrders((await getEnv()).DB);
  return (await getDb())
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.createdAt, products.id);
}
