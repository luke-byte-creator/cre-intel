CREATE TABLE `retail_developments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`area` text,
	`address` text,
	`notes` text,
	`sort_order` integer DEFAULT 0,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `retail_tenants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`development_id` integer NOT NULL,
	`tenant_name` text NOT NULL,
	`category` text,
	`comment` text,
	`status` text DEFAULT 'active',
	`sort_order` integer DEFAULT 0,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_retail_tenants_dev` ON `retail_tenants` (`development_id`);--> statement-breakpoint
CREATE INDEX `idx_retail_tenants_name` ON `retail_tenants` (`tenant_name`);