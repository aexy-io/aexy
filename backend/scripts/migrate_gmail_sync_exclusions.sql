-- Keeping some mail out of a synced Gmail account.
--
-- Connecting a personal mailbox to a shared workspace is only a reasonable
-- thing to ask if some of it can be kept out. Two tables:
--
-- `google_sync_exclusion_rules` — standing rules, by address or domain,
-- evaluated before a message becomes a `synced_emails` row, so excluded mail
-- leaves no body, snippet or attachment preview behind to be scrubbed later.
--
-- `google_sync_hidden_messages` — the tombstone for one-off hides.
-- `_sync_message` treats the presence of a `synced_emails` row as "already
-- seen"; it *is* the dedup marker. So deleting a hidden message's row is not
-- enough — the next full sync would import it again and the user would watch
-- something they hid come back. The tombstone holds no content, only the Gmail
-- id, which is all both the dedup check and the hide need.
--
-- Both key on the integration rather than the workspace: the person who
-- connected the mailbox owns the decision, and a workspace-scoped rule would be
-- one somebody else could delete.

CREATE TABLE IF NOT EXISTS google_sync_exclusion_rules (
    id UUID PRIMARY KEY,
    integration_id UUID NOT NULL
        REFERENCES google_integrations(id) ON DELETE CASCADE,
    -- Denormalised so an admin's "show me this workspace's exclusions" does not
    -- have to join through integrations.
    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,

    kind VARCHAR(16) NOT NULL,
    -- Normalised lowercase on the way in. A domain is stored bare
    -- ("acme.com"), never "@acme.com", so matching is one comparison.
    value VARCHAR(255) NOT NULL,
    -- 'participants' (default) or 'sender'. Sender-only leaves your own replies
    -- to a hidden domain in place — they carry the counterparty in `to_emails`,
    -- not `from_email` — so it exposes half the thread. Participants is the
    -- honest default; sender-only is the narrower deliberate choice.
    match_scope VARCHAR(16) NOT NULL DEFAULT 'participants',

    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_google_sync_exclusion UNIQUE (integration_id, kind, value),
    CONSTRAINT ck_google_sync_exclusion_kind
        CHECK (kind IN ('address', 'domain')),
    CONSTRAINT ck_google_sync_exclusion_scope
        CHECK (match_scope IN ('participants', 'sender'))
);

CREATE INDEX IF NOT EXISTS ix_google_sync_exclusion_rules_integration
    ON google_sync_exclusion_rules (integration_id);

CREATE INDEX IF NOT EXISTS ix_google_sync_exclusion_rules_workspace
    ON google_sync_exclusion_rules (workspace_id);

-- Every sync of every message asks "does any rule match this address", so the
-- lookup is by value, not by rule.
CREATE INDEX IF NOT EXISTS ix_google_sync_exclusion_rules_value
    ON google_sync_exclusion_rules (value);


CREATE TABLE IF NOT EXISTS google_sync_hidden_messages (
    id UUID PRIMARY KEY,
    integration_id UUID NOT NULL
        REFERENCES google_integrations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,
    gmail_id VARCHAR(255) NOT NULL,

    -- Which rule hid it, when a retroactive purge did the hiding; NULL for a
    -- one-off hide. SET NULL rather than CASCADE on purpose: deleting a rule
    -- must not resurrect the mail it already removed.
    rule_id UUID REFERENCES google_sync_exclusion_rules(id) ON DELETE SET NULL,
    hidden_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_google_sync_hidden_message UNIQUE (integration_id, gmail_id)
);

CREATE INDEX IF NOT EXISTS ix_google_sync_hidden_messages_integration
    ON google_sync_hidden_messages (integration_id);

CREATE INDEX IF NOT EXISTS ix_google_sync_hidden_messages_gmail_id
    ON google_sync_hidden_messages (gmail_id);
