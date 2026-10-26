# Preparation pieces (2026-10-12)

This supersedes the pack-count section of ORDER-FLOW-PREPARATION.md.

- UI: `components/seller/preparation-summary.tsx`, rendered above filters by `app/seller/(dashboard)/orders/page.tsx`.
- Query: `lib/seller/preparation.ts`, one D1 aggregate with `WHERE o.status='PREPARING'`. No payment, pagination or table filter. Groups by product ID and sorts total pieces descending, snapshot name ascending.
- Formula: `SUM(i.quantity * p.units_per_pack)`. `SUM(i.quantity)` is retained only for optional pack information. Labels are never parsed. The footer sums aggregated pieces.
- Names use order-item snapshots; image, label and numeric packaging use current products. Editing packaging changes preparation counts for existing PREPARING orders, but never changes stored financial totals or order-item quantities. There is no numeric packaging snapshot in the existing schema.
- Schema: new `products.units_per_pack INTEGER NOT NULL DEFAULT 1`, positive constraint. Migration `drizzle/0008_product_units_per_pack.sql` adds the column without rebuilding tables or touching inventory triggers. Drizzle snapshot/journal updated.
- Backfill: explicit known seed IDs `original`, `chocolate`, `matcha`, `mixed`, `mixed-mystery-face` receive 3 only when their slug still equals ID and label is the known seed label or null. This is a guarded seed mapping, not parsing label text. Seed SQL now stores 3 explicitly.
- Unknown/customized products remain at default 1, which is a migration fallback, not a verified packaging size. No production database was queried. Sellers must review customized products in the new **Số bánh trong mỗi gói** input (integer 1–10000). Existing API clients omitting the field retain the value on update; create defaults to 1.
- Seller writes retain revalidation and router refresh. Orders list refreshes every 15 seconds while visible and when focus returns. No browser reload. Seller authentication protects page and summary API.
- Tests cover numeric examples, mixed sizes, sorting, misleading labels, status changes, financial-total preservation, JSON/multipart validation, and migration preservation of stock/triggers, alongside existing flow/auth tests.

Review products requiring packaging verification after migration:

```sql
SELECT id, name, pack_label, units_per_pack FROM products
WHERE NOT (
  id IN ('original','chocolate','matcha','mixed','mixed-mystery-face')
  AND slug=id AND (pack_label='3 cookies / pack' OR pack_label IS NULL)
)
ORDER BY name;
```

Production commands when authorized (not executed in this task):

```powershell
npm run db:migrate:remote
npm run deploy
```

Apply the migration before deploying code that queries the new column. Do not run remote seed as a substitute for migration/backfill.

Files changed for this upgrade:

- `db/schema.ts`, `db/seed.sql`
- `drizzle/0008_product_units_per_pack.sql`, `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json`
- `lib/seller/preparation.ts`, `lib/seller/data.ts`, `lib/seller/product-validation.ts`, `lib/seller/product-write.ts`
- `components/seller/preparation-summary.tsx`, `components/seller/product-form.tsx`, `app/seller/seller.css`
- `tests/preparation-summary.test.ts`, `tests/seller.test.ts`, `tests/units-migration.test.ts`
- `tests/homepage.test.ts`, `tests/product-card.test.ts` (typed product fixtures)
- This document and the supersession note in `docs/ORDER-FLOW-PREPARATION.md`.

Validation: typecheck and lint passed; 21 test files / 364 tests passed; production Next build and Cloudflare build passed (`.open-next/worker.js` generated). OpenNext emitted its Windows compatibility warning. Tests use isolated local Miniflare databases, not production D1. No deployment or remote migration was performed.
