-- Preserve historical Mux sessions and tickets; never route their IDs to Gcore.
ALTER TABLE live_sessions ADD COLUMN provider_name varchar(16) NOT NULL DEFAULT 'MUX'
    CHECK (provider_name IN ('MUX','GCORE'));
ALTER TABLE live_sessions ALTER COLUMN provider_name SET DEFAULT 'GCORE';
ALTER TABLE live_sessions ADD COLUMN provider_disconnected_at timestamptz;
-- Gcore returns full ingest and playback URLs, rather than Mux identifiers.
ALTER TABLE live_sessions ALTER COLUMN playback_id TYPE text;
ALTER TABLE live_sessions ALTER COLUMN stream_key TYPE text;
ALTER TABLE live_sessions DROP CONSTRAINT live_sessions_provider_id_key;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_provider_identity UNIQUE(provider_name,provider_id);
ALTER TABLE live_sessions DROP CONSTRAINT live_sessions_owner_id_request_key_key;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_provider_request UNIQUE(owner_id,provider_name,request_key);
ALTER TABLE live_cleanup_jobs DROP CONSTRAINT live_cleanup_jobs_pkey;
ALTER TABLE live_cleanup_jobs ADD PRIMARY KEY(kind,provider_id,session_id);
DROP INDEX live_one_open_per_creator;
CREATE UNIQUE INDEX live_one_open_per_creator ON live_sessions(owner_id,provider_name)
    WHERE status IN ('PREPARING','LIVE','RECONNECTING');
