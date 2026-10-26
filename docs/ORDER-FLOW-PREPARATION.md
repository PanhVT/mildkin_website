# Order flow and preparation summary

Packaging update: [PREPARATION-PIECES.md](PREPARATION-PIECES.md) supersedes the original pack-count section below and adds migration 0008. The flow itself still requires no status migration.

## Flow

Both methods reuse `PENDING_PAYMENT`; no enum, schema or migration change.

| Method | Before | Now |
| --- | --- | --- |
| BANK_TRANSFER | Waiting payment → SePay → PAID (confirmed) → seller starts PREPARING | Waiting payment → SePay atomically sets payment PAID and order PREPARING |
| COD | Created directly in PREPARING | Waiting confirmation → seller accepts → PREPARING (payment remains PENDING) |

Delivery then follows PREPARING → SHIPPING → COMPLETED. Pickup skips SHIPPING. Completion still requires payment PAID. Existing cancellation and revenue rules remain unchanged.

`PENDING_PAYMENT` is displayed as “Chờ thanh toán” for bank transfer and “Chờ xác nhận” for COD. `PAID` remains an internal legacy order value, displayed as “Chờ chuẩn bị (đơn cũ)” for old records; it is omitted from the normal list filters. Existing legacy paid orders may still advance to PREPARING. Existing COD orders already in preparation are not reset.

## SePay and D1 atomicity

`lib/payments/sepay/handler.ts` batches two operations in one D1 transaction:

1. Insert the unique SePay receipt. The deployed settlement trigger validates provider, bank/account, exact amount, pending state and expiry; sets payment PAID, paid timestamp and linked receipt; and marks it MATCHED.
2. Advance only the order linked to **this newly inserted receipt ID**, with bank-transfer method, payment PAID and legacy order PAID, to PREPARING.

The trigger's intermediate order PAID state is never externally visible between the two atomic statements. If either statement fails, both roll back. Duplicate events do not insert a new receipt, so their generated receipt ID cannot match the update guard. Later SePay events cannot rewind SHIPPING/COMPLETED, reactivate CANCELLED/EXPIRED or double revenue. COD is excluded by both trigger and batch guard. No historical migration or trigger is edited.

Bank-transfer manual overrides remain unavailable. Seller COD collection is a separate, existing idempotent operation and reads the amount from D1.

## Seller confirmation

`/seller/orders/[id]` shows **Xác nhận & bắt đầu chuẩn bị** for awaiting COD orders. The authenticated same-origin PATCH sends only status PREPARING. Backend transition validation and snapshot compare guard the write. Confirmation changes only order status and updated timestamp; it neither collects money nor changes reserved stock.

## Preparation summary

`lib/seller/preparation.ts` performs one D1 aggregate query:

```sql
FROM orders o JOIN order_items i ON i.order_id=o.id
LEFT JOIN products p ON p.id=i.product_id
WHERE o.status='PREPARING'
GROUP BY i.product_id,p.image_url,p.pack_label
ORDER BY quantity DESC,name COLLATE NOCASE ASC,i.product_id ASC
```

`SUM(i.quantity)` counts ordered packs/items. Product ID is the identity; the product join is one-to-one. `MAX(i.product_name_snapshot)` chooses a deterministic representative snapshot when one product has multiple historical names. Product renames do not replace those snapshots. Current images and pack labels are presentation metadata only.

There is no `units_per_pack` field; no cookie counts are guessed or parsed from pack-label strings. No order pagination/search/payment/status list filter enters the aggregate. Both unpaid accepted COD and paid SePay preparation count. All other order statuses are excluded.

`/seller/orders` renders the card above its list filters/table, with total product types, total packs, thumbnails, missing-image placeholder, pack text, responsive grid and an explicit empty state.

`GET /api/seller/orders/preparation-summary` exposes the same safe aggregate behind requireSeller. The page calls sellerPageEnv before any data query; buyers and guests cannot view seller production data.

## Refresh and preserved behavior

Seller status writes already revalidate seller and buyer paths and refresh the current detail. SePay route now revalidates the same views after successful callbacks. The open orders list refreshes its Server Components every 15 seconds while visible and on focus/visibility restoration, retaining filters and without a browser reload. External callbacks therefore appear on the next poll; returning from detail refreshes through the existing revalidation/navigation flow.

Bank-transfer unpaid expiry still cancels and marks EXPIRED; paid orders and all COD orders do not expire through payment timeout. Reservation/release triggers are untouched. Creation reserves once; acceptance and payment do not reserve again; eligible cancellation releases once. Revenue continues to require payment PAID, paid timestamp and a non-cancelled sales state.

## Files

- `lib/orders/service.ts`
- `lib/payments/sepay/handler.ts`
- `lib/seller/order-status.ts`
- `lib/seller/handler.ts`
- `lib/seller/preparation.ts` (new)
- `app/api/webhooks/sepay/route.ts`
- `app/seller/(dashboard)/orders/page.tsx`
- `app/seller/(dashboard)/orders/[id]/page.tsx`
- `app/seller/seller.css`
- `components/seller/order-status-controls.tsx`
- `components/seller/ui.tsx`
- `components/seller/preparation-summary.tsx` (new)
- `components/seller/orders-refresh.tsx` (new)
- `components/auth/order-history.tsx`
- `app/account/orders/[orderCode]/page.tsx`
- `app/orders/[orderCode]/success/page.tsx`
- `tests/seller.test.ts`
- `tests/seller-status-controls.test.ts`
- `tests/seller-navigation.test.ts`
- `tests/cod-pages.test.ts`
- `tests/preparation-summary.test.ts` (new)
- `tests/orders-refresh.test.ts` (new)
- This report and updates to previous flow documentation.

No deployment, remote migration, D1 reset or inventory migration is performed. Production command, when ready: `npm run deploy`.

## Validation (2026-10-12)

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: 20 files, 349 tests passed. Uses real local Miniflare D1 for transactional, inventory, authorization, settlement and aggregation coverage.
- `npm run build`: passed.
- `npm run build:cloudflare`: passed; `.open-next/worker.js` generated. OpenNext emitted its Windows compatibility warning, and Next retried one page-generation attempt after 60 seconds before succeeding.

Tests verify both new flows; SePay repeat/late/invalid transactions; atomic rollback if preparation fails; no inventory double-release; no double revenue; paid bank and accepted unpaid COD inclusion; all non-PREPARING exclusions; product grouping, sorting, snapshots and filter independence; seller-only access; summary empty state/images; and visible-tab refresh with timer cleanup.
