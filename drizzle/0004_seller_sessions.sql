CREATE TABLE `seller_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seller_sessions_expiry_idx` ON `seller_sessions` (`expires_at`);