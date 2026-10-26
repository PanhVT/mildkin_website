-- Replace tokens with the SAME reviewed ID/code used in the deletion file.
SELECT COUNT(*) AS order_count FROM orders WHERE id='__CONFIRMED_ORDER_ID__';
SELECT COUNT(*) AS order_code_count FROM orders WHERE order_code='__CONFIRMED_ORDER_CODE__';
SELECT COUNT(*) AS item_count FROM order_items WHERE order_id='__CONFIRMED_ORDER_ID__';
SELECT COUNT(*) AS payment_count FROM payments WHERE order_id='__CONFIRMED_ORDER_ID__';
SELECT id,name,stock FROM products ORDER BY name,id;
SELECT COUNT(*) AS other_order_count FROM orders;
SELECT COUNT(*) AS users_count FROM users;
PRAGMA foreign_key_check;
