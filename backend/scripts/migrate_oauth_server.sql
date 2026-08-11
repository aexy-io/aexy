-- OAuth 2.1 authorization server, for remote MCP clients.
--
-- ChatGPT and other remote-only MCP clients cannot be handed an API token:
-- they discover the authorization server, register themselves, and walk the
-- authorization-code flow. These three tables are what that requires.
--
-- Nothing replayable is stored. Client secrets, codes, access tokens and
-- refresh tokens are all SHA-256 digests; only a short prefix is kept, so a
-- person can tell two grants apart in a list.
--
-- Idempotent: safe to re-run.

-- ─── oauth_clients ─────────────────────────────────────────────────────
-- Registration is open, as the MCP spec expects: the "client" is somebody's
-- install of ChatGPT, and there is no admin standing by to approve it. A row
-- here grants nothing — access comes only from a person completing consent.
CREATE TABLE IF NOT EXISTS oauth_clients (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id                   VARCHAR(64)  NOT NULL UNIQUE,
    client_secret_hash          VARCHAR(64),           -- NULL for public clients
    client_name                 VARCHAR(255) NOT NULL,
    redirect_uris               JSONB        NOT NULL DEFAULT '[]'::jsonb,
    grant_types                 JSONB        NOT NULL
                                    DEFAULT '["authorization_code","refresh_token"]'::jsonb,
    token_endpoint_auth_method  VARCHAR(32)  NOT NULL DEFAULT 'client_secret_post',
    client_uri                  TEXT,
    logo_uri                    TEXT,
    is_active                   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_oauth_clients_client_id ON oauth_clients (client_id);

-- ─── oauth_authorization_codes ─────────────────────────────────────────
-- Single-use bridge between the consent screen and the token endpoint.
-- code_challenge is NOT NULL because OAuth 2.1 requires PKCE from every
-- client, confidential ones included.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash              VARCHAR(64) NOT NULL UNIQUE,
    client_id              VARCHAR(64) NOT NULL,
    developer_id           UUID        NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id           UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    redirect_uri           TEXT        NOT NULL,
    scope                  TEXT        NOT NULL DEFAULT '',
    code_challenge         VARCHAR(128) NOT NULL,
    code_challenge_method  VARCHAR(8)  NOT NULL DEFAULT 'S256',
    expires_at             TIMESTAMPTZ NOT NULL,
    consumed_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_oauth_codes_code_hash    ON oauth_authorization_codes (code_hash);
CREATE INDEX IF NOT EXISTS ix_oauth_codes_developer    ON oauth_authorization_codes (developer_id);
CREATE INDEX IF NOT EXISTS ix_oauth_codes_workspace    ON oauth_authorization_codes (workspace_id);
CREATE INDEX IF NOT EXISTS ix_oauth_codes_client       ON oauth_authorization_codes (client_id);

-- ─── oauth_tokens ──────────────────────────────────────────────────────
-- Access and refresh tokens share a table because they share a lifecycle, and
-- a revocation that misses one of the pair is not a revocation. grant_id ties
-- an access token to the refresh token that minted it and each rotated refresh
-- token to the one it replaced, so revoking a grant can walk the whole chain.
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash     VARCHAR(64) NOT NULL UNIQUE,
    token_prefix   VARCHAR(16) NOT NULL,
    token_type     VARCHAR(16) NOT NULL,   -- access | refresh
    client_id      VARCHAR(64) NOT NULL,
    developer_id   UUID        NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    scope          TEXT        NOT NULL DEFAULT '',
    grant_id       UUID        NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    revoked_at     TIMESTAMPTZ,
    last_used_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The hot path is "resolve this digest to a live grant", run on every MCP call.
CREATE INDEX IF NOT EXISTS ix_oauth_tokens_token_hash ON oauth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS ix_oauth_tokens_grant      ON oauth_tokens (grant_id);
CREATE INDEX IF NOT EXISTS ix_oauth_tokens_developer  ON oauth_tokens (developer_id);
CREATE INDEX IF NOT EXISTS ix_oauth_tokens_client     ON oauth_tokens (client_id);
CREATE INDEX IF NOT EXISTS ix_oauth_tokens_workspace  ON oauth_tokens (workspace_id);
-- "Show me / revoke everything this person granted to this client."
CREATE INDEX IF NOT EXISTS ix_oauth_tokens_developer_client
    ON oauth_tokens (developer_id, client_id);
