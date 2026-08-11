"""Request/response shapes for the MCP OAuth endpoints.

Field names follow RFC 7591 and RFC 6749 exactly — snake_case, `client_id` not
`clientId`. Clients construct these from the spec, not from our docs, so a
prettier name is a name that does not work.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ClientRegistrationRequest(BaseModel):
    """RFC 7591 §2. Only the fields we act on; the rest are ignored, not rejected,
    because clients routinely send the full metadata set."""

    client_name: str = Field(default="Unnamed MCP client", max_length=255)
    redirect_uris: list[str] = Field(default_factory=list)
    grant_types: list[str] | None = None
    token_endpoint_auth_method: str = "client_secret_post"
    client_uri: str | None = None
    logo_uri: str | None = None


class ClientRegistrationResponse(BaseModel):
    client_id: str
    # Present exactly once, in this response. Stored only as a digest, so it
    # cannot be shown again — a client that loses it must re-register.
    client_secret: str | None = None
    client_name: str
    redirect_uris: list[str]
    grant_types: list[str]
    token_endpoint_auth_method: str


class ConsentPromptResponse(BaseModel):
    """What the consent screen shows. Served by the server so the name a person
    approves is the registered one, not whatever the redirect chose to display."""

    client_id: str
    client_name: str
    client_uri: str | None = None
    logo_uri: str | None = None
    redirect_uri: str


class ConsentGrantRequest(BaseModel):
    client_id: str
    redirect_uri: str
    code_challenge: str
    code_challenge_method: str = "S256"
    # Which workspace this grant exposes. An MCP session is scoped to one, so
    # the client's tool list is that workspace's access model rather than a
    # union across everything the person can reach.
    workspace_id: str
    scope: str | None = None
    state: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    scope: str


class ConnectorSummary(BaseModel):
    """One authorised client, for the person who authorised it.

    Carries no token material — not even a prefix. A connector is identified by
    its grant, and showing a fragment of a live bearer token would put a
    credential on a settings page to no benefit.
    """

    grant_id: str
    client_id: str
    client_name: str
    client_uri: str | None = None
    logo_uri: str | None = None
    workspace_id: str
    workspace_name: str | None = None
    scope: str
    authorized_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool
