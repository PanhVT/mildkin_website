-- TEMPLATE ONLY. No real order has been selected/confirmed.
-- Replace BOTH tokens with the reviewed exact ID and code, or use the generator.
-- Do not run this template against remote. Never replace with a latest subquery.
-- Review deployed FKs and triggers first. DELETE does not restore reserved stock.
-- Do not cancel first, modify products, disable FKs, or add BEGIN/COMMIT.
-- Execute this entire small file once with Wrangler --file (not separate commands).
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE id='879d75ab-5a36-4d73-a299-2eeedcca1213' AND order_code='MK92E6CB3012'
);
DELETE FROM payments WHERE order_id IN (
  SELECT id FROM orders WHERE id='879d75ab-5a36-4d73-a299-2eeedcca1213' AND order_code='MK92E6CB3012'
);
DELETE FROM orders WHERE id='879d75ab-5a36-4d73-a299-2eeedcca1213' AND order_code='MK92E6CB3012';
