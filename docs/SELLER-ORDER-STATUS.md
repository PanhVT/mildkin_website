# Seller order and payment status

Files changed for this work:

- `app/api/seller/[...path]/route.ts`
- `app/seller/(dashboard)/orders/page.tsx`
- `app/seller/(dashboard)/orders/[id]/page.tsx`
- `app/seller/seller.css`
- `components/seller/ui.tsx`
- `components/seller/order-status-controls.tsx` (new)
- `lib/seller/data.ts`
- `lib/seller/handler.ts`
- `lib/seller/order-status.ts` (new)
- `tests/seller.test.ts`
- `tests/seller-status-controls.test.ts` (new)
- `docs/SELLER-ORDER-STATUS.md` (new)

Seller controls are at `/seller/orders/[id]`. Each status has a separate select and save button, loading state and result message. Cancellation and COD collection require a confirmation dialog. Pickup completion skips shipping. Unpaid COD cannot be completed.

## Existing database values

Order: `PENDING_PAYMENT`, `PAID`, `PREPARING`, `SHIPPING`, `COMPLETED`, `CANCELLED`.
The legacy order stage `PAID` is displayed as “Chờ chuẩn bị (đơn cũ)”; new bank-transfer settlements enter PREPARING automatically. See [current flow and preparation summary](ORDER-FLOW-PREPARATION.md).
Payment: `PENDING`, `PAID`, `EXPIRED`, `FAILED`. No new values or migrations.

## Allowed transitions

- Bank-transfer checkout starts at `PENDING_PAYMENT`; SePay settlement advances it atomically to `PREPARING` with payment PAID.
- `PAID → PREPARING` remains available only for legacy orders.
- Delivery: `PREPARING → SHIPPING → COMPLETED`.
- Pickup: `PREPARING → COMPLETED`.
- Completion requires payment `PAID`.
- Unpaid `PENDING_PAYMENT`, `PREPARING`, `SHIPPING` orders can be cancelled.
- Terminal orders cannot move again. Existing policy forbidding cancellation of paid orders is retained. No refund operation is offered.
- COD starts at `PENDING_PAYMENT` (Chờ xác nhận); seller acceptance advances it directly to `PREPARING`, leaving payment PENDING.

## API and persistence

`PATCH /api/seller/orders/[id]/status` accepts only `{ "status": "..." }`.
The original `PATCH /api/seller/orders/[id]` remains supported with the same validation.

`PATCH /api/seller/orders/[id]/payment-status` accepts only `{ "status": "PAID" }` and only collects COD. The original COD collection endpoint remains supported.

All endpoints require same-origin requests and `requireSeller()`. Buyer sessions cannot authorize these writes. Guest orders are supported without a user ID.

Order writes compare the database snapshot of status, payment status, fulfillment and payment method. They write only order status and updated timestamp. Concurrent collection or expiry causes a stale write to fail safely.

COD collection uses the existing atomic insert/settlement trigger. Amount comes from `orders.total`, never from the client. The unique `cod:<order-id>` receipt prevents duplicate collection. The trigger sets `payment_status`, `paid_at`, `paid_payment_id`, and `updated_at`, preserving fulfillment status.

SePay remains the sole bank-transfer settlement source. Manual bank-transfer confirmation is deliberately unavailable in V1; no fabricated SePay payment or refund is created. Existing webhook idempotency and settlement rules are unchanged.

Cancellation uses the existing `release_reservation` trigger; repeat cancellation fails and cannot release twice. Payment changes and fulfillment progression do not release stock.

The orders list combines order and payment filters, with Vietnamese labels and pastel badges. Overview processing counts include `PENDING_PAYMENT`, `PAID`, `PREPARING`. Existing revenue policy is retained: only paid, dated, non-cancelled sales qualify. COD receipts flow into payments and provider revenue analytics immediately. Buyer history continues to read both statuses from D1 and stays read-only.

After successful writes, route revalidation invalidates seller pages, buyer order pages and the guest success page; `router.refresh()` updates the current detail without a browser reload.

## Validation and release

Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:cloudflare`.

D1 integration coverage includes forward transitions, terminal rejection, unpaid COD completion rejection, pickup skipping shipping, auth isolation, forged amount rejection, retry idempotency, inventory restoration, concurrent cancel/collection, revenue inclusion/exclusion and SePay settlement. UI rendering tests cover separate Vietnamese controls and read-only bank-transfer payments.

Production command (not executed): `npm run deploy`.
No D1 migration is needed and no remote migration is applied.

Verified on 2026-10-12: typecheck, lint, Next production build and Cloudflare build all passed. The complete test suite passed: 18 files, 330 tests, using `npm run test -- --pool=forks --reporter=verbose`. Earlier default test runs did not produce results and were stopped; the process-pool run completed successfully. OpenNext reported its existing Windows compatibility warning but generated `.open-next/worker.js` successfully.
