import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { revenueDashboard } from "@/lib/seller/revenue";
import { sellerOrders } from "@/lib/seller/data";
import { sellerPreparationSummary } from "@/lib/seller/preparation";
import { deliveryDashboard } from "@/lib/seller/delivery";
import { DELIVERY_ASSIGNEES } from "@/lib/seller/delivery-config";

it("clears transactions without releasing stock or changing catalog, auth, schema; dashboards become empty", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: "export default { fetch() { return new Response('test'); } }",
    d1Databases: ["DB"], compatibilityDate: "2026-09-01",
  }));
  try {
    const db = await mf.getD1Database("DB") as unknown as D1Database;
    for (const file of (await readdir("drizzle")).filter(f => f.endsWith(".sql")).sort()) {
      for (const sql of (await readFile(`drizzle/${file}`, "utf8")).split("--> statement-breakpoint")) {
        if (sql.trim()) await db.prepare(sql).run();
      }
    }
    await db.prepare(await readFile("db/seed.sql", "utf8")).run();
    await db.prepare("INSERT INTO users VALUES ('buyer','test@example.com','hash','salt','Test',NULL,1,1)").run();
    await db.prepare("INSERT INTO sessions VALUES ('session','buyer','token',9999999999999,1,NULL)").run();
    await db.prepare("INSERT INTO seller_sessions VALUES ('seller-token',9999999999999)").run();
    await db.prepare("INSERT INTO request_limits VALUES ('limit',1,9999999999999)").run();
    const now = Date.now();
    // Pending bank, active COD, cancelled, paid/completed and delivery/pickup.
    for (const [id, method, status, shipping] of [
      ['pending','BANK_TRANSFER','PENDING_PAYMENT','DELIVERY'],
      ['cod','COD','PREPARING','PICKUP'],
      ['cancelled','COD','PREPARING','DELIVERY'],
      ['paid','BANK_TRANSFER','PENDING_PAYMENT','DELIVERY'],
    ]) {
      await db.prepare(`INSERT INTO orders
        (id,order_code,access_token_hash,user_id,customer_name,phone,address,ward,district,city,
         subtotal,shipping_fee,total,status,payment_method,shipping_method,bank_code,bank_account,account_holder,
         created_at,updated_at,expires_at,delivery_assignee,delivery_status)
        VALUES (?,?,?,'buyer','Test','0912345678','Test','Test','Test','Test',22000,0,22000,?,?,?,'MB','123','Test',?,?,?,'Hồng Anh','WAITING')`)
        .bind(id,id,id,status,method,shipping,now,now,now+3600000).run();
      await db.prepare(`INSERT INTO order_items VALUES (?,?,'original','Original',22000,1)`).bind(id,id).run();
    }
    await db.prepare("UPDATE orders SET status='CANCELLED' WHERE id='cancelled'").run();
    await db.prepare(`INSERT INTO payments
      (id,order_id,provider,provider_transaction_id,amount,bank,account,content,raw_payload,created_at)
      VALUES ('payment','paid','sepay','tx',22000,'MB','123','test','{}',?)`).bind(now).run();
    await db.prepare("UPDATE orders SET status='COMPLETED',delivered_at=? WHERE id='paid'").bind(now).run();
    await db.prepare(`INSERT INTO payments
      (id,provider,provider_transaction_id,amount,bank,account,content,raw_payload,created_at)
      VALUES ('unmatched','sepay','unmatched',1,'MB','123','test','{}',?)`).bind(now).run();
    expect((await revenueDashboard(db, new URLSearchParams(), now)).summary.revenue).toBe(22000);
    expect((await sellerPreparationSummary(db)).totalItems).toBe(1);
    expect((await deliveryDashboard(db, new URLSearchParams(), now)).total).toBeGreaterThan(0);
    const preserved = ['products','users','sessions','seller_sessions','request_limits'];
    const snapshot = async () => Promise.all(preserved.map(t => db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()));
    const before = await snapshot();
    const schema = await db.prepare("SELECT name,type,sql FROM sqlite_master ORDER BY name").all();
    const cleanup = (await readFile('scripts/reset-test-data.sql','utf8'))
      .replace(/--[^\n]*/g,'').split(';').map(s => s.trim()).filter(Boolean);
    for (let pass = 0; pass < 2; pass++) {
      await db.batch(cleanup.map(s => db.prepare(s)));
      expect((await snapshot()).map(r => r.results)).toEqual(before.map(r => r.results));
      expect((await db.prepare("SELECT name,type,sql FROM sqlite_master ORDER BY name").all()).results).toEqual(schema.results);
      for (const t of ['orders','order_items','payments']) {
        expect(await db.prepare(`SELECT COUNT(*) n FROM ${t}`).first('n')).toBe(0);
      }
      expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    }
    const revenue = await revenueDashboard(db, new URLSearchParams(), now);
    expect(revenue.summary).toMatchObject({ revenue: 0, count: 0, aov: 0, customers: 0, returning: 0, apf: 0, returningRate: 0, repurchaseDays: null });
    expect((await sellerOrders(db, new URLSearchParams())).total).toBe(0);
    expect(await sellerPreparationSummary(db)).toMatchObject({ products: [], totalItems: 0, totalPieces: 0 });
    const delivery = await deliveryDashboard(db, new URLSearchParams(), now);
    expect(delivery.rows).toEqual([]);
    expect(Object.values(delivery.kpis)).toEqual([0,0,0,0]);
    expect(delivery.workload).toEqual(DELIVERY_ASSIGNEES.map(name => ({ name, count: 0, delivering: 0 })));
  } finally { await mf.dispose(); }
}, 30000);
