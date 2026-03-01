CREATE TABLE `underwriting_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`extracted_data` text,
	`field_confidence` text,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'email' NOT NULL,
	`source_ref` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `underwriting_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_underwriting_documents_package_id` ON `underwriting_documents` (`package_id`);--> statement-breakpoint
CREATE TABLE `underwriting_packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`property_address` text NOT NULL,
	`property_address_normalized` text NOT NULL,
	`property_id` integer,
	`status` text DEFAULT 'collecting' NOT NULL,
	`analysis_result` text,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_underwriting_packages_address_normalized` ON `underwriting_packages` (`property_address_normalized`);--> statement-breakpoint
CREATE INDEX `idx_underwriting_packages_created_by` ON `underwriting_packages` (`created_by`);