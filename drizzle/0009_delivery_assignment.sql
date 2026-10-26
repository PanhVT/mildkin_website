-- Add columns only: do not rebuild orders or replace reservation/payment triggers.
ALTER TABLE orders ADD COLUMN delivery_assignee TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'UNASSIGNED' CONSTRAINT delivery_status_valid CHECK (delivery_status IN ('UNASSIGNED','WAITING','IN_DELIVERY','COMPLETED'));
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN assigned_at INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN delivery_started_at INTEGER;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN delivered_at INTEGER;
--> statement-breakpoint
CREATE INDEX orders_delivery_idx ON orders(status,delivery_status,delivery_assignee);
--> statement-breakpoint
-- Preserve operational stage of legacy rows; never invent an assignee.
UPDATE orders SET delivery_status='IN_DELIVERY',delivery_started_at=updated_at WHERE status='SHIPPING' AND shipping_method='DELIVERY';
--> statement-breakpoint
UPDATE orders SET delivery_status='COMPLETED',delivered_at=updated_at WHERE status='COMPLETED';
