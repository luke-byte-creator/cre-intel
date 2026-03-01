PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_retail_tenants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`development_id` integer NOT NULL,
	`tenant_name` text NOT NULL,
	`category` text,
	`comment` text,
	`status` text DEFAULT 'active',
	`area_sf` real,
	`unit_suite` text,
	`net_rent_psf` real,
	`annual_rent` real,
	`lease_start` text,
	`lease_expiry` text,
	`term_months` integer,
	`rent_steps` text,
	`lease_type` text,
	`sort_order` integer DEFAULT 0,
	`updated_at` text
);
--> statement-breakpoint
INSERT INTO `__new_retail_tenants`("id", "development_id", "tenant_name", "category", "comment", "status", "area_sf", "unit_suite", "net_rent_psf", "annual_rent", "lease_start", "lease_expiry", "term_months", "rent_steps", "lease_type", "sort_order", "updated_at") SELECT "id", "development_id", "tenant_name", "category", "comment", "status", "area_sf", "unit_suite", "net_rent_psf", "annual_rent", "lease_start", "lease_expiry", "term_months", "rent_steps", "lease_type", "sort_order", "updated_at" FROM `retail_tenants`;--> statement-breakpoint
DROP TABLE `retail_tenants`;--> statement-breakpoint
ALTER TABLE `__new_retail_tenants` RENAME TO `retail_tenants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_retail_tenants_dev` ON `retail_tenants` (`development_id`);--> statement-breakpoint
CREATE INDEX `idx_retail_tenants_name` ON `retail_tenants` (`tenant_name`);