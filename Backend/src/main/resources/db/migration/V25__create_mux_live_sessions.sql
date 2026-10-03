CREATE TABLE live_plans (
 id uuid PRIMARY KEY, name varchar(80) NOT NULL, duration_minutes int NOT NULL CHECK(duration_minutes BETWEEN 1 AND 180),
 price numeric(10,2) NOT NULL CHECK(price>=0), currency varchar(3) NOT NULL DEFAULT 'CAD', badge varchar(40),
 enabled boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0, version bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO live_plans(id,name,duration_minutes,price,badge,sort_order) VALUES
 ('d6828b97-e9ef-4549-a064-1f117a669101','10 minutes',10,15,null,0),
 ('d6828b97-e9ef-4549-a064-1f117a669102','20 minutes',20,25,null,1),
 ('d6828b97-e9ef-4549-a064-1f117a669103','30 minutes',30,35,'Most Popular',2),
 ('d6828b97-e9ef-4549-a064-1f117a669104','40 minutes',40,45,null,3),
 ('d6828b97-e9ef-4549-a064-1f117a669105','60 minutes',60,60,'Best Value',4);
CREATE TABLE live_payment_details (
 owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 method varchar(16) NOT NULL CHECK(method IN ('INTERAC','PAYPAL','GPAY')),
 details varchar(200) NOT NULL, enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(owner_id,method)
);
CREATE TABLE live_sessions (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app_users(id), listing_id uuid NOT NULL REFERENCES listings(id),
 title varchar(80) NOT NULL, plan_id uuid NOT NULL REFERENCES live_plans(id), plan_version bigint NOT NULL,
 duration_minutes int NOT NULL, price numeric(10,2) NOT NULL, currency varchar(3) NOT NULL,
 demo_purchase boolean NOT NULL DEFAULT false, payment_details jsonb NOT NULL DEFAULT '[]',
 status varchar(16) NOT NULL CHECK(status IN ('PREPARING','LIVE','RECONNECTING','ENDED','FAILED')),
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, ends_at timestamptz, ended_at timestamptz,
 setup_expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 provider_id varchar(200) UNIQUE, playback_id varchar(200), stream_key varchar(512),
 request_key uuid NOT NULL, request_hash varchar(64) NOT NULL, last_provider_event_at timestamptz,
 provider_checked_at timestamptz, chat_purged_at timestamptz,
 UNIQUE(owner_id,request_key)
);
CREATE UNIQUE INDEX live_one_open_per_creator ON live_sessions(owner_id) WHERE status IN ('PREPARING','LIVE','RECONNECTING');
CREATE INDEX live_open_expiry ON live_sessions(ends_at) WHERE status IN ('PREPARING','LIVE','RECONNECTING');
CREATE TABLE live_broadcast_tickets (
 token_hash varchar(64) PRIMARY KEY, session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES app_users(id), expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE live_webhook_events (id varchar(200) PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE live_provider_assets (
 asset_id varchar(200) PRIMARY KEY, session_id uuid NOT NULL REFERENCES live_sessions(id), deleted_at timestamptz
);
CREATE TABLE live_cleanup_jobs (
 kind varchar(8) NOT NULL CHECK(kind IN ('STREAM','ASSET')), provider_id varchar(200) NOT NULL,
 session_id uuid NOT NULL REFERENCES live_sessions(id), attempts int NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 PRIMARY KEY(kind,provider_id)
);
