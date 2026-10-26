-- Replace tokens with the SAME reviewed ID/code used in the deletion file.
SELECT COUNT(*) AS order_count FROM orders WHERE id='879d75ab-5a36-4d73-a299-2eeedcca1213';
SELECT COUNT(*) AS order_code_count FROM orders WHERE order_code='MK92E6CB3012';
SELECT COUNT(*) AS item_count FROM order_items WHERE order_id='879d75ab-5a36-4d73-a299-2eeedcca1213';
SELECT COUNT(*) AS payment_count FROM payments WHERE order_id='879d75ab-5a36-4d73-a299-2eeedcca1213';
SELECT id,name,stock FROM products ORDER BY name,id;
SELECT COUNT(*) AS other_order_count FROM orders;
SELECT COUNT(*) AS users_count FROM users;
PRAGMA foreign_key_check;
