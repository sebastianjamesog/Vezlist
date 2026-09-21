-- Admin console support: suspension detail on user accounts (the account is
-- already gated app-wide by app_users.enabled, used by moderation, saved
-- listings, discovery and seller lookups; these two columns only add the
-- human-readable "why" for the admin UI) and a generic append-only audit
-- log for admin actions that have nowhere else to record themselves
-- (moderation decisions already have moderation_actions/audit_events; user
-- suspension and taxonomy CRUD do not).
ALTER TABLE app_users ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN suspension_reason VARCHAR(200);

CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES app_users(id),
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id VARCHAR(80),
    details VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_created ON admin_audit_log (created_at DESC, id DESC);

-- Reuse the immutability guard already defined for moderation history.
CREATE TRIGGER trg_admin_audit_log_immutable BEFORE UPDATE OR DELETE ON admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION vezlist_immutable_moderation_history();
