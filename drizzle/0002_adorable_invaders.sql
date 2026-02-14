CREATE TABLE `office_buildings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`street_number` text,
	`neighborhood` text,
	`building_name` text,
	`building_class` text,
	`floors` integer,
	`year_built` integer,
	`total_sf` integer,
	`contiguous_block` integer,
	`direct_vacant_sf` integer,
	`sublease_sf` integer,
	`total_vacant_sf` integer,
	`total_available_sf` integer,
	`vacancy_rate` real,
	`net_asking_rate` real,
	`op_cost` real,
	`gross_rate` real,
	`listing_agent` text,
	`parking_type` text,
	`parking_ratio` text,
	`owner` text,
	`parcel_number` text,
	`comments` text,
	`data_source` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_office_buildings_class` ON `office_buildings` (`building_class`);--> statement-breakpoint
CREATE INDEX `idx_office_buildings_address` ON `office_buildings` (`address`);--> statement-breakpoint
CREATE TABLE `office_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`building_id` integer NOT NULL,
	`floor` text NOT NULL,
	`suite` text,
	`area_sf` integer,
	`tenant_name` text,
	`is_vacant` integer DEFAULT 0,
	`is_sublease` integer DEFAULT 0,
	`listing_agent` text,
	`notes` text,
	`verified_date` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_office_units_building` ON `office_units` (`building_id`);--> statement-breakpoint
CREATE INDEX `idx_office_units_tenant` ON `office_units` (`tenant_name`);