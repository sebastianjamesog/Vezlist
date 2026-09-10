ALTER TABLE listings DROP CONSTRAINT chk_listings_status;
ALTER TABLE listings ADD CONSTRAINT chk_listings_status CHECK (
    status IN ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'REMOVED', 'EXPIRED', 'DELETED'));
ALTER TABLE listings ADD COLUMN moderation_reason VARCHAR(80);

CREATE TABLE moderation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('SUBMISSION', 'REPORT', 'APPEAL')),
    status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    assigned_to UUID REFERENCES app_users(id),
    review_version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_moderation_open_listing ON moderation_cases(listing_id) WHERE status = 'OPEN';
CREATE INDEX idx_moderation_queue ON moderation_cases(created_at, id) WHERE status = 'OPEN';

CREATE TABLE reports (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES app_users(id),
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('SPAM', 'FRAUD', 'PROHIBITED', 'SAFETY', 'OTHER')),
    details VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, listing_id)
);
CREATE INDEX idx_reports_actor_time ON reports(reporter_id, created_at);
CREATE INDEX idx_reports_case ON reports(case_id, created_at);

-- These history records deliberately keep identifiers without cascading foreign keys:
-- deleting operational data must not erase the evidence of a moderation decision.
CREATE TABLE moderation_actions (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    listing_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    action VARCHAR(32) NOT NULL,
    public_reason VARCHAR(80),
    private_note VARCHAR(2000),
    eligibility_checked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_moderation_actions_case ON moderation_actions(case_id, created_at, id);
CREATE UNIQUE INDEX uq_moderation_approval_actor ON moderation_actions(case_id, actor_id)
    WHERE action = 'APPROVE';
CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    action_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_events_subject ON audit_events(subject_id, created_at, id);
CREATE TABLE moderation_media_reviews (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES listing_media(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES app_users(id),
    checksum_sha256 VARCHAR(64) NOT NULL,
    verdict VARCHAR(8) NOT NULL CHECK (verdict IN ('PASS', 'BLOCK')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(case_id, media_id, reviewer_id)
);

CREATE FUNCTION vezlist_immutable_moderation_history() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Moderation history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_moderation_actions_immutable BEFORE UPDATE OR DELETE ON moderation_actions
    FOR EACH ROW EXECUTE FUNCTION vezlist_immutable_moderation_history();
CREATE TRIGGER trg_audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION vezlist_immutable_moderation_history();

-- Queue every submission in the same transaction, including existing submission callers.
CREATE FUNCTION vezlist_queue_moderation() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'PENDING_REVIEW' AND
       (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE moderation_cases SET status = 'CLOSED', closed_at = now()
            WHERE listing_id = NEW.id AND status = 'OPEN';
        INSERT INTO moderation_cases(listing_id, kind, review_version)
            VALUES (NEW.id, 'SUBMISSION', NEW.version);
    ELSIF NEW.status IN ('DELETED', 'EXPIRED') THEN
        UPDATE moderation_cases SET status = 'CLOSED', closed_at = now()
            WHERE listing_id = NEW.id AND status = 'OPEN';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_listing_moderation AFTER INSERT OR UPDATE OF status ON listings
    FOR EACH ROW EXECUTE FUNCTION vezlist_queue_moderation();
INSERT INTO moderation_cases(listing_id, kind, review_version)
    SELECT id, 'SUBMISSION', version FROM listings WHERE status = 'PENDING_REVIEW';

ALTER TABLE listing_events DROP CONSTRAINT chk_listing_event_type;
-- Save/unsave changes optimistic-lock metadata but not the content under review.
CREATE FUNCTION vezlist_preserve_moderation_review_version() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.version <> OLD.version AND
       (to_jsonb(NEW) - 'version' - 'save_count' - 'updated_at') =
       (to_jsonb(OLD) - 'version' - 'save_count' - 'updated_at') THEN
        UPDATE moderation_cases SET review_version = NEW.version
            WHERE listing_id = NEW.id AND status = 'OPEN' AND review_version = OLD.version;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_listing_moderation_version AFTER UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION vezlist_preserve_moderation_review_version();

ALTER TABLE listing_events ADD CONSTRAINT chk_listing_event_type CHECK (event_type IN (
    'LISTING_CREATED', 'LISTING_UPDATED', 'LISTING_SUBMITTED', 'LISTING_DELETED',
    'LISTING_SAVE_COUNT_CHANGED', 'LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_REMOVED'));
