-- Add 'ambiguous' status for multi-concert disambiguation
-- Add possibleConcertIds field to store concert options

ALTER TABLE unmatched_photos
  MODIFY COLUMN reviewed ENUM('pending', 'skipped', 'linked', 'ambiguous') DEFAULT 'pending' NOT NULL;

ALTER TABLE unmatched_photos
  ADD COLUMN possibleConcertIds TEXT COMMENT 'JSON array of concert IDs when ambiguous (e.g., "[1,2]" for opener vs headliner)';
