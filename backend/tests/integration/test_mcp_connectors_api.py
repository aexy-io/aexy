"""The OAuth 2.1 + connector-management surface, driven over HTTP.

`tests/unit/test_mcp_connectors.py` covers the service directly. This walks the
same ground a remote client actually walks — discovery, Dynamic Client
Registration, consent, code exchange, then the settings screen that lists and
revokes what came out of it — because several of the properties that matter only
exist once the routers, dependencies and auth are in the path:

  * the endpoints are mounted where the discovery document says they are, since
    a client reads that document rather than our docs;
  * the management API refuses an anonymous caller and refuses another
    developer's grant, which is the difference between a revocation screen and
    a way to knock somebody else offline;
  * revoking through the API a person clicks really does kill the client — both
    halves of the pair, so nothing can quietly refresh its way back in.

Everything runs against the in-process app and the test database. No server, no
container, and no network.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

settings = get_settings()

REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect"


def _token_for(developer_id: str) -> str:
    return jwt.encode(
        {
            "sub": developer_id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
            "type": "access",
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _pkce() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    return verifier, challenge


@pytest.fixture
async def people(db_session):
    """Two developers who both belong to one workspace."""
    owner = Developer(email="owner@example.com", name="Owner")
    other = Developer(email="other@example.com", name="Other")
    db_session.add_all([owner, other])
    await db_session.flush()

    workspace = Workspace(name="Probe WS", slug="probe-ws", owner_id=owner.id)
    db_session.add(workspace)
    await db_session.flush()

    db_session.add_all(
        [
            WorkspaceMember(workspace_id=workspace.id, developer_id=owner.id, role="owner"),
            WorkspaceMember(workspace_id=workspace.id, developer_id=other.id, role="member"),
        ]
    )
    await db_session.commit()
    return owner, other, workspace


async def _connect(client, developer, workspace, *, name="ChatGPT"):
    """Walk a client all the way from registration to a live token pair."""
    auth = {"Authorization": f"Bearer {_token_for(developer.id)}"}

    registration = await client.post(
        "/oauth/register",
        json={
            "client_name": name,
            "redirect_uris": [REDIRECT],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        },
    )
    assert registration.status_code == 201, registration.text
    client_id = registration.json()["client_id"]

    verifier, challenge = _pkce()
    consent = await client.post(
        "/oauth/authorize/grant",
        headers=auth,
        json={
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "scope": "mcp",
            "workspace_id": workspace.id,
        },
    )
    assert consent.status_code == 200, consent.text
    code = urllib.parse.parse_qs(
        urllib.parse.urlparse(consent.json()["redirect_to"]).query
    )["code"][0]

    exchanged = await client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    assert exchanged.status_code == 200, exchanged.text
    return client_id, exchanged.json()


class TestDiscovery:
    async def test_protected_resource_metadata(self, client):
        r = await client.get("/.well-known/oauth-protected-resource")
        assert r.status_code == 200
        assert r.json()["authorization_servers"]

    async def test_authorization_server_metadata_is_honest(self, client):
        """A client configures itself from this document, so it must be true."""
        r = await client.get("/.well-known/oauth-authorization-server")
        assert r.status_code == 200
        body = r.json()

        # OAuth 2.1: PKCE is mandatory and `plain` is not a method we accept.
        assert body["code_challenge_methods_supported"] == ["S256"]
        assert "authorization_code" in body["grant_types_supported"]

        # Every advertised endpoint must actually answer, or the client walks
        # into a 404 halfway through a flow it cannot restart.
        for key in ("registration_endpoint", "token_endpoint", "revocation_endpoint"):
            path = urllib.parse.urlparse(body[key]).path
            assert (await client.post(path)).status_code != 404, key


class TestConnectorListing:
    async def test_authorizing_produces_one_connector(self, client, people):
        owner, _, workspace = people
        client_id, _ = await _connect(client, owner, workspace)

        r = await client.get(
            "/api/v1/mcp/connectors",
            headers={"Authorization": f"Bearer {_token_for(owner.id)}"},
        )
        assert r.status_code == 200
        rows = [c for c in r.json() if c["client_id"] == client_id]

        assert len(rows) == 1
        assert rows[0]["is_active"] is True
        assert rows[0]["client_name"] == "ChatGPT"
        assert rows[0]["workspace_name"] == "Probe WS"

    async def test_listing_carries_no_token_material(self, client, people):
        """A settings page should never hold a usable credential."""
        owner, _, workspace = people
        await _connect(client, owner, workspace)

        r = await client.get(
            "/api/v1/mcp/connectors",
            headers={"Authorization": f"Bearer {_token_for(owner.id)}"},
        )
        for row in r.json():
            for value in row.values():
                if isinstance(value, str):
                    assert not value.startswith("mcp_at_")
                    assert not value.startswith("mcp_rt_")

    async def test_you_cannot_see_another_developers_connectors(self, client, people):
        owner, other, workspace = people
        client_id, _ = await _connect(client, owner, workspace)

        r = await client.get(
            "/api/v1/mcp/connectors",
            headers={"Authorization": f"Bearer {_token_for(other.id)}"},
        )
        assert r.status_code == 200
        assert [c for c in r.json() if c["client_id"] == client_id] == []

    async def test_listing_requires_authentication(self, client):
        r = await client.get("/api/v1/mcp/connectors")
        assert r.status_code in (401, 403)


class TestRevocation:
    async def test_revoking_kills_both_halves_of_the_grant(self, client, people):
        """The whole point: after this, the client is genuinely locked out."""
        owner, _, workspace = people
        client_id, tokens = await _connect(client, owner, workspace)
        auth = {"Authorization": f"Bearer {_token_for(owner.id)}"}

        rows = (await client.get("/api/v1/mcp/connectors", headers=auth)).json()
        grant_id = next(c["grant_id"] for c in rows if c["client_id"] == client_id)

        assert (
            await client.delete(f"/api/v1/mcp/connectors/{grant_id}", headers=auth)
        ).status_code == 204

        # The access token no longer opens the transport...
        r = await client.post(
            "/api/v1/mcp",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        )
        assert r.status_code == 401

        # ...and the refresh token cannot mint a replacement.
        r = await client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": tokens["refresh_token"],
                "client_id": client_id,
            },
        )
        assert r.status_code == 400

    async def test_revoked_connector_stays_listed(self, client, people):
        """Revocation is not deletion — the row is the audit trail."""
        owner, _, workspace = people
        client_id, _ = await _connect(client, owner, workspace)
        auth = {"Authorization": f"Bearer {_token_for(owner.id)}"}

        rows = (await client.get("/api/v1/mcp/connectors", headers=auth)).json()
        grant_id = next(c["grant_id"] for c in rows if c["client_id"] == client_id)
        await client.delete(f"/api/v1/mcp/connectors/{grant_id}", headers=auth)

        rows = (await client.get("/api/v1/mcp/connectors", headers=auth)).json()
        row = next(c for c in rows if c["client_id"] == client_id)
        assert row["is_active"] is False

    async def test_cannot_revoke_another_developers_connector(self, client, people):
        """`grant_id` comes from the caller, so ownership is checked server-side."""
        owner, other, workspace = people
        client_id, tokens = await _connect(client, owner, workspace)

        rows = (
            await client.get(
                "/api/v1/mcp/connectors",
                headers={"Authorization": f"Bearer {_token_for(owner.id)}"},
            )
        ).json()
        grant_id = next(c["grant_id"] for c in rows if c["client_id"] == client_id)

        r = await client.delete(
            f"/api/v1/mcp/connectors/{grant_id}",
            headers={"Authorization": f"Bearer {_token_for(other.id)}"},
        )
        assert r.status_code == 404

        # And the connector is genuinely untouched, not merely still listed.
        r = await client.post(
            "/api/v1/mcp",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        )
        assert r.status_code == 200

    async def test_unknown_grant_is_a_404(self, client, people):
        owner, _, _workspace = people
        r = await client.delete(
            "/api/v1/mcp/connectors/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {_token_for(owner.id)}"},
        )
        assert r.status_code == 404

    async def test_revocation_requires_authentication(self, client, people):
        owner, _, workspace = people
        client_id, _ = await _connect(client, owner, workspace)
        rows = (
            await client.get(
                "/api/v1/mcp/connectors",
                headers={"Authorization": f"Bearer {_token_for(owner.id)}"},
            )
        ).json()
        grant_id = next(c["grant_id"] for c in rows if c["client_id"] == client_id)

        r = await client.delete(f"/api/v1/mcp/connectors/{grant_id}")
        assert r.status_code in (401, 403)
