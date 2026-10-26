import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { hasSellerSession, SELLER_COOKIE } from "./auth";
export async function sellerPageEnv() {
  const env = await getEnv();
  if (
    !(await hasSellerSession(env, (await cookies()).get(SELLER_COOKIE)?.value))
  )
    redirect("/seller/login");
  return env;
}
