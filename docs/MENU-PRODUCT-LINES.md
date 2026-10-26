# Menu product lines

Reuse `products.category` and `products.is_special`; no schema migration:

| Seller selection | category | is_special |
| --- | --- | --- |
| Mildkin Signature — Standard | COOKIE | 0 |
| Mildkin Signature — Special | COOKIE | 1 |
| Chunky Cookies | CHUNKY | 0 |

The menu fetches active products once, ordered by positive stock first, then
`created_at ASC, id ASC`. Server grouping preserves this order within each line.
Empty sections are hidden. Homepage selection remains independent.

Production IDs were inspected read-only on 2026-10-13. Original, Chocolate,
Matcha, Mixed and Mystery Face already have the correct Signature fields.
`db/backfill-product-lines.sql` updates only the three inspected IDs for Classic
cookie, Matcha Oreo and Cheesy Red Velvet. It preserves stock, prices, images,
pack labels and units per pack, and can safely be run again.

Production steps (not executed as part of this change):

1. Deploy code supporting the new category: `npm run deploy`.
2. Apply the data backfill:
   `npx wrangler d1 execute mildkin-db --remote --file=db/backfill-product-lines.sql`
3. Refresh `/menu` and `/seller/products` to verify the grouping.

No migration command is needed. Until backfill runs, the three existing Chunky
products retain their previous Signature classification. Seller can subsequently
change any product's line through the “Dòng sản phẩm” dropdown.
