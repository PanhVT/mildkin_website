import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";

it("adds delivery metadata without rebuilding orders, losing triggers or modifying money/stock", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"], compatibilityDate: "2026-09-01" }));
  try {
    const db = await mf.getD1Database("DB") as unknown as D1Database;
    const apply = async (file: string) => {
      for (const sql of (await readFile(`drizzle/${file}`, "utf8")).split("--> statement-breakpoint")) if (sql.trim()) await db.prepare(sql).run();
    };
    for (const file of (await readdir("drizzle")).filter(f => f.endsWith(".sql") && f < "0009").sort()) await apply(file);
    await db.prepare(await readFile("db/seed.sql", "utf8")).run();
    for (const [id, status, method] of [["preparing", "PREPARING", "PICKUP"], ["shipping", "SHIPPING", "DELIVERY"], ["completed", "COMPLETED", "PICKUP"], ["cancelled", "CANCELLED", "PICKUP"]]) {
      await db.prepare(`INSERT INTO orders(id,order_code,access_token_hash,customer_name,phone,address,ward,district,city,subtotal,shipping_fee,total,status,payment_status,payment_method,shipping_method,bank_code,bank_account,account_holder,created_at,updated_at,expires_at)
        VALUES (?,?,?,'Buyer','0912345678','','','','',22000,0,22000,?,'PENDING','COD',?,'VCB','123','TEST',100,200,300)`)
        .bind(id, id, id, status, method).run();
    }
    const triggers = await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
    const financial = await db.prepare("SELECT id,status,payment_status,total,subtotal,shipping_fee FROM orders ORDER BY id").all();
    await apply("0009_delivery_assignment.sql");
    expect((await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results).toEqual(triggers.results);
    expect((await db.prepare("SELECT id,status,payment_status,total,subtotal,shipping_fee FROM orders ORDER BY id").all()).results).toEqual(financial.results);
    expect((await db.prepare("SELECT id,delivery_status,delivery_assignee,assigned_at,delivery_started_at,delivered_at FROM orders ORDER BY id").all()).results).toEqual([
      { id: "cancelled", delivery_status: "UNASSIGNED", delivery_assignee: null, assigned_at: null, delivery_started_at: null, delivered_at: null },
      { id: "completed", delivery_status: "COMPLETED", delivery_assignee: null, assigned_at: null, delivery_started_at: null, delivered_at: 200 },
      { id: "preparing", delivery_status: "UNASSIGNED", delivery_assignee: null, assigned_at: null, delivery_started_at: null, delivered_at: null },
      { id: "shipping", delivery_status: "IN_DELIVERY", delivery_assignee: null, assigned_at: null, delivery_started_at: 200, delivered_at: null },
    ]);
    expect((await db.prepare("SELECT stock FROM products WHERE id='original'").first())?.stock).toBe(100);
    await expect(db.prepare("UPDATE orders SET delivery_status='INVALID' WHERE id='preparing'").run()).rejects.toThrow();
  } finally { await mf.dispose(); }
});
