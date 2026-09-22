CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activity_metadata_json_check" CHECK(json_valid("activity_log"."metadata")),
	CONSTRAINT "activity_entity_type_check" CHECK("activity_log"."entity_type" IN ('person','group','tag','note','attachment','vault','user'))
);
--> statement-breakpoint
CREATE INDEX `activity_entity_created_idx` ON `activity_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_r2_key_unique` ON `attachments` (`r2_key`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_unique` ON `groups` (`name`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_person_created_idx` ON `notes` (`person_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`organization` text,
	`role_position` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes_summary` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "people_status_check" CHECK("people"."status" IN ('active','paused','alumni'))
);
--> statement-breakpoint
CREATE INDEX `people_status_idx` ON `people` (`status`);--> statement-breakpoint
CREATE INDEX `people_deleted_at_idx` ON `people` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `people_organization_idx` ON `people` (`organization`);--> statement-breakpoint
CREATE TABLE `people_groups` (
	`person_id` text NOT NULL,
	`group_id` text NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`person_id`, `group_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `people_groups_group_idx` ON `people_groups` (`group_id`);--> statement-breakpoint
CREATE TABLE `people_tags` (
	`person_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`person_id`, `tag_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `people_tags_tag_idx` ON `people_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "tags_lowercase_check" CHECK("tags"."name" = lower(trim("tags"."name")) AND length("tags"."name") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `vault_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `vault_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vault_access_action_check" CHECK("vault_access_log"."action" IN ('reveal','copy','create','update','delete'))
);
--> statement-breakpoint
CREATE INDEX `vault_access_created_idx` ON `vault_access_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `vault_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`username` text,
	`url` text,
	`category` text,
	`ciphertext` blob,
	`iv` blob,
	`wrapped_dek` blob,
	`key_version` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_rotated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "vault_secret_or_tombstone_check" CHECK(("vault_entries"."deleted_at" IS NULL AND "vault_entries"."ciphertext" IS NOT NULL AND "vault_entries"."iv" IS NOT NULL AND "vault_entries"."wrapped_dek" IS NOT NULL) OR ("vault_entries"."deleted_at" IS NOT NULL AND "vault_entries"."ciphertext" IS NULL AND "vault_entries"."iv" IS NULL AND "vault_entries"."wrapped_dek" IS NULL))
);
