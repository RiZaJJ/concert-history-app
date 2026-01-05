-- Add altName column to venues table for alternative venue names from OSM
-- Example: "DHL Stadium" has alt_name "Cape Town Stadium" in OSM
-- This helps match venues when setlist.fm uses a different name than OSM's primary name

ALTER TABLE venues ADD COLUMN altName VARCHAR(255) AFTER name;
