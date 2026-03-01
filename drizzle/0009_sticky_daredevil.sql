CREATE TABLE `industrial_vacancies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`building_id` integer,
	`address` text NOT NULL,
	`available_sf` real,
	`total_building_sf` real,
	`listing_brokerage` text,
	`listing_type` text,
	`quarter_recorded` text NOT NULL,
	`year_recorded` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_industrial_vacancies_address` ON `industrial_vacancies` (`address`);--> statement-breakpoint
CREATE INDEX `idx_industrial_vacancies_quarter` ON `industrial_vacancies` (`quarter_recorded`);--> statement-breakpoint
CREATE INDEX `idx_industrial_vacancies_building` ON `industrial_vacancies` (`building_id`);