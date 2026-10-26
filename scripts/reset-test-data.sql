-- WARNING:
-- Deletes transactional/test data only. ALL orders/payments are removed,
-- including unmatched payment records; there is no test/real-data filter.
-- Keeps products and schema. Keeps current stock without releasing reservations.
-- Keeps users, customer sessions, seller_sessions and request_limits.
-- Before remote use: pause order/payment writers, export a backup, inspect the
-- deployed schema/FKs/triggers, and capture scripts/verify-test-data-reset.sql.
-- Reviewed migrations: 0000 through 0009. No DELETE triggers exist there.
-- Do NOT cancel orders first: UPDATE status can release inventory a second time.
-- D1 manages transactions; do not add BEGIN/COMMIT or disable foreign keys.
DELETE FROM order_items;
DELETE FROM payments;
DELETE FROM orders;
