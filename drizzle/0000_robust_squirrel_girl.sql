CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name_snapshot` text NOT NULL,
	`price_snapshot` integer NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_quantity_valid" CHECK("order_items"."quantity" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE INDEX `items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_product_order_idx` ON `order_items` (`order_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_code` text NOT NULL,
	`access_token_hash` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`ward` text NOT NULL,
	`district` text NOT NULL,
	`city` text NOT NULL,
	`note` text,
	`subtotal` integer NOT NULL,
	`shipping_fee` integer NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	`payment_status` text DEFAULT 'PENDING' NOT NULL,
	`bank_code` text NOT NULL,
	`bank_account` text NOT NULL,
	`account_holder` text NOT NULL,
	`paid_payment_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`paid_at` integer,
	`expires_at` integer NOT NULL,
	CONSTRAINT "order_total_valid" CHECK("orders"."total" = "orders"."subtotal" + "orders"."shipping_fee" AND "orders"."subtotal" > 0 AND "orders"."shipping_fee" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_code_unique` ON `orders` (`order_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_access_token_hash_unique` ON `orders` (`access_token_hash`);--> statement-breakpoint
CREATE INDEX `orders_payment_status_idx` ON `orders` (`payment_status`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`provider` text NOT NULL,
	`provider_transaction_id` text NOT NULL,
	`amount` integer NOT NULL,
	`bank` text NOT NULL,
	`account` text NOT NULL,
	`content` text NOT NULL,
	`reference_code` text,
	`raw_payload` text NOT NULL,
	`resolution` text DEFAULT 'REVIEW' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_transaction_id_unique` ON `payments` (`provider_transaction_id`);--> statement-breakpoint
CREATE INDEX `payments_order_id_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`image_url` text NOT NULL,
	`flavor` text NOT NULL,
	`seasonal` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "product_price_positive" CHECK("products"."price" > 0),
	CONSTRAINT "stock_nonnegative" CHECK("products"."stock" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `request_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `request_limits_expiry_idx` ON `request_limits` (`expires_at`);