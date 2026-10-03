import { handleWebhook } from "@/lib/payments/sepay/handler";
import { getEnv } from "@/lib/env";
export async function POST(request: Request) {
  return handleWebhook(request, await getEnv());
}
