import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import {
  hashPassword,
  verifyPassword,
  PASSWORD_ITERATIONS,
} from "@/lib/auth/password";
import {
  createSession,
  getSession,
  cleanExpiredSessions,
  deleteSession,
  sessionCookieOptions,
  SESSION_SECONDS,
} from "@/lib/auth/session";
import { registerUser, loginUser } from "@/lib/auth/user";
import { handleAuth } from "@/lib/auth/handler";
import { userOrders, userOrder } from "@/lib/auth/orders";
import { createOrder } from "@/lib/orders/service";
import { sha256 } from "@/lib/security";
import { safeNext } from "@/lib/auth/validation";
import type { Env } from "@/lib/env";
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));
import { geocodeAddress } from "@/lib/geocoding";
const geocode = vi.mocked(geocodeAddress);
let mf: Miniflare;
let db: D1Database;
let env: Env;
const password = "Test-only-password-123";
const registration = (email = "ban@example.test") => ({
  name: "Bạn Mildkin",
  email,
  phone: "0912345678",
  password,
  confirmPassword: password,
});
const checkout = () => ({
  customerName: "Người nhận khác",
  phone: "0987654321",
  address: "12 Đường thử nghiệm",
  ward: "Phường thử",
  district: "Khu vực thử",
  city: "Hà Nội",
  note: "",
  shippingMethod: "DELIVERY",
  checkoutToken: crypto.randomUUID(),
  items: [{ productId: "original", quantity: 1 }],
});
const request = (
  path: string,
  body?: unknown,
  token?: string,
  origin = "https://test.example",
  ip = "192.0.2.1",
) =>
  new Request(`https://test.example${path}`, {
    method: path.endsWith("session")
      ? "GET"
      : path.endsWith("profile")
        ? "PATCH"
        : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
      ...(token ? { Cookie: `mildkin_session=${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
let legacyCheck: { user_id: unknown; stock: number; triggers: number; shipping_method: unknown; delivery_distance_meters: unknown; total: unknown };
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: `export default {async fetch(){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('runtime-password'),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(32),iterations:${PASSWORD_ITERATIONS}},key,256);return new Response(String(bits.byteLength));}}`,
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-01",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file.startsWith("0002")) {
      await db.prepare(await readFile("db/seed.sql", "utf8")).run();
      await db
        .prepare(
          "INSERT INTO orders (id,order_code,access_token_hash,customer_name,phone,address,ward,district,city,subtotal,shipping_fee,total,bank_code,bank_account,account_holder,created_at,updated_at,expires_at) VALUES ('legacy','MK0000000001','legacy-hash','Legacy','0912345678','Legacy address','Ward','District','Hà Nội',22000,25000,47000,'VCB','123456789','TEST',1,1,9999999999999)",
        )
        .run();
    }
    for (const statement of (await readFile(`drizzle/${file}`, "utf8")).split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) await db.prepare(statement).run();
  }
  const legacy = await db.prepare("SELECT shipping_method, delivery_distance_meters, total FROM orders WHERE id='legacy'").first();
  legacyCheck = {
    shipping_method: legacy?.shipping_method,
    delivery_distance_meters: legacy?.delivery_distance_meters,
    total: legacy?.total,
    user_id: (
      await db.prepare("SELECT user_id FROM orders WHERE id='legacy'").first()
    )?.user_id,
    stock: (await db
      .prepare("SELECT stock FROM products WHERE id='original'")
      .first<{ stock: number }>())!.stock,
    triggers: (await db
      .prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'")
      .first<{ n: number }>())!.n,
  };
  env = {
    DB: db,
    SITE_URL: "https://test.example",
    PAYMENT_PROVIDER: "sepay",
    SEPAY_BANK_CODE: "VCB",
    SEPAY_BANK_ACCOUNT: "123456789",
    SEPAY_ACCOUNT_HOLDER: "TEST ONLY",
    SEPAY_WEBHOOK_AUTH: "apikey",
    SEPAY_WEBHOOK_SECRET: "local-test-only-webhook-key-32-chars",
    STORE_LAT: "0",
    STORE_LNG: "0",
  };
});
beforeEach(async () => {
  geocode.mockReset().mockResolvedValue({ lat: 0.06745, lng: 0 });
  await db.batch(
    [
      "payments",
      "order_items",
      "orders",
      "sessions",
      "users",
      "products",
      "request_limits",
    ].map((t) => db.prepare(`DELETE FROM ${t}`)),
  );
  await db.prepare(await readFile("db/seed.sql", "utf8")).run();
});
afterAll(async () => {
  await mf?.dispose();
});

describe("password and session security", () => {
  it("salted PBKDF2 verifies correct passwords and rejects wrong ones", async () => {
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toContain(password);
    expect(await verifyPassword(password, a.hash, a.salt)).toBe(true);
    expect(await verifyPassword("wrong", a.hash, a.salt)).toBe(false);
    expect(await verifyPassword(password, "bad", a.salt)).toBe(false);
  });
  it("PBKDF2 cost runs in actual workerd runtime", async () => {
    expect(await (await mf.dispatchFetch("https://test.example")).text()).toBe(
      "32",
    );
  });
  it("new migration retains legacy orders, stock and reservation/payment triggers", () => {
    expect(legacyCheck.user_id).toBeNull();
    expect(legacyCheck.shipping_method).toBe("DELIVERY");
    expect(legacyCheck.delivery_distance_meters).toBeNull();
    expect(legacyCheck.total).toBe(47000);
    expect(legacyCheck.stock).toBe(100);
    expect(legacyCheck.triggers).toBeGreaterThanOrEqual(3);
  });
  it("creates a random session storing only a token hash", async () => {
    const { user, session } = await registerUser(db, registration());
    const row = await db
      .prepare("SELECT * FROM sessions WHERE user_id=?")
      .bind(user.id)
      .first();
    expect(row?.token_hash).toBe(await sha256(session.token));
    expect(JSON.stringify(row)).not.toContain(session.token);
    expect((await getSession(db, session.token))?.user.id).toBe(user.id);
    const second = await createSession(db, user.id, session.token);
    expect(second.token).not.toBe(session.token);
    expect(await getSession(db, session.token)).toBeNull();
    expect(second.row.expiresAt - second.row.createdAt).toBe(
      SESSION_SECONDS * 1000,
    );
    await deleteSession(db, second.token);
    expect(await getSession(db, second.token)).toBeNull();
  });
  it("expired sessions cannot authenticate and are cleaned without sliding expiry", async () => {
    const { session } = await registerUser(db, registration());
    expect(
      await getSession(db, session.token, session.row.expiresAt),
    ).toBeNull();
    await cleanExpiredSessions(db, session.row.expiresAt + 1);
    expect(
      (await db.prepare("SELECT COUNT(*) n FROM sessions").first())?.n,
    ).toBe(0);
  });
  it("cookies are HttpOnly, lax, bounded, and Secure in production", () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2592000,
    });
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});

describe("authentication and mutations", () => {
  it("normalizes registration email, returns safe responses and a real HttpOnly cookie", async () => {
    const response = await handleAuth(
      request("/api/auth/register", registration(" BAN@EXAMPLE.TEST ")),
      env,
      "register",
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    const body = await response.json();
    expect(body).toEqual({ redirectTo: "/account" });
    const row = await db
      .prepare("SELECT email,password_hash,password_salt FROM users")
      .first();
    expect(row?.email).toBe("ban@example.test");
    expect(JSON.stringify(row)).not.toContain(password);
    expect(JSON.stringify(body)).not.toMatch(/password|salt|token|hash/i);
  });
  it("allows registration without an optional phone number", async () => {
    const input = { ...registration(), phone: undefined };
    const { user } = await registerUser(db, input);
    expect(user.phone).toBeNull();
  });
  it("rejects duplicate emails, including simultaneous registrations, with friendly errors", async () => {
    const results = await Promise.all([
      handleAuth(
        request("/api/auth/register", registration()),
        env,
        "register",
      ),
      handleAuth(
        request("/api/auth/register", registration()),
        env,
        "register",
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await results.find((r) => r.status === 409)!.json()).toEqual({
      error: "Email này đã được sử dụng.",
    });
    expect((await db.prepare("SELECT COUNT(*) n FROM users").first())?.n).toBe(
      1,
    );
  });
  it("login accepts normalized email and returns identical errors for unknown email and wrong password", async () => {
    const { user } = await registerUser(db, registration());
    expect(
      (await loginUser(db, { email: " BAN@example.test ", password })).user.id,
    ).toBe(user.id);
    const bad = await handleAuth(
      request("/api/auth/login", { email: user.email, password: "bad" }),
      env,
      "login",
    );
    const unknown = await handleAuth(
      request("/api/auth/login", {
        email: "missing@example.test",
        password: "bad",
      }),
      env,
      "login",
    );
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await bad.json()).toEqual(await unknown.json());
    const good = await handleAuth(
      request("/api/auth/login", {
        email: user.email,
        password,
        next: "/checkout",
      }),
      env,
      "login",
    );
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ redirectTo: "/checkout" });
  });
  it("session endpoint never serializes password fields or internal IDs; expired cookie is removed", async () => {
    const { session } = await registerUser(db, registration());
    const response = await handleAuth(
      request("/api/auth/session", undefined, session.token),
      env,
      "session",
    );
    const data = (await response.json()) as {
      user: {
        name: string;
        email: string;
        phone: string | null;
        createdAt: number;
      } | null;
    };
    if (!data.user) throw new Error("Expected an authenticated user");
    expect(Object.keys(data.user).sort()).toEqual([
      "createdAt",
      "email",
      "name",
      "phone",
    ]);
    const expired = await handleAuth(
      request("/api/auth/session", undefined, "0".repeat(64)),
      env,
      "session",
    );
    expect(await expired.json()).toEqual({ user: null });
    expect(expired.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("logout deletes D1 session and expires the cookie", async () => {
    const { session } = await registerUser(db, registration());
    const response = await handleAuth(
      request("/api/auth/logout", undefined, session.token),
      env,
      "logout",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await getSession(db, session.token)).toBeNull();
  });
  it.each(["login", "register", "logout", "profile"] as const)(
    "rejects cross-site %s mutation",
    async (action) => {
      const response = await handleAuth(
        request(
          `/api/auth/${action}`,
          registration(),
          undefined,
          "https://evil.example",
        ),
        env,
        action,
      );
      expect(response.status).toBe(403);
    },
  );
  it("profile updates only the authenticated name and phone, never email or another user's profile", async () => {
    const { user, session } = await registerUser(db, registration());
    const other = await registerUser(db, registration("other@example.test"));
    const response = await handleAuth(
      request(
        "/api/account/profile",
        {
          name: "Tên mới",
          phone: "",
          email: "changed@example.test",
          userId: other.user.id,
        },
        session.token,
      ),
      env,
      "profile",
    );
    expect(response.status).toBe(200);
    const changed = (await getSession(db, session.token))!.user;
    expect(changed.name).toBe("Tên mới");
    expect(changed.phone).toBeNull();
    expect(changed.email).toBe(user.email);
    expect((await getSession(db, other.session.token))!.user.name).toBe(
      other.user.name,
    );
    expect(
      (
        await handleAuth(
          request("/api/account/profile", { name: "Tên mới", phone: "" }),
          env,
          "profile",
        )
      ).status,
    ).toBe(401);
  });
  it("rate limits login by email across different IPs, and registration by IP", async () => {
    for (let n = 0; n < 10; n++)
      await handleAuth(
        request(
          "/api/auth/login",
          { email: "no@example.test", password: "bad" },
          undefined,
          env.SITE_URL,
          `192.0.2.${n}`,
        ),
        env,
        "login",
      );
    expect(
      (
        await handleAuth(
          request(
            "/api/auth/login",
            { email: "no@example.test", password: "bad" },
            undefined,
            env.SITE_URL,
            "192.0.2.200",
          ),
          env,
          "login",
        )
      ).status,
    ).toBe(429);
    for (let n = 0; n < 5; n++)
      await handleAuth(request("/api/auth/register", {}), env, "register");
    expect(
      (await handleAuth(request("/api/auth/register", {}), env, "register"))
        .status,
    ).toBe(429);
  });
  it("only allows local approved return paths", () => {
    expect(safeNext("/checkout")).toBe("/checkout");
    for (const value of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/%2f%2fevil.example",
      "/admin",
    ])
      expect(safeNext(value)).toBe("/account");
  });
});

describe("account order isolation and guest checkout", () => {
  it("attaches user from session, ignores frontend userId, preserves edited delivery fields and idempotency", async () => {
    const { user, session } = await registerUser(db, registration());
    const other = await registerUser(db, registration("other@example.test"));
    const data = { ...checkout(), userId: other.user.id };
    const { order } = await createOrder(env, data, session.token);
    expect(order.userId).toBe(user.id);
    expect(order.customerName).toBe("Người nhận khác");
    expect(order.phone).toBe("0987654321");
    const retried = await createOrder(env, data, other.session.token);
    expect(retried.order.id).toBe(order.id);
    expect(retried.order.userId).toBe(user.id);
    expect((await getSession(db, session.token))!.user.name).toBe(user.name);
  });
  it("guest and expired-session orders keep user_id null even when client supplies one", async () => {
    const { user, session } = await registerUser(db, registration());
    const guest = await createOrder(env, { ...checkout(), userId: user.id });
    expect(guest.order.userId).toBeNull();
    await db.prepare("UPDATE sessions SET expires_at=1").run();
    const expired = await createOrder(
      env,
      { ...checkout(), userId: user.id },
      session.token,
    );
    expect(expired.order.userId).toBeNull();
    expect(guest.order.accessTokenHash).toBe(await sha256(guest.token));
  });
  it("history/detail isolate owners and never claim existing guest orders by matching phone", async () => {
    const a = await registerUser(db, registration());
    const b = await registerUser(db, registration("other@example.test"));
    const owned = await createOrder(env, checkout(), a.session.token);
    await createOrder(env, checkout());
    expect((await userOrders(db, a.user.id)).map((o) => o.orderCode)).toEqual([
      owned.order.orderCode,
    ]);
    expect(await userOrders(db, b.user.id)).toEqual([]);
    expect(await userOrder(db, b.user.id, owned.order.orderCode)).toBeNull();
    const detail = await userOrder(db, a.user.id, owned.order.orderCode);
    expect(detail?.items[0].quantity).toBe(1);
    expect(JSON.stringify(detail)).not.toMatch(
      /accessTokenHash|token_hash|rawPayload|password/i,
    );
  });
});
