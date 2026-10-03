import { NextResponse } from "next/server";
import type { Env } from "@/lib/env";
import {
  apiError,
  json,
  parseJson,
  readBody,
  requireSameOrigin,
  PublicError,
} from "@/lib/http";
import {
  cleanExpiredSessions,
  deleteSession,
  getSession,
  requestSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./session";
import { loginUser, registerUser, updateProfile } from "./user";
import { emailSchema, safeNext } from "./validation";
import { limitAuth } from "./rate-limit";
export type AuthAction =
  | "register"
  | "login"
  | "logout"
  | "profile"
  | "session";
export async function handleAuth(
  request: Request,
  env: Env,
  action: AuthAction,
) {
  try {
    const token = requestSessionToken(request);
    if (action === "session") {
      const found = await getSession(env.DB, token);
      const response = NextResponse.json(
        {
          user: found
            ? {
                name: found.user.name,
                email: found.user.email,
                phone: found.user.phone,
                createdAt: found.user.createdAt,
              }
            : null,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
      if (token && !found)
        response.cookies.set(SESSION_COOKIE, "", {
          ...sessionCookieOptions(),
          maxAge: 0,
        });
      return response;
    }
    requireSameOrigin(request, env.SITE_URL);
    if (action === "logout") {
      await deleteSession(env.DB, token);
      const response = NextResponse.json(
        { redirectTo: "/" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
      response.cookies.set(SESSION_COOKIE, "", {
        ...sessionCookieOptions(),
        maxAge: 0,
      });
      return response;
    }
    const input = parseJson(await readBody(request));
    if (action === "profile") {
      const session = await getSession(env.DB, token);
      if (!session) throw new PublicError("Bạn cần đăng nhập lại.", 401);
      await updateProfile(env.DB, session.user.id, input);
      return json({ success: true });
    }
    const obj =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};
    const email = emailSchema.safeParse(obj.email);
    await limitAuth(
      env.DB,
      request,
      action,
      email.success ? email.data : undefined,
    );
    await cleanExpiredSessions(env.DB);
    const result =
      action === "register"
        ? await registerUser(env.DB, input, token)
        : await loginUser(env.DB, input, token);
    const response = NextResponse.json(
      { redirectTo: action === "register" ? "/account" : safeNext(obj.next) },
      {
        status: action === "register" ? 201 : 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
    response.cookies.set(
      SESSION_COOKIE,
      result.session.token,
      sessionCookieOptions(),
    );
    return response;
  } catch (error) {
    return apiError(error);
  }
}
