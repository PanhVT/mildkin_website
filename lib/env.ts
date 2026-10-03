import { getCloudflareContext } from "@opennextjs/cloudflare";
export interface Env {
  DB: D1Database;
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
