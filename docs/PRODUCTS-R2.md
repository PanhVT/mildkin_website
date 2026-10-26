# Seller products, D1 catalog and R2 images

## Implementation

- D1 remains the only product source of truth. `getCatalogProducts` queries active records and does not exclude zero stock. `/menu` is rendered dynamically.
- Existing `description`, `image_url`, `active`, IDs, slugs, prices and inventory are reused. New fields: `category TEXT NOT NULL DEFAULT 'COOKIE'`, `is_special INTEGER NOT NULL DEFAULT false`.
- New migration `drizzle/0005_vengeful_skin.sql` adds these fields and marks existing `mixed-mystery-face` as special. No old migration, product, order or reservation/payment trigger is removed. The seed marks Mystery Face special on fresh installations and remains non-overwriting.
- Seller: `/seller/products` → **+ Thêm sản phẩm** → `/seller/products/new`. Image preview, name, description, integer VND price, available stock, category, special and active switches. Existing products have **Sửa sản phẩm** for these fields, including replacement image and hiding via Đang bán.
- `POST /api/seller/products` and multipart `PATCH /api/seller/products/:id` perform both upload and persistence. There is no independent upload step that can leave an abandoned image when a seller cancels a form. Existing JSON PATCH price/stock/active clients remain supported.
- Every mutation requires the existing seller session and same-origin check. Buyer sessions do not authorize seller access.
- Multipart requests are bounded to 5 MB plus 32 KB form overhead. Files are limited to 5 MB; JPEG/PNG/WebP MIME and signatures are checked; SVG and arbitrary filenames are rejected/ignored. No native processing dependency is added.
- Binding: `PRODUCT_IMAGES`. Private bucket: `mildkin-product-images`. Keys are generated UUIDs with verified type extensions. D1 stores only `/api/product-images/<uuid>.<extension>`, never image bytes.
- On save: validate → upload to R2 → insert/update D1 → success. D1 failure triggers best-effort deletion of the uploaded object. After a successful replacement, only a previous uploaded UUID image is deleted; static assets are preserved. Cleanup failure is logged without misreporting a committed product write as failed.
- `GET /api/product-images/[key]` restricts keys to UUID JPEG/PNG/WebP files and reads the private binding. Responses use the corresponding image MIME, `nosniff`, and `public, max-age=31536000, immutable`; every upload gets a new key.
- Slugs are generated server-side from normalized names plus a UUID suffix, avoiding concurrent duplicate-name collisions. Existing slugs are preserved when editing.
- Edits compare both expected available stock and `updated_at`. If checkout or another edit changed the product, the seller gets a conflict message and must reload. Stock means currently available packs, after reservations.
- Regular and special products share ProductCard. Zero stock dims only the image (opacity .45 / grayscale .2), adds a light overlay and **Hết hàng**, and disables purchase. Names/prices remain readable. Inactive products are excluded entirely.
- The Special section uses a responsive grid with cards capped at 400 px instead of the former two-column banner. Mystery Face and every future `is_special=true` record follow the same logic.
- Cart continues sending product ID + quantity. Checkout reads trusted D1 price/name/active/stock and retains atomic reserve/release triggers. UUID IDs fit existing cart validation. Existing order item snapshots are unchanged when product names or prices change.

## Files added by this change

- `lib/seller/product-write.ts`
- `app/api/product-images/[key]/route.ts`
- `components/seller/product-form.tsx`
- `app/seller/(dashboard)/products/new/page.tsx`
- `drizzle/0005_vengeful_skin.sql`
- `drizzle/meta/0005_snapshot.json`
- `tests/product-card.test.ts`
- `tests/product-images.test.ts`
- `docs/PRODUCTS-R2.md`

## Existing working-tree files edited by this change

The workspace already contained unrelated uncommitted changes and seller dashboard files; those were preserved.

- `db/schema.ts`, `db/seed.sql`, `drizzle/meta/_journal.json`
- `lib/env.ts`, `lib/catalog.ts`, `lib/seller/handler.ts`, `lib/seller/data.ts`
- `wrangler.jsonc`, `worker-configuration.d.ts`
- `app/menu/page.tsx`, `app/menu/menu.css`, `app/globals.css`
- `components/products/product-card.tsx`, `components/products/product-purchase.tsx`, `components/products/mystery-face.tsx`
- `app/seller/(dashboard)/products/page.tsx`, `app/seller/seller.css`
- `tests/auth.test.ts`, `tests/d1.test.ts`, `tests/seller.test.ts`

## Local development

OpenNext development integration already calls `initOpenNextCloudflareForDev`. Wrangler emulates the R2 binding locally; no production bucket is needed for local uploads. Local state lives in Wrangler persistence, not `public/uploads`. Tests use isolated Miniflare D1/R2 bindings and do not use production storage.

```powershell
npm run db:migrate:local
# Only for a fresh development database; never required to create a seller product:
npm run db:seed
npm run dev
```

Configure local `SITE_URL` in `.dev.vars` to match the browser origin (e.g. `http://localhost:3000`), together with existing seller credentials/session secret, so same-origin checks pass. Do not commit secret values.

Worker preview, if desired:

```powershell
npm run preview
```

## Before production

1. Review the migration and preserve a database backup using your normal procedure.
2. Create the private bucket once in the same Cloudflare account as the Worker:

```powershell
npx wrangler r2 bucket create mildkin-product-images
```

3. Apply the additive production migration before deploying code that queries the new fields:

```powershell
npm run db:migrate:remote
```

4. Verify `PRODUCT_IMAGES` binding, D1 binding, production `SITE_URL`, seller secrets, and existing payment configuration.
5. Deploy when ready:

```powershell
npm run deploy
```

6. Smoke-test seller image upload/create/edit, buyer Standard/Special, zero stock, inactive products, checkout and order history.

No remote migration, production bucket creation, or deployment was performed by this implementation. Failed best-effort R2 cleanup can leave an unused object; investigate the cleanup log if it occurs. Do not delete arbitrary static assets or currently referenced image objects.

## Verification results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: 257 tests passed across 14 files; the subsequently added image-serving suite passed 7/7 tests (264 total across 15 files).
- `npm run build`: passed.
- `npm run build:cloudflare`: passed, Worker generated at `.open-next/worker.js`; rerun outside the sandbox completed without Wrangler log permission errors.
- `npm run cf:typegen`: passed with the new R2 binding.
- D1/R2 integration coverage: seller authorization, create and repeated names, active/special catalog records, zero-stock checkout rejection, invalid field/image rejection, valid JPEG/PNG/WebP signatures, uploaded-image replacement, stale-edit cleanup, failed-insert cleanup, new-ID checkout, snapshot retention, stock reservation and release.
- Render tests cover sold-out normal/special cards, disabled purchase, available inventory and escaped plain-text description. Image-serving tests cover traversal/invalid keys, missing objects and response headers.
- Existing authentication, seller dashboard, shipping, payment and inventory regression suites pass.
- Browser/manual visual smoke testing was not performed. No production or persistent local database migration was applied; migration tests run on disposable local databases.
- Non-blocking tool warnings: OpenNext recommends WSL for Windows; Vite warns about future native config loading behavior.
