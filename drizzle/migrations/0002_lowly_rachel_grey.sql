CREATE TABLE `customer_request_access_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`createdByUserId` int NOT NULL,
	`redeemedByUserId` int,
	`expiresAt` timestamp NOT NULL,
	`redeemedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_request_access_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_request_access_invites_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `customer_request_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`customerRequestId` int NOT NULL,
	`actorUserId` int,
	`eventType` varchar(100) NOT NULL,
	`note` text,
	`metadata` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_request_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_request_supply_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`customerRequestId` int NOT NULL,
	`settlementLineId` int NOT NULL,
	`allocatedQuantity` decimal(14,3) NOT NULL,
	`approvedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_request_supply_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`branchId` int,
	`customerName` varchar(160) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`normalizedCustomerPhone` varchar(32) NOT NULL,
	`productCode` varchar(120),
	`productName` varchar(255) NOT NULL,
	`normalizedProductName` varchar(255) NOT NULL,
	`requestedQuantity` decimal(14,3) NOT NULL,
	`allocatedQuantity` decimal(14,3) NOT NULL DEFAULT '0.000',
	`customerRequestStatus` enum('requested','awaiting_supply','ready_to_contact','contacted','fulfilled','cancelled') NOT NULL DEFAULT 'requested',
	`createdByUserId` int NOT NULL,
	`lastUpdatedByUserId` int NOT NULL,
	`readyAt` timestamp,
	`contactedAt` timestamp,
	`fulfilledAt` timestamp,
	`closedReason` text,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workspace_members` MODIFY COLUMN `accessRole` enum('owner','manager','operator','reviewer','customer_requests') NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_request_access_invites` ADD CONSTRAINT `cra_invite_ws_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_access_invites` ADD CONSTRAINT `cra_invite_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_access_invites` ADD CONSTRAINT `cra_invite_redeemer_fk` FOREIGN KEY (`redeemedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_events` ADD CONSTRAINT `cr_event_ws_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_events` ADD CONSTRAINT `cr_event_request_fk` FOREIGN KEY (`customerRequestId`) REFERENCES `customer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_events` ADD CONSTRAINT `cr_event_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_supply_allocations` ADD CONSTRAINT `cr_alloc_ws_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_supply_allocations` ADD CONSTRAINT `cr_alloc_request_fk` FOREIGN KEY (`customerRequestId`) REFERENCES `customer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_supply_allocations` ADD CONSTRAINT `cr_alloc_settlement_fk` FOREIGN KEY (`settlementLineId`) REFERENCES `invoice_settlement_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_request_supply_allocations` ADD CONSTRAINT `cr_alloc_approver_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_requests` ADD CONSTRAINT `cr_ws_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_requests` ADD CONSTRAINT `cr_branch_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_requests` ADD CONSTRAINT `cr_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_requests` ADD CONSTRAINT `cr_updater_fk` FOREIGN KEY (`lastUpdatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_request_invite_workspace_idx` ON `customer_request_access_invites` (`workspaceId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `customer_request_event_request_idx` ON `customer_request_events` (`customerRequestId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `customer_supply_allocation_request_idx` ON `customer_request_supply_allocations` (`customerRequestId`);--> statement-breakpoint
CREATE INDEX `customer_supply_allocation_settlement_line_idx` ON `customer_request_supply_allocations` (`settlementLineId`);--> statement-breakpoint
CREATE INDEX `customer_request_workspace_status_idx` ON `customer_requests` (`workspaceId`,`customerRequestStatus`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `customer_request_match_idx` ON `customer_requests` (`workspaceId`,`productCode`,`normalizedProductName`,`customerRequestStatus`);--> statement-breakpoint
CREATE INDEX `customer_request_customer_idx` ON `customer_requests` (`workspaceId`,`normalizedCustomerPhone`,`customerRequestStatus`);
