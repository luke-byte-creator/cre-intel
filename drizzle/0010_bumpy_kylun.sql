CREATE TABLE `pipeline_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deal_id` integer NOT NULL,
	`text` text NOT NULL,
	`completed` integer DEFAULT 0,
	`sort_order` integer NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pipeline_todos_deal_id` ON `pipeline_todos` (`deal_id`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_todos_sort_order` ON `pipeline_todos` (`sort_order`);