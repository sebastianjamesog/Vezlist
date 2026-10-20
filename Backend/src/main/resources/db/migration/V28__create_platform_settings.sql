CREATE TABLE platform_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    age_gate_title VARCHAR(160) NOT NULL,
    age_gate_body VARCHAR(2000) NOT NULL,
    review_sla_hours INTEGER NOT NULL CHECK (review_sla_hours BETWEEN 1 AND 72),
    report_sla_hours INTEGER NOT NULL CHECK (report_sla_hours BETWEEN 1 AND 168),
    ticket_sla_hours INTEGER NOT NULL CHECK (ticket_sla_hours BETWEEN 1 AND 168),
    version BIGINT NOT NULL DEFAULT 0
);
INSERT INTO platform_settings VALUES (1, 'This site is for adults',
 'Personals carries adult ads and stories posted by members. Some of it is explicit.', 2, 48, 24, 0);
