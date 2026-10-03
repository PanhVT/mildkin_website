import { cookies } from "next/headers";
import { createOrder } from "@/lib/orders/service";
import { getEnv } from "@/lib/env";
import {
  apiError,
  json,
  parseJson,
  readBody,
  requireSameOrigin,
} from "@/lib/http";
import { orderCookie } from "@/lib/orders/access";
import { limitCheckout } from "@/lib/rate-limit";
import { requestSessionToken } from "@/lib/auth/session";
export async function POST(request: Request) {
  try {
    const env = await getEnv();
    requireSameOrigin(request, env.SITE_URL);
    await limitCheckout(env.DB, request);
    const { order, token } = await createOrder(
      env,
      parseJson(await readBody(request)),
      requestSessionToken(request),
    );
    (await cookies()).set(orderCookie(order.orderCode), token, {
      httpOnly: true,
      secure: new URL(env.SITE_URL!).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return json({ orderCode: order.orderCode }, 201);
  } catch (error) {
    return apiError(error);
  }
}
