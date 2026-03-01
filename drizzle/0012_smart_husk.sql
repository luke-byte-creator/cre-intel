ALTER TABLE `office_units` ADD `asking_rent` real;--> statement-breakpoint
ALTER TABLE `office_units` ADD `rent_basis` text;--> statement-breakpoint
ALTER TABLE `office_units` ADD `listing_brokerage` text;--> statement-breakpoint
ALTER TABLE `office_units` ADD `available_date` text;--> statement-breakpoint
ALTER TABLE `office_units` ADD `source` text;--> statement-breakpoint
ALTER TABLE `office_units` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `office_units` ADD `last_seen` text;--> statement-breakpoint
ALTER TABLE `office_units` ADD `status` text DEFAULT 'active';--> statement-breakpoint
CREATE INDEX `idx_office_units_status` ON `office_units` (`status`);--> statement-breakpoint
CREATE INDEX `idx_office_units_source` ON `office_units` (`source`);