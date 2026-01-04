CREATE TABLE `venue_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`alias` varchar(255) NOT NULL,
	`venueName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `venue_aliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `unmatched_photos` ADD `venueDetectionMethod` varchar(50);--> statement-breakpoint
ALTER TABLE `unmatched_photos` ADD `venueConfidence` varchar(20);--> statement-breakpoint
CREATE INDEX `venue_alias_user_idx` ON `venue_aliases` (`userId`);--> statement-breakpoint
CREATE INDEX `venue_alias_alias_idx` ON `venue_aliases` (`alias`);