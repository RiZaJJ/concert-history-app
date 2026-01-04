CREATE TABLE `artists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`mbid` varchar(64),
	`imageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `artists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `concerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`artistId` int NOT NULL,
	`venueId` int NOT NULL,
	`concertDate` timestamp NOT NULL,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`weatherCondition` varchar(100),
	`temperature` int,
	`weatherIcon` varchar(20),
	`notes` text,
	`setlistFmId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_concert_idx` UNIQUE(`userId`,`venueId`,`concertDate`)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concertId` int NOT NULL,
	`userId` int NOT NULL,
	`sourceUrl` text NOT NULL,
	`s3Url` text,
	`s3Key` varchar(500),
	`takenAt` timestamp,
	`latitude` varchar(20),
	`longitude` varchar(20),
	`isStarred` boolean NOT NULL DEFAULT false,
	`starredAt` timestamp,
	`filename` varchar(500),
	`mimeType` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `setlists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concertId` int NOT NULL,
	`songId` int NOT NULL,
	`setNumber` int NOT NULL,
	`position` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `setlists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`artistId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `songs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`city` varchar(100) NOT NULL,
	`state` varchar(100),
	`country` varchar(100) NOT NULL,
	`latitude` varchar(20),
	`longitude` varchar(20),
	`capacity` int,
	`address` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `venues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `artist_name_idx` ON `artists` (`name`);--> statement-breakpoint
CREATE INDEX `artist_mbid_idx` ON `artists` (`mbid`);--> statement-breakpoint
CREATE INDEX `concert_user_idx` ON `concerts` (`userId`);--> statement-breakpoint
CREATE INDEX `concert_artist_idx` ON `concerts` (`artistId`);--> statement-breakpoint
CREATE INDEX `concert_venue_idx` ON `concerts` (`venueId`);--> statement-breakpoint
CREATE INDEX `concert_date_idx` ON `concerts` (`concertDate`);--> statement-breakpoint
CREATE INDEX `photo_concert_idx` ON `photos` (`concertId`);--> statement-breakpoint
CREATE INDEX `photo_user_idx` ON `photos` (`userId`);--> statement-breakpoint
CREATE INDEX `photo_starred_idx` ON `photos` (`isStarred`);--> statement-breakpoint
CREATE INDEX `setlist_concert_idx` ON `setlists` (`concertId`);--> statement-breakpoint
CREATE INDEX `setlist_song_idx` ON `setlists` (`songId`);--> statement-breakpoint
CREATE INDEX `song_artist_idx` ON `songs` (`artistId`);--> statement-breakpoint
CREATE INDEX `song_title_idx` ON `songs` (`title`);--> statement-breakpoint
CREATE INDEX `venue_city_idx` ON `venues` (`city`);--> statement-breakpoint
CREATE INDEX `venue_name_idx` ON `venues` (`name`);