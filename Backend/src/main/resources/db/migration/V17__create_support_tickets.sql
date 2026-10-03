CREATE TABLE support_tickets (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES app_users(id),
    site_scope VARCHAR(20) NOT NULL CHECK (site_scope IN ('MARKETPLACE', 'PERSONALS')),
    subject VARCHAR(160) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_owner_site_time ON support_tickets(owner_id, site_scope, created_at DESC, id DESC);
CREATE INDEX idx_support_queue ON support_tickets(site_scope, status, updated_at, id);

CREATE TABLE support_messages (
    id UUID PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES app_users(id),
    staff BOOLEAN NOT NULL DEFAULT FALSE,
    body VARCHAR(4000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_ticket_time ON support_messages(ticket_id, created_at, id);
