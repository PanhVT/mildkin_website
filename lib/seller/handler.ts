import { updateInstagramContact, confirmationMessage } from "./instagram";
import { NextResponse } from "next/server";
import { revenueDashboard } from "./revenue";
import { collectCod } from "./cod";
import { sellerPreparationSummary } from "./preparation";
import { deliveryDashboard, updateDelivery } from "./delivery";
import { z } from "zod";
import { writeProduct } from "./product-write";
import type { Env } from "@/lib/env";
import {
  apiError,
  json,
  parseJson,
  readBody,
  requireSameOrigin,
  PublicError,
} from "@/lib/http";
import { limitAuth } from "@/lib/auth/rate-limit";
import { sha256 } from "@/lib/security";
import {
  createSellerSession,
  requireSeller,
  sellerCredentials,
  sellerCookieOptions,
  sellerToken,
  SELLER_COOKIE,
} from "./auth";
import {
  sellerOrders,
  sellerOrder,
  sellerProducts,
  sellerOverview,
  sellerPayments,
  updateSellerOrder,
  updateSellerProduct,
} from "./data";
export async function handleSeller(request: Request, env: Env, path: string[]) {
  try {
    const [resource, id, action] = path,
      method = request.method;
    if (path.length > 3 || (path.length === 3 && !(path[0] === "orders" && ["status", "payment-status", "instagram-contact", "instagram-message"].includes(path[2])))) throw new PublicError("Không tìm thấy trang.", 404);
    if (method !== "GET") requireSameOrigin(request, env.SITE_URL);
    const token = sellerToken(request);
    if (resource === "login" && !id && method === "POST") {
      await limitAuth(env.DB, request, "seller-login");
      const parsed = z
        .object({
          username: z.string().min(1).max(100),
          password: z.string().min(1).max(1024),
        })
        .strict()
        .safeParse(parseJson(await readBody(request)));
      if (!parsed.success)
        throw new PublicError("Thông tin đăng nhập không hợp lệ.");
      if (
        !(await sellerCredentials(
          env,
          parsed.data.username,
          parsed.data.password,
        ))
      )
        throw new PublicError("Tên đăng nhập hoặc mật khẩu không đúng.", 401);
      if (token)
        await env.DB.prepare("DELETE FROM seller_sessions WHERE token_hash=?")
          .bind(await sha256(token))
          .run();
      const response = NextResponse.json(
        { redirectTo: "/seller" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
      response.cookies.set(
        SELLER_COOKIE,
        await createSellerSession(env),
        sellerCookieOptions(),
      );
      return response;
    }
    await requireSeller(env, token);
    if (resource === "orders" && id && action === "instagram-contact" && method === "PATCH") {
      return json(await updateInstagramContact(env.DB, id, parseJson(await readBody(request))));
    }
    if (resource === "orders" && id && action === "instagram-message" && method === "GET") {
      const data = await sellerOrder(env.DB, id);
      return json({ message: confirmationMessage(data.order, data.items) });
    }
    if (resource === "delivery" && !action) {
      if (method === "GET" && !id) return json(await deliveryDashboard(env.DB, new URL(request.url).searchParams));
      if (method === "PATCH" && id) return json(await updateDelivery(env.DB, id, parseJson(await readBody(request))));
    }
    if (resource === "orders" && id && action === "payment-status" && method === "PATCH") {
      const parsed = z.object({ status: z.literal("PAID") }).strict().safeParse(parseJson(await readBody(request)));
      if (!parsed.success) throw new PublicError("Chỉ có thể xác nhận đã thu tiền COD.");
      return json(await collectCod(env.DB, id));
    }
    if (action && !(resource === "orders" && action === "status" && method === "PATCH"))
      throw new PublicError("Không tìm thấy thao tác.", 404);
    if (resource === "cod-payments" && id && method === "POST") {
      return json(await collectCod(env.DB, id));
    }
    if (resource === "products" && ((method === "POST" && !id) || (method === "PATCH" && id && request.headers.get("content-type")?.startsWith("multipart/form-data")))) {
      return json(await writeProduct(request, env, id), method === "POST" ? 201 : 200);
    }
    if (resource === "logout" && !id && method === "POST") {
      await env.DB.prepare("DELETE FROM seller_sessions WHERE token_hash=?")
        .bind(await sha256(token!))
        .run();
      const response = NextResponse.redirect(
        new URL("/seller/login", env.SITE_URL),
        303,
      );
      response.headers.set("Cache-Control", "private, no-store");
      response.cookies.set(SELLER_COOKIE, "", {
        ...sellerCookieOptions(),
        maxAge: 0,
      });
      return response;
    }
    const params = new URL(request.url).searchParams;
    if (method === "GET") {
      if (resource === "orders" && id === "preparation-summary")
        return json(await sellerPreparationSummary(env.DB));
      if (resource === "orders")
        return json(
          id
            ? await sellerOrder(env.DB, id)
            : await sellerOrders(env.DB, params),
        );
      if (!id) {
        if (resource === "overview") return json(await sellerOverview(env.DB));
        if (resource === "revenue")
          return json(await revenueDashboard(env.DB, params));
        if (resource === "products")
          return json(await sellerProducts(env.DB, params));
        if (resource === "payments")
          return json(await sellerPayments(env.DB, params));
      }
    }
    if (method === "PATCH" && id) {
      const input = parseJson(await readBody(request));
      if (resource === "orders")
        return json(await updateSellerOrder(env.DB, id, input));
      if (resource === "products")
        return json(await updateSellerProduct(env.DB, id, input));
    }
    throw new PublicError("Không tìm thấy thao tác.", 404);
  } catch (error) {
    return apiError(error);
  }
}
