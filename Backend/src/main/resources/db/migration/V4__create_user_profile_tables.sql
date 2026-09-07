CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    phone VARCHAR(32),
    location VARCHAR(150),
    bio VARCHAR(200),
    avatar_url VARCHAR(2048),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    email_updates BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    show_phone_on_ads BOOLEAN NOT NULL DEFAULT TRUE,
    precise_location BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE account_deletion_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT account_deletion_status_known
        CHECK (status IN ('PENDING', 'CANCELLED', 'COMPLETED'))
);

CREATE UNIQUE INDEX account_deletion_one_pending_ix
    ON account_deletion_requests (user_id)
    WHERE status = 'PENDING';

CREATE INDEX account_deletion_requested_at_ix
    ON account_deletion_requests (requested_at DESC);
