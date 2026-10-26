import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { handleWebhook } from "@/lib/payments/sepay/handler";
import { createOrder, expireOrders } from "@/lib/orders/service";
import { getCatalogProducts, getHomepageProducts } from "@/lib/catalog";
import { groupMenuProducts } from "@/lib/products/line";
import type { Env } from "@/lib/env";
vi.mock("@/lib/geocoding", () => ({ geocodeAddress: vi.fn() }));
import { geocodeAddress } from "@/lib/geocoding";
const geocode = vi.mocked(geocodeAddress);
// Existing tariff fixtures encode the mocked route length in latitude.
vi.mock("@/lib/routing", () => ({ roadDistanceKm: vi.fn(async (_env, lat: number) => Math.abs(lat) * 6371 * Math.PI / 180) }));
let mf: Miniflare;
let db: D1Database;
let env: Env;
const secret = "local-test-only-webhook-key-32-chars";
const customer = {
  customerName: "Khách thử nghiệm", customerInstagram: "@Test.Buyer",
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
      r2Buckets: ["PRODUCT_IMAGES"],
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
    PRODUCT_IMAGES: (await mf.getR2Bucket("PRODUCT_IMAGES")) as unknown as R2Bucket,
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
describe("menu stock ordering", () => {
  it.each([["COOKIE", 0, "signature_standard"], ["COOKIE", 1, "signature_special"], ["CHUNKY", 0, "chunky"]] as const)("preserves stock and secondary ordering inside %s/%s", async (category, special, line) => {
    await db.prepare("UPDATE products SET category=?,is_special=?").bind(category, special).run();
    await db.prepare("UPDATE products SET stock=0 WHERE id IN ('original','chocolate')").run();
    await db.prepare("UPDATE products SET active=0 WHERE id='mixed'").run();
    const groups = groupMenuProducts(await getCatalogProducts(db, { inStockFirst: true }));
    expect(groups[line].map(p => p.id)).toEqual(["matcha", "mixed-mystery-face", "original", "chocolate"]);
    expect(Object.values(groups).flat()).toHaveLength(4);
  });
  it("backfills only the inspected Chunky IDs, preserves commercial fields, and is idempotent", async () => {
    const ids = ["c5f326a7-1a34-4efa-8618-233d4d195a80", "6504c015-366b-44c5-965b-929c1bacac32", "9abd88ee-6cb7-465a-b90b-af9f3eb359f5"];
    for (const id of ids) await db.prepare("INSERT INTO products (id,slug,name,description,price,image_url,flavor,stock,created_at,updated_at) VALUES (?,?,?,'Cookie',30000,'/images/original.webp','original',5,1,1)").bind(id, id, id).run();
    const snapshot = () => db.prepare("SELECT id,stock,price,pack_label,units_per_pack,image_url FROM products ORDER BY id").all();
    const before = await snapshot();
    const sql = await readFile("db/backfill-product-lines.sql", "utf8");
    await db.prepare(sql).run();
    expect((await getCatalogProducts(db)).filter(p => p.category === "CHUNKY").map(p => p.id).sort()).toEqual([...ids].sort());
    expect(await snapshot()).toMatchObject({ results: before.results });
    const after = await db.prepare("SELECT * FROM products ORDER BY id").all();
    await db.prepare(sql).run();
    expect(await db.prepare("SELECT * FROM products ORDER BY id").all()).toMatchObject({ results: after.results });
  });
  const menu = async () => (await getCatalogProducts(db, { inStockFirst: true })).map(p => p.id);
  it("puts active in-stock products first and keeps created_at/id ordering within both groups", async () => {
    await db.prepare("UPDATE products SET stock=0 WHERE id IN ('original','chocolate')").run();
    expect(await menu()).toEqual(["matcha", "mixed", "mixed-mystery-face", "original", "chocolate"]);
    // Equal timestamps remain deterministic by ID, independently in each stock group.
    await db.prepare("UPDATE products SET created_at=1").run();
    expect(await menu()).toEqual(["matcha", "mixed", "mixed-mystery-face", "chocolate", "original"]);
    await db.prepare("UPDATE products SET active=0 WHERE id IN ('matcha','original')").run();
    expect(await menu()).toEqual(["mixed", "mixed-mystery-face", "chocolate"]);
  });
  it("moves restocked products up and newly sold-out products down on the next query", async () => {
    await db.prepare("UPDATE products SET stock=0 WHERE id='original'").run();
    expect(await menu()).toEqual(["chocolate", "matcha", "mixed", "mixed-mystery-face", "original"]);
    await db.prepare("UPDATE products SET stock=10 WHERE id='original'").run();
    expect(await menu()).toEqual(["original", "chocolate", "matcha", "mixed", "mixed-mystery-face"]);
    await db.prepare("UPDATE products SET stock=0 WHERE id='chocolate'").run();
    expect(await menu()).toEqual(["original", "matcha", "mixed", "mixed-mystery-face", "chocolate"]);
    // Other catalog consumers keep their existing order; homepage retains its own stock filter/limit.
    expect((await getCatalogProducts(db)).map(p => p.id)).toEqual(["original", "chocolate", "matcha", "mixed", "mixed-mystery-face"]);
    expect((await getHomepageProducts(db)).map(p => p.id)).toEqual(["original", "matcha", "mixed", "mixed-mystery-face"]);
  });
});
describe("homepage D1 product selection", () => {
  it("includes active stock, excludes sold out/inactive, and allows special products", async () => {
    await db.prepare("UPDATE products SET stock=0 WHERE id='original'").run();
    await db.prepare("UPDATE products SET active=0 WHERE id='chocolate'").run();
    expect((await getHomepageProducts(db)).map(p => p.id)).toEqual(["matcha", "mixed", "mixed-mystery-face"]);
    const menu = await getCatalogProducts(db);
    expect(menu.find(p => p.id === "original")?.stock).toBe(0);
    expect(menu.some(p => p.id === "chocolate")).toBe(false);
  });
  it("limits more than four eligible products in stable catalog order", async () => {
    expect((await getHomepageProducts(db)).map(p => p.id)).toEqual(["original", "chocolate", "matcha", "mixed"]);
  });
  it.each([0, 1, 2, 3])("returns exactly %s eligible products without padding", async count => {
    await db.prepare("UPDATE products SET stock=0 WHERE id NOT IN (SELECT id FROM products ORDER BY created_at,id LIMIT ?)").bind(count).run();
    const selected = await getHomepageProducts(db);
    expect(selected).toHaveLength(count);
    expect(new Set(selected.map(p => p.id)).size).toBe(count);
  });
  it("includes newly added seller products using the existing order and their saved fields", async () => {
    await db.prepare("UPDATE products SET stock=0").run();
    await db.prepare("INSERT INTO products (id,slug,name,description,price,image_url,flavor,active,stock,pack_label,created_at,updated_at) VALUES ('new-cookie','new-cookie','New Cookie','New',30000,'/api/product-images/new.webp','original',1,8,'6 cookies / box',9999999999999,9999999999999)").run();
    expect(await getHomepageProducts(db)).toEqual([expect.objectContaining({ id: "new-cookie", stock: 8, packLabel: "6 cookies / box", imageUrl: "/api/product-images/new.webp" })]);
  });
});
describe("real local D1 order and webhook flow", () => {
  it("creates DELIVERY without district and stores an empty legacy column", async () => {
    geocode.mockResolvedValue({ lat: 0, lng: 0 });
    const created = await createOrder(env, { ...input(), district: undefined });
    expect(created.order.shippingFee).toBe(0);
    expect((await getOrder(created.order.id))?.district).toBe("");
    expect(geocode).toHaveBeenCalledOnce();
  });
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

it("COD delivery uses the same server-calculated shipping total as bank transfer", async () => {
  geocode.mockResolvedValue({ lat: 3.2 / (6371 * Math.PI / 180), lng: 0 });
  const transfer = await createOrder(env, input());
  const cod = await createOrder(env, { ...input(), paymentMethod: "COD", shippingFee: 1, total: 1 });
  expect(cod.order.subtotal).toBe(transfer.order.subtotal);
  expect(cod.order.shippingFee).toBe(10000);
  expect(cod.order.total).toBe(transfer.order.total);
  expect(cod.order.deliveryDistanceMeters).toBe(transfer.order.deliveryDistanceMeters);
  expect((await getOrder(cod.order.id))?.payment_status).toBe("PENDING");
});

it("COD still rejects sold-out items without creating an order or receipt", async () => {
  await db.prepare("UPDATE products SET stock=0 WHERE id='original'").run();
  await expect(createOrder(env, { ...input(), paymentMethod: "COD" })).rejects.toThrow("không đủ");
  expect((await db.prepare("SELECT count(*) n FROM orders").first())?.n).toBe(0);
  expect((await db.prepare("SELECT count(*) n FROM payments").first())?.n).toBe(0);
});


