CREATE TABLE `customer_request_message_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_request_message_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_message_template_workspace_name_unique` UNIQUE(`workspaceId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `customer_request_message_templates` ADD CONSTRAINT `cr_msg_template_ws_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_message_templates` ADD CONSTRAINT `cr_msg_template_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_message_templates` ADD CONSTRAINT `cr_msg_template_updater_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_message_template_workspace_active_idx` ON `customer_request_message_templates` (`workspaceId`,`isActive`,`updatedAt`);
