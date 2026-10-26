# Mildkin seller dashboard

## Implementation files

New files:

- `app/start/page.tsx`
- `app/seller/layout.tsx`, `app/seller/login/page.tsx`, `app/seller/error.tsx`, `app/seller/loading.tsx`, `app/seller/seller.css`
- `app/seller/(dashboard)/layout.tsx`, `app/seller/(dashboard)/page.tsx`
- `app/seller/(dashboard)/orders/page.tsx`, `app/seller/(dashboard)/orders/[id]/page.tsx`
- `app/seller/(dashboard)/revenue/page.tsx`, `app/seller/(dashboard)/products/page.tsx`, `app/seller/(dashboard)/payments/page.tsx`
- `app/api/seller/[...path]/route.ts`
- `components/seller/controls.tsx`, `components/seller/navigation.tsx`, `components/seller/ui.tsx`
- `components/layout/buyer-chrome.tsx`
- `lib/seller/auth.ts`, `lib/seller/page-auth.ts`, `lib/seller/handler.ts`, `lib/seller/data.ts`
- `drizzle/0004_seller_sessions.sql`, `drizzle/meta/0004_snapshot.json`
- `scripts/seller-hash-password.mjs`, `tests/seller.test.ts`, `SELLER.md`

Modified files: `.dev.vars.example`, `package.json`, `lib/env.ts`, `lib/auth/rate-limit.ts`, `db/schema.ts`, `drizzle/meta/_journal.json`, `app/layout.tsx`, `components/layout/header.tsx`.

Pre-existing edits in the working tree were preserved. No dependencies were added.

Validation completed: typecheck, lint (no warnings), all 228 tests across 12 files (including 31 seller tests), Next.js production build, and OpenNext Cloudflare build. The initial sandboxed Next build reported a Wrangler log-directory permission error but exited successfully; the subsequent permitted Cloudflare build rebuilt Next and produced the Worker successfully. OpenNext emits its existing Windows compatibility warning. Interactive browser visual QA has not been performed.

The buyer storefront remains at `/`; the header's “Dành cho người bán” link opens `/seller/login`, which redirects to `/seller` when the seller session is valid. Guest checkout and `/login`, `/register`, `/account` keep their existing authentication and behavior. The optional `/start` selector remains available and links authenticated sellers to `/seller`, otherwise `/seller/login`.

## Configuration

Initial seller username should be configured as `PanhVT`. The desired password must be entered locally and stored only as a hash; no actual credentials are provided by the source code.

```sh
npm run seller:hash-password
```

The prompt hides input. Alternatively, provide `SELLER_PASSWORD` through the process environment (do not put a password in shell history). The script outputs `pbkdf2-sha256$100000$hash$salt`, matching the existing customer PBKDF2 utility. Treat the hash as a secret. It is verified by the existing `verifyPassword` function on the server.

For local development, copy the three placeholders from `.dev.vars.example` into the ignored `.dev.vars` and fill them locally. Preserve the literal `$` separators in the hash. Configure `SITE_URL` to match the exact local origin. Never paste secrets into tracked files.

Generate a separate random session secret of at least 32 characters, for example locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Configure Cloudflare using the interactive prompts:

```sh
npx wrangler secret put SELLER_USERNAME
npx wrangler secret put SELLER_PASSWORD_HASH
npx wrangler secret put SELLER_SESSION_SECRET
```

## Migration and release

New migration: `drizzle/0004_seller_sessions.sql`. It adds only `seller_sessions` (hashed session token, expiry and expiry index), enabling immediate server-side revocation at logout. Credentials are still stored exclusively in environment/secrets. No seller user or plaintext password is stored in D1. Existing migrations, order/inventory/payment triggers and production data are untouched. Drizzle metadata is included for future schema generation.

Apply the migration before running the new seller login:

```sh
npm run db:migrate:local
# Production, only when you are ready to release:
npm run db:migrate:remote
npm run deploy
```

This implementation does not deploy production or apply a remote migration. Do not seed or reset production as part of this release.

## Authentication and permissions

Seller login uses configured credentials, server-side PBKDF2 verification and a dedicated D1-backed rate-limit namespace. The session is an HS256 JWT with seller-specific issuer, audience, role, subject and random ID. Only a SHA-256 digest is stored in D1. Sessions expire after eight hours; logout deletes the stored digest and clears the cookie. Rotating the session secret invalidates all existing signed tokens. Expired session rows are cleaned at login.

Cookie: `mildkin_seller_session`; HttpOnly, SameSite=Lax, Path=/, Secure in production. Customer cookies never authorize seller access. Every data page verifies seller auth independently of the layout; every protected API goes through `requireSeller` before accessing business data. Mutations enforce the configured origin, bound JSON body size, and strict Zod validation. API responses use private/no-store caching. Seller pages are noindex. Secrets, raw payment payloads and guest order access tokens are excluded from returned business data.

## Pages

| Route                 | Contents                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `/start`              | Buyer/seller selection                                                                              |
| `/seller/login`       | Separate seller login                                                                               |
| `/seller`             | Today's paid revenue, new/pending/processing orders, latest five orders, low stock and top products |
| `/seller/orders`      | Server-side search, status filter and pagination                                                    |
| `/seller/orders/[id]` | Customer and pickup/delivery details, items, totals, SePay status and fulfillment update            |
| `/seller/revenue`     | Today/7 days/30 days/current month/custom dates, KPIs, daily chart, breakdown and best sellers      |
| `/seller/products`    | Product image, price, available inventory, paid units sold, availability filters and editing        |
| `/seller/payments`    | Real SePay transactions, received today, matched/review totals and pending orders                   |

All dashboard pages use the cream/pink/green seller shell with responsive navigation and horizontally scrollable tables. No chart dependency is added; chart bars have hover/focus tooltips and accessible value labels.

## API

Routes are dispatched through `app/api/seller/[...path]/route.ts`:

- `POST /api/seller/login`: public authentication endpoint; credentials, origin and rate limit enforced.
- `POST /api/seller/logout`: revoke session, clear cookie, redirect to seller login (303).
- `GET /api/seller/overview`
- `GET /api/seller/orders?q=&status=&page=`
- `GET /api/seller/orders/[id]`
- `PATCH /api/seller/orders/[id]`: `{ "status": "PREPARING" | "SHIPPING" | "COMPLETED" | "CANCELLED" }`
- `GET /api/seller/revenue?range=today|7|30|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/seller/products?filter=all|active|low|empty&page=`
- `PATCH /api/seller/products/[id]`: `price`, `stock`, `active`, `expectedStock`, `expectedPrice`, `expectedActive`.
- `GET /api/seller/payments?page=`

Collections have 25 rows per page. Revenue custom ranges are limited to 366 days. SQL aggregates run in D1; the server fills missing chart days with zero. Date boundaries are Vietnam local time, inclusive start / exclusive next-day end, based on `paid_at`. Paid revenue excludes cancelled and pending orders. Average order value includes shipping. Best-seller revenue uses immutable item price snapshots. Today's received payments includes recorded review transactions; matched/review counts use all recorded SePay history. `REVIEW` is shown as “Unmatched / Cần kiểm tra”, including transactions with an order reference that failed reconciliation.

Bank-transfer settlement enters PREPARING automatically; COD waits in PENDING_PAYMENT for seller acceptance before PREPARING. Fulfillment is PREPARING → SHIPPING → COMPLETED (pickup skips SHIPPING); completion requires payment PAID. See docs/ORDER-FLOW-PREPARATION.md. Only pending, unpaid orders can be cancelled; the existing release trigger restores reservations exactly once. Seller can confirm collected COD through the authenticated payment-status API; bank-transfer confirmation remains SePay-only. Paid cancellation/refunds are not introduced.

Product stock means available stock after current reservations, not total physical stock. Atomic compare-and-update prevents overwriting stock/price/availability changed after a page was loaded. A stale edit returns 409 and requires refresh. Existing reserve/release and payment settlement triggers continue to govern checkout.

## Validation

`tests/seller.test.ts` covers credential verification, hash-script compatibility, buyer/seller isolation, logout revocation, expiry/tampering, origin checks, rate limiting, real D1 metrics, paid-date revenue boundaries and exclusions, AOV, payments, order visibility/transitions/cancellation, product validation, unavailable products and reservation conflicts. Existing auth/D1 suites cover buyer login and guest checkout.

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:cloudflare
```
