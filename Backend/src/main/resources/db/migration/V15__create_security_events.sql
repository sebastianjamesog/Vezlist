-- Security/auth event trail (login success/failure, logout, register,
-- password change). Deliberately separate from admin_audit_log: that
-- table's actor_id is NOT NULL and represents "an admin performed this
-- action" -- a failed login attempt has no authenticated actor at all, and
-- may not even correspond to a real account (a typo or a guessed email).
-- user_id here is nullable for exactly that reason; attempted_email
-- preserves what was typed regardless of whether it resolved to a user.
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(40) NOT NULL,
    user_id UUID REFERENCES app_users(id),
    attempted_email VARCHAR(320),
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    details VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_events_created ON security_events (created_at DESC, id DESC);
CREATE INDEX idx_security_events_user ON security_events (user_id, created_at DESC);

-- Reuse the immutability guard already defined for moderation/admin history.
CREATE TRIGGER trg_security_events_immutable BEFORE UPDATE OR DELETE ON security_events
    FOR EACH ROW EXECUTE FUNCTION vezlist_immutable_moderation_history();
