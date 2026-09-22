CREATE TABLE `request_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `request_limits_scope_actor_time_idx` ON `request_limits` (`scope`,`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `vault_reauth` (
	`session_id` text PRIMARY KEY NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
