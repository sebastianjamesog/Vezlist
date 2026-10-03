-- Live sessions belong to creators independently of their ads.
-- Retain existing associations for historical compatibility; new sessions leave this null.
ALTER TABLE live_sessions ALTER COLUMN listing_id DROP NOT NULL;
