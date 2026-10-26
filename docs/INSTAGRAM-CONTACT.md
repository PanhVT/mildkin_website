# Instagram customer contact

Checkout requires `customerInstagram` for delivery/pickup and guest/account orders.
The shared Zod schema trims, removes one leading @, lowercases, and extracts a
single profile segment from http(s) instagram.com/www.instagram.com URLs. It accepts
1–30 ASCII letters/numbers/underscore/dot, excluding consecutive/leading/trailing
dots. Invalid input returns “Vui lòng nhập tên Instagram hợp lệ.”.
Accounts currently have no Instagram property, so checkout asks for an order snapshot;
no account/profile migration is necessary.

## Database

`drizzle/0010_lively_mindworm.sql` adds nullable `customer_instagram TEXT` and
`instagram_contacted_at INTEGER` (Unix milliseconds). Legacy orders retain NULL;
new orders save the normalized username and start uncontacted. No old migrations,
reservation triggers, payment, delivery, stock or revenue rules change.

## Seller workflow

Order detail uses existing `/seller/orders/[id]` routing. The contact card opens
`https://www.instagram.com/{normalizedUsername}/` in a new tab with
`rel="noopener noreferrer"`. Invalid/missing historical usernames have no profile link.
The order list shows username/contact badge inside the customer cell and supports
`contact=uncontacted` (IS NULL), `contact=contacted` (IS NOT NULL), or all.

Authenticated seller endpoints, protected by requireSeller:

- `GET /api/seller/orders/:id/instagram-message`: loads customer, item snapshots,
  total, fulfillment and payment from DB. Only PREPARING/SHIPPING/COMPLETED orders
  qualify; bank transfers additionally require PAID. Returns a confirmation with
  customer greeting, code, items × quantities, formatted total, delivery/pickup,
  payment wording and Mildkin thanks. Unpaid COD says “Thanh toán khi nhận hàng”;
  paid orders say “Đã thanh toán”. Later order stages have accurate wording.
- `PATCH /api/seller/orders/:id/instagram-contact`, strict JSON `{ contacted: boolean }`:
  explicit true sets server Date.now() (retains original timestamp on retries);
  false clears NULL. Same-origin validation applies. Only contact metadata changes.

Copy uses Clipboard API and shows accessible success/error feedback without a
page reload. It fetches a fresh message so stale tabs cannot copy unconfirmed
orders. Copy and opening Instagram never mark contact. Marking updates the card
from the server response immediately, then refreshes server-rendered badges.
No Instagram API or automatic DM is used.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`,
`npm run build:cloudflare`. Verification on 2026-10-15: typecheck, lint, Next.js build and Cloudflare build
passed. The default test run and a full thread-pool attempt stalled; the project's
previously documented Windows invocation completed successfully:
`npm run test -- --pool=forks --reporter=verbose` — 31 files, 455 tests passed.
The 5 Instagram D1 tests also passed separately after switching the authorization
fixture to a genuine buyer session. OpenNext emitted its Windows compatibility
warning and successfully generated `.open-next/worker.js`. No deployment, remote
migration, database reset or production seed was performed.

Tests cover normalization/rejection, guest/account persisted snapshots, seller
access and same-origin enforcement, strict input, mark/unmark/idempotency,
unchanged order fields, NULL/NOT NULL filters, DB message generation and gating,
COD/paid transfer wording, copy/open independence, UI feedback and immediate undo.

## Production commands (manual; not executed by this change)

From the project directory, with Cloudflare credentials configured:

```powershell
npm run db:migrate:remote
npm run deploy
```

The migration command is `wrangler d1 migrations apply mildkin-db --remote` and
applies all pending migrations in `drizzle`, including existing pending migrations.
The deploy script builds Cloudflare artifacts before deploying. Apply the migration
before deploying code that selects the new columns. Do not reset D1 or seed production.
For local D1 only: `npm run db:migrate:local`.
