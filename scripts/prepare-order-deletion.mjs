// Offline generator only: no database connection, Wrangler invocation or deletion.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export function pinOrderSql(template, id, code) {
  if (typeof id !== "string" || !id.trim() || id.length > 200 || /[\x00-\x1f]/.test(id)
    || id.includes("__CONFIRMED_") || typeof code !== "string" || !/^MK[A-F0-9]{10}$/.test(code)) {
    throw new Error("Supply the exact reviewed order ID and Mildkin order code.");
  }
  return template.replaceAll("__CONFIRMED_ORDER_ID__", id.replaceAll("'", "''"))
    .replaceAll("__CONFIRMED_ORDER_CODE__", code);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, code, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error("Usage: node scripts/prepare-order-deletion.mjs ORDER_ID ORDER_CODE");
  for (const [source, target] of [
    ["delete-latest-test-order.sql", "delete-confirmed-test-order.sql"],
    ["verify-single-order-deletion.sql", "verify-confirmed-test-order.sql"],
  ]) {
    const path = new URL(source, import.meta.url);
    const sql = pinOrderSql(await readFile(path, "utf8"), id, code);
    await writeFile(new URL(target, import.meta.url), sql, { flag: "wx" });
    console.log(`Prepared scripts/${target} for ${code}. Nothing executed.`);
  }
}
