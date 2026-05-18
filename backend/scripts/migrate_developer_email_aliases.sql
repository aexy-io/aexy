-- Migration: developer_email_aliases
-- Adds a per-developer secondary-email table so commit-author attribution
-- can resolve git-config emails that don't match Developer.email exactly
-- (e.g., legacy noreply formats, work-laptop git configs, the
-- "secondary email patterns" pattern developers commit with).
--
-- The unique index is on `lower(email)` globally — a single email
-- shouldn't claim two humans. (DB enforces; the API also checks for a
-- clearer error message.)
--
-- Idempotent: re-running is a no-op.

CREATE TABLE IF NOT EXISTS developer_email_aliases (
    id            UUID         PRIMARY KEY,
    developer_id  UUID         NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    email         VARCHAR(255) NOT NULL,
    verified      BOOLEAN      NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_developer_email_aliases_email_lower
    ON developer_email_aliases (lower(email));

CREATE INDEX IF NOT EXISTS ix_developer_email_aliases_developer_id
    ON developer_email_aliases (developer_id);
