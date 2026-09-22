-- Existing listings retain their status and ordinary moderation queue entries.
ALTER TABLE listings ADD COLUMN verification_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- Verification submissions have their own staff queue and must not enter ordinary submission moderation.
CREATE OR REPLACE FUNCTION vezlist_queue_moderation() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'PENDING_REVIEW' AND
       (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE moderation_cases SET status = 'CLOSED', closed_at = now()
            WHERE listing_id = NEW.id AND status = 'OPEN';
        IF NOT NEW.verification_requested THEN
            INSERT INTO moderation_cases(listing_id, kind, review_version)
                VALUES (NEW.id, 'SUBMISSION', NEW.version);
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'ACTIVE' AND OLD.status IN ('DRAFT', 'REJECTED') THEN
        UPDATE moderation_cases SET status = 'CLOSED', closed_at = now()
            WHERE listing_id = NEW.id AND status = 'OPEN' AND kind IN ('SUBMISSION', 'APPEAL');
    ELSIF NEW.status IN ('DELETED', 'EXPIRED') THEN
        UPDATE moderation_cases SET status = 'CLOSED', closed_at = now()
            WHERE listing_id = NEW.id AND status = 'OPEN';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE listing_events DROP CONSTRAINT chk_listing_event_type;
ALTER TABLE listing_events ADD CONSTRAINT chk_listing_event_type CHECK (event_type IN (
    'LISTING_CREATED', 'LISTING_UPDATED', 'LISTING_SUBMITTED', 'LISTING_PUBLISHED', 'LISTING_DELETED',
    'LISTING_SAVE_COUNT_CHANGED', 'LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_REMOVED'));
