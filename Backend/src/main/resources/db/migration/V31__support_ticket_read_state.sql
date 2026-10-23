-- Preserve the former chronological ordering for existing conversations.
CREATE SEQUENCE support_message_order_seq;
ALTER TABLE support_messages ADD COLUMN message_order BIGINT;
WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS position FROM support_messages
)
UPDATE support_messages m SET message_order=o.position FROM ordered o WHERE m.id=o.id;
SELECT setval('support_message_order_seq', GREATEST(COALESCE(MAX(message_order), 0), 1), COUNT(*) > 0)
FROM support_messages;
ALTER TABLE support_messages ALTER COLUMN message_order SET DEFAULT nextval('support_message_order_seq');
ALTER TABLE support_messages ALTER COLUMN message_order SET NOT NULL;
CREATE UNIQUE INDEX idx_support_message_order ON support_messages(message_order);
CREATE INDEX idx_support_messages_unread ON support_messages(ticket_id, staff, message_order);

CREATE TABLE support_ticket_reads (
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    staff BOOLEAN NOT NULL,
    last_read_order BIGINT NOT NULL CHECK (last_read_order > 0),
    PRIMARY KEY (ticket_id, actor_id, staff)
);
