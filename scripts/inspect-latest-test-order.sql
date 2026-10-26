-- Read-only. Stable latest selection; this never selects a deletion target at write time.
SELECT o.id,o.order_code,o.customer_name,o.created_at,
  datetime(o.created_at/1000,'unixepoch','+7 hours') AS created_at_vietnam,
  o.status,o.payment_status,o.payment_method,o.total,
  (SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) AS item_rows,
  (SELECT COUNT(*) FROM payments p WHERE p.order_id=o.id) AS payment_rows,
  (SELECT json_group_array(json_object('id',i.id,'product_id',i.product_id,
    'product_name',i.product_name_snapshot,'quantity',i.quantity,'price',i.price_snapshot))
    FROM order_items i WHERE i.order_id=o.id) AS items_to_review,
  (SELECT json_group_array(json_object('id',p.id,'provider',p.provider,
    'transaction_id',p.provider_transaction_id,'amount',p.amount,'resolution',p.resolution))
    FROM payments p WHERE p.order_id=o.id) AS payments_to_review
FROM orders o ORDER BY o.created_at DESC,o.id DESC LIMIT 1;
SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY type,name;
-- Review every CREATE TABLE above for additional references to orders.
-- D1 forbids the table-valued pragma_foreign_key_list join; use supported PRAGMA statements.
PRAGMA foreign_key_list(order_items);
PRAGMA foreign_key_list(payments);
PRAGMA foreign_key_list(orders);
PRAGMA foreign_key_check;
SELECT id,name,stock FROM products ORDER BY name,id;
SELECT COUNT(*) AS orders_before FROM orders;
SELECT COUNT(*) AS users_before FROM users;
