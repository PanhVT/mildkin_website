import { getEnv } from "@/lib/env";
import { handleSeller } from "@/lib/seller/handler";
import { revalidatePath } from "next/cache";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const response = await handleSeller(request, await getEnv(), path);
  if (response.ok && request.method !== "GET" && ["orders", "cod-payments", "delivery"].includes(path[0])) {
    revalidatePath("/seller", "layout");
    revalidatePath("/account/orders", "layout");
    revalidatePath("/orders/[orderCode]/success", "page");
  }
  return response;
}
export { handle as GET, handle as POST, handle as PATCH };
