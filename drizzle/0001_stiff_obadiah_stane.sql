CREATE TABLE `scan_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalDriveFiles` int NOT NULL DEFAULT 0,
	`lastUpdated` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scan_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `scan_cache_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `scan_cache_user_idx` ON `scan_cache` (`userId`);