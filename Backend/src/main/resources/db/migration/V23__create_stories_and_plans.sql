ALTER TABLE app_users ADD COLUMN account_type varchar(16) NOT NULL DEFAULT 'CREATOR'
    CHECK (account_type IN ('CREATOR', 'BROWSING'));

CREATE TABLE story_plans (
    id uuid PRIMARY KEY,
    name varchar(80) NOT NULL,
    price numeric(10,2) NOT NULL CHECK (price >= 0),
    currency varchar(3) NOT NULL DEFAULT 'CAD',
    story_count integer NOT NULL CHECK (story_count BETWEEN 1 AND 100),
    enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    version bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO story_plans(id,name,price,story_count,sort_order) VALUES
 ('dcad20de-c717-4c71-a03c-876090c779ac','Single Story',5,1,0),
 ('87ed96e3-cc1c-4ec1-bccd-8acfd44be912','3 Stories Pack',12,3,1);

CREATE TABLE story_credits (
    owner_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0)
);
CREATE TABLE stories (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    object_key varchar(512) NOT NULL,
    content_type varchar(64) NOT NULL,
    size_bytes bigint NOT NULL,
    checksum_sha256 varchar(64) NOT NULL,
    media_type varchar(8) NOT NULL CHECK (media_type IN ('IMAGE','VIDEO')),
    status varchar(16) NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING','READY','PUBLISHED','DELETED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    upload_expires_at timestamptz NOT NULL,
    published_at timestamptz,
    expires_at timestamptz,
    plan_id uuid REFERENCES story_plans(id),
    plan_version bigint,
    CONSTRAINT story_publication_dates CHECK (status <> 'PUBLISHED' OR (published_at IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE INDEX stories_owner_created ON stories(owner_id,created_at DESC);
CREATE INDEX stories_active ON stories(expires_at,published_at DESC) WHERE status = 'PUBLISHED';
