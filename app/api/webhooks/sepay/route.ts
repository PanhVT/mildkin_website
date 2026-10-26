import { handleWebhook } from "@/lib/payments/sepay/handler";
import { getEnv } from "@/lib/env";
import { revalidatePath } from "next/cache";
export async function POST(request: Request) {
  const response = await handleWebhook(request, await getEnv());
  if (response.ok) {
    revalidatePath("/seller", "layout");
    revalidatePath("/account/orders", "layout");
    revalidatePath("/orders/[orderCode]/success", "page");
  }
  return response;
}
