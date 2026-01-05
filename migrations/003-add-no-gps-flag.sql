-- Add noGps flag to unmatched_photos table
-- This marks photos that lack GPS data and need special handling
-- Photos without GPS can be auto-matched to concerts on the same date

ALTER TABLE unmatched_photos ADD COLUMN noGps TINYINT NOT NULL DEFAULT 0 AFTER linkedConcertId;
