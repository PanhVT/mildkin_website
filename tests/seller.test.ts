import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import type { Env } from "@/lib/env";
import { hashPassword } from "@/lib/auth/password";
import { registerUser } from "@/lib/auth/user";
import { createOrder } from "@/lib/orders/service";
import { handleWebhook } from "@/lib/payments/sepay/handler";
import {
  createSellerSession,
  hasSellerSession,
  SELLER_COOKIE,
  sellerCredentials,
} from "@/lib/seller/auth";
import { handleSeller } from "@/lib/seller/handler";
import {
  dateRange,
  sellerRevenue,
  sellerOverview,
  sellerProducts,
} from "@/lib/seller/data";
import { sellerPasswordHash } from "@/scripts/seller-hash-password.mjs";
import { sellerPreparationSummary } from "@/lib/seller/preparation";
import { deliveryDashboard } from "@/lib/seller/delivery";
let mf: Miniflare, db: D1Database, env: Env, token: string;
const password = "Seller-test-only-password-123";
const headers = {
  "Content-Type": "application/json",
  Origin: "https://test.example",
};
function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = `${SELLER_COOKIE}=${token}`,
  origin = headers.Origin,
) {
  return new Request(`https://test.example/api/seller/${path}`, {
    method,
    headers: { ...headers, Origin: origin, Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const call = (
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
  origin?: string,
) =>
  handleSeller(
    request(path, method, body, cookie, origin),
    env,
    path.split("?")[0].split("/"),
  );
async function order() {
  return (
    await createOrder(env, {
      customerName: "Test buyer", customerInstagram: "@Test.Buyer",
      phone: "0912345678",
      shippingMethod: "PICKUP",
      checkoutToken: crypto.randomUUID(),
      items: [{ productId: "original", quantity: 2 }],
    })
  ).order;
}
async function assign(id: string, assignee = "Hồng Anh") {
  const state = await db.prepare("SELECT delivery_assignee,delivery_status FROM orders WHERE id=?").bind(id).first<{ delivery_assignee: string | null; delivery_status: string }>();
  const response = await call(`delivery/${id}`, "PATCH", { action: "assign", assignee, expectedAssignee: state!.delivery_assignee, expectedStatus: state!.delivery_status, confirmReassign: true });
  expect(response.status).toBe(200);
}
async function pay(o: Awaited<ReturnType<typeof order>>, amount = o.total, transactionId = Math.floor(Math.random() * 1e12)) {
  return handleWebhook(
    new Request("https://test.example/api/webhooks/sepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Apikey ${env.SEPAY_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        id: transactionId,
        gateway: "Vietcombank",
        accountNumber: env.SEPAY_BANK_ACCOUNT,
        transferType: "in",
        transferAmount: amount,
        content: o.orderCode,
      }),
    }),
    env,
  );
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('test'); } }",
      d1Databases: ["DB"],
      r2Buckets: ["PRODUCT_IMAGES"],
      compatibilityDate: "2026-09-01",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const statement of (await readFile(`drizzle/${file}`, "utf8")).split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) await db.prepare(statement).run();
  const credential = await hashPassword(password);
  env = {
    DB: db,
    PRODUCT_IMAGES: (await mf.getR2Bucket("PRODUCT_IMAGES")) as unknown as R2Bucket,
    SITE_URL: "https://test.example",
    SELLER_USERNAME: "test-seller",
    SELLER_PASSWORD_HASH: `${credential.hash}$${credential.salt}`,
    SELLER_SESSION_SECRET: "test-only-seller-session-secret-32-chars",
    PAYMENT_PROVIDER: "sepay",
    SEPAY_BANK_CODE: "VCB",
    SEPAY_BANK_ACCOUNT: "123456789",
    SEPAY_ACCOUNT_HOLDER: "TEST",
    SEPAY_WEBHOOK_AUTH: "apikey",
    SEPAY_WEBHOOK_SECRET: "test-only-webhook-secret-32-chars",
  };
});
beforeEach(async () => {
  await db.batch(
    [
      "payments",
      "order_items",
      "orders",
      "products",
      "sessions",
      "users",
      "seller_sessions",
      "request_limits",
    ].map((table) => db.prepare(`DELETE FROM ${table}`)),
  );
  await db.prepare(await readFile("db/seed.sql", "utf8")).run();
  token = await createSellerSession(env);
});
afterAll(async () => {
  await mf?.dispose();
});

describe("delivery and NEU handoff", () => {
  async function preparing(pickup = false) {
    const o = await order();
    await db.prepare("UPDATE orders SET payment_method='COD',shipping_method=? WHERE id=?").bind(pickup ? "PICKUP" : "DELIVERY", o.id).run();
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "PREPARING" })).status).toBe(200);
    return o;
  }
  const state = (id: string) => db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
  const stage = (id: string, status: string) => call(`delivery/${id}`, "PATCH", { action: "status", status });
  it("lists preparation with default unassigned state and excludes waiting, cancelled and expired", async () => {
    await order();
    const p = await preparing(), cancelled = await preparing(), expired = await preparing();
    await call(`orders/${cancelled.id}`, "PATCH", { status: "CANCELLED" });
    await db.prepare("UPDATE orders SET payment_status='EXPIRED' WHERE id=?").bind(expired.id).run();
    const dashboard = await deliveryDashboard(db);
    expect(dashboard.rows.map(r => r.id)).toEqual([p.id]);
    expect(dashboard.rows[0]).toMatchObject({ delivery_status: "UNASSIGNED", delivery_assignee: null, assigned_at: null });
    expect(dashboard.kpis).toEqual({ UNASSIGNED: 1, WAITING: 0, IN_DELIVERY: 0, COMPLETED: 0 });
  });
  it.each([false, true])("requires assignment through delivery and existing detail endpoints, pickup=%s", async pickup => {
    const o = await preparing(pickup);
    const next = pickup ? "COMPLETED" : "IN_DELIVERY";
    expect((await stage(o.id, next)).status).toBe(409);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: pickup ? "COMPLETED" : "SHIPPING" })).status).toBe(409);
    expect((await state(o.id))?.delivery_status).toBe("UNASSIGNED");
  });
  it("validates whitelist, request shape, session and same origin", async () => {
    const o = await preparing();
    const input = { action: "assign", assignee: "Other", expectedAssignee: null, expectedStatus: "UNASSIGNED" };
    expect((await call(`delivery/${o.id}`, "PATCH", input)).status).toBe(400);
    expect((await call(`delivery/${o.id}`, "PATCH", { ...input, assignee: "Hồng Anh", status: "COMPLETED" })).status).toBe(400);
    expect((await call("delivery", "GET", undefined, "")).status).toBe(401);
    expect((await call(`delivery/${o.id}`, "PATCH", input, "")).status).toBe(401);
    const buyer = await registerUser(db, { name: "Buyer", email: "delivery@example.test", password, confirmPassword: password, phone: "" });
    const cookie = `mildkin_session=${buyer.session.token}`;
    expect((await call("delivery", "GET", undefined, cookie)).status).toBe(401);
    expect((await call(`delivery/${o.id}`, "PATCH", input, cookie)).status).toBe(401);
    expect((await call(`delivery/${o.id}`, "PATCH", input, undefined, "https://evil.example")).status).toBe(403);
  });
  it("assigns, reassigns with a stale guard and preserves first assignment time", async () => {
    const o = await preparing();
    await assign(o.id);
    const first = await state(o.id);
    expect(first).toMatchObject({ delivery_assignee: "Hồng Anh", delivery_status: "WAITING", status: "PREPARING", payment_status: "PENDING" });
    expect(first?.assigned_at).toBeGreaterThan(0);
    expect((await call(`delivery/${o.id}`, "PATCH", { action: "assign", assignee: "Vi Anh", expectedAssignee: null, expectedStatus: "UNASSIGNED" })).status).toBe(409);
    await assign(o.id, "Vi Anh");
    expect((await state(o.id))?.assigned_at).toBe(first?.assigned_at);
  });
  it("exposes assignment in order detail and then saves SHIPPING through its status endpoint", async () => {
    const o = await preparing();
    const detail = async () => (await (await call(`orders/${o.id}`)).json()) as { order: { delivery_assignee: string | null; delivery_status: string; status: string } };
    expect((await detail()).order).toMatchObject({ delivery_assignee: null, delivery_status: "UNASSIGNED" });
    await assign(o.id);
    expect((await detail()).order).toMatchObject({ delivery_assignee: "Hồng Anh", delivery_status: "WAITING" });
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "SHIPPING" })).status).toBe(200);
    expect((await detail()).order).toMatchObject({ status: "SHIPPING", delivery_status: "IN_DELIVERY", delivery_assignee: "Hồng Anh" });
  });
  it("syncs delivery atomically, requires collection, protects terminal states and stock", async () => {
    const o = await preparing();
    await assign(o.id);
    expect((await stage(o.id, "COMPLETED")).status).toBe(409);
    expect((await stage(o.id, "IN_DELIVERY")).status).toBe(200);
    const started = await state(o.id);
    expect(started).toMatchObject({ status: "SHIPPING", delivery_status: "IN_DELIVERY", payment_status: "PENDING" });
    expect(started?.delivery_started_at).toBeGreaterThan(0);
    expect((await stage(o.id, "IN_DELIVERY")).status).toBe(409);
    expect((await stage(o.id, "COMPLETED")).status).toBe(409);
    expect((await state(o.id))?.delivered_at).toBeNull();
    const reassign = { action: "assign", assignee: "Vi Anh", expectedAssignee: "Hồng Anh", expectedStatus: "IN_DELIVERY" };
    expect((await call(`delivery/${o.id}`, "PATCH", reassign)).status).toBe(409);
    expect((await call(`delivery/${o.id}`, "PATCH", { ...reassign, confirmReassign: true })).status).toBe(200);
    expect((await state(o.id))?.delivery_started_at).toBe(started?.delivery_started_at);
    expect((await call(`orders/${o.id}/payment-status`, "PATCH", { status: "PAID" })).status).toBe(200);
    expect((await stage(o.id, "COMPLETED")).status).toBe(200);
    const completed = await state(o.id);
    expect(completed).toMatchObject({ status: "COMPLETED", delivery_status: "COMPLETED", delivery_assignee: "Vi Anh", payment_status: "PAID" });
    expect(completed?.delivered_at).toBeGreaterThan(0);
    expect((await stage(o.id, "IN_DELIVERY")).status).toBe(409);
    expect((await stage(o.id, "COMPLETED")).status).toBe(409);
    expect((await call(`delivery/${o.id}`, "PATCH", { ...reassign, expectedAssignee: "Vi Anh", expectedStatus: "COMPLETED", assignee: "Hồng Anh" })).status).toBe(409);
    expect((await state(o.id))?.delivered_at).toBe(completed?.delivered_at);
    expect((await db.prepare("SELECT stock FROM products WHERE id='original'").first())?.stock).toBe(98);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(0);
    expect((await sellerRevenue(db, new URLSearchParams())).totals.revenue).toBe(o.total);
  });
  it("pickup skips delivery and syncs completion from existing order detail", async () => {
    const o = await preparing(true);
    await assign(o.id, "Thuỳ Anh");
    expect((await stage(o.id, "IN_DELIVERY")).status).toBe(409);
    expect((await stage(o.id, "COMPLETED")).status).toBe(409);
    await call(`orders/${o.id}/payment-status`, "PATCH", { status: "PAID" });
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(200);
    expect(await state(o.id)).toMatchObject({ status: "COMPLETED", delivery_status: "COMPLETED", delivery_started_at: null, delivery_assignee: "Thuỳ Anh" });
    expect((await state(o.id))?.delivered_at).toBeGreaterThan(0);
  });
  it("computes global KPIs/workload independently of filters and bounds completed history", async () => {
    const unassigned = await preparing(), waiting = await preparing(true), delivering = await preparing(), completed = await preparing(true), cancelled = await preparing();
    await assign(waiting.id); await assign(delivering.id); await assign(completed.id, "Vi Anh"); await assign(cancelled.id);
    await stage(delivering.id, "IN_DELIVERY");
    await call(`orders/${completed.id}/payment-status`, "PATCH", { status: "PAID" }); await stage(completed.id, "COMPLETED");
    await call(`orders/${cancelled.id}`, "PATCH", { status: "CANCELLED" });
    const all = await deliveryDashboard(db);
    expect(all.rows.map(r => r.id)).toEqual([unassigned.id, waiting.id, delivering.id, completed.id]);
    expect(all.kpis).toEqual({ UNASSIGNED: 1, WAITING: 1, IN_DELIVERY: 1, COMPLETED: 1 });
    expect(all.workload.find(p => p.name === "Hồng Anh")).toEqual({ name: "Hồng Anh", count: 2, delivering: 1 });
    expect(all.workload.find(p => p.name === "Vi Anh")?.count).toBe(0);
    const filtered = await deliveryDashboard(db, new URLSearchParams({ assignee: "Hồng Anh", fulfillment: "PICKUP", status: "WAITING", q: waiting.orderCode }));
    expect(filtered.rows.map(r => r.id)).toEqual([waiting.id]);
    expect(filtered.kpis).toEqual(all.kpis); expect(filtered.workload).toEqual(all.workload);
    await db.prepare("UPDATE orders SET delivered_at=? WHERE id=?").bind(Date.now() - 31 * 86400000, completed.id).run();
    expect((await deliveryDashboard(db)).kpis.COMPLETED).toBe(0);
    expect((await call("delivery?status=INVALID")).status).toBe(400);
    expect((await call("delivery?assignee=Other")).status).toBe(400);
  });
});
describe("seller credentials and isolation", () => {
  it("logs in with configured credentials and a private HttpOnly cookie", async () => {
    const result = await call(
      "login",
      "POST",
      { username: env.SELLER_USERNAME, password },
      "",
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain(`${SELLER_COOKIE}=`);
    expect(result.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(result.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(await result.text()).not.toContain(env.SELLER_SESSION_SECRET);
  });
  it.each([
    { username: "wrong", password },
    { username: "test-seller", password: "wrong" },
  ])("rejects invalid credentials %s", async (input) => {
    expect((await call("login", "POST", input, "")).status).toBe(401);
  });
  it("hash script uses the existing password format without storing plaintext", async () => {
    const configured = {
      ...env,
      SELLER_PASSWORD_HASH: sellerPasswordHash(password),
    };
    expect(await sellerCredentials(configured, "test-seller", password)).toBe(
      true,
    );
    expect(configured.SELLER_PASSWORD_HASH).not.toContain(password);
  });
  it.each([
    "overview",
    "orders",
    "orders/missing",
    "revenue",
    "products",
    "payments",
  ])("protects %s with no cookie and a genuine buyer cookie", async (path) => {
    const buyer = await registerUser(db, {
      name: "Buyer",
      email: "buyer@example.test",
      password,
      confirmPassword: password,
      phone: "",
    });
    expect((await call(path, "GET", undefined, "")).status).toBe(401);
    expect(
      (
        await call(
          path,
          "GET",
          undefined,
          `mildkin_session=${buyer.session.token}`,
        )
      ).status,
    ).toBe(401);
  });
  it("logout revokes the captured token and clears the cookie", async () => {
    const response = await call("logout", "POST");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://test.example/seller/login",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await hasSellerSession(env, token)).toBe(false);
    expect((await call("payments")).status).toBe(401);
  });
  it("rejects expired, tampered and secret-rotated sessions", async () => {
    expect(await hasSellerSession(env, token + "x")).toBe(false);
    expect(
      await hasSellerSession(
        {
          ...env,
          SELLER_SESSION_SECRET: "rotated-test-only-session-secret-long",
        },
        token,
      ),
    ).toBe(false);
    await db.prepare("UPDATE seller_sessions SET expires_at=0").run();
    expect(await hasSellerSession(env, token)).toBe(false);
  });
  it("rejects cross-origin mutations", async () => {
    expect(
      (
        await call(
          "products/original",
          "PATCH",
          {},
          undefined,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "login",
          "POST",
          { username: "test-seller", password },
          "",
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
  });
  it("rate limits attempts", async () => {
    for (let i = 0; i < 30; i++) await call("login", "POST", {}, "");
    expect((await call("login", "POST", {}, "")).status).toBe(429);
  });
  it("fails closed with missing configuration", async () => {
    expect(
      await hasSellerSession(
        { ...env, SELLER_SESSION_SECRET: undefined },
        token,
      ),
    ).toBe(false);
  });
});
describe("real D1 dashboard data", () => {
  it("empty overview is zero, then reflects real orders and webhook payment", async () => {
    const empty = await sellerOverview(db);
    expect(empty.revenue).toBe(0);
    expect(empty.recent).toHaveLength(0);
    const o = await order();
    expect(o.userId).toBeNull();
    expect((await sellerOverview(db)).counts.pending).toBe(1);
    await pay(o);
    const result = await sellerOverview(db);
    expect(result.revenue).toBe(o.total);
    expect(result.counts.pending).toBe(0);
    expect(result.counts.processing).toBe(1);
    expect(result.top[0].packs).toBe(2);
  });
  it("includes paid, excludes pending, cancelled and expired; computes AOV and shipping", async () => {
    const a = await order();
    await pay(a);
    const b = await order();
    await db
      .prepare(
        "UPDATE orders SET shipping_fee=10000,total=subtotal+10000 WHERE id=?",
      )
      .bind(b.id)
      .run();
    await pay({ ...b, total: b.total + 10000 });
    await order();
    const cancelled = await order();
    await call(`orders/${cancelled.id}`, "PATCH", { status: "CANCELLED" });
    const expired = await order();
    await db
      .prepare(
        "UPDATE orders SET status='CANCELLED',payment_status='EXPIRED' WHERE id=?",
      )
      .bind(expired.id)
      .run();
    const paidCancelled = await order();
    await pay(paidCancelled);
    await db
      .prepare("UPDATE orders SET status='CANCELLED' WHERE id=?")
      .bind(paidCancelled.id)
      .run();
    const result = await sellerRevenue(db, new URLSearchParams());
    expect(result.totals).toEqual({
      revenue: 98000,
      count: 2,
      aov: 49000,
      shipping: 10000,
      subtotal: 88000,
    });
    expect(result.top[0].packs).toBe(4);
  });
  it("filters paid_at at inclusive VN start / exclusive end, fills empty days", async () => {
    const a = await order();
    await pay(a);
    const b = await order();
    await pay(b);
    await db
      .prepare("UPDATE orders SET paid_at=? WHERE id=?")
      .bind(Date.parse("2026-10-03T17:00:00Z"), a.id)
      .run();
    await db
      .prepare("UPDATE orders SET paid_at=? WHERE id=?")
      .bind(Date.parse("2026-10-04T17:00:00Z"), b.id)
      .run();
    const result = await sellerRevenue(
      db,
      new URLSearchParams("range=custom&from=2026-10-04&to=2026-10-04"),
    );
    expect(result.totals.count).toBe(1);
    expect(result.daily[0].day).toBe("2026-10-04");
    expect(
      dateRange(
        new URLSearchParams("range=7"),
        Date.parse("2026-10-04T12:00:00Z"),
      ).to -
        dateRange(
          new URLSearchParams("range=7"),
          Date.parse("2026-10-04T12:00:00Z"),
        ).from,
    ).toBe(7 * 86400000);
    expect(() =>
      dateRange(
        new URLSearchParams("range=custom&from=2026-02-30&to=2026-03-01"),
      ),
    ).toThrow();
  });
  it("views actual payments including unmatched, without raw payload or bank secrets", async () => {
    const o = await order();
    await pay(o);
    await pay(o, 1);
    const response = await call("payments");
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      counts: { matched: number; review: number };
      rows: unknown[];
    };
    expect(result.counts.matched).toBe(1);
    expect(result.counts.review).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(
      /raw_payload|bank_account|access_token/,
    );
  });
  it("searches and filters orders and returns only safe detail columns", async () => {
    const o = await order();
    const response = await call(`orders?q=${o.orderCode}`);
    const result = (await response.json()) as { total: number };
    expect(result.total).toBe(1);
    const detail = await call(`orders/${o.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.text()).not.toMatch(/access_token_hash|bank_account/);
    expect((await call("orders/missing")).status).toBe(404);
    expect((await call("orders?status=INVALID")).status).toBe(400);
  });
});
describe("order and inventory writes", () => {
  it("allows only forward paid fulfillment, never frontend payment edits", async () => {
    const o = await order();
    await db.prepare("UPDATE orders SET shipping_method='DELIVERY' WHERE id=?").bind(o.id).run();
    expect(
      (await call(`orders/${o.id}`, "PATCH", { status: "PREPARING" })).status,
    ).toBe(409);
    expect(
      (await call(`orders/${o.id}`, "PATCH", { status: "PAID" })).status,
    ).toBe(400);
    await pay(o);
    expect(
      (await call(`orders/${o.id}`, "PATCH", { status: "COMPLETED" })).status,
    ).toBe(409);
    await assign(o.id);
    for (const status of ["SHIPPING", "COMPLETED"])
      expect((await call(`orders/${o.id}`, "PATCH", { status })).status).toBe(
        200,
      );
    expect(
      (await call(`orders/${o.id}`, "PATCH", { status: "CANCELLED" })).status,
    ).toBe(409);
  });
  it("cancels pending once, restores inventory once, blocks late payment settlement", async () => {
    const o = await order();
    expect(
      (await call(`orders/${o.id}`, "PATCH", { status: "CANCELLED" })).status,
    ).toBe(200);
    expect(
      (await call(`orders/${o.id}`, "PATCH", { status: "CANCELLED" })).status,
    ).toBe(409);
    expect(
      (
        await db
          .prepare("SELECT stock FROM products WHERE id='original'")
          .first()
      )?.stock,
    ).toBe(100);
    await pay(o);
    expect(
      (
        await db
          .prepare("SELECT status FROM orders WHERE id=?")
          .bind(o.id)
          .first()
      )?.status,
    ).toBe("CANCELLED");
  });
  const input = () => ({
    price: 23000,
    stock: 42,
    active: true,
    expectedStock: 100,
    expectedPrice: 22000,
    expectedActive: true,
  });
  it("updates product stock, price and active atomically", async () => {
    expect((await call("products/original", "PATCH", input())).status).toBe(
      200,
    );
    const p = (await sellerProducts(db, new URLSearchParams())).rows.find(
      (p) => p.id === "original",
    )!;
    expect(p.stock).toBe(42);
    expect(p.price).toBe(23000);
    expect((await call("products/original", "PATCH", input())).status).toBe(
      409,
    );
  });
  it.each([
    { stock: -1 },
    { stock: 1.5 },
    { price: 0 },
    { price: -1 },
    { price: 1.5 },
  ])("rejects invalid product values %s", async (bad) => {
    expect(
      (await call("products/original", "PATCH", { ...input(), ...bad })).status,
    ).toBe(400);
  });
  it("cannot overwrite stock reserved by a checkout since the page loaded", async () => {
    await order();
    expect((await call("products/original", "PATCH", input())).status).toBe(
      409,
    );
    expect(
      (
        await db
          .prepare("SELECT stock FROM products WHERE id='original'")
          .first()
      )?.stock,
    ).toBe(98);
  });
  it("disabled products cannot be bought", async () => {
    expect(
      (await call("products/original", "PATCH", { ...input(), active: false }))
        .status,
    ).toBe(200);
    await expect(order()).rejects.toThrow();
  });
  it("rejects buyer and unauthenticated product/order writes", async () => {
    for (const cookie of ["", "mildkin_session=buyer-token"])
      for (const resource of ["products/original", "orders/missing"])
        expect((await call(resource, "PATCH", input(), cookie)).status).toBe(
          401,
        );
  });
});

// Product creation exercises real local D1 + R2; no production bindings.
async function productRequest(overrides: Record<string, string> = {}, image?: File, id?: string, cookie = `${SELLER_COOKIE}=${token}`) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ name: '  New Cookie  ', description: 'Fresh cookie', price: '35000', stock: '3', category: 'COOKIE', active: 'true', isSpecial: 'false', ...overrides })) body.set(key, value);
  body.set('image', image || new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], 'untrusted.png', { type: 'image/png' }));
  return handleSeller(new Request('https://test.example/api/seller/products', { method: id ? 'PATCH' : 'POST', headers: { Origin: headers.Origin, Cookie: cookie }, body }), env, id ? ['products', id] : ['products']);
}
describe('seller product uploads and dynamic catalog', () => {
  it('creates Chunky products and moves edited categories to the correct menu section', async () => {
    const { getCatalogProducts } = await import('@/lib/catalog');
    const { groupMenuProducts } = await import('@/lib/products/line');
    const response = await productRequest({ category: 'CHUNKY', pack_label: '1 cookie / pack', units_per_pack: '1' });
    expect(response.status).toBe(201);
    const { id } = await response.json() as { id: string };
    const current = groupMenuProducts(await getCatalogProducts(db)).chunky.find(p => p.id === id)!;
    expect(current).toMatchObject({ category: 'CHUNKY', isSpecial: false });
    const edit = await productRequest({ category: 'COOKIE', isSpecial: 'true', expectedStock: String(current.stock), expectedUpdatedAt: String(current.updatedAt) }, new File([], ''), id);
    expect(edit.status).toBe(200);
    const grouped = groupMenuProducts(await getCatalogProducts(db));
    expect(grouped.chunky).toHaveLength(0);
    expect(grouped.signature_special.find(p => p.id === id)).toMatchObject({ price: current.price, stock: current.stock, imageUrl: current.imageUrl, packLabel: current.packLabel, unitsPerPack: current.unitsPerPack });
    expect((await productRequest({ category: 'CHUNKY', isSpecial: 'true' })).status).toBe(400);
  });
  it('creates unique products, stores image in R2, exposes active and special records', async () => {
    const { getCatalogProducts } = await import('@/lib/catalog');
    const response = await productRequest({ isSpecial: 'true' });
    expect(response.status).toBe(201);
    const { id } = await response.json() as { id: string };
    const p = (await getCatalogProducts(db)).find(p => p.id === id)!;
    expect(p).toMatchObject({ name: 'New Cookie', price: 35000, stock: 3, description: 'Fresh cookie', category: 'COOKIE', active: true, isSpecial: true });
    expect(await env.PRODUCT_IMAGES.get(p.imageUrl.split('/').pop()!)).not.toBeNull();
    expect((await productRequest()).status).toBe(201);
    expect((await productRequest({ active: 'false' })).status).toBe(201);
    expect((await getCatalogProducts(db)).filter(p => p.name === 'New Cookie')).toHaveLength(2);
    expect((await getCatalogProducts(db)).find(p => p.id === 'mixed-mystery-face')?.isSpecial).toBe(true);
  });
  it('new IDs checkout, reserve stock, preserve snapshots after edits and release reservations', async () => {
    const { id } = await (await productRequest()).json() as { id: string };
    const { order: o } = await createOrder(env, { customerName: 'Test Buyer', customerInstagram: "@Test.Buyer", phone: '0912345678', shippingMethod: 'PICKUP', checkoutToken: crypto.randomUUID(), price: 1, items: [{ productId: id, quantity: 2 }] });
    expect(o.total).toBe(70000);
    const p = await db.prepare('SELECT * FROM products WHERE id=?').bind(id).first<{ stock: number; updated_at: number; image_url: string }>();
    expect(p?.stock).toBe(1);
    expect((await productRequest({ name: 'Edited', price: '40000', stock: '1', expectedStock: '1', expectedUpdatedAt: String(p!.updated_at) }, undefined, id)).status).toBe(200);
    expect(await env.PRODUCT_IMAGES.get(p!.image_url.split('/').pop()!)).toBeNull();
    const snapshot = await db.prepare('SELECT product_name_snapshot,price_snapshot FROM order_items WHERE order_id=?').bind(o.id).first();
    expect(snapshot).toMatchObject({ product_name_snapshot: 'New Cookie', price_snapshot: 35000 });
    await call(`orders/${o.id}`, 'PATCH', { status: 'CANCELLED' });
    expect((await db.prepare('SELECT stock FROM products WHERE id=?').bind(id).first())?.stock).toBe(3);
  });
  it('keeps sold-out products in catalog but rejects checkout', async () => {
    const { getCatalogProducts } = await import('@/lib/catalog');
    const { id } = await (await productRequest({ stock: '0' })).json() as { id: string };
    expect((await getCatalogProducts(db)).find(p => p.id === id)?.stock).toBe(0);
    await expect(createOrder(env, { customerName: 'Test Buyer', customerInstagram: "@Test.Buyer", phone: '0912345678', shippingMethod: 'PICKUP', checkoutToken: crypto.randomUUID(), items: [{ productId: id, quantity: 1 }] })).rejects.toThrow();
  });
  it.each<Record<string, string>>([{price:'0'}, {price:'-1'}, {price:'1.5'}, {stock:'-1'}, {stock:'1.2'}, {name:' '}, {description:''}, {stock:''}, {category:'INVALID'}])('rejects invalid fields %s', async bad => {
    expect((await productRequest(bad)).status).toBe(400);
  });
  it.each(['', 'mildkin_session=buyer'])('rejects unauthorized uploads %s', async cookie => {
    expect((await productRequest({}, undefined, undefined, cookie)).status).toBe(401);
  });
  it.each([
    new File(['<svg/>'], 'evil.svg', {type:'image/svg+xml'}),
    new File(['not an image'], 'fake.png', {type:'image/png'}),
    new File([new Uint8Array(5*1024*1024+1)], 'large.png', {type:'image/png'}),
  ])('rejects invalid image %s', async image => {
    expect((await productRequest({}, image)).status).toBe(400);
  });
  it.each([
    new File([new Uint8Array([255,216,255,224])], '../image.jpg', {type:'image/jpeg'}),
    new File(['RIFF0000WEBPVP8 '], 'image.webp', {type:'image/webp'}),
  ])('accepts supported signatures using generated keys %s', async image => {
    expect((await productRequest({}, image)).status).toBe(201);
  });
  it('cleans up uploaded object on stale edit without changing D1', async () => {
    const before = (await env.PRODUCT_IMAGES.list()).objects.length;
    expect((await productRequest({ expectedStock:'100', expectedUpdatedAt:'0' }, undefined, 'original')).status).toBe(409);
    expect((await env.PRODUCT_IMAGES.list()).objects).toHaveLength(before);
    expect((await db.prepare("SELECT name FROM products WHERE id='original'").first())?.name).toBe('Original');
  });
});

it('removes the new R2 image when D1 insert fails', async () => {
  const before = (await env.PRODUCT_IMAGES.list()).objects.length;
  await db.prepare("CREATE TRIGGER test_reject_product BEFORE INSERT ON products WHEN NEW.name='Reject me' BEGIN SELECT RAISE(ABORT, 'test_failure'); END;").run();
  try {
    expect((await productRequest({ name:'Reject me' })).status).toBe(500);
    expect((await env.PRODUCT_IMAGES.list()).objects).toHaveLength(before);
    expect(await db.prepare("SELECT id FROM products WHERE name='Reject me'").first()).toBeNull();
  } finally { await db.prepare('DROP TRIGGER test_reject_product').run(); }
});

describe('seller pack labels', () => {
  it('creates a trimmed label, updates it, and returns it through buyer and seller queries', async () => {
    const { getCatalogProducts } = await import('@/lib/catalog');
    const response = await productRequest({pack_label:'  1 cookie / pack  ', isSpecial:'true'});
    expect(response.status).toBe(201);
    const { id } = await response.json() as { id:string };
    const current = (await getCatalogProducts(db)).find(p => p.id === id)!;
    expect(current.packLabel).toBe('1 cookie / pack');
    expect((await db.prepare('SELECT pack_label FROM products WHERE id=?').bind(id).first())?.pack_label).toBe('1 cookie / pack');
    expect((await productRequest({pack_label:'2 cookies / pack', expectedStock:String(current.stock), expectedUpdatedAt:String(current.updatedAt)}, undefined, id)).status).toBe(200);
    expect((await getCatalogProducts(db)).find(p => p.id === id)?.packLabel).toBe('2 cookies / pack');
    expect((await sellerProducts(db, new URLSearchParams())).rows.find(p => p.id === id)?.pack_label).toBe('2 cookies / pack');
  });
  it.each(['', '   '])('uses the old display default for empty label %s', async pack_label => {
    const response = await productRequest({pack_label});
    expect(response.status).toBe(201);
    const {id} = await response.json() as {id:string};
    expect((await db.prepare('SELECT pack_label FROM products WHERE id=?').bind(id).first())?.pack_label).toBe('3 cookies / pack');
  });
  it.each(['<script>alert(1)</script>', '<b>Cookie</b>', 'a'.repeat(51), 'a\u0000b'])('rejects HTML, control characters and excessive length %s', async pack_label => {
    expect((await productRequest({pack_label})).status).toBe(400);
  });
  it('accepts the label through legacy JSON PATCH and preserves it if omitted', async () => {
    const input = {price:22000,stock:100,active:true,expectedStock:100,expectedPrice:22000,expectedActive:true};
    expect((await call('products/original', 'PATCH', {...input,pack_label:'6 cookies / box'})).status).toBe(200);
    expect((await call('products/original', 'PATCH', input)).status).toBe(200);
    expect((await db.prepare("SELECT pack_label FROM products WHERE id='original'").first())?.pack_label).toBe('6 cookies / box');
    expect((await call('products/original', 'PATCH', {...input,pack_label:'<b>unsafe</b>'})).status).toBe(400);
  });
  it('preserves custom labels for older multipart clients that omit the field', async () => {
    const {getCatalogProducts} = await import('@/lib/catalog');
    const {id} = await (await productRequest({pack_label:'6 cookies / box'})).json() as {id:string};
    const current=(await getCatalogProducts(db)).find(p=>p.id===id)!;
    expect((await productRequest({expectedStock:String(current.stock), expectedUpdatedAt:String(current.updatedAt)},undefined,id)).status).toBe(200);
    expect((await getCatalogProducts(db)).find(p=>p.id===id)?.packLabel).toBe('6 cookies / box');
  });
});

describe("revenue redesign D1 analytics", () => {
  const range = new URLSearchParams("start=2026-10-01&end=2026-10-07");
  async function paidAt(iso: string, phone = "0912345678") {
    const o = await order();
    await pay(o);
    await db.prepare("UPDATE orders SET phone=?,paid_at=?,created_at=? WHERE id=?")
      .bind(phone, Date.parse(iso), Date.parse(iso) - 60000, o.id).run();
    return o;
  }
  it("aggregates real item snapshots, normalized customers, intervals, comparisons, hours and providers", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    const a = await paidAt("2026-10-01T18:00:00+07:00");
    await paidAt("2026-10-03T18:00:00+07:00", "+84 912-345-678");
    await paidAt("2026-10-04T09:00:00+07:00", "0987654321");
    await paidAt("2026-09-28T18:00:00+07:00");
    await pay(a, 1); // Review/duplicate payments must never inflate provider totals.
    const result = await revenueDashboard(db, range);
    expect(result.summary).toMatchObject({ revenue: 132000, count: 3, aov: 44000, customers: 2, returning: 1, returningRate: 50, apf: 1.5, repurchaseDays: 2 });
    expect(result.comparisons).toMatchObject({ revenue: 200, count: 200, aov: 0, returningRate: null });
    expect(result.products).toEqual([expect.objectContaining({ product_id: "original", revenue: 132000, packs: 6 })]);
    expect(result.payments).toEqual([{ provider: "sepay", amount: 132000, count: 3 }]);
    expect(result.hours[6]).toMatchObject({ count: 2, revenue: 88000, label: "18–21h" });
    expect(result.hours[3].count).toBe(1);
    expect(result.daily).toHaveLength(7);
    expect(result.daily[1]).toEqual({ day: "2026-10-02", revenue: 0, count: 0 });
    expect(result.recent).toHaveLength(3);
    expect(result.recent[0].products).toBe("Original (2)");
    expect(result.paymentSuccess).toEqual({ eligible: 3, successful: 3, rate: 100 });
    expect(JSON.stringify(result)).not.toMatch(/phone:|0912345678|0987654321|address|raw_payload|access_token/);
    if (process.env.REVENUE_QA === "1") {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir("test-results/revenue", { recursive: true });
      await writeFile("test-results/revenue/data.json", JSON.stringify(result));
    }
  });
  it("prioritizes user_id over phone and keeps different registered users separate", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    const buyer = await registerUser(db, { name: "Buyer", email: "revenue@example.test", password, confirmPassword: password, phone: "" });
    const user = await db.prepare("SELECT id FROM users WHERE email='revenue@example.test'").first<{ id: string }>();
    expect(buyer.session.token).toBeTruthy();
    for (const phone of ["0912345678", "0987654321"]) {
      const o = await paidAt("2026-10-02T10:00:00+07:00", phone);
      await db.prepare("UPDATE orders SET user_id=? WHERE id=?").bind(user!.id, o.id).run();
    }
    await paidAt("2026-10-03T10:00:00+07:00");
    const result = await revenueDashboard(db, range);
    expect(result.summary).toMatchObject({ customers: 2, apf: 1.5, returningRate: 50, repurchaseDays: 0 });
  });
  it("excludes pending, failed, expired and paid-cancelled from every sales aggregation", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    for (const payment of ["PENDING", "FAILED", "EXPIRED", "PAID"]) {
      const o = await paidAt("2026-10-02T10:00:00+07:00");
      await db.prepare("UPDATE orders SET payment_status=?,status=? WHERE id=?")
        .bind(payment, payment === "PENDING" ? "PENDING_PAYMENT" : "CANCELLED", o.id).run();
    }
    const result = await revenueDashboard(db, range);
    expect(result.summary).toMatchObject({ count: 0, revenue: 0, aov: 0, customers: 0, returningRate: 0, apf: 0, repurchaseDays: null });
    expect(result.products).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.recent).toEqual([]);
    expect(result.hours.every(h => h.count === 0 && h.revenue === 0)).toBe(true);
    expect(result.paymentSuccess).toEqual({ eligible: 4, successful: 0, rate: 0 });
  });
  it("handles empty periods without NaN or infinite values", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    const result = await revenueDashboard(db, range);
    expect(result.summary).toMatchObject({ revenue: 0, count: 0, aov: 0, apf: 0, returningRate: 0, repurchaseDays: null });
    expect(result.paymentSuccess.rate).toBe(0);
    expect(Object.values(result.comparisons)).toEqual([0, 0, 0, 0]);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
  it("uses inclusive VN midnight, exclusive end, and a consistent payment cohort", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    await paidAt("2026-09-30T16:59:59Z");
    await paidAt("2026-09-30T17:00:00Z");
    await paidAt("2026-10-07T16:59:59Z");
    await paidAt("2026-10-07T17:00:00Z");
    const result = await revenueDashboard(db, range);
    expect(result.summary.count).toBe(2);
    expect(result.hours[0].count).toBe(1);
    expect(result.hours[7].count).toBe(1);
    expect(result.paymentSuccess).toEqual({ eligible: 2, successful: 1, rate: 50 });
  });
  it("limits recent orders, supports actual future providers and keeps API private", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    for (let i = 1; i <= 6; i++) await paidAt(`2026-10-0${i}T10:00:00+07:00`);
    await db.prepare("UPDATE payments SET provider='test-provider' WHERE id=(SELECT paid_payment_id FROM orders ORDER BY paid_at DESC LIMIT 1)").run();
    const result = await revenueDashboard(db, range);
    expect(result.recent).toHaveLength(5);
    expect(result.payments).toEqual([{ provider: "sepay", amount: 220000, count: 5 }, { provider: "test-provider", amount: 44000, count: 1 }]);
    const response = await call(`revenue?${range}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json() as typeof result).summary.count).toBe(6);
    expect((await call("revenue?start=bad&end=2026-10-07")).status).toBe(400);
  });
});

describe("revenue date and comparison contracts", () => {
  it.each([
    ["today", "2026-10-01", "2026-10-01", 1],
    ["7d", "2026-09-25", "2026-10-01", 7],
    ["30d", "2026-09-02", "2026-10-01", 30],
    ["month", "2026-10-01", "2026-10-01", 1],
  ])("resolves %s server-side across UTC midnight", async (preset, start, end, days) => {
    const { revenueRange } = await import("@/lib/seller/revenue");
    const result = revenueRange(new URLSearchParams({ preset }), Date.parse("2026-09-30T17:30:00Z"));
    expect(result.start).toBe(start);
    expect(result.end).toBe(end);
    expect(result.to - result.from).toBe(Number(days) * 86400000);
    expect(result.previousTo).toBe(result.from);
    expect(result.previousTo - result.previousFrom).toBe(result.to - result.from);
  });
  it("uses equal preceding periods and rejects invalid ranges", async () => {
    const { revenueRange, percentageChange } = await import("@/lib/seller/revenue");
    const result = revenueRange(new URLSearchParams("start=2026-10-01&end=2026-10-07"));
    expect(result.previousFrom).toBe(Date.parse("2026-09-24T00:00:00+07:00"));
    expect(result.previousTo).toBe(Date.parse("2026-10-01T00:00:00+07:00"));
    for (const query of ["preset=bad", "start=2026-02-30&end=2026-03-01", "start=2026-10-08&end=2026-10-07", "start=2020-01-01&end=2026-10-01", "start=2026-10-01"]) {
      expect(() => revenueRange(new URLSearchParams(query))).toThrow();
    }
    expect(percentageChange(50, 100)).toBe(-50);
    expect(percentageChange(1, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBe(0);
  });
});

describe("COD checkout and seller collection", () => {
  const newCod = (session?: string, extra: Record<string, unknown> = {}) => createOrder(env, {
    customerName: "COD buyer", customerInstagram: "@Test.Buyer", phone: "0912345678", shippingMethod: "PICKUP", paymentMethod: "COD",
    items: [{ productId: "original", quantity: 2 }], checkoutToken: crypto.randomUUID(), ...extra,
  }, session);
  // Existing fulfillment/collection cases start AFTER explicit seller acceptance.
  const cod = async (session?: string, extra: Record<string, unknown> = {}) => {
    const result = await newCod(session, extra);
    if (result.order.status === "PENDING_PAYMENT")
      expect((await call(`orders/${result.order.id}/status`, "PATCH", { status: "PREPARING" })).status).toBe(200);
    return result;
  };
  const saved = (id: string) => db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Record<string, unknown>>();
  const stock = async () => (await db.prepare("SELECT stock FROM products WHERE id='original'").first<{ stock: number }>())!.stock;
  const collect = (id: string, cookie?: string, origin?: string) => call(`cod-payments/${id}`, "POST", {}, cookie, origin);

  it("creates guest COD unpaid, reserves inventory, and ignores forged payment fields", async () => {
    const { order: o } = await newCod(undefined, { paymentStatus: "PAID", status: "PAID", paidAt: 1, provider: "sepay", total: 1, shippingFee: 10000 });
    expect(await saved(o.id)).toMatchObject({ payment_method: "COD", payment_status: "PENDING", status: "PENDING_PAYMENT", paid_at: null, user_id: null, total: 44000, shipping_fee: 0, bank_code: "", bank_account: "", account_holder: "" });
    expect(await stock()).toBe(98);
    expect((await db.prepare("SELECT COUNT(*) n FROM payments").first())?.n).toBe(0);
    const { orderPaymentPath } = await import("@/lib/payments/method");
    expect(orderPaymentPath(o)).toBe(`/orders/${o.orderCode}/success`);
  });
  it("does not depend on SePay configuration for COD, but still validates bank-transfer config", async () => {
    const input = { customerName: "COD buyer", customerInstagram: "@Test.Buyer", phone: "0912345678", shippingMethod: "PICKUP", paymentMethod: "COD", items: [{ productId: "original", quantity: 1 }], checkoutToken: crypto.randomUUID() };
    const withoutSePay = { DB: db } as Env;
    expect((await createOrder(withoutSePay, input)).order.paymentMethod).toBe("COD");
    await expect(createOrder(withoutSePay, { ...input, checkoutToken: crypto.randomUUID(), paymentMethod: "BANK_TRANSFER" })).rejects.toThrow("cổng thanh toán");
  });
  it("validates methods and preserves backward-compatible bank-transfer defaults", async () => {
    await expect(cod(undefined, { paymentMethod: "arbitrary" })).rejects.toThrow();
    const o = await order();
    expect(await saved(o.id)).toMatchObject({ payment_method: "BANK_TRANSFER", payment_status: "PENDING", status: "PENDING_PAYMENT" });
    await pay(o);
    expect((await saved(o.id))?.payment_status).toBe("PAID");
    const { orderPaymentPath } = await import("@/lib/payments/method");
    expect(orderPaymentPath(o)).toBe(`/orders/${o.orderCode}/payment`);
  });
  it("associates logged-in COD with the account and returns method in list/detail history", async () => {
    const buyer = await registerUser(db, { name: "Buyer", email: "cod@example.test", password, confirmPassword: password, phone: "" });
    const { order: o } = await cod(buyer.session.token);
    expect((await saved(o.id))?.user_id).toBe(buyer.user.id);
    const { userOrders, userOrder } = await import("@/lib/auth/orders");
    expect((await userOrders(db, buyer.user.id))[0]).toMatchObject({ paymentMethod: "COD", paymentStatus: "PENDING" });
    expect((await userOrder(db, buyer.user.id, o.orderCode))?.order.paymentMethod).toBe("COD");
  });
  it("survives the bank timeout while unpaid transfer expires and releases only its stock", async () => {
    const { expireOrders } = await import("@/lib/orders/service");
    const { order: o } = await cod();
    const bank = await order();
    await expireOrders(db, Math.max(o.expiresAt, bank.expiresAt) + 1);
    expect(await saved(o.id)).toMatchObject({ status: "PREPARING", payment_status: "PENDING" });
    expect(await saved(bank.id)).toMatchObject({ status: "CANCELLED", payment_status: "EXPIRED" });
    expect(await stock()).toBe(98);
    expect((await collect(o.id)).status).toBe(200);
  });
  it("blocks unpaid pickup completion and skips shipping after collection", async () => {
    const { order: o } = await cod();
    await assign(o.id);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "SHIPPING" })).status).toBe(409);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(409);
    expect((await call(`orders/${o.id}/payment-status`, "PATCH", { status: "PAID" })).status).toBe(200);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(200);
    expect(await saved(o.id)).toMatchObject({ status: "COMPLETED", payment_status: "PAID" });
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "PREPARING" })).status).toBe(409);
  });
  it("validates payment authorization, amount and no downgrades through the new endpoint", async () => {
    const { order: o } = await cod();
    const path = `orders/${o.id}/payment-status`;
    const buyer = await registerUser(db, { name: "Buyer", email: "status@example.test", password, confirmPassword: password, phone: "" });
    expect((await call(path, "PATCH", { status: "PAID" }, "")).status).toBe(401);
    expect((await call(path, "PATCH", { status: "PAID" }, `mildkin_session=${buyer.session.token}`)).status).toBe(401);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "CANCELLED" }, "")).status).toBe(401);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "CANCELLED" }, `mildkin_session=${buyer.session.token}`)).status).toBe(401);
    expect((await call(path, "PATCH", { status: "PAID", amount: 1 })).status).toBe(400);
    expect((await call(path, "PATCH", { status: "PAID" })).status).toBe(200);
    expect((await call(path, "PATCH", { status: "PAID" })).status).toBe(200);
    expect((await call(path, "PATCH", { status: "PENDING" })).status).toBe(400);
    const bank = await order();
    expect((await call(`orders/${bank.id}/payment-status`, "PATCH", { status: "PAID" })).status).toBe(409);
    expect((await pay(bank)).status).toBe(200);
    expect((await saved(bank.id))?.payment_status).toBe("PAID");
    expect((await call("orders?status=PREPARING&payment=PAID").then(r => r.json()) as { total: number }).total).toBe(2);
    expect((await call("orders?status=PREPARING&payment=PENDING").then(r => r.json()) as { total: number }).total).toBe(0);
  });
  it("requires payment before delivery completion and rejects cancelled resurrection", async () => {
    const { order: o } = await cod();
    await assign(o.id);
    await db.prepare("UPDATE orders SET shipping_method='DELIVERY' WHERE id=?").bind(o.id).run();
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "SHIPPING" })).status).toBe(200);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(409);
    await collect(o.id);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(200);
    const { order: cancelled } = await cod();
    await call(`orders/${cancelled.id}/status`, "PATCH", { status: "CANCELLED" });
    expect((await call(`orders/${cancelled.id}/status`, "PATCH", { status: "SHIPPING" })).status).toBe(409);
  });
  it("records exactly one real receipt under concurrent clicks and preserves paid_at on retries", async () => {
    const { order: o } = await cod();
    const responses = await Promise.all([collect(o.id), collect(o.id), collect(o.id)]);
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    const state = await saved(o.id);
    expect(state).toMatchObject({ payment_status: "PAID", status: "PREPARING", paid_payment_id: `cod:${o.id}` });
    expect(state?.paid_at).toBeGreaterThan(0);
    expect((await collect(o.id)).status).toBe(200);
    expect((await saved(o.id))?.paid_at).toBe(state?.paid_at);
    const receipts = await db.prepare("SELECT * FROM payments WHERE order_id=?").bind(o.id).all();
    expect(receipts.results).toHaveLength(1);
    expect(receipts.results[0]).toMatchObject({ provider: "cod", amount: 44000, resolution: "MATCHED" });
    expect(await stock()).toBe(98);
  });
  it.each(["PREPARING", "SHIPPING"])("cancels unpaid COD in %s and releases stock once", async status => {
    const { order: o } = await cod();
    if (status === "SHIPPING") {
      await assign(o.id);
      await db.prepare("UPDATE orders SET shipping_method='DELIVERY' WHERE id=?").bind(o.id).run();
      await call(`orders/${o.id}`, "PATCH", { status });
    }
    expect((await call(`orders/${o.id}`, "PATCH", { status: "CANCELLED" })).status).toBe(200);
    expect(await stock()).toBe(100);
    expect((await call(`orders/${o.id}`, "PATCH", { status: "CANCELLED" })).status).toBe(409);
    expect((await collect(o.id)).status).toBe(409);
    expect(await stock()).toBe(100);
    expect(await saved(o.id)).toMatchObject({ status: "CANCELLED", payment_status: "PENDING", paid_at: null });
    expect((await db.prepare("SELECT COUNT(*) n FROM payments").first())?.n).toBe(0);
  });
  it("forbids cancelling paid COD and safely resolves concurrent collect/cancel", async () => {
    const { order: paid } = await cod();
    await collect(paid.id);
    expect((await call(`orders/${paid.id}`, "PATCH", { status: "CANCELLED" })).status).toBe(409);
    const { order: racing } = await cod();
    await Promise.all([collect(racing.id), call(`orders/${racing.id}`, "PATCH", { status: "CANCELLED" })]);
    const state = await saved(racing.id);
    const count = (await db.prepare("SELECT COUNT(*) n FROM payments WHERE order_id=?").bind(racing.id).first())!.n;
    if (state!.status === "CANCELLED") {
      expect(state!.payment_status).toBe("PENDING"); expect(count).toBe(0); expect(await stock()).toBe(98);
    } else {
      expect(state!.payment_status).toBe("PAID"); expect(count).toBe(1); expect(await stock()).toBe(96);
    }
  });
  it("rejects missing, transfer, anonymous, genuine buyer and cross-origin collection requests", async () => {
    const { order: o } = await cod();
    const buyer = await registerUser(db, { name: "Buyer", email: "cod-auth@example.test", password, confirmPassword: password, phone: "" });
    expect((await collect(o.id, "")).status).toBe(401);
    expect((await collect(o.id, `mildkin_session=${buyer.session.token}`)).status).toBe(401);
    expect((await collect(o.id, undefined, "https://evil.example")).status).toBe(403);
    expect((await collect("missing")).status).toBe(404);
    expect((await collect((await order()).id)).status).toBe(409);
    expect((await saved(o.id))?.payment_status).toBe("PENDING");
  });
  it("SePay callbacks never settle COD even with matching banking snapshots", async () => {
    const { order: o } = await cod();
    await db.prepare("UPDATE orders SET bank_code='VCB',bank_account=?,status='PENDING_PAYMENT' WHERE id=?").bind(env.SEPAY_BANK_ACCOUNT!, o.id).run();
    await pay(o);
    expect((await saved(o.id))?.payment_status).toBe("PENDING");
    expect((await db.prepare("SELECT resolution FROM payments WHERE order_id=?").bind(o.id).first())?.resolution).toBe("REVIEW");
  });
  it("excludes unpaid COD from revenue/AOV/products and includes collected COD in provider analytics", async () => {
    const { revenueDashboard } = await import("@/lib/seller/revenue");
    const { order: o } = await cod();
    const bank = await order(); await pay(bank);
    const before = await revenueDashboard(db, new URLSearchParams());
    expect(before.summary).toMatchObject({ revenue: 44000, count: 1, aov: 44000 });
    expect(before.products[0].packs).toBe(2);
    expect(before.payments).toEqual([{ provider: "sepay", count: 1, amount: 44000 }]);
    await collect(o.id);
    const after = await revenueDashboard(db, new URLSearchParams());
    expect(after.summary).toMatchObject({ revenue: 88000, count: 2, aov: 44000 });
    expect(after.products[0].packs).toBe(4);
    expect(after.payments).toEqual([{ provider: "cod", count: 1, amount: 44000 }, { provider: "sepay", count: 1, amount: 44000 }]);
    expect((await sellerRevenue(db, new URLSearchParams())).totals.revenue).toBe(88000);
  });
  it("lists pending COD separately from actual receipts, filters methods, excludes review from received", async () => {
    const { sellerPayments } = await import("@/lib/seller/data");
    const { order: o } = await cod();
    const bank = await order(); await pay(bank); await pay(bank, 1);
    const before = await sellerPayments(db, new URLSearchParams());
    expect(before.counts).toEqual({ received: 44000, matched: 1, review: 1 });
    expect(before.pending).toBe(1);
    const codOnly = await sellerPayments(db, new URLSearchParams("method=COD"));
    expect(codOnly.rows).toHaveLength(1);
    expect(codOnly.rows[0]).toMatchObject({ payment_method: "COD", resolution: "PENDING", amount: 44000 });
    expect(codOnly.counts.received).toBe(0);
    await collect(o.id);
    const collected = await sellerPayments(db, new URLSearchParams("method=COD"));
    expect(collected.rows).toHaveLength(1);
    expect(collected.rows[0].resolution).toBe("MATCHED");
    expect(collected.counts.received).toBe(44000);
    expect(collected.pending).toBe(0);
    expect((await sellerPayments(db, new URLSearchParams("method=BANK_TRANSFER"))).rows).toHaveLength(2);
    expect((await call("payments?method=bad")).status).toBe(400);
  });
  it("retries checkout without changing the persisted method or reserving twice", async () => {
    const checkoutToken = crypto.randomUUID();
    const first = await cod(undefined, { checkoutToken });
    const retry = await cod(undefined, { checkoutToken, paymentMethod: "BANK_TRANSFER" });
    expect(retry.order.id).toBe(first.order.id);
    expect(retry.order.paymentMethod).toBe("COD");
    expect(await stock()).toBe(98);
  });
});
describe("method-specific flow and global preparation summary", () => {
  const saved = (id: string) => db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Record<string, unknown>>();
  const stock = async () => (await db.prepare("SELECT stock FROM products WHERE id='original'").first<{ stock: number }>())!.stock;
  const make = async (paymentMethod = "COD", items = [{ productId: "original", quantity: 2 }]) =>
    (await createOrder(env, { customerName: "Preparation buyer", customerInstagram: "@Test.Buyer", phone: "0912345678", shippingMethod: "PICKUP", paymentMethod, checkoutToken: crypto.randomUUID(), items })).order;
  const accept = (id: string) => call(`orders/${id}/status`, "PATCH", { status: "PREPARING" });

  it("creates COD awaiting seller confirmation, reserving stock but excluding it from production", async () => {
    const o = await make();
    expect(await saved(o.id)).toMatchObject({ status: "PENDING_PAYMENT", payment_status: "PENDING", user_id: null });
    expect(await sellerPreparationSummary(db)).toEqual({ products: [], productTypes: 0, totalItems: 0, totalPieces: 0 });
    expect(await stock()).toBe(98);
    expect((await call(`orders/${o.id}/payment-status`, "PATCH", { status: "PAID" })).status).toBe(409);
    expect((await accept(o.id)).status).toBe(200);
    expect(await saved(o.id)).toMatchObject({ status: "PREPARING", payment_status: "PENDING", paid_at: null });
    expect(await stock()).toBe(98);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(2);
    expect((await sellerRevenue(db, new URLSearchParams())).totals.revenue).toBe(0);
    await assign(o.id);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(409);
    expect((await call(`orders/${o.id}/payment-status`, "PATCH", { status: "PAID" })).status).toBe(200);
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "COMPLETED" })).status).toBe(200);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(0);
  });
  it("SePay settlement enters preparation atomically, repeats never rewind fulfillment or double revenue", async () => {
    const o = await make("BANK_TRANSFER");
    expect(await saved(o.id)).toMatchObject({ status: "PENDING_PAYMENT", payment_status: "PENDING" });
    expect((await accept(o.id)).status).toBe(409);
    expect((await pay(o, o.total, 987001)).status).toBe(200);
    const settled = await saved(o.id);
    expect(settled).toMatchObject({ status: "PREPARING", payment_status: "PAID" });
    expect((await sellerPreparationSummary(db)).totalItems).toBe(2);
    expect((await sellerRevenue(db, new URLSearchParams())).totals.revenue).toBe(o.total);
    await pay(o, o.total, 987001);
    expect(await saved(o.id)).toEqual(settled);
    await assign(o.id);
    expect((await db.prepare("SELECT COUNT(*) n FROM payments").first())?.n).toBe(1);
    expect(await stock()).toBe(98);
    await db.prepare("UPDATE orders SET shipping_method='DELIVERY' WHERE id=?").bind(o.id).run();
    expect((await call(`orders/${o.id}/status`, "PATCH", { status: "SHIPPING" })).status).toBe(200);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(0);
    await pay(o, o.total, 987001);
    await pay(o, o.total, 987002);
    expect(await saved(o.id)).toMatchObject({ status: "SHIPPING", payment_status: "PAID", paid_at: settled?.paid_at });
    expect((await sellerRevenue(db, new URLSearchParams())).totals.revenue).toBe(o.total);
  });
  it("rolls back receipt and settlement if the preparation step fails", async () => {
    const o = await make("BANK_TRANSFER");
    await db.prepare(`CREATE TRIGGER test_preparation_failure BEFORE UPDATE OF status ON orders
      WHEN NEW.status='PREPARING' BEGIN SELECT RAISE(ABORT,'test_failure'); END`).run();
    try {
      expect((await pay(o)).status).toBe(500);
      expect(await saved(o.id)).toMatchObject({ status: "PENDING_PAYMENT", payment_status: "PENDING", paid_at: null });
      expect((await db.prepare("SELECT COUNT(*) n FROM payments").first())?.n).toBe(0);
    } finally { await db.prepare("DROP TRIGGER test_preparation_failure").run(); }
  });
  it("groups all preparation by product ID, keeps snapshot names and sorts quantities then names", async () => {
    const a = await make("COD", [{ productId: "original", quantity: 2 }, { productId: "matcha", quantity: 1 }]);
    const b = await make("COD", [{ productId: "original", quantity: 3 }, { productId: "chocolate", quantity: 1 }]);
    await accept(a.id); await accept(b.id);
    await db.prepare("UPDATE products SET name='Renamed today',pack_label='99 cookies / pack',image_url='/api/product-images/example.webp' WHERE id='original'").run();
    const summary = await sellerPreparationSummary(db);
    expect(summary).toMatchObject({ totalItems: 7, productTypes: 3 });
    expect(summary.products.map(p => [p.name, p.quantity])).toEqual([["Original", 5], ["Chocolate", 1], ["Matcha", 1]]);
    expect(summary.products[0]).toMatchObject({ productId: "original", imageUrl: "/api/product-images/example.webp", packLabel: "99 cookies / pack" });
    expect(summary.totalPieces).toBe(21);
    expect(summary.products[0]).toMatchObject({ totalPieces: 15, unitsPerPack: 3 });
    // List filters/page/search cannot affect the independent global summary.
    const filtered = await call("orders?status=CANCELLED&payment=PAID&q=missing&page=2").then(r => r.json()) as { total: number };
    expect(filtered.total).toBe(0);
    expect(await sellerPreparationSummary(db)).toEqual(summary);
    const response = await call("orders/preparation-summary");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(summary);
  });
  it.each(["PENDING_PAYMENT", "PAID", "SHIPPING", "COMPLETED", "CANCELLED"])("excludes order stage %s regardless of payment", async status => {
    const o = await make();
    await db.prepare("UPDATE orders SET status=? WHERE id=?").bind(status, o.id).run();
    expect((await sellerPreparationSummary(db)).totalItems).toBe(0);
  });
  it("expiry excludes COD and paid bank preparation; late payments cannot resurrect expired orders", async () => {
    const { expireOrders } = await import("@/lib/orders/service");
    const cod = await make();
    const bank = await make("BANK_TRANSFER");
    const paid = await make("BANK_TRANSFER"); await pay(paid);
    await expireOrders(db, Math.max(cod.expiresAt, bank.expiresAt, paid.expiresAt) + 1);
    await expireOrders(db, bank.expiresAt + 2);
    expect(await saved(cod.id)).toMatchObject({ status: "PENDING_PAYMENT", payment_status: "PENDING" });
    expect(await saved(bank.id)).toMatchObject({ status: "CANCELLED", payment_status: "EXPIRED" });
    expect(await saved(paid.id)).toMatchObject({ status: "PREPARING", payment_status: "PAID" });
    await pay(bank);
    expect(await saved(bank.id)).toMatchObject({ status: "CANCELLED", payment_status: "EXPIRED" });
    expect((await sellerPreparationSummary(db)).totalItems).toBe(2);
    expect(await stock()).toBe(96);
    expect((await accept(cod.id)).status).toBe(200);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(4);
    expect((await call(`orders/${cod.id}/status`, "PATCH", { status: "CANCELLED" })).status).toBe(200);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(2);
    expect((await call(`orders/${cod.id}/status`, "PATCH", { status: "CANCELLED" })).status).toBe(409);
    expect(await stock()).toBe(98);
  });
  it("requires seller authorization for summary and COD acceptance", async () => {
    const o = await make();
    const buyer = await registerUser(db, { name: "Buyer", email: "preparation-auth@example.test", password, confirmPassword: password, phone: "" });
    for (const cookie of ["", `mildkin_session=${buyer.session.token}`]) {
      expect((await call("orders/preparation-summary", "GET", undefined, cookie)).status).toBe(401);
      expect((await call(`orders/${o.id}/status`, "PATCH", { status: "PREPARING" }, cookie)).status).toBe(401);
    }
    expect(await saved(o.id)).toMatchObject({ status: "PENDING_PAYMENT", payment_status: "PENDING" });
  });
});
describe("numeric preparation pieces", () => {
  it("multiplies numeric pack size, groups orders and sorts by pieces rather than packs", async () => {
    await db.prepare("UPDATE products SET units_per_pack=1 WHERE id='matcha'").run();
    const create = async (quantity: number, matcha = 0) => {
      const o = (await createOrder(env, { customerName: "Pieces", customerInstagram: "@Test.Buyer", phone: "0912345678", paymentMethod: "COD", shippingMethod: "PICKUP", checkoutToken: crypto.randomUUID(), items: [{ productId: "original", quantity }, ...(matcha ? [{ productId: "matcha", quantity: matcha }] : [])] })).order;
      expect((await call(`orders/${o.id}/status`, "PATCH", { status: "PREPARING" })).status).toBe(200);
      return o;
    };
    const a = await create(2, 4);
    let summary = await sellerPreparationSummary(db);
    expect(summary.products.map(p => [p.productId, p.quantity, p.totalPieces])).toEqual([["original", 2, 6], ["matcha", 4, 4]]);
    expect(summary.totalPieces).toBe(10);
    await create(3);
    summary = await sellerPreparationSummary(db);
    expect(summary.products[0]).toMatchObject({ quantity: 5, totalPieces: 15 });
    expect(summary.totalPieces).toBe(19);
    const total = (await db.prepare("SELECT total FROM orders WHERE id=?").bind(a.id).first())?.total;
    await db.prepare("UPDATE products SET units_per_pack=2,pack_label='999 cookies / pack' WHERE id='original'").run();
    expect((await sellerPreparationSummary(db)).totalPieces).toBe(14);
    expect((await db.prepare("SELECT total FROM orders WHERE id=?").bind(a.id).first())?.total).toBe(total);
    await db.prepare("UPDATE orders SET status='SHIPPING' WHERE id=?").bind(a.id).run();
    expect((await sellerPreparationSummary(db)).totalPieces).toBe(6);
  });
  it.each([0, -1, 1.5, 10001, "3"])("rejects invalid JSON pack size %s", async units_per_pack => {
    expect((await call("products/original", "PATCH", { price: 22000, stock: 100, active: true, expectedStock: 100, expectedPrice: 22000, expectedActive: true, units_per_pack })).status).toBe(400);
  });
  it("persists pack size through JSON edits independently of the display label", async () => {
    expect((await call("products/original", "PATCH", { price: 22000, stock: 100, active: true, expectedStock: 100, expectedPrice: 22000, expectedActive: true, units_per_pack: 7 })).status).toBe(200);
    expect((await sellerProducts(db, new URLSearchParams())).rows.find(p => p.id === "original")?.units_per_pack).toBe(7);
  });
});
describe("seller numeric packaging form writes", () => {
  it("creates, edits and preserves numeric pack sizes through multipart requests", async () => {
    const response = await productRequest({ units_per_pack: "3", pack_label: "display only" });
    expect(response.status).toBe(201);
    const { id } = await response.json() as { id: string };
    let current = (await sellerProducts(db, new URLSearchParams())).rows.find(p => p.id === id)!;
    expect(current.units_per_pack).toBe(3);
    expect((await productRequest({ units_per_pack: "1", expectedStock: String(current.stock), expectedUpdatedAt: String(current.updated_at) }, undefined, id)).status).toBe(200);
    current = (await sellerProducts(db, new URLSearchParams())).rows.find(p => p.id === id)!;
    expect(current.units_per_pack).toBe(1);
    expect((await productRequest({ expectedStock: String(current.stock), expectedUpdatedAt: String(current.updated_at) }, undefined, id)).status).toBe(200);
    expect((await sellerProducts(db, new URLSearchParams())).rows.find(p => p.id === id)?.units_per_pack).toBe(1);
  });
  it.each(["", "0", "-1", "1.5", "10001", "invalid"])("rejects invalid multipart units_per_pack %s", async units_per_pack => {
    expect((await productRequest({ units_per_pack })).status).toBe(400);
  });
});


describe("Instagram seller contact", () => {
  it("rejects missing Instagram before creating an order", async () => {
    await expect(createOrder(env, { customerName: "Buyer", phone: "0912345678", shippingMethod: "PICKUP", checkoutToken: crypto.randomUUID(), items: [{ productId: "original", quantity: 1 }] })).rejects.toThrow("Vui lòng nhập tên Instagram hợp lệ.");
  });
  it("marks/unmarks without changing payment, delivery, totals or order stage", async () => {
    const o = await order();
    const before = await db.prepare("SELECT * FROM orders WHERE id=?").bind(o.id).first<Record<string, unknown>>();
    expect(before!.instagram_contacted_at).toBeNull();
    const marked = await call(`orders/${o.id}/instagram-contact`, "PATCH", { contacted: true });
    expect(marked.status).toBe(200);
    const timestamp = (await marked.json() as { instagram_contacted_at: number }).instagram_contacted_at;
    expect(timestamp).toBeGreaterThan(0);
    const after = await db.prepare("SELECT * FROM orders WHERE id=?").bind(o.id).first<Record<string, unknown>>();
    expect({ ...after, instagram_contacted_at: null }).toEqual(before);
    const retry = await call(`orders/${o.id}/instagram-contact`, "PATCH", { contacted: true });
    expect(await retry.json()).toEqual({ instagram_contacted_at: timestamp });
    expect((await call(`orders/${o.id}/instagram-contact`, "PATCH", { contacted: false })).status).toBe(200);
    expect(await db.prepare("SELECT instagram_contacted_at FROM orders WHERE id=?").bind(o.id).first("instagram_contacted_at")).toBeNull();
  });
  it("denies guests and buyer sessions", async () => {
    const o = await order();
    const buyer = await registerUser(db, { name: "Buyer", email: "instagram-auth@example.test", password, confirmPassword: password, phone: "" });
    for (const cookie of ["", `mildkin_session=${buyer.session.token}`]) {
      expect((await call(`orders/${o.id}/instagram-contact`, "PATCH", { contacted: true }, cookie)).status).toBe(401);
      expect((await call(`orders/${o.id}/instagram-message`, "GET", undefined, cookie)).status).toBe(401);
    }
    expect((await call(`orders/${o.id}/instagram-contact`, "PATCH", { contacted: "true" })).status).toBe(400);
    expect((await call(`orders/${o.id}/instagram-contact`, "PATCH", { contacted: true }, undefined, "https://evil.test")).status).toBe(403);
  });
  it("filters NULL and NOT NULL with matching counts", async () => {
    const first = await order(), second = await order();
    await call(`orders/${first.id}/instagram-contact`, "PATCH", { contacted: true });
    const yes = await (await call("orders?contact=contacted")).json() as { rows: { id: string }[]; total: number };
    const no = await (await call("orders?contact=uncontacted")).json() as { rows: { id: string }[]; total: number };
    expect(yes.rows.map(o => o.id)).toEqual([first.id]); expect(yes.total).toBe(1);
    expect(no.rows.map(o => o.id)).toEqual([second.id]); expect(no.total).toBe(1);
  });
  it("requires confirmation and generates DB messages without marking contact", async () => {
    const o = await order();
    expect((await call(`orders/${o.id}/instagram-message`)).status).toBe(409);
    await pay(o);
    const response = await call(`orders/${o.id}/instagram-message?total=1&customerName=Forged`);
    expect(response.status).toBe(200);
    const { message } = await response.json() as { message: string };
    expect(message).toContain("Test buyer"); expect(message).toContain("44.000đ"); expect(message).toContain("Đã thanh toán"); expect(message).not.toContain("Forged");
    expect(await db.prepare("SELECT instagram_contacted_at FROM orders WHERE id=?").bind(o.id).first("instagram_contacted_at")).toBeNull();
  });
});
