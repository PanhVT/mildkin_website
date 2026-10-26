import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";

it("adds packaging without replacing products or inventory triggers, backfilling only known seed packaging", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"], compatibilityDate: "2026-09-01" }));
  try {
    const db = await mf.getD1Database("DB") as unknown as D1Database;
    const apply = async (file: string) => {
      for (const sql of (await readFile(`drizzle/${file}`, "utf8")).split("--> statement-breakpoint"))
        if (sql.trim()) await db.prepare(sql).run();
    };
    for (const file of (await readdir("drizzle")).filter(f => f.endsWith(".sql") && f < "0008").sort()) await apply(file);
    // Pre-migration seed columns are explicit and do not contain the new field.
    await db.prepare(`INSERT INTO products(id,slug,name,description,price,image_url,flavor,stock,created_at,updated_at)
      VALUES ('original','original','Original','known seed',22000,'/images/original.webp','original',37,1,1),
      ('matcha','matcha','Matcha','customized seed',24000,'/images/matcha.webp','matcha',8,1,1),
      ('custom','custom','Custom Cookie','unknown packaging',20000,'/images/original.webp','original',9,1,1)`).run();
    await db.prepare("UPDATE products SET pack_label='Custom packaging' WHERE id='matcha'").run();
    const triggers = await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
    await apply("0008_product_units_per_pack.sql");
    expect((await db.prepare("SELECT id,stock,units_per_pack FROM products ORDER BY id").all()).results).toEqual([
      { id: "custom", stock: 9, units_per_pack: 1 }, { id: "matcha", stock: 8, units_per_pack: 1 }, { id: "original", stock: 37, units_per_pack: 3 },
    ]);
    expect((await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results).toEqual(triggers.results);
    await expect(db.prepare("UPDATE products SET units_per_pack=0 WHERE id='original'").run()).rejects.toThrow();
  } finally { await mf.dispose(); }
});
