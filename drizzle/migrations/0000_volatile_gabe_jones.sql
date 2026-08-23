CREATE TABLE `approved_analysis_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`branchId` int,
	`approvedByUserId` int NOT NULL,
	`sourceFileName` varchar(255) NOT NULL,
	`sourceFingerprint` varchar(128) NOT NULL,
	`sourceSheetCount` int NOT NULL,
	`sourceRowCount` int NOT NULL,
	`periodLabel` varchar(120),
	`mappingDecision` json NOT NULL,
	`normalizedSummary` json NOT NULL,
	`analysisSessionStatus` enum('approved','archived') NOT NULL DEFAULT 'approved',
	`approvedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approved_analysis_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(80),
	`metadata` json NOT NULL,
	`previousEventHash` varchar(128),
	`eventHash` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_event_hash_unique` UNIQUE(`eventHash`)
);
--> statement-breakpoint
CREATE TABLE `branch_transfer_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`fromBranchId` int NOT NULL,
	`toBranchId` int NOT NULL,
	`productCode` varchar(120),
	`productName` varchar(255) NOT NULL,
	`suggestedQuantity` decimal(14,3) NOT NULL,
	`explanation` text NOT NULL,
	`evidence` json NOT NULL,
	`transferSuggestionStatus` enum('proposed','approved','rejected','expired') NOT NULL DEFAULT 'proposed',
	`decidedByUserId` int,
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branch_transfer_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_workspace_code_unique` UNIQUE(`workspaceId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `invoice_settlement_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settlementId` int NOT NULL,
	`orderLineId` int,
	`productCode` varchar(120),
	`productName` varchar(255) NOT NULL,
	`invoiceQuantity` decimal(14,3) NOT NULL,
	`acceptedQuantity` decimal(14,3) NOT NULL,
	`documentedUnitPrice` decimal(14,2),
	`matchMethod` varchar(64) NOT NULL,
	`exceptionReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_settlement_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`branchId` int,
	`supplierId` int,
	`sourceOrderId` int,
	`approvedByUserId` int NOT NULL,
	`invoiceReference` varchar(120),
	`settlementDecision` enum('approved','rejected','needs_review') NOT NULL,
	`reconciliationSummary` json NOT NULL,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_settlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `open_order_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productCode` varchar(120),
	`productName` varchar(255) NOT NULL,
	`unitLabel` varchar(64),
	`requestedQuantity` decimal(14,3) NOT NULL,
	`settledQuantity` decimal(14,3) NOT NULL DEFAULT '0.000',
	`documentedUnitPrice` decimal(14,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `open_order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `open_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`branchId` int,
	`supplierId` int,
	`sourceSessionId` int,
	`createdByUserId` int NOT NULL,
	`approvedByUserId` int,
	`orderStatus` enum('draft','pending_approval','approved','partially_received','settled','cancelled') NOT NULL DEFAULT 'draft',
	`reference` varchar(100),
	`note` text,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `open_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operating_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`alertId` int,
	`createdByUserId` int NOT NULL,
	`decisionStatus` enum('open','deferred','done') NOT NULL DEFAULT 'open',
	`priorityRank` int NOT NULL,
	`actionLabel` varchar(255) NOT NULL,
	`reason` text NOT NULL,
	`managerNote` text,
	`dueAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operating_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operational_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`branchId` int,
	`sessionId` int,
	`kind` varchar(80) NOT NULL,
	`alertLevel` enum('urgent','review','watch','positive') NOT NULL,
	`alertStatus` enum('open','snoozed','resolved') NOT NULL DEFAULT 'open',
	`title` varchar(255) NOT NULL,
	`explanation` text NOT NULL,
	`evidence` json NOT NULL,
	`suggestedAction` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`statusChangedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operational_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pharmacy_workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'Africa/Cairo',
	`ownerUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pharmacy_workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `pharmacy_workspaces_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `supplier_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`normalizedName` varchar(200) NOT NULL,
	`contactLabel` varchar(160),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_workspace_name_unique` UNIQUE(`workspaceId`,`normalizedName`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`accessRole` enum('owner','manager','operator','reviewer') NOT NULL,
	`membershipStatus` enum('active','suspended') NOT NULL DEFAULT 'active',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_member_unique` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `workspace_retention_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`rawSourceRetentionDays` int NOT NULL DEFAULT 0,
	`approvedMetadataRetentionDays` int NOT NULL DEFAULT 365,
	`auditEventRetentionDays` int NOT NULL DEFAULT 2555,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_retention_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `retention_policy_workspace_unique` UNIQUE(`workspaceId`)
);
--> statement-breakpoint
ALTER TABLE `approved_analysis_sessions` ADD CONSTRAINT `approved_analysis_sessions_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approved_analysis_sessions` ADD CONSTRAINT `approved_analysis_sessions_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approved_analysis_sessions` ADD CONSTRAINT `approved_analysis_sessions_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfer_suggestions` ADD CONSTRAINT `branch_transfer_workspace_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfer_suggestions` ADD CONSTRAINT `branch_transfer_suggestions_fromBranchId_branches_id_fk` FOREIGN KEY (`fromBranchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfer_suggestions` ADD CONSTRAINT `branch_transfer_suggestions_toBranchId_branches_id_fk` FOREIGN KEY (`toBranchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfer_suggestions` ADD CONSTRAINT `branch_transfer_suggestions_decidedByUserId_users_id_fk` FOREIGN KEY (`decidedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branches` ADD CONSTRAINT `branches_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlement_lines` ADD CONSTRAINT `invoice_settlement_lines_settlementId_invoice_settlements_id_fk` FOREIGN KEY (`settlementId`) REFERENCES `invoice_settlements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlement_lines` ADD CONSTRAINT `invoice_settlement_lines_orderLineId_open_order_lines_id_fk` FOREIGN KEY (`orderLineId`) REFERENCES `open_order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlements` ADD CONSTRAINT `invoice_settlements_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlements` ADD CONSTRAINT `invoice_settlements_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlements` ADD CONSTRAINT `invoice_settlements_supplierId_supplier_profiles_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `supplier_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlements` ADD CONSTRAINT `invoice_settlements_sourceOrderId_open_orders_id_fk` FOREIGN KEY (`sourceOrderId`) REFERENCES `open_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_settlements` ADD CONSTRAINT `invoice_settlements_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_order_lines` ADD CONSTRAINT `open_order_lines_orderId_open_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `open_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_orders` ADD CONSTRAINT `open_orders_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_orders` ADD CONSTRAINT `open_orders_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_orders` ADD CONSTRAINT `open_orders_supplierId_supplier_profiles_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `supplier_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_orders` ADD CONSTRAINT `open_orders_sourceSessionId_approved_analysis_sessions_id_fk` FOREIGN KEY (`sourceSessionId`) REFERENCES `approved_analysis_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_orders` ADD CONSTRAINT `open_orders_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `open_orders` ADD CONSTRAINT `open_orders_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operating_decisions` ADD CONSTRAINT `operating_decisions_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operating_decisions` ADD CONSTRAINT `operating_decisions_alertId_operational_alerts_id_fk` FOREIGN KEY (`alertId`) REFERENCES `operational_alerts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operating_decisions` ADD CONSTRAINT `operating_decisions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_alerts` ADD CONSTRAINT `operational_alerts_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_alerts` ADD CONSTRAINT `operational_alerts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operational_alerts` ADD CONSTRAINT `operational_alerts_sessionId_approved_analysis_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `approved_analysis_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pharmacy_workspaces` ADD CONSTRAINT `pharmacy_workspaces_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_profiles` ADD CONSTRAINT `supplier_profiles_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_workspaceId_pharmacy_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_retention_policies` ADD CONSTRAINT `retention_workspace_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_retention_policies` ADD CONSTRAINT `retention_updated_by_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `analysis_session_workspace_branch_idx` ON `approved_analysis_sessions` (`workspaceId`,`branchId`,`approvedAt`);--> statement-breakpoint
CREATE INDEX `analysis_session_fingerprint_idx` ON `approved_analysis_sessions` (`workspaceId`,`sourceFingerprint`);--> statement-breakpoint
CREATE INDEX `audit_event_workspace_created_idx` ON `audit_events` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `branch_transfer_workspace_status_idx` ON `branch_transfer_suggestions` (`workspaceId`,`transferSuggestionStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `branch_workspace_active_idx` ON `branches` (`workspaceId`,`isActive`);--> statement-breakpoint
CREATE INDEX `invoice_settlement_line_settlement_idx` ON `invoice_settlement_lines` (`settlementId`);--> statement-breakpoint
CREATE INDEX `invoice_settlement_workspace_created_idx` ON `invoice_settlements` (`workspaceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `invoice_settlement_supplier_idx` ON `invoice_settlements` (`supplierId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `open_order_line_order_idx` ON `open_order_lines` (`orderId`);--> statement-breakpoint
CREATE INDEX `open_order_line_product_idx` ON `open_order_lines` (`productCode`);--> statement-breakpoint
CREATE INDEX `open_order_workspace_status_idx` ON `open_orders` (`workspaceId`,`orderStatus`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `open_order_supplier_idx` ON `open_orders` (`supplierId`,`orderStatus`);--> statement-breakpoint
CREATE INDEX `operating_decision_workspace_status_idx` ON `operating_decisions` (`workspaceId`,`decisionStatus`,`priorityRank`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `operational_alert_workspace_status_idx` ON `operational_alerts` (`workspaceId`,`alertStatus`,`alertLevel`,`createdAt`);--> statement-breakpoint
CREATE INDEX `operational_alert_branch_idx` ON `operational_alerts` (`branchId`,`alertStatus`);--> statement-breakpoint
CREATE INDEX `workspace_member_user_idx` ON `workspace_members` (`userId`);
