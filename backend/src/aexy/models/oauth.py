"""OAuth 2.1 authorization-server tables.

Aexy is the authorization server for remote MCP clients. ChatGPT — and any
other client that consumes a *remote* MCP server rather than launching a local
process — will only authenticate this way: it discovers the endpoints, registers
itself, and walks the authorization-code flow. There is no header it can be
told to send instead, which is why this exists rather than reusing `api_tokens`.

Three things are load-bearing across these tables:

  * **Nothing usable is stored.** Client secrets, authorization codes, access
    tokens and refresh tokens are all kept as SHA-256 digests, so a read of this
    schema yields nothing that can be replayed. Only the prefix is kept, and only
    so a person can recognise a token in a list.
  * **Codes are single-use.** `consumed_at` is set on first redemption, and a
    second attempt is not merely refused — it revokes the tokens already issued
    from that code, because a replayed code means the code leaked.
  * **PKCE is mandatory.** OAuth 2.1 drops the implicit grant and requires PKCE
    for every client; `code_challenge` is non-nullable for that reason.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class OAuthClient(Base):
    """A client registered through Dynamic Client Registration (RFC 7591).

    Registration is open, which is what the spec expects of an MCP server: the
    client is an install of ChatGPT or Claude, and there is no human to approve
    it beforehand. Registration therefore grants nothing on its own — a client
    row is only a name and a set of redirect URIs. Every scrap of access still
    comes from a person completing the consent step in `/oauth/authorize`.
    """

    __tablename__ = "oauth_clients"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    client_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    # Null for public clients. ChatGPT registers as confidential, but native
    # clients that cannot keep a secret are legitimate under OAuth 2.1 provided
    # they use PKCE — which everything here must do regardless.
    client_secret_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Exact-match list. Never prefix-matched: a redirect_uri that is merely
    # "under" a registered one is the classic open-redirect token exfiltration.
    redirect_uris: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    grant_types: Mapped[list] = mapped_column(
        JSON, nullable=False, default=lambda: ["authorization_code", "refresh_token"]
    )
    token_endpoint_auth_method: Mapped[str] = mapped_column(
        String(32), nullable=False, default="client_secret_post"
    )
    client_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_uri: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OAuthAuthorizationCode(Base):
    """A one-time code bridging the consent screen and the token endpoint."""

    __tablename__ = "oauth_authorization_codes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    client_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Which workspace the person consented to expose. An MCP session is scoped
    # to one, so the tool list a client sees is the access model of that
    # workspace and not a union across everything the person belongs to.
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    redirect_uri: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Non-nullable: OAuth 2.1 requires PKCE from every client, public or not.
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    code_challenge_method: Mapped[str] = mapped_column(String(8), nullable=False, default="S256")

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OAuthToken(Base):
    """An issued access or refresh token, stored only as a digest.

    Access and refresh tokens share a table because they share a lifecycle: the
    thing that matters at check time is "is this digest live, and whose is it".
    Splitting them would mean two revocation paths, and a revocation path that
    misses one of the pair is not a revocation.
    """

    __tablename__ = "oauth_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # Shown in the UI so somebody can tell two grants apart before revoking one.
    token_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    token_type: Mapped[str] = mapped_column(String(16), nullable=False)  # access | refresh

    client_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scope: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Ties an access token to the refresh token that minted it, and each rotated
    # refresh token to the one it replaced. Revoking a grant walks this chain,
    # so revoking a refresh token cannot leave a live access token behind.
    grant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # The hot path is "resolve this digest to a live grant" on every MCP
        # call; the second is "show me / revoke everything this person granted".
        Index("ix_oauth_tokens_developer_client", "developer_id", "client_id"),
    )
