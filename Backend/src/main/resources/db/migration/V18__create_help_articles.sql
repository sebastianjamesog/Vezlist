CREATE TABLE help_articles (
    id UUID PRIMARY KEY,
    category VARCHAR(80) NOT NULL,
    question VARCHAR(240) NOT NULL,
    answer TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_help_articles_public ON help_articles(published, category, updated_at DESC, id DESC);
