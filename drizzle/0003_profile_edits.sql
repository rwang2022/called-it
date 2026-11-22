CREATE TABLE `avatars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `name_edited` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `image_edited` integer DEFAULT false NOT NULL;