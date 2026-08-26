ALTER TABLE `customer_requests` ADD `recordedByUserId` int;--> statement-breakpoint
ALTER TABLE `customer_requests` ADD `recordedByUserId` int;--> statement-breakpoint
ALTER TABLE `customer_requests` ADD CONSTRAINT `customer_requests_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_request_workspace_recorded_by_idx` ON `customer_requests` (`workspaceId`,`recordedByUserId`,`updatedAt`);
