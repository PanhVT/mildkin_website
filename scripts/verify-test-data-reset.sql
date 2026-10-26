-- Run BEFORE and AFTER; compare products_snapshot and users/auth counts.
-- Compatible with older local schemas (no delivery/units_per_pack requirement).
SELECT 'orders' AS entity, COUNT(*) AS count FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'users', COUNT(*) FROM users;
SELECT 'sessions' AS entity, COUNT(*) AS count FROM sessions;
SELECT 'seller_sessions' AS entity, COUNT(*) AS count FROM seller_sessions;
SELECT 'request_limits' AS entity, COUNT(*) AS count FROM request_limits;
-- Includes ALL catalog fields, images, prices, packaging, stock and timestamps.
SELECT * FROM products ORDER BY id;
-- Zero orders also means zero delivery records: delivery is embedded in orders.
SELECT COUNT(*) AS delivery_orders FROM orders WHERE shipping_method='DELIVERY';
SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS successful_orders,
  COALESCE(AVG(total),0) AS aov
FROM orders WHERE payment_status='PAID'
  AND status IN ('PAID','PREPARING','SHIPPING','COMPLETED');
PRAGMA foreign_key_check;
