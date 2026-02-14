CREATE TABLE `alerts_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`alert_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_read` integer DEFAULT false,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`entity_number` text,
	`type` text,
	`status` text,
	`registration_date` text,
	`jurisdiction` text,
	`registered_agent` text,
	`registered_address` text,
	`raw_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`role` text,
	`title` text,
	`start_date` text,
	`end_date` text,
	`raw_source` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`full_name` text NOT NULL,
	`address` text,
	`raw_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`permit_number` text,
	`property_id` integer,
	`address` text,
	`applicant` text,
	`applicant_company_id` integer,
	`description` text,
	`work_type` text,
	`building_type` text,
	`estimated_value` real,
	`issue_date` text,
	`status` text,
	`raw_source` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applicant_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text,
	`legal_description` text,
	`parcel_id` text,
	`property_type` text,
	`neighbourhood` text,
	`city` text,
	`province` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_id` integer,
	`transfer_date` text,
	`registration_date` text,
	`title_number` text,
	`transaction_type` text,
	`price` real,
	`grantor` text,
	`grantee` text,
	`grantor_company_id` integer,
	`grantee_company_id` integer,
	`grantor_person_id` integer,
	`grantee_person_id` integer,
	`raw_source` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grantor_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grantee_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grantor_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grantee_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`label` text,
	`notes` text,
	`created_at` text NOT NULL
);
