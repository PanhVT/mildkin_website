ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'BANK_TRANSFER' NOT NULL CHECK (payment_method IN ('BANK_TRANSFER','COD'));
--> statement-breakpoint
-- Extend cancellation to unpaid COD fulfillment. A second cancellation cannot release twice.
DROP TRIGGER release_reservation;
--> statement-breakpoint
CREATE TRIGGER release_reservation AFTER UPDATE OF status ON orders
WHEN NEW.status='CANCELLED' AND OLD.status<>'CANCELLED'
  AND (OLD.status='PENDING_PAYMENT' OR (OLD.payment_method='COD' AND OLD.payment_status='PENDING'))
BEGIN
  UPDATE products SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id), updated_at=NEW.updated_at
    WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
END;
--> statement-breakpoint
-- Only SePay can settle bank-transfer orders; COD receipts are inserted by the seller API.
DROP TRIGGER settle_payment;
--> statement-breakpoint
CREATE TRIGGER settle_payment AFTER INSERT ON payments
BEGIN
  UPDATE orders SET payment_status='PAID', status='PAID', paid_at=NEW.created_at, updated_at=NEW.created_at, paid_payment_id=NEW.id
    WHERE id=NEW.order_id AND payment_method='BANK_TRANSFER' AND NEW.provider='sepay'
      AND payment_status='PENDING' AND status='PENDING_PAYMENT'
      AND expires_at>NEW.created_at AND total=NEW.amount AND bank_code=NEW.bank AND bank_account=NEW.account;
  UPDATE orders SET payment_status='PAID', paid_at=NEW.created_at, updated_at=NEW.created_at, paid_payment_id=NEW.id
    WHERE id=NEW.order_id AND payment_method='COD' AND NEW.provider='cod'
      AND payment_status='PENDING' AND status IN ('PREPARING','SHIPPING','COMPLETED')
      AND total=NEW.amount AND NEW.provider_transaction_id='cod:'||id;
  UPDATE payments SET resolution=CASE WHEN EXISTS(SELECT 1 FROM orders WHERE paid_payment_id=NEW.id) THEN 'MATCHED' ELSE 'REVIEW' END WHERE id=NEW.id;
END;
