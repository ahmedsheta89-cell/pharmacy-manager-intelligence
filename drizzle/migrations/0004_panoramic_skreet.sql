CREATE TABLE `supplier_arrival_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`supplierId` int,
	`supplierName` varchar(200) NOT NULL,
	`expectedAt` timestamp NOT NULL,
	`supplierArrivalStatus` enum('scheduled','arrived','late','cancelled') NOT NULL DEFAULT 'scheduled',
	`note` text,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`arrivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_arrival_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `employeeCode` varchar(40);--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_employee_code_unique` UNIQUE(`workspaceId`,`employeeCode`);--> statement-breakpoint
ALTER TABLE `supplier_arrival_schedules` ADD CONSTRAINT `supplier_arrival_ws_fk` FOREIGN KEY (`workspaceId`) REFERENCES `pharmacy_workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_arrival_schedules` ADD CONSTRAINT `supplier_arrival_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `supplier_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_arrival_schedules` ADD CONSTRAINT `supplier_arrival_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_arrival_schedules` ADD CONSTRAINT `supplier_arrival_updater_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_arrival_workspace_status_expected_idx` ON `supplier_arrival_schedules` (`workspaceId`,`supplierArrivalStatus`,`expectedAt`);--> statement-breakpoint
CREATE INDEX `supplier_arrival_supplier_expected_idx` ON `supplier_arrival_schedules` (`supplierId`,`expectedAt`);
