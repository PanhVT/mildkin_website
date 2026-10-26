# Seller delivery and NEU handoff

## Delivery list redesign (2026-10-13)

`components/seller/delivery-table.tsx` replaces the large per-order cards in the delivery page. At widths of 900px and above, it renders a semantic table with nine columns: code, customer, fulfillment, address/pickup point, payment, order status, delivery/handoff, assignee, actions. The rounded container scrolls horizontally when needed, preventing page overflow. At mobile widths the same rows/cells become compact labeled cards; no duplicated forms or select IDs.

Assignment uses the existing DeliveryControls with a table presentation option: 170px select, a small Save button only for a changed selection, and completed assignments displayed as read-only text. Unassigned rows have a focus-to-select action. Existing start/complete requests, confirmation for reassignment, deadline, finally cleanup, toast and router refresh are retained. Filters, KPI/workload, sorting, authentication, database and all business rules are unchanged.

CSS is in `app/seller/seller.css`. Tests cover nine semantic columns, pickup addresses/labels, completed/empty states, and both table and existing detail controls under success and request failures. Browser screenshot verification was attempted but the in-app browser automation failed to initialize; responsive behavior is implemented in CSS and markup tests, not verified by screenshots.

Redesign validation: typecheck, lint, Next production build and Cloudflare build passed; `npm run test` passed all 397 tests in 27 files. Cloudflare generated `.open-next/worker.js` with its standard Windows compatibility warning. No schema migration is needed for this presentation change. No deployment was performed.

## Page and access

`/seller/delivery`: `app/seller/(dashboard)/delivery/page.tsx`. Sidebar entry **Giao hàng & Bàn giao** uses Truck in `components/seller/navigation.tsx`. The page calls sellerPageEnv before reading D1. `GET /api/seller/delivery` and `PATCH /api/seller/delivery/:id` reuse the seller catch-all handler, requireSeller and same-origin validation for writes. Buyers cannot assign people at checkout.

The dashboard includes PREPARING and SHIPPING orders plus COMPLETED within 30 days (delivered_at, falling back to updated_at). CANCELLED, expired payments and waiting confirmation/payment are excluded. Pickup cards do not display addresses. Status, assignee, fulfillment and escaped code/name/phone search are supported, 25 orders per page. Sorting: unassigned, waiting, in delivery, completed; newest first within each group.

## Schema and migration

`drizzle/0009_delivery_assignment.sql` adds nullable TEXT delivery_assignee; TEXT delivery_status NOT NULL DEFAULT UNASSIGNED (CHECK whitelist); nullable INTEGER assigned_at, delivery_started_at and delivered_at (epoch milliseconds). It adds orders_delivery_idx on status, delivery_status, delivery_assignee. Schema and Drizzle metadata match the migration. Historical migrations are untouched; no table rebuild, reset, or trigger replacement.

New orders start unassigned and retain that default when entering PREPARING through COD confirmation or SePay. Existing SHIPPING delivery orders are backfilled IN_DELIVERY with delivery_started_at from updated_at. Existing COMPLETED orders get delivery_status COMPLETED and delivered_at from updated_at. These are legacy timestamp approximations, not reconstructed event times. No names are invented: legacy shipping rows must be assigned before completion; legacy completed rows remain read-only with unknown assignee.

## Whitelist and flows

`lib/seller/delivery-config.ts` contains the fixed whitelist: Hồng Anh, Thuỳ Anh, Phương Anh, Vi Anh, Thái Thư, Ngô Thư, Hoàng Hà. Zod validates the whitelist on the server.

- DELIVERY: UNASSIGNED → assign → WAITING → IN_DELIVERY → COMPLETED. Order status is PREPARING → SHIPPING → COMPLETED (SHIPPING is the existing schema's delivery state).
- PICKUP: UNASSIGNED → assign → WAITING (**Chờ khách nhận**) → COMPLETED (**Đã bàn giao**). No start-delivery action.
- Both methods require an assignee before starting delivery or completing handoff. Existing order detail PATCH also enforces this, with a link to assignment.
- Order detail now includes an inline assignment form using the same delivery endpoint. Its detail query returns delivery_assignee and delivery_status; after saving a person, router.refresh updates these props and the seller can save SHIPPING directly in Orders. This resolves the previous UX gap where the backend required assignment but detail only linked to another page.
- Completion requires payment PAID. For unpaid COD, collect payment using existing detail controls first. Assignment/start never mark payment paid. Bank transfers still use SePay.
- Order/detail and delivery actions share updateSellerOrder in `lib/seller/data.ts`. Order/delivery stages and milestone timestamps update in one conditional SQL statement. Payment, order stage, fulfillment, assignee and delivery stage are compared to the read snapshot, rejecting concurrent changes instead of overwriting them.
- The legacy admin order PATCH also uses the shared guard/sync to prevent bypasses, retaining admin authentication and its paid-only requirement. It revalidates seller/admin/buyer paths after success.
- Assignment uses its own compare-and-set, retains first assigned_at and delivery_started_at on reassignment, and requires explicit confirmation while IN_DELIVERY. Completed/cancelled orders cannot be reassigned or reopened; delivered_at is never reset.

## Queries and refresh

`lib/seller/delivery.ts` uses one D1 batch of four queries: global KPI COUNT GROUP BY delivery_status; active workload COUNT and SUM(in delivery) GROUP BY delivery_assignee; filtered/paginated rows; filtered count. KPI and workload do not depend on list filters. Workload excludes completed, cancelled and expired orders. All seven names appear, including zero counts. No per-row queries.

`components/seller/delivery-controls.tsx` has a duplicate-submit lock and try/catch/finally to reset loading, JSON 200 success responses, API/network error feedback, router.refresh and a success toast retained outside the filtered list. Successful writes revalidate seller layout and existing buyer paths in the API route. Existing visible-tab 15-second/focus polling also updates the page. No hard browser reload.

Order status, payment status and delivery controls now use `lib/seller/request.ts`: a 20-second deadline covers response headers and JSON parsing. Before this, a pending fetch/body promise could prevent finally from executing indefinitely despite an otherwise correct finally block. The timeout aborts the request and releases loading; controls refresh after both success and error because the database may already have committed. This is verified with stalled-request tests; the specific production network/server delay has not been observed directly.

Revenue/stock/payment SQL and triggers are unchanged. Starting or assigning does not reserve stock again. Cancellation continues through existing stock-release logic. Moving out of PREPARING updates the existing preparation summary through the same revalidation.

## Files

- New: delivery page, `lib/seller/delivery.ts`, `lib/seller/delivery-config.ts`, `components/seller/delivery-controls.tsx`, migration 0009 and its Drizzle snapshot, this document.
- Updated: schema/journal, seller API handler and route revalidation, legacy admin order route, `lib/seller/data.ts`, navigation, order-status-controls link, seller CSS.
- Tests: seller integration and navigation tests; new delivery-controls, delivery-migration and admin-delivery tests.

## Production commands (not executed)

Apply schema migration before deployment:

```powershell
npm run db:migrate:remote
npm run deploy
```

No remote migration or deployment is performed in this task.

## Validation (2026-10-12)

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: 23 files / 380 tests passed, including delivery integration, controls and migration. After the legacy admin guard was added, its targeted suite passed all 3 additional tests (383 passing tests in total).
- `npm run build`: passed, with `/seller/delivery` in the generated route list.
- `npm run build:cloudflare`: passed after the final admin-route change; its nested Next production build also passed. `.open-next/worker.js` generated. OpenNext emitted its standard Windows compatibility warning.
- UI controls tests cover success, API failure, network failure, invalid JSON, duplicate clicks, pickup actions and reassignment confirmation. Migration tests preserve existing order financial fields, product stock and exact trigger definitions while verifying legacy backfill.

Follow-up Orders loading fix: full suite passed 24 files / 385 tests after inline assignment was added. The targeted request/control suites then passed, including 5 new tests for stalled headers/body, timer cleanup and loading release for both order and payment writes. Typecheck and lint passed after the timeout change.
