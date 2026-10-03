ALTER TABLE `orders` ADD `shipping_method` text DEFAULT 'DELIVERY' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_distance_meters` integer;