import { getCloudflareContext } from "@opennextjs/cloudflare";
export interface Env {
  SELLER_USERNAME?: string;
  SELLER_PASSWORD_HASH?: string;
  SELLER_SESSION_SECRET?: string;
  DB: D1Database;
  PRODUCT_IMAGES: R2Bucket;
  PAYMENT_PROVIDER?: string;
  SEPAY_BANK_CODE?: string;
  SEPAY_BANK_ACCOUNT?: string;
  SEPAY_ACCOUNT_HOLDER?: string;
  SEPAY_WEBHOOK_AUTH?: string;
  SEPAY_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
  GEOAPIFY_API_KEY?: string;
  STORE_LAT?: string;
  STORE_LNG?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}
export async function getEnv(): Promise<Env> {
  return (await getCloudflareContext({ async: true })).env as unknown as Env;
}
