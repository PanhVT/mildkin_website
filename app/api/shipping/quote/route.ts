import { getEnv } from "@/lib/env";
import { apiError, json, parseJson, readBody, requireSameOrigin, PublicError } from "@/lib/http";
import { limitShippingQuote } from "@/lib/rate-limit";
import { deliveryAddressSchema } from "@/lib/validation";
import { quoteAddressShipping } from "@/lib/shipping-server";
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    requireSameOrigin(request, env.SITE_URL);
    await limitShippingQuote(env.DB, request);
    const parsed = deliveryAddressSchema.safeParse(parseJson(await readBody(request, 4096)));
    if (!parsed.success) throw new PublicError("Vui lòng điền đầy đủ địa chỉ giao hàng.");
    return json(await quoteAddressShipping(env, parsed.data));
  } catch (error) { return apiError(error); }
}
