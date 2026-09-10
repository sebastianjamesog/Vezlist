CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedup_key VARCHAR(200) NOT NULL UNIQUE,
    recipient_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    site_scope VARCHAR(20) NOT NULL CHECK (site_scope IN ('MARKETPLACE', 'PERSONALS')),
    event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
        'LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_REMOVED', 'LISTING_EXPIRING',
        'LISTING_SAVED_AGGREGATE', 'SUPPORT_REPLY', 'PAYMENT_EVENT', 'SECURITY_EVENT')),
    subject_id UUID,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_code VARCHAR(40)
);
CREATE INDEX idx_notification_events_pending ON notification_events(available_at, id) WHERE status = 'PENDING';

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence BIGSERIAL NOT NULL UNIQUE,
    event_id UUID NOT NULL UNIQUE REFERENCES notification_events(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    site_scope VARCHAR(20) NOT NULL CHECK (site_scope IN ('MARKETPLACE', 'PERSONALS')),
    event_type VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    href VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);
CREATE INDEX idx_notifications_inbox ON notifications(recipient_id, site_scope, sequence DESC);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, site_scope) WHERE read_at IS NULL;

CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'PUSH')),
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'SKIPPED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_code VARCHAR(40),
    UNIQUE(notification_id, channel)
);
CREATE INDEX idx_notification_deliveries_pending ON notification_deliveries(available_at, id) WHERE status = 'PENDING';
CREATE INDEX idx_listings_notification_expiry ON listings(expires_at, id) WHERE status = 'ACTIVE';

-- Capture only new events; snapshot ownership/site in the originating transaction.
CREATE FUNCTION vezlist_queue_notification() RETURNS TRIGGER AS $$
DECLARE
    recipient UUID;
    scope VARCHAR(20);
    kind VARCHAR(40);
    event_key VARCHAR(200);
    due TIMESTAMPTZ := now();
BEGIN
    IF NEW.event_type IN ('LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_REMOVED') THEN
        kind := NEW.event_type;
        event_key := 'listing-event:' || NEW.id;
    ELSIF NEW.event_type = 'LISTING_SAVE_COUNT_CHANGED' AND NEW.payload->>'delta' = '1' THEN
        kind := 'LISTING_SAVED_AGGREGATE';
        event_key := 'saved:' || NEW.listing_id || ':' || (NEW.occurred_at AT TIME ZONE 'UTC')::date;
        due := now() + interval '15 minutes';
    ELSE
        RETURN NEW;
    END IF;
    SELECT owner_id, site_scope INTO recipient, scope FROM listings WHERE id = NEW.listing_id;
    IF recipient IS NOT NULL THEN
        INSERT INTO notification_events(dedup_key, recipient_id, site_scope, event_type, subject_id, available_at)
        VALUES (event_key, recipient, scope, kind, NEW.listing_id, due)
        ON CONFLICT(dedup_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_listing_event_notification AFTER INSERT ON listing_events
    FOR EACH ROW EXECUTE FUNCTION vezlist_queue_notification();
