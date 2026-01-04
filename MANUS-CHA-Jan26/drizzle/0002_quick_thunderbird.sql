CREATE TABLE `unmatched_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`driveFileId` varchar(255) NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`mimeType` varchar(100),
	`sourceUrl` text NOT NULL,
	`thumbnailUrl` text,
	`takenAt` timestamp,
	`fileCreatedAt` timestamp,
	`latitude` varchar(50),
	`longitude` varchar(50),
	`reviewed` enum('pending','skipped','linked') NOT NULL DEFAULT 'pending',
	`linkedConcertId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unmatched_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `unmatched_photo_user_idx` ON `unmatched_photos` (`userId`);--> statement-breakpoint
CREATE INDEX `unmatched_photo_reviewed_idx` ON `unmatched_photos` (`reviewed`);