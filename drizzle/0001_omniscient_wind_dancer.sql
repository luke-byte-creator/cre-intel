CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`property_type` text,
	`investment_type` text,
	`lease_type` text,
	`property_name` text,
	`address` text NOT NULL,
	`unit` text,
	`city` text DEFAULT 'Saskatoon',
	`province` text DEFAULT 'Saskatchewan',
	`seller` text,
	`purchaser` text,
	`landlord` text,
	`tenant` text,
	`portfolio` text,
	`sale_date` text,
	`sale_price` real,
	`price_psf` real,
	`price_per_acre` real,
	`is_renewal` integer,
	`lease_start` text,
	`lease_expiry` text,
	`term_months` integer,
	`net_rent_psf` real,
	`annual_rent` real,
	`rent_steps` text,
	`area_sf` real,
	`office_sf` real,
	`ceiling_height` real,
	`loading_docks` integer,
	`drive_in_doors` integer,
	`land_acres` real,
	`land_sf` real,
	`year_built` integer,
	`zoning` text,
	`noi` real,
	`cap_rate` real,
	`stabilized_noi` real,
	`stabilized_cap_rate` real,
	`vacancy_rate` real,
	`price_per_unit` real,
	`opex_ratio` real,
	`num_units` integer,
	`num_buildings` integer,
	`num_stories` integer,
	`construction_class` text,
	`retail_sales_per_annum` real,
	`retail_sales_psf` real,
	`operating_cost` real,
	`improvement_allowance` text,
	`free_rent_period` text,
	`fixturing_period` text,
	`comments` text,
	`source` text,
	`roll_number` text,
	`ppt_code` integer,
	`ppt_descriptor` text,
	`arms_length` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comps_type` ON `comps` (`type`);--> statement-breakpoint
CREATE INDEX `idx_comps_property_type` ON `comps` (`property_type`);--> statement-breakpoint
CREATE INDEX `idx_comps_sale_date` ON `comps` (`sale_date`);--> statement-breakpoint
CREATE INDEX `idx_comps_address` ON `comps` (`address`);--> statement-breakpoint
CREATE INDEX `idx_comps_seller` ON `comps` (`seller`);--> statement-breakpoint
CREATE INDEX `idx_comps_purchaser` ON `comps` (`purchaser`);--> statement-breakpoint
CREATE INDEX `idx_comps_tenant` ON `comps` (`tenant`);--> statement-breakpoint
CREATE TABLE `deals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_name` text NOT NULL,
	`tenant_company` text,
	`tenant_email` text,
	`tenant_phone` text,
	`property_address` text NOT NULL,
	`asset_type` text,
	`size_sf` text,
	`estimated_commission` real,
	`stage` text DEFAULT 'prospect' NOT NULL,
	`stage_entered_at` text NOT NULL,
	`notes` text,
	`inquiry_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_name` text NOT NULL,
	`tenant_company` text,
	`tenant_email` text,
	`tenant_phone` text,
	`property_of_interest` text,
	`business_description` text,
	`space_needs_sf` text,
	`asset_type_preference` text,
	`preferred_area` text,
	`budget_rate` text,
	`timeline` text,
	`notes` text,
	`source` text DEFAULT 'form',
	`submitted_by` text DEFAULT 'tenant',
	`status` text DEFAULT 'new',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inquiries_status` ON `inquiries` (`status`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`asset_type` text,
	`size_sf` integer,
	`asking_rate` text,
	`description` text,
	`landlord` text,
	`status` text DEFAULT 'Active',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tours` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_name` text NOT NULL,
	`tenant_company` text,
	`tenant_email` text,
	`tenant_phone` text,
	`property_address` text NOT NULL,
	`tour_date` text NOT NULL,
	`vibe` text,
	`notes` text,
	`follow_up_draft` text,
	`follow_up_sent` integer DEFAULT false,
	`follow_up_date` text,
	`deal_id` integer,
	`inquiry_id` integer,
	`status` text DEFAULT 'pending_followup',
	`created_at` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `people` ADD `email` text;--> statement-breakpoint
ALTER TABLE `people` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `people` ADD `notes` text;--> statement-breakpoint
CREATE INDEX `idx_alerts_entity` ON `alerts_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_alerts_is_read` ON `alerts_log` (`is_read`);--> statement-breakpoint
CREATE INDEX `idx_company_people_company_id` ON `company_people` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_company_people_person_id` ON `company_people` (`person_id`);--> statement-breakpoint
CREATE INDEX `idx_company_people_role` ON `company_people` (`role`);--> statement-breakpoint
CREATE INDEX `idx_permits_property_id` ON `permits` (`property_id`);--> statement-breakpoint
CREATE INDEX `idx_permits_applicant_company_id` ON `permits` (`applicant_company_id`);--> statement-breakpoint
CREATE INDEX `idx_permits_issue_date` ON `permits` (`issue_date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_property_id` ON `transactions` (`property_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_grantor_company_id` ON `transactions` (`grantor_company_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_grantee_company_id` ON `transactions` (`grantee_company_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_grantor_person_id` ON `transactions` (`grantor_person_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_grantee_person_id` ON `transactions` (`grantee_person_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_transfer_date` ON `transactions` (`transfer_date`);--> statement-breakpoint
CREATE INDEX `idx_watchlist_entity` ON `watchlist` (`entity_type`,`entity_id`);