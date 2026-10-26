-- TEMPLATE ONLY. No real order has been selected/confirmed.
-- Replace BOTH tokens with the reviewed exact ID and code, or use the generator.
-- Do not run this template against remote. Never replace with a latest subquery.
-- Review deployed FKs and triggers first. DELETE does not restore reserved stock.
-- Do not cancel first, modify products, disable FKs, or add BEGIN/COMMIT.
-- Execute this entire small file once with Wrangler --file (not separate commands).
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE id='__CONFIRMED_ORDER_ID__' AND order_code='__CONFIRMED_ORDER_CODE__'
);
DELETE FROM payments WHERE order_id IN (
  SELECT id FROM orders WHERE id='__CONFIRMED_ORDER_ID__' AND order_code='__CONFIRMED_ORDER_CODE__'
);
DELETE FROM orders WHERE id='__CONFIRMED_ORDER_ID__' AND order_code='__CONFIRMED_ORDER_CODE__';
