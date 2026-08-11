"""Connector management — the screen a person uses to see and cut off access.

A revocation surface has two ways to be worse than useless, and both are tested
here rather than assumed:

  * **Showing less than the truth.** A grant is several token rows — an access
    token, the refresh token that minted it, and every rotation before them —
    so a naive listing reports one connector as many, or reports a live grant
    as gone because its access token aged out. Either reading leaves somebody
    believing they revoked something they did not.
  * **Revoking somebody else's.** ``grant_id`` arrives from the client, so
    ownership is checked server-side; without that, knowing an id is enough to
    knock another person's connector offline.
"""

from __future__ import annotations

import base64
import hashlib
import secrets

import pytest
from sqlalchemy import update

from aexy.models.developer import Developer
from aexy.models.oauth import OAuthToken
from aexy.models.workspace import Workspace
from aexy.services.mcp_oauth_service import (
    ACCESS_TOKEN_TTL,
    McpOAuthService,
    OAuthError,
    _now,
)

REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect"


def _pkce() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    return verifier, challenge


@pytest.fixture
async def actors(db_session):
    """A developer, a second developer, and a workspace to grant against."""
    owner = Developer(email="owner@example.com", name="Owner")
    other = Developer(email="other@example.com", name="Other")
    db_session.add_all([owner, other])
    await db_session.flush()

    workspace = Workspace(name="Test WS", slug="test-ws", owner_id=owner.id)
    db_session.add(workspace)
    await db_session.flush()
    return owner, other, workspace


async def _connect(service, developer_id, workspace_id, *, name="ChatGPT"):
    """Register, consent and redeem — leaving one live grant behind.

    Tokens are what a grant is made of, so nothing is listable until the code
    has been redeemed; every test that inspects a connector goes through here.
    """
    client, _secret = await service.register_client(
        client_name=name,
        redirect_uris=[REDIRECT],
        grant_types=["authorization_code", "refresh_token"],
        token_endpoint_auth_method="none",
    )
    verifier, challenge = _pkce()
    code = await service.create_authorization_code(
        client_id=client.client_id,
        developer_id=developer_id,
        workspace_id=workspace_id,
        redirect_uri=REDIRECT,
        scope="mcp",
        code_challenge=challenge,
        code_challenge_method="S256",
    )
    issued = await service.exchange_code(
        code=code,
        client_id=client.client_id,
        client_secret=None,
        redirect_uri=REDIRECT,
        code_verifier=verifier,
    )
    return client, issued


class TestListing:
    async def test_one_grant_is_one_connector(self, db_session, actors):
        """Access + refresh are two rows and one decision."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        await _connect(service, owner.id, ws.id)

        grants = await service.list_grants(owner.id)

        assert len(grants) == 1
        assert grants[0].client_name == "ChatGPT"
        assert grants[0].workspace_id == ws.id
        assert grants[0].is_active is True

    async def test_rotation_does_not_multiply_connectors(self, db_session, actors):
        """Refreshing mints new rows on the same grant, not a new connector."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        client, issued = await _connect(service, owner.id, ws.id)

        await service.refresh(
            refresh_token=issued.refresh_token,
            client_id=client.client_id,
            client_secret=None,
        )

        grants = await service.list_grants(owner.id)
        assert len(grants) == 1, "rotation created a second connector row"
        assert grants[0].is_active is True

    async def test_expired_access_token_is_still_a_live_connector(
        self, db_session, actors
    ):
        """The refresh token is what keeps a grant alive, not the access token."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        await _connect(service, owner.id, ws.id)

        # Age the access token past its TTL, leaving the refresh token untouched.
        await db_session.execute(
            update(OAuthToken)
            .where(OAuthToken.token_type == "access")
            .values(expires_at=_now() - ACCESS_TOKEN_TTL)
        )

        grants = await service.list_grants(owner.id)
        assert grants[0].is_active is True

    async def test_revoked_grant_is_listed_but_inactive(self, db_session, actors):
        """Revocation is not deletion — the record is the audit trail."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        await _connect(service, owner.id, ws.id)

        grant = (await service.list_grants(owner.id))[0]
        await service.revoke_grant_for_developer(owner.id, grant.grant_id)

        grants = await service.list_grants(owner.id)
        assert len(grants) == 1
        assert grants[0].is_active is False

    async def test_only_your_own_grants_are_listed(self, db_session, actors):
        owner, other, ws = actors
        service = McpOAuthService(db_session)
        await _connect(service, owner.id, ws.id, name="Owner's ChatGPT")
        await _connect(service, other.id, ws.id, name="Other's ChatGPT")

        grants = await service.list_grants(owner.id)
        assert len(grants) == 1
        assert grants[0].client_name == "Owner's ChatGPT"

    async def test_two_workspaces_are_two_connectors(self, db_session, actors):
        """A grant is scoped to one workspace, so each is its own decision."""
        owner, _, ws = actors
        second = Workspace(name="Second WS", slug="second-ws", owner_id=owner.id)
        db_session.add(second)
        await db_session.flush()

        service = McpOAuthService(db_session)
        await _connect(service, owner.id, ws.id)
        await _connect(service, owner.id, second.id)

        grants = await service.list_grants(owner.id)
        assert {g.workspace_id for g in grants} == {ws.id, second.id}

    async def test_no_token_material_is_exposed(self, db_session, actors):
        """A settings page has no business holding a bearer credential."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        await _connect(service, owner.id, ws.id)

        grant = (await service.list_grants(owner.id))[0]
        for value in vars(grant).values():
            if isinstance(value, str):
                assert not value.startswith("mcp_at_")
                assert not value.startswith("mcp_rt_")


class TestRevocation:
    async def test_revoking_kills_the_access_token(self, db_session, actors):
        """The point of the screen: the client stops working."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        _client, issued = await _connect(service, owner.id, ws.id)
        assert await service.resolve_access_token(issued.access_token) is not None

        grant = (await service.list_grants(owner.id))[0]
        await service.revoke_grant_for_developer(owner.id, grant.grant_id)

        assert await service.resolve_access_token(issued.access_token) is None

    async def test_revoking_kills_the_refresh_token(self, db_session, actors):
        """A revocation that leaves refresh alive revokes nothing."""
        owner, _, ws = actors
        service = McpOAuthService(db_session)
        client, issued = await _connect(service, owner.id, ws.id)

        grant = (await service.list_grants(owner.id))[0]
        await service.revoke_grant_for_developer(owner.id, grant.grant_id)

        with pytest.raises(OAuthError):
            await service.refresh(
                refresh_token=issued.refresh_token,
                client_id=client.client_id,
                client_secret=None,
            )

    async def test_cannot_revoke_someone_elses_connector(self, db_session, actors):
        owner, other, ws = actors
        service = McpOAuthService(db_session)
        _client, issued = await _connect(service, owner.id, ws.id)
        grant = (await service.list_grants(owner.id))[0]

        with pytest.raises(OAuthError) as exc:
            await service.revoke_grant_for_developer(other.id, grant.grant_id)
        assert exc.value.status_code == 404

        # And the owner's connector is genuinely untouched, not merely listed.
        assert (await service.list_grants(owner.id))[0].is_active is True
        assert await service.resolve_access_token(issued.access_token) is not None

    async def test_unknown_grant_is_a_404(self, db_session, actors):
        owner, _, _ws = actors
        service = McpOAuthService(db_session)

        with pytest.raises(OAuthError) as exc:
            await service.revoke_grant_for_developer(owner.id, "no-such-grant")
        assert exc.value.status_code == 404
