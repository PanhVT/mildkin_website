import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { handleWebhook } from "@/lib/payments/sepay/handler";
import { createOrder, expireOrders } from "@/lib/orders/service";
import type { Env } from "@/lib/env";
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));
import { geocodeAddress } from "@/lib/geocoding";
const geocode = vi.mocked(geocodeAddress);
let mf: Miniflare;
let db: D1Database;
let env: Env;
const secret = "local-test-only-webhook-key-32-chars";
const customer = {
  customerName: "Khách thử nghiệm",
  phone: "0912345678",
  address: "12 Đường thử nghiệm",
  ward: "Phường thử",
  district: "Khu vực thử",
  city: "Hà Nội",
  note: "",
};
const input = () => ({
  ...customer,
  shippingMethod: "DELIVERY",
  checkoutToken: crypto.randomUUID(),
  items: [{ productId: "original", quantity: 2 }],
});
async function payloadFor(code: string, id = 1001, amount = 69000) {
  return {
    id,
    gateway: "Vietcombank",
    accountNumber: "123456789",
    transferType: "in",
    transferAmount: amount,
    content: `Thanh toan ${code}`,
    code: null,
    referenceCode: `REF${id}`,
  };
}
async function send(payload: unknown, auth = true) {
  return handleWebhook(
    new Request("https://test.example/api/webhooks/sepay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth ? `Apikey ${secret}` : "wrong",
      },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
    env,
  );
}
async function getOrder(id: string) {
  return db
    .prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('test'); } }",
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-01",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const files = (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(`drizzle/${file}`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
  env = {
    DB: db,
    PAYMENT_PROVIDER: "sepay",
    SEPAY_BANK_CODE: "VCB",
    SEPAY_BANK_ACCOUNT: "123456789",
    SEPAY_ACCOUNT_HOLDER: "TEST ONLY",
    SEPAY_WEBHOOK_AUTH: "apikey",
    SEPAY_WEBHOOK_SECRET: secret,
    STORE_LAT: "0",
    STORE_LNG: "0",
  };
});
beforeEach(async () => {
  geocode.mockReset().mockResolvedValue({ lat: 0.06745, lng: 0 });
  await db.batch([
    db.prepare("DELETE FROM payments"),
    db.prepare("DELETE FROM order_items"),
    db.prepare("DELETE FROM orders"),
    db.prepare("DELETE FROM products"),
  ]);
  await db.prepare(await readFile("db/seed.sql", "utf8")).run();
});
afterAll(async () => {
  await mf?.dispose();
});
describe("real local D1 order and webhook flow", () => {
  it("re-geocodes the submitted delivery address when creating each new order", async () => {
    geocode.mockResolvedValueOnce({ lat: 0, lng: 0 }).mockResolvedValueOnce({ lat: 3.2 / (6371 * Math.PI / 180), lng: 0 });
    const first = await createOrder(env, input());
    const second = await createOrder(env, { ...input(), address: "Một địa chỉ mới", shippingFee: 0 });
    expect(first.order.shippingFee).toBe(0);
    expect(second.order.shippingFee).toBe(10000);
    expect(geocode).toHaveBeenCalledTimes(2);
    expect(geocode).toHaveBeenLastCalledWith(expect.objectContaining({ address: "Một địa chỉ mới" }), env);
  });
  it("rejects unlocatable delivery before reserving stock", async () => {
    geocode.mockRejectedValue(new Error("Không tìm thấy địa chỉ"));
    await expect(createOrder(env, input())).rejects.toThrow("Không tìm thấy địa chỉ");
    expect((await db.prepare("SELECT count(*) n FROM orders").first())?.n).toBe(0);
    expect((await db.prepare("SELECT stock FROM products WHERE id='original'").first())?.stock).toBe(100);
  });
  it.each([[1.5, 0], [3.2, 10000], [5.2, 15000], [6.5, 20000], [7.95, 25000]])("server recomputes delivery at %s km and ignores supplied fee", async (distance, fee) => {
    geocode.mockResolvedValue({ lat: distance / (6371 * Math.PI / 180), lng: 0 });
    const { order } = await createOrder(env, {
      ...input(), customerLat: 0, customerLng: 0,
      shippingFee: 1, distanceKm: 0, total: 1,
    });
    expect(geocode).toHaveBeenCalledWith(expect.objectContaining({ address: customer.address, district: customer.district }), env);
    expect(order.shippingFee).toBe(fee);
    expect(order.total).toBe(44000 + fee);
    const saved = await getOrder(order.id);
    expect(saved?.shipping_method).toBe("DELIVERY");
    expect(saved?.delivery_distance_meters).toBe(Math.round(distance * 1000));
  });
  it("pickup works without store config, coordinates or delivery address", async () => {
    const { order } = await createOrder({ ...env, STORE_LAT: undefined, STORE_LNG: undefined }, {
      ...input(), shippingMethod: "PICKUP", customerLat: undefined, customerLng: undefined,
      address: undefined, ward: undefined, district: undefined, shippingFee: 25000,
    });
    expect(geocode).not.toHaveBeenCalled();
    expect(order.shippingFee).toBe(0);
    expect(order.total).toBe(44000);
    expect(order.deliveryDistanceMeters).toBeNull();
    expect((await getOrder(order.id))?.shipping_method).toBe("PICKUP");
    await send(await payloadFor(order.orderCode, 1001, 44000));
    expect((await getOrder(order.id))?.payment_status).toBe("PAID");
  });
  it.each([8, 8.001, 12])("rejects delivery at %s km without reserving stock", async (distance) => {
    geocode.mockResolvedValue({ lat: distance / (6371 * Math.PI / 180), lng: 0 });
    await expect(createOrder(env, { ...input(), customerLat: 0, customerLng: 0 })).rejects.toThrow("ngoài khu vực");
    expect((await db.prepare("SELECT count(*) n FROM orders").first())?.n).toBe(0);
    expect((await db.prepare("SELECT stock FROM products WHERE id='original'").first())?.stock).toBe(100);
  });
  it("rejects delivery without address or configured store", async () => {
    await expect(createOrder(env, { ...input(), address: undefined })).rejects.toThrow();
    await expect(createOrder({ ...env, STORE_LAT: "" }, input())).rejects.toThrow("Mildkin chưa thể tính phí");
  });
  it("reseeding preserves existing stock and keeps one Mystery Face product", async () => {
    await db.prepare("UPDATE products SET stock=37").run();
    await db.prepare(await readFile("db/seed.sql", "utf8")).run();
    const rows = await db.prepare("SELECT slug, stock FROM products").all();
    expect(rows.results).toHaveLength(5);
    expect(rows.results.every((row) => row.stock === 37)).toBe(true);
    expect(rows.results.filter((row) => row.slug === "mixed-mystery-face")).toHaveLength(1);
  });
  it("Mystery Face uses D1 price and its own reservation, release and settlement", async () => {
    const data = { ...input(), items: [{ productId: "mixed-mystery-face", quantity: 2, price: 1 }] };
    const { order } = await createOrder(env, { ...data, total: 1 });
    expect(order.subtotal).toBe(56000);
    expect(order.total).toBe(81000);
    const item = await db.prepare("SELECT * FROM order_items WHERE order_id=?").bind(order.id).first();
    expect(item?.product_name_snapshot).toBe("Mystery Face");
    expect(item?.price_snapshot).toBe(28000);
    const stock = async (id: string) => (await db.prepare("SELECT stock FROM products WHERE id=?").bind(id).first())?.stock;
    expect(await stock("mixed-mystery-face")).toBe(98);
    expect(await stock("mixed")).toBe(100);
    await expireOrders(db, order.expiresAt + 1);
    await expireOrders(db, order.expiresAt + 2);
    expect(await stock("mixed-mystery-face")).toBe(100);
    const paid = await createOrder(env, { ...data, checkoutToken: crypto.randomUUID() });
    await send(await payloadFor(paid.order.orderCode, 1001, 81000));
    expect((await getOrder(paid.order.id))?.payment_status).toBe("PAID");
    await expireOrders(db, paid.order.expiresAt + 1);
    expect(await stock("mixed-mystery-face")).toBe(98);
  });
  it("recalculates price, snapshots items, reserves stock, and retries checkout idempotently", async () => {
    const data = input();
    const result = await createOrder(env, { ...data, total: 1, price: 1 });
    expect(result.order.total).toBe(69000);
    expect(
      (
        await db
          .prepare("SELECT stock FROM products WHERE id='original'")
          .first<{ stock: number }>()
      )?.stock,
    ).toBe(98);
    expect((await createOrder(env, data)).order.id).toBe(result.order.id);
    expect(
      (
        await db
          .prepare("SELECT count(*) AS n FROM order_items")
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });
  it("valid incoming transaction marks order PAID", async () => {
    const { order } = await createOrder(env, input());
    expect((await send(await payloadFor(order.orderCode))).status).toBe(200);
    expect((await getOrder(order.id))?.payment_status).toBe("PAID");
  });
  it.each([68000, 70000])(
    "wrong amount %s stays PENDING and is retained for review",
    async (amount) => {
      const { order } = await createOrder(env, input());
      await send(await payloadFor(order.orderCode, 1001, amount));
      expect((await getOrder(order.id))?.payment_status).toBe("PENDING");
      expect(
        (await db.prepare("SELECT resolution FROM payments").first())
          ?.resolution,
      ).toBe("REVIEW");
    },
  );
  it("unknown order is retained without crashing", async () => {
    expect((await send(await payloadFor("MK0000000000"))).status).toBe(200);
    expect(
      (await db.prepare("SELECT order_id FROM payments").first())?.order_id,
    ).toBeNull();
  });
  it("concurrent duplicate deliveries create one payment", async () => {
    const { order } = await createOrder(env, input());
    const payload = await payloadFor(order.orderCode);
    const responses = await Promise.all([
      send(payload),
      send(payload),
      send(payload),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(
      (await db.prepare("SELECT count(*) AS n FROM payments").first())?.n,
    ).toBe(1);
  });
  it("invalid authentication returns 401 without mutation", async () => {
    const { order } = await createOrder(env, input());
    expect((await send(await payloadFor(order.orderCode), false)).status).toBe(
      401,
    );
    expect((await getOrder(order.id))?.payment_status).toBe("PENDING");
  });
  it("already paid order is not changed by a second transaction", async () => {
    const { order } = await createOrder(env, input());
    await send(await payloadFor(order.orderCode));
    const previous = await getOrder(order.id);
    await send(await payloadFor(order.orderCode, 1002));
    expect((await getOrder(order.id))?.paid_payment_id).toBe(
      previous?.paid_payment_id,
    );
    expect(
      (
        await db
          .prepare(
            "SELECT count(*) AS n FROM payments WHERE resolution='REVIEW'",
          )
          .first()
      )?.n,
    ).toBe(1);
  });
  it("malformed webhook returns 400", async () => {
    expect((await send("not json")).status).toBe(400);
    expect((await send({ id: 1 })).status).toBe(400);
  });
  it("wrong bank, wrong account and outgoing transfers never settle", async () => {
    const { order } = await createOrder(env, input());
    const payload = await payloadFor(order.orderCode);
    await send({ ...payload, gateway: "MBBank" });
    await send({ ...payload, id: 1002, accountNumber: "000000000" });
    await send({ ...payload, id: 1003, transferType: "out" });
    expect((await getOrder(order.id))?.payment_status).toBe("PENDING");
  });
  it("ambiguous payment codes require review", async () => {
    const { order } = await createOrder(env, input());
    const payload = await payloadFor(order.orderCode);
    await send({
      ...payload,
      content: `${order.orderCode} MK0000000000`,
      code: order.orderCode,
    });
    expect((await getOrder(order.id))?.payment_status).toBe("PENDING");
  });
  it("hidden products and invalid quantities cannot create orders", async () => {
    await db.prepare("UPDATE products SET active=0 WHERE id='original'").run();
    await expect(createOrder(env, input())).rejects.toThrow();
    await expect(
      createOrder(env, {
        ...input(),
        items: [{ productId: "matcha", quantity: 0 }],
      }),
    ).rejects.toThrow();
    expect(
      (await db.prepare("SELECT count(*) AS n FROM orders").first())?.n,
    ).toBe(0);
  });
  it("expiry restores stock once; late payment stays in review", async () => {
    const { order } = await createOrder(env, input());
    await expireOrders(db, order.expiresAt + 1);
    await expireOrders(db, order.expiresAt + 2);
    expect(
      (
        await db
          .prepare("SELECT stock FROM products WHERE id='original'")
          .first()
      )?.stock,
    ).toBe(100);
    await send(await payloadFor(order.orderCode));
    expect((await getOrder(order.id))?.payment_status).toBe("EXPIRED");
  });
  it("concurrent orders cannot oversell and a failed batch leaves no orphan order", async () => {
    await db.prepare("UPDATE products SET stock=2 WHERE id='original'").run();
    const results = await Promise.allSettled([
      createOrder(env, input()),
      createOrder(env, input()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.prepare("SELECT count(*) AS n FROM orders").first())?.n,
    ).toBe(1);
    expect(
      (
        await db
          .prepare("SELECT stock FROM products WHERE id='original'")
          .first()
      )?.stock,
    ).toBe(0);
  });
  it("price changes after lookup cause the entire batch to roll back", async () => {
    const { order } = await createOrder(env, input());
    const clone = {
      ...order,
      id: crypto.randomUUID(),
      orderCode: "MKFFFFFFFFFF",
      accessTokenHash: "different",
    };
    const { drizzle } = await import("drizzle-orm/d1");
    const schema = await import("@/db/schema");
    const orm = drizzle(db);
    await expect(
      orm.batch([
        orm.insert(schema.orders).values(clone),
        orm
          .insert(schema.orderItems)
          .values({
            id: crypto.randomUUID(),
            orderId: clone.id,
            productId: "original",
            productNameSnapshot: "Original",
            priceSnapshot: 1,
            quantity: 1,
          }),
      ]),
    ).rejects.toThrow();
    expect(await getOrder(clone.id)).toBeNull();
  });
});
