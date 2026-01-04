CREATE TABLE `processed_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileId` varchar(255) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processed_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `processed_file_user_file_idx` ON `processed_files` (`userId`,`fileId`);--> statement-breakpoint
CREATE INDEX `processed_file_id_idx` ON `processed_files` (`fileId`);