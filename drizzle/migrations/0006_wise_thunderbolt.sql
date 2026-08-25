ALTER TABLE `supplier_profiles` ADD `contactPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `supplier_profiles` ADD `normalizedContactPhone` varchar(32);--> statement-breakpoint
CREATE INDEX `supplier_workspace_contact_idx` ON `supplier_profiles` (`workspaceId`,`normalizedContactPhone`);