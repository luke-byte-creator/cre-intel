CREATE TABLE `market_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`metric` text NOT NULL,
	`year` integer NOT NULL,
	`is_forecast` integer DEFAULT 0 NOT NULL,
	`value` real,
	`is_override` integer DEFAULT 0 NOT NULL,
	`updated_at` text,
	`updated_by` integer
);
--> statement-breakpoint
CREATE INDEX `idx_market_stats_lookup` ON `market_stats` (`category`,`metric`,`year`);