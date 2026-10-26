ALTER TABLE `products` ADD `category` text DEFAULT 'COOKIE' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `is_special` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE products SET is_special=1 WHERE slug='mixed-mystery-face';
