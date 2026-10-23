-- An appeal belongs to a moderation episode, not the frequently changing JPA version.
ALTER TABLE listings ADD COLUMN moderation_episode UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE moderation_cases ADD COLUMN appeal_episode UUID;
ALTER TABLE moderation_cases ADD COLUMN resolution VARCHAR(12) CHECK (resolution IN ('APPROVED','REJECTED','STALE'));

UPDATE moderation_cases c SET resolution = CASE
    WHEN EXISTS (SELECT 1 FROM moderation_actions a WHERE a.case_id=c.id AND a.action='REJECT') THEN 'REJECTED'
    WHEN (SELECT count(*) FROM moderation_actions a WHERE a.case_id=c.id AND a.action='APPROVE')
         >= CASE WHEN l.site_scope='PERSONALS' THEN 2 ELSE 1 END THEN 'APPROVED'
    ELSE 'STALE' END
FROM listings l WHERE l.id=c.listing_id AND c.kind='APPEAL' AND c.status='CLOSED';

-- Preserve the latest applicable legacy appeal. A later takedown starts a new episode.
WITH latest AS (
    SELECT DISTINCT ON (c.listing_id) c.id,c.listing_id,c.created_at,c.closed_at
    FROM moderation_cases c WHERE c.kind='APPEAL'
    ORDER BY c.listing_id,c.created_at DESC,c.id DESC
)
UPDATE moderation_cases c SET appeal_episode=l.moderation_episode
FROM latest x JOIN listings l ON l.id=x.listing_id
WHERE c.id=x.id AND COALESCE(x.closed_at,x.created_at) >= COALESCE(
    (SELECT max(e.occurred_at) FROM listing_events e WHERE e.listing_id=l.id
       AND e.event_type IN ('LISTING_REJECTED','LISTING_REMOVED')), '-infinity'::timestamptz);
CREATE UNIQUE INDEX uq_appeal_episode ON moderation_cases(listing_id,appeal_episode)
    WHERE kind='APPEAL' AND appeal_episode IS NOT NULL;

CREATE FUNCTION vezlist_moderation_episode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('REJECTED','REMOVED') AND NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.moderation_episode := gen_random_uuid();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_listing_moderation_episode BEFORE UPDATE OF status ON listings
    FOR EACH ROW EXECUTE FUNCTION vezlist_moderation_episode();

CREATE FUNCTION vezlist_appeal_episode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind='APPEAL' AND NEW.appeal_episode IS NULL THEN
        SELECT moderation_episode INTO NEW.appeal_episode FROM listings WHERE id=NEW.listing_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_case_appeal_episode BEFORE INSERT ON moderation_cases
    FOR EACH ROW EXECUTE FUNCTION vezlist_appeal_episode();

CREATE OR REPLACE FUNCTION vezlist_preserve_moderation_review_version() RETURNS trigger AS $$
BEGIN
    IF NEW.version <> OLD.version AND NEW.save_count IS DISTINCT FROM OLD.save_count AND
       (to_jsonb(NEW) - 'version' - 'save_count' - 'updated_at') =
       (to_jsonb(OLD) - 'version' - 'save_count' - 'updated_at') THEN
        UPDATE moderation_cases SET review_version=NEW.version
            WHERE listing_id=NEW.id AND status='OPEN' AND review_version=OLD.version;
    ELSIF NEW.version <> OLD.version THEN
        UPDATE moderation_cases SET status='CLOSED',closed_at=now(),resolution='STALE'
            WHERE listing_id=NEW.id AND status='OPEN' AND kind='APPEAL' AND review_version<>NEW.version;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
UPDATE moderation_cases c SET status='CLOSED',closed_at=now(),resolution='STALE'
FROM listings l WHERE l.id=c.listing_id AND c.kind='APPEAL' AND c.status='OPEN'
    AND (l.version<>c.review_version OR l.status NOT IN ('REJECTED','REMOVED')
         OR c.appeal_episode IS DISTINCT FROM l.moderation_episode);

ALTER TABLE notification_events DROP CONSTRAINT notification_events_event_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (event_type IN (
    'LISTING_APPROVED','LISTING_REJECTED','LISTING_REMOVED','LISTING_EXPIRING','LISTING_SAVED_AGGREGATE',
    'SUPPORT_REPLY','PAYMENT_EVENT','SECURITY_EVENT','APPEAL_SUBMITTED','APPEAL_APPROVED','APPEAL_REJECTED'));

CREATE OR REPLACE FUNCTION vezlist_queue_notification() RETURNS trigger AS $$
DECLARE recipient UUID; scope VARCHAR(20); kind VARCHAR(40); event_key VARCHAR(200); due TIMESTAMPTZ := now();
BEGIN
    IF NEW.event_type IN ('LISTING_APPROVED','LISTING_REJECTED','LISTING_REMOVED') THEN
        kind := CASE WHEN NEW.payload->>'appeal'='true'
            THEN CASE WHEN NEW.event_type='LISTING_APPROVED' THEN 'APPEAL_APPROVED' ELSE 'APPEAL_REJECTED' END
            ELSE NEW.event_type END;
        event_key := 'listing-event:' || NEW.id;
    ELSIF NEW.event_type='LISTING_SAVE_COUNT_CHANGED' AND NEW.payload->>'delta'='1' THEN
        kind := 'LISTING_SAVED_AGGREGATE';
        event_key := 'saved:' || NEW.listing_id || ':' || (NEW.occurred_at AT TIME ZONE 'UTC')::date;
        due := now()+interval '15 minutes';
    ELSE RETURN NEW;
    END IF;
    SELECT owner_id,site_scope INTO recipient,scope FROM listings WHERE id=NEW.listing_id;
    IF recipient IS NOT NULL THEN
        INSERT INTO notification_events(dedup_key,recipient_id,site_scope,event_type,subject_id,available_at)
        VALUES(event_key,recipient,scope,kind,NEW.listing_id,due) ON CONFLICT(dedup_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
