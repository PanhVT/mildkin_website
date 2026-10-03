import { drizzle } from "drizzle-orm/d1";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
export async function getDb() {
  return drizzle((await getEnv()).DB, { schema });
}
