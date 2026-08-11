"""The OAuth 2.1 authorization server behind the remote MCP endpoint.

Everything here exists because a remote MCP client cannot be handed a token out
of band. ChatGPT discovers this server, registers itself, and sends a person
through the authorization-code flow; there is no configuration file to put a
credential in. So Aexy issues its own.

Deliberate choices, each of which is a way this can go wrong if reversed:

  * **PKCE is required of everyone.** OAuth 2.1 drops the implicit grant and
    mandates PKCE even for confidential clients. Only S256 is accepted — `plain`
    is a challenge that anyone who saw the request can satisfy.
  * **A replayed code revokes its own grant.** Redeeming a code twice is not a
    user error; it means the code leaked. The second attempt fails *and* kills
    the tokens the first one produced, per RFC 6749 §4.1.2.
  * **Refresh tokens rotate.** Each refresh mints a new one and retires the old.
    Reusing a retired refresh token revokes the whole chain, for the same reason.
  * **Nothing replayable is persisted.** Every secret is stored as a SHA-256
    digest, so this schema leaks nothing usable.
  * **A grant is scoped to one workspace.** The person picks it at consent, and
    the tool list the client sees is that workspace's access model — not a union
    over everything they can reach.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.oauth import OAuthAuthorizationCode, OAuthClient, OAuthToken

# Short, because a code is redeemed within seconds of consent and every extra
# second is replay window. RFC 6749 recommends a maximum of 10 minutes; the flow
# does not need anything like that.
AUTHORIZATION_CODE_TTL = timedelta(minutes=5)
ACCESS_TOKEN_TTL = timedelta(hours=1)
REFRESH_TOKEN_TTL = timedelta(days=30)

ACCESS_TOKEN_PREFIX = "mcp_at_"
REFRESH_TOKEN_PREFIX = "mcp_rt_"

# Not `aexy_`: that prefix routes to ApiTokenService in
# `get_current_developer_id`, and an MCP credential is not an API token. Keeping
# them lexically distinct means neither can be fed to the other's validator by
# accident, and a leaked one is recognisable on sight.
SUPPORTED_SCOPES = ("mcp",)
DEFAULT_SCOPE = "mcp"


class OAuthError(Exception):
    """An OAuth-shaped failure, rendered as the spec's JSON error body."""

    def __init__(self, error: str, description: str, status_code: int = 400):
        super().__init__(description)
        self.error = error
        self.description = description
        self.status_code = status_code


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str
    expires_in: int
    scope: str


@dataclass(frozen=True)
class ResolvedGrant:
    developer_id: str
    workspace_id: str
    client_id: str
    scope: str
    grant_id: str


@dataclass(frozen=True)
class ConnectorGrant:
    """One authorised client, as a person sees it in their settings.

    A grant spans several token rows — an access token, the refresh token that
    minted it, and every rotation before them — so this collapses that chain
    back into the single decision the person actually made.
    """

    grant_id: str
    client_id: str
    client_name: str
    client_uri: str | None
    logo_uri: str | None
    workspace_id: str
    scope: str
    authorized_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    is_active: bool


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    """Postgres gives back tz-aware datetimes; SQLite in tests does not.

    Comparing a naive datetime to an aware one raises, which would turn an
    expiry check into a 500 — failing open in the sense that the caller never
    learns their token expired, and closed in the sense that nothing works.
    """
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def verify_pkce(verifier: str, challenge: str) -> bool:
    """S256 only: base64url(sha256(verifier)) == challenge, compared in constant time."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return secrets.compare_digest(computed, challenge)


class McpOAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Dynamic client registration (RFC 7591)
    # ------------------------------------------------------------------

    async def register_client(
        self,
        *,
        client_name: str,
        redirect_uris: list[str],
        grant_types: list[str] | None = None,
        token_endpoint_auth_method: str = "client_secret_post",
        client_uri: str | None = None,
        logo_uri: str | None = None,
    ) -> tuple[OAuthClient, str | None]:
        """Register a client. Returns the row and the plaintext secret, once.

        Open registration is what the MCP spec expects — the client is somebody's
        install of ChatGPT and there is nobody to approve it in advance. It is
        safe precisely because registering grants nothing: a row here is a name
        and a redirect list, and all access still comes from a person completing
        consent.
        """
        if not redirect_uris:
            raise OAuthError(
                "invalid_redirect_uri", "At least one redirect_uri is required"
            )
        for uri in redirect_uris:
            _validate_redirect_uri(uri)

        is_public = token_endpoint_auth_method == "none"
        secret = None if is_public else secrets.token_urlsafe(32)

        client = OAuthClient(
            client_id=f"mcp_client_{secrets.token_urlsafe(16)}",
            client_secret_hash=_digest(secret) if secret else None,
            client_name=client_name[:255],
            redirect_uris=redirect_uris,
            grant_types=grant_types or ["authorization_code", "refresh_token"],
            token_endpoint_auth_method=token_endpoint_auth_method,
            client_uri=client_uri,
            logo_uri=logo_uri,
        )
        self.db.add(client)
        await self.db.flush()
        return client, secret

    async def get_client(self, client_id: str) -> OAuthClient | None:
        result = await self.db.execute(
            select(OAuthClient).where(
                OAuthClient.client_id == client_id,
                OAuthClient.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # Authorization
    # ------------------------------------------------------------------

    async def validate_authorization_request(
        self,
        *,
        client_id: str,
        redirect_uri: str,
        code_challenge: str,
        code_challenge_method: str,
        scope: str | None,
    ) -> OAuthClient:
        """Check everything before a person is shown a consent screen.

        Validating up front matters: once consent is rendered, an invalid
        redirect_uri would send the resulting code somewhere the client never
        registered, which is the whole open-redirect exfiltration shape.
        """
        client = await self.get_client(client_id)
        if client is None:
            raise OAuthError("invalid_client", "Unknown or inactive client_id", 401)

        # Exact match, never prefix. A redirect_uri merely *under* a registered
        # one is an attacker-controlled path on a trusted host.
        if redirect_uri not in (client.redirect_uris or []):
            raise OAuthError(
                "invalid_request",
                "redirect_uri does not exactly match a registered URI",
            )

        if code_challenge_method != "S256":
            raise OAuthError(
                "invalid_request",
                "code_challenge_method must be S256; OAuth 2.1 requires PKCE and "
                "`plain` is satisfiable by anyone who observed the request",
            )
        if not code_challenge:
            raise OAuthError("invalid_request", "code_challenge is required")

        for requested in (scope or DEFAULT_SCOPE).split():
            if requested not in SUPPORTED_SCOPES:
                raise OAuthError("invalid_scope", f"Unsupported scope: {requested}")

        return client

    async def create_authorization_code(
        self,
        *,
        client_id: str,
        developer_id: str,
        workspace_id: str,
        redirect_uri: str,
        scope: str,
        code_challenge: str,
        code_challenge_method: str = "S256",
    ) -> str:
        code = secrets.token_urlsafe(32)
        self.db.add(
            OAuthAuthorizationCode(
                code_hash=_digest(code),
                client_id=client_id,
                developer_id=developer_id,
                workspace_id=workspace_id,
                redirect_uri=redirect_uri,
                scope=scope,
                code_challenge=code_challenge,
                code_challenge_method=code_challenge_method,
                expires_at=_now() + AUTHORIZATION_CODE_TTL,
            )
        )
        await self.db.flush()
        return code

    # ------------------------------------------------------------------
    # Token endpoint
    # ------------------------------------------------------------------

    async def exchange_code(
        self,
        *,
        code: str,
        client_id: str,
        client_secret: str | None,
        redirect_uri: str,
        code_verifier: str,
    ) -> IssuedTokens:
        client = await self._authenticate_client(client_id, client_secret)

        result = await self.db.execute(
            select(OAuthAuthorizationCode).where(
                OAuthAuthorizationCode.code_hash == _digest(code)
            )
        )
        stored = result.scalar_one_or_none()
        if stored is None:
            raise OAuthError("invalid_grant", "Unknown authorization code")

        # A second redemption means the code leaked. Refusing is not enough —
        # whoever redeemed it first may not have been the client, so the tokens
        # it produced have to die too (RFC 6749 §4.1.2).
        if stored.consumed_at is not None:
            await self._revoke_grants_from_code(stored)
            raise OAuthError(
                "invalid_grant",
                "Authorization code already used; every token issued from it has "
                "been revoked",
            )

        expires_at = _aware(stored.expires_at)
        if expires_at is None or expires_at < _now():
            raise OAuthError("invalid_grant", "Authorization code has expired")
        if stored.client_id != client.client_id:
            raise OAuthError("invalid_grant", "Code was issued to a different client")
        if stored.redirect_uri != redirect_uri:
            raise OAuthError("invalid_grant", "redirect_uri does not match the request")
        if not code_verifier or not verify_pkce(code_verifier, stored.code_challenge):
            raise OAuthError("invalid_grant", "PKCE verification failed")

        stored.consumed_at = _now()
        return await self._issue(
            client_id=client.client_id,
            developer_id=stored.developer_id,
            workspace_id=stored.workspace_id,
            scope=stored.scope,
            grant_id=str(uuid4()),
        )

    async def refresh(
        self,
        *,
        refresh_token: str,
        client_id: str,
        client_secret: str | None,
    ) -> IssuedTokens:
        client = await self._authenticate_client(client_id, client_secret)

        result = await self.db.execute(
            select(OAuthToken).where(
                OAuthToken.token_hash == _digest(refresh_token),
                OAuthToken.token_type == "refresh",
            )
        )
        stored = result.scalar_one_or_none()
        if stored is None:
            raise OAuthError("invalid_grant", "Unknown refresh token")

        # Rotation means a retired refresh token should never be presented
        # again. If one is, treat it as a leak and kill the chain.
        if stored.revoked_at is not None:
            await self.revoke_grant(stored.grant_id)
            raise OAuthError(
                "invalid_grant",
                "Refresh token was already rotated; the grant has been revoked",
            )

        expires_at = _aware(stored.expires_at)
        if expires_at is None or expires_at < _now():
            raise OAuthError("invalid_grant", "Refresh token has expired")
        if stored.client_id != client.client_id:
            raise OAuthError("invalid_grant", "Token belongs to a different client")

        now = _now()
        stored.revoked_at = now
        # Retire the access token minted alongside it, so a refresh never leaves
        # two live access tokens on one grant.
        await self.db.execute(
            update(OAuthToken)
            .where(
                OAuthToken.grant_id == stored.grant_id,
                OAuthToken.token_type == "access",
                OAuthToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

        return await self._issue(
            client_id=client.client_id,
            developer_id=stored.developer_id,
            workspace_id=stored.workspace_id,
            scope=stored.scope,
            grant_id=stored.grant_id,
        )

    # ------------------------------------------------------------------
    # Resource server
    # ------------------------------------------------------------------

    async def resolve_access_token(self, token: str) -> ResolvedGrant | None:
        """Resolve a bearer token to its grant, or None if it cannot be used."""
        if not token.startswith(ACCESS_TOKEN_PREFIX):
            return None

        result = await self.db.execute(
            select(OAuthToken).where(
                OAuthToken.token_hash == _digest(token),
                OAuthToken.token_type == "access",
            )
        )
        stored = result.scalar_one_or_none()
        if stored is None or stored.revoked_at is not None:
            return None

        expires_at = _aware(stored.expires_at)
        if expires_at is None or expires_at < _now():
            return None

        stored.last_used_at = _now()
        return ResolvedGrant(
            developer_id=stored.developer_id,
            workspace_id=stored.workspace_id,
            client_id=stored.client_id,
            scope=stored.scope,
            grant_id=stored.grant_id,
        )

    # ------------------------------------------------------------------
    # Connector management — the person's own view of what they authorised
    # ------------------------------------------------------------------

    async def list_grants(self, developer_id: str) -> list[ConnectorGrant]:
        """Every client this developer has authorised, newest first.

        Revoked grants are kept and returned rather than hidden. Someone
        checking what reached their workspace needs to see that a connector
        existed and when it was last used; deleting the row on revocation would
        erase exactly the evidence they came for.
        """
        result = await self.db.execute(
            select(OAuthToken).where(OAuthToken.developer_id == developer_id)
        )
        tokens = list(result.scalars().all())
        if not tokens:
            return []

        clients = await self.db.execute(
            select(OAuthClient).where(
                OAuthClient.client_id.in_({t.client_id for t in tokens})
            )
        )
        by_client = {c.client_id: c for c in clients.scalars().all()}

        grouped: dict[str, list[OAuthToken]] = {}
        for token in tokens:
            grouped.setdefault(token.grant_id, []).append(token)

        now = _now()
        grants: list[ConnectorGrant] = []
        for grant_id, rows in grouped.items():
            head = min(rows, key=lambda r: r.created_at)
            client = by_client.get(head.client_id)

            used = [_aware(r.last_used_at) for r in rows]
            last_used = max((u for u in used if u is not None), default=None)

            # Live means at least one unrevoked, unexpired token remains. A
            # grant whose access token has merely aged out is still live —
            # the refresh token will mint another without asking anyone.
            refresh_expiries = [
                _aware(r.expires_at)
                for r in rows
                if r.token_type == "refresh" and r.revoked_at is None
            ]
            expires_at = max((e for e in refresh_expiries if e is not None), default=None)
            is_active = expires_at is not None and expires_at > now

            grants.append(
                ConnectorGrant(
                    grant_id=grant_id,
                    client_id=head.client_id,
                    client_name=client.client_name if client else head.client_id,
                    client_uri=client.client_uri if client else None,
                    logo_uri=client.logo_uri if client else None,
                    workspace_id=head.workspace_id,
                    scope=head.scope,
                    authorized_at=head.created_at,
                    last_used_at=last_used,
                    expires_at=expires_at,
                    is_active=is_active,
                )
            )

        grants.sort(key=lambda g: (_aware(g.authorized_at) or now), reverse=True)
        return grants

    async def revoke_grant_for_developer(self, developer_id: str, grant_id: str) -> int:
        """Revoke a grant, but only if it belongs to this developer.

        The ownership check is the whole point of this wrapper: `grant_id` comes
        from the client, and without it anyone could revoke a grant by id and
        knock another person's connector offline.
        """
        result = await self.db.execute(
            select(OAuthToken).where(
                OAuthToken.grant_id == grant_id,
                OAuthToken.developer_id == developer_id,
            )
        )
        if result.first() is None:
            raise OAuthError("invalid_request", "Unknown connector", status_code=404)
        return await self.revoke_grant(grant_id)

    async def revoke_grant(self, grant_id: str) -> int:
        """Revoke every token on a grant. Returns how many were still live."""
        result = await self.db.execute(
            update(OAuthToken)
            .where(OAuthToken.grant_id == grant_id, OAuthToken.revoked_at.is_(None))
            .values(revoked_at=_now())
        )
        return result.rowcount or 0

    async def revoke_token(self, token: str) -> bool:
        """RFC 7009. Revokes the whole grant, not just the presented token.

        Revoking one half of a pair would leave the other live, which is not
        what anyone means by revoking.
        """
        result = await self.db.execute(
            select(OAuthToken).where(OAuthToken.token_hash == _digest(token))
        )
        stored = result.scalar_one_or_none()
        if stored is None:
            return False
        await self.revoke_grant(stored.grant_id)
        return True

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _authenticate_client(
        self, client_id: str, client_secret: str | None
    ) -> OAuthClient:
        client = await self.get_client(client_id)
        if client is None:
            raise OAuthError("invalid_client", "Unknown or inactive client_id", 401)

        if client.client_secret_hash is None:
            return client  # public client; PKCE is what protects it

        if not client_secret or not secrets.compare_digest(
            _digest(client_secret), client.client_secret_hash
        ):
            raise OAuthError("invalid_client", "Client authentication failed", 401)
        return client

    async def _issue(
        self,
        *,
        client_id: str,
        developer_id: str,
        workspace_id: str,
        scope: str,
        grant_id: str,
    ) -> IssuedTokens:
        access = ACCESS_TOKEN_PREFIX + secrets.token_urlsafe(32)
        refresh = REFRESH_TOKEN_PREFIX + secrets.token_urlsafe(32)
        now = _now()

        for raw, kind, ttl in (
            (access, "access", ACCESS_TOKEN_TTL),
            (refresh, "refresh", REFRESH_TOKEN_TTL),
        ):
            self.db.add(
                OAuthToken(
                    token_hash=_digest(raw),
                    token_prefix=raw[:16],
                    token_type=kind,
                    client_id=client_id,
                    developer_id=developer_id,
                    workspace_id=workspace_id,
                    scope=scope,
                    grant_id=grant_id,
                    expires_at=now + ttl,
                )
            )
        await self.db.flush()

        return IssuedTokens(
            access_token=access,
            refresh_token=refresh,
            expires_in=int(ACCESS_TOKEN_TTL.total_seconds()),
            scope=scope,
        )

    async def _revoke_grants_from_code(self, code: OAuthAuthorizationCode) -> None:
        """Kill every token traceable to a replayed code."""
        result = await self.db.execute(
            select(OAuthToken.grant_id).where(
                OAuthToken.client_id == code.client_id,
                OAuthToken.developer_id == code.developer_id,
                OAuthToken.workspace_id == code.workspace_id,
                OAuthToken.created_at >= code.created_at,
            )
        )
        for grant_id in {row for row in result.scalars()}:
            await self.revoke_grant(grant_id)


def _validate_redirect_uri(uri: str) -> None:
    """Reject redirect targets that cannot be a real client callback.

    Loopback is allowed because native MCP clients genuinely use it. `https` is
    required everywhere else: a code delivered over plaintext http is a code
    delivered to whoever is on the path.
    """
    parsed = urlparse(uri)
    if parsed.scheme not in ("https", "http") and not parsed.scheme:
        raise OAuthError("invalid_redirect_uri", f"Unsupported redirect_uri: {uri}")
    if parsed.fragment:
        raise OAuthError(
            "invalid_redirect_uri", "redirect_uri must not contain a fragment"
        )
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise OAuthError(
            "invalid_redirect_uri",
            "http redirect_uri is only allowed for loopback; use https",
        )
