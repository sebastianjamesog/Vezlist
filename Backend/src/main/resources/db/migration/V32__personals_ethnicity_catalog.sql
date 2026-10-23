CREATE TABLE ethnicities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label VARCHAR(80) NOT NULL CHECK (label = btrim(label) AND length(label) > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    display_order BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE UNIQUE INDEX idx_ethnicities_label_unique ON ethnicities(lower(label));
INSERT INTO ethnicities(label) VALUES
    ('Asian'), ('Black'), ('Latino / Hispanic'), ('Middle Eastern'),
    ('Mixed'), ('South Asian'), ('White'), ('Other');
