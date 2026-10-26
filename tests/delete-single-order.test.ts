import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { pinOrderSql } from "@/scripts/prepare-order-deletion.mjs";

it("deletes only the pinned order, preserves stock/auth/other orders, and rolls back child deletes on FK failure", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default { fetch() { return new Response('test'); } }",
    d1Databases: ["DB"], compatibilityDate: "2026-09-01" }));
  try {
    const db = await mf.getD1Database("DB") as unknown as D1Database;
    for (const file of (await readdir("drizzle")).filter(f => f.endsWith(".sql")).sort())
      for (const sql of (await readFile(`drizzle/${file}`, "utf8")).split("--> statement-breakpoint"))
        if (sql.trim()) await db.prepare(sql).run();
    await db.prepare(await readFile("db/seed.sql", "utf8")).run();
    await db.prepare("INSERT INTO users VALUES ('buyer','single@example.test','hash','salt','Test',NULL,1,1)").run();
    const template = await readFile("scripts/delete-latest-test-order.sql", "utf8");
    const statements = (sql: string) => sql.replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s));
    const table = async (name: string) => (await db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all()).results;
    for (const status of ["PENDING_PAYMENT", "PREPARING", "COMPLETED", "CANCELLED"]) {
      for (const [id, code] of [["aa-older", "MK0000000001"], ["zz-latest", "MK0000000002"]]) {
        await db.prepare(`INSERT INTO orders
          (id,order_code,access_token_hash,user_id,customer_name,phone,address,ward,district,city,
           subtotal,shipping_fee,total,payment_method,bank_code,bank_account,account_holder,created_at,updated_at,expires_at)
          VALUES (?,?,?,'buyer','Test','0912345678','','','','',22000,0,22000,'COD','','','',100,100,9999999999999)`)
          .bind(id,code,id).run();
        await db.prepare("INSERT INTO order_items VALUES (?,?,'original','Original',22000,1)").bind(id,id).run();
        await db.prepare(`INSERT INTO payments (id,order_id,provider,provider_transaction_id,amount,bank,account,content,raw_payload,created_at)
          VALUES (?,?,'test',?,1,'','','test','{}',100)`).bind(id,id,id).run();
        if (status !== "PENDING_PAYMENT") await db.prepare("UPDATE orders SET status=? WHERE id=?").bind(status,id).run();
        if (status === "COMPLETED") await db.prepare("UPDATE orders SET payment_status='PAID' WHERE id=?").bind(id).run();
      }
      expect(await db.prepare("SELECT id FROM orders ORDER BY created_at DESC,id DESC LIMIT 1").first("id")).toBe("zz-latest");
      const products = await table("products"), users = await table("users");
      const orders = await table("orders"), items = await table("order_items"), payments = await table("payments");
      await db.batch(statements(template)); // Unfilled template is inert.
      await db.batch(statements(pinOrderSql(template, "zz-latest", "MK0000000099")));
      expect(await table("orders")).toEqual(orders); expect(await table("order_items")).toEqual(items); expect(await table("payments")).toEqual(payments);
      const sql = pinOrderSql(template, "zz-latest", "MK0000000002");
      await db.prepare("CREATE TABLE extra_order_child (order_id TEXT REFERENCES orders(id))").run();
      await db.prepare("INSERT INTO extra_order_child VALUES ('zz-latest')").run();
      await expect(db.batch(statements(sql))).rejects.toThrow();
      expect(await table("order_items")).toEqual(items); expect(await table("payments")).toEqual(payments); expect(await table("orders")).toEqual(orders);
      await db.prepare("DROP TABLE extra_order_child").run();
      await db.batch(statements(sql));
      for (const name of ["orders", "order_items", "payments"]) {
        const column = name === "orders" ? "id" : "order_id";
        expect(await db.prepare(`SELECT COUNT(*) FROM ${name} WHERE ${column}='zz-latest'`).first("COUNT(*)")).toBe(0);
        expect(await db.prepare(`SELECT COUNT(*) FROM ${name} WHERE ${column}='aa-older'`).first("COUNT(*)")).toBe(1);
      }
      expect(await table("products")).toEqual(products); expect(await table("users")).toEqual(users);
      expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
      await db.batch(statements(sql)); // Retry cannot touch another order.
      await db.batch([db.prepare("DELETE FROM order_items WHERE order_id='aa-older'"), db.prepare("DELETE FROM payments WHERE order_id='aa-older'"), db.prepare("DELETE FROM orders WHERE id='aa-older'")]);
    }
  } finally { await mf.dispose(); }
}, 30000);

it("requires a reviewed ID/code and escapes SQL literals", () => {
  expect(() => pinOrderSql("", "", "MK0000000001")).toThrow();
  expect(() => pinOrderSql("", "id", "wrong")).toThrow();
  expect(pinOrderSql("'__CONFIRMED_ORDER_ID__'", "a'b", "MK0000000001")).toBe("'a''b'");
});
