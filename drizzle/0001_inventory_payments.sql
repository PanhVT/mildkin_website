-- These triggers are part of the migration, not runtime setup. Keep their deployed version in drizzle/.
-- Validate and reserve stock in the same atomic D1 batch as order creation.
CREATE TRIGGER reserve_item BEFORE INSERT ON order_items
BEGIN
  SELECT (
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM products
        WHERE id = NEW.product_id
          AND active = 1
          AND stock >= NEW.quantity
          AND price = NEW.price_snapshot
          AND name = NEW.product_name_snapshot
      )
      THEN RAISE(ABORT, 'stock_or_price_changed')
    END
  );

  UPDATE products
  SET
    stock = stock - NEW.quantity,
    updated_at = (
      SELECT created_at
      FROM orders
      WHERE id = NEW.order_id
    )
  WHERE id = NEW.product_id;
END;
--> statement-breakpoint
-- Only the first cancellation releases reservations. Paid orders are never cancelled by expiry.
CREATE TRIGGER release_reservation AFTER UPDATE OF status ON orders
WHEN NEW.status='CANCELLED' AND OLD.status='PENDING_PAYMENT'
BEGIN
  UPDATE products SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id), updated_at=NEW.updated_at
    WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
END;
--> statement-breakpoint
-- An inserted payment and order settlement form one atomic statement, including retries/races.
-- Bank and account use the order snapshot, allowing later bank configuration changes.
CREATE TRIGGER settle_payment AFTER INSERT ON payments
BEGIN
  UPDATE orders SET payment_status='PAID', status='PAID', paid_at=NEW.created_at, updated_at=NEW.created_at, paid_payment_id=NEW.id
    WHERE id=NEW.order_id AND payment_status='PENDING' AND status='PENDING_PAYMENT'
      AND expires_at>NEW.created_at AND total=NEW.amount AND bank_code=NEW.bank AND bank_account=NEW.account;
  UPDATE payments SET resolution=CASE WHEN EXISTS(SELECT 1 FROM orders WHERE paid_payment_id=NEW.id) THEN 'MATCHED' ELSE 'REVIEW' END WHERE id=NEW.id;
END;
