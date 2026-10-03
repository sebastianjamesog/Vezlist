BEGIN;
-- Share the feed builder's lock so it cannot read a half-seeded rotation.
SELECT pg_advisory_xact_lock(20260928);

CREATE TEMP TABLE seed_featured ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(:'listings'::jsonb) AS x(
  id uuid, owner_id uuid, media_id uuid, slug text, name text, title text,
  province text, location text, latitude double precision, longitude double precision,
  feed text, age_minutes integer, views integer, saves integer, description text,
  object_key text, photo_source text, size_bytes bigint, checksum text
);
CREATE TEMP TABLE seed_readers ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(:'readers'::jsonb) AS x(id uuid, number integer);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM seed_featured s
    LEFT JOIN locations l ON l.id = s.location AND l.parent_id = s.province AND l.enabled
    WHERE l.id IS NULL
  ) THEN RAISE EXCEPTION 'A required catalog location is missing or disabled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 'personals' AND enabled AND site_scope = 'PERSONALS')
    THEN RAISE EXCEPTION 'The Personals category is missing or disabled'; END IF;
  IF EXISTS (
    SELECT 1 FROM listings l JOIN seed_featured s ON s.id = l.id
    WHERE l.owner_id <> s.owner_id OR NOT EXISTS (
      SELECT 1 FROM listing_attributes a WHERE a.listing_id = l.id
      AND a.attribute_key = 'seed_dataset' AND a.attribute_value = 'featured-v1'
    )
  ) THEN RAISE EXCEPTION 'Seed listing ID belongs to unrelated data'; END IF;
  IF EXISTS (
    SELECT 1 FROM app_users u JOIN (
      SELECT owner_id AS id, slug || '@featured-seed.invalid' AS email FROM seed_featured
      UNION ALL SELECT id, 'reader-' || number || '@featured-seed.invalid' FROM seed_readers
    ) s ON s.id = u.id WHERE s.email <> u.email
  ) THEN RAISE EXCEPTION 'Seed account ID belongs to unrelated data'; END IF;
END $$;

-- Intentionally unusable passwords: these accounts provide local feed data only.
INSERT INTO app_users(id, display_name, email, password_hash, enabled, email_verified)
SELECT owner_id, name || ' (Test)', slug || '@featured-seed.invalid', '!seed-no-login', TRUE, FALSE FROM seed_featured
UNION ALL
SELECT id, 'Feed reader ' || number || ' (Test)', 'reader-' || number || '@featured-seed.invalid', '!seed-no-login', TRUE, FALSE FROM seed_readers
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles(user_id, role)
SELECT owner_id, 'USER' FROM seed_featured UNION ALL SELECT id, 'USER' FROM seed_readers
ON CONFLICT DO NOTHING;
INSERT INTO user_profiles(user_id, location, bio)
SELECT s.owner_id, l.label, 'Local development test account for featured feed testing.'
FROM seed_featured s JOIN locations l ON l.id = s.location
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_preferences(user_id, available_now)
SELECT owner_id, FALSE FROM seed_featured
ON CONFLICT (user_id) DO UPDATE SET available_now = FALSE, updated_at = now();
INSERT INTO user_privacy_settings(user_id, show_phone_on_ads, precise_location)
SELECT owner_id, FALSE, FALSE FROM seed_featured ON CONFLICT DO NOTHING;

INSERT INTO listings(id, owner_id, site_scope, status, title, business_name, description,
  price, category_id, province_id, location_id, contact_email, contact_phone,
  latitude, longitude, created_at, submitted_at, published_at, expires_at)
SELECT id, owner_id, 'PERSONALS', 'ACTIVE', title, name || ' (Test)',
  description || E'\n\nLocal development test listing. This is not a real advertiser. Photo illustrates the activity or scenery.',
  NULL, 'personals', province, location, slug || '@featured-seed.invalid', '', latitude, longitude,
  now() - age_minutes * interval '1 minute', now() - age_minutes * interval '1 minute',
  now() - age_minutes * interval '1 minute', now() + interval '30 days'
FROM seed_featured
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, title = EXCLUDED.title,
  description = EXCLUDED.description, business_name = EXCLUDED.business_name,
  published_at = EXCLUDED.published_at, created_at = EXCLUDED.created_at,
  submitted_at = EXCLUDED.submitted_at, expires_at = EXCLUDED.expires_at,
  updated_at = now(), version = listings.version + 1;

INSERT INTO listing_attributes(listing_id, attribute_key, attribute_value)
SELECT id, 'seed_dataset', 'featured-v1' FROM seed_featured
UNION ALL SELECT id, 'seed_feed', feed FROM seed_featured
UNION ALL SELECT id, 'photo_source', photo_source FROM seed_featured
ON CONFLICT (listing_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;

INSERT INTO listing_media(id, listing_id, object_key, original_filename, content_type,
  size_bytes, checksum_sha256, status, position, upload_expires_at, ready_at)
SELECT media_id, id, object_key, slug || '.jpg', 'image/jpeg', size_bytes, checksum,
  'READY', 0, now() + interval '10 minutes', now() FROM seed_featured
ON CONFLICT (id) DO UPDATE SET size_bytes = EXCLUDED.size_bytes,
  checksum_sha256 = EXCLUDED.checksum_sha256, status = 'READY', ready_at = now(), updated_at = now();

-- Persist engagement events; normal ranking queries and counters consume them.
INSERT INTO saved_listings(id, user_id, listing_id, saved_at)
SELECT md5('featured-v1:save:' || s.id || ':' || r.number)::uuid, r.id, s.id,
  now() - r.number * interval '7 minutes'
FROM seed_featured s JOIN seed_readers r ON r.number <= s.saves
ON CONFLICT (user_id, listing_id) DO UPDATE SET saved_at = EXCLUDED.saved_at;

INSERT INTO listing_views(id, listing_id, anonymous_viewer_hash, viewed_at)
SELECT md5('featured-v1:view:' || s.id || ':' || n)::uuid, s.id,
  'featured-v1:' || s.slug || ':' || n,
  now() - (s.age_minutes::double precision * n / (s.views + 1)) * interval '1 minute'
FROM seed_featured s CROSS JOIN LATERAL generate_series(1, s.views) n
ON CONFLICT (id) DO NOTHING;

UPDATE listings l SET
  save_count = (SELECT count(*) FROM saved_listings WHERE listing_id = l.id),
  view_count = (SELECT count(*) FROM listing_views WHERE listing_id = l.id)
WHERE l.id IN (SELECT id FROM seed_featured);

-- Refresh seed exposure history; rebuild the current cache through the normal API.
-- Existing listings, engagement, and their previous rotation history are preserved.
DELETE FROM featured_slots WHERE listing_id IN (SELECT id FROM seed_featured)
  OR window_start = to_timestamp(floor(extract(epoch FROM now()) / 900) * 900);

SELECT json_build_object('listings', (SELECT count(*) FROM seed_featured),
  'newTodayCandidates', (SELECT count(*) FROM seed_featured WHERE feed = 'NEW_TODAY'),
  'trendingCandidates', (SELECT count(*) FROM seed_featured WHERE feed = 'TRENDING'),
  'seedAccounts', (SELECT count(*) FROM seed_featured) + (SELECT count(*) FROM seed_readers),
  'seedSaves', (SELECT sum(saves) FROM seed_featured),
  'seedViews', (SELECT sum(views) FROM seed_featured));
COMMIT;
