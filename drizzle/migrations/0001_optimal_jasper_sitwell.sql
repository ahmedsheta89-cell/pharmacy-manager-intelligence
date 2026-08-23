ALTER TABLE `operating_decisions` ADD `clientDecisionKey` varchar(180) NOT NULL;--> statement-breakpoint
ALTER TABLE `operating_decisions` ADD CONSTRAINT `operating_decision_workspace_key_unique` UNIQUE(`workspaceId`,`clientDecisionKey`);
