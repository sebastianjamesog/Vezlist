ALTER TABLE user_preferences ADD COLUMN available_until TIMESTAMPTZ;
-- Old boolean-only activations have no reliable start time. Require a fresh opt-in.
UPDATE user_preferences SET available_now = FALSE WHERE available_now = TRUE;
ALTER TABLE user_preferences ADD CONSTRAINT availability_has_deadline CHECK (NOT available_now OR available_until IS NOT NULL);
ALTER TABLE user_privacy_settings ADD COLUMN ad_latitude DOUBLE PRECISION;
ALTER TABLE user_privacy_settings ADD COLUMN ad_longitude DOUBLE PRECISION;
ALTER TABLE user_privacy_settings ADD CONSTRAINT ad_location_pair CHECK (
    (ad_latitude IS NULL AND ad_longitude IS NULL) OR
    (ad_latitude IS NOT NULL AND ad_longitude IS NOT NULL AND ad_latitude BETWEEN -90 AND 90 AND ad_longitude BETWEEN -180 AND 180));
