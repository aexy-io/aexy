"""
Integration tests for Slack API endpoints.

These tests verify:
- OAuth installation flow
- Slash command handling
- Event webhooks
- Interactive components
"""

import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from jose import jwt

from aexy.core.config import get_settings

settings = get_settings()

# The app verifies Slack signatures using settings.slack_signing_secret, so
# tests must sign with the *same* secret the running app is configured with
# (not a hardcoded constant).
SIGNING_SECRET = settings.slack_signing_secret


def _auth(developer_id: str) -> dict:
    payload = {
        "sub": str(developer_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        "type": "access",
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return {"Authorization": f"Bearer {token}"}


def _sign(body: str, timestamp: str | None = None) -> tuple[str, str]:
    """Produce a valid (timestamp, signature) pair for a raw request body."""
    if timestamp is None:
        timestamp = str(int(time.time()))
    sig_basestring = f"v0:{timestamp}:{body}"
    signature = "v0=" + hmac.new(
        SIGNING_SECRET.encode(),
        sig_basestring.encode(),
        hashlib.sha256,
    ).hexdigest()
    return timestamp, signature


class TestSlackAPI:
    """Integration tests for /slack endpoints."""

    @pytest.fixture
    def valid_slack_signature(self):
        """Generate a valid Slack signature for testing (uses the app secret)."""
        def _generate(body: str):
            return _sign(body)
        return _generate

    # OAuth Tests

    @pytest.mark.asyncio
    async def test_get_installation_url(
        self, client: AsyncClient, db_session, sample_developer
    ):
        """GET /slack/install redirects a workspace admin to Slack.

        The workspace and the active owner membership are the whole point:
        `_require_workspace_admin` refuses anyone who is not an active
        owner/admin of `organization_id`. This test used to pass a bare
        "org-123" with no workspace behind it and assert a redirect, i.e. the
        opposite of the endpoint's contract — it 403'd under SQLite, and under
        Postgres the id was rejected as an invalid UUID before that.
        """
        from uuid import uuid4

        from aexy.models.workspace import Workspace, WorkspaceMember

        workspace = Workspace(
            id=str(uuid4()),
            name="Slack Install Co",
            slug=f"slack-install-{uuid4().hex[:8]}",
            owner_id=sample_developer.id,
            next_task_key=1,
        )
        db_session.add(workspace)
        db_session.add(
            WorkspaceMember(
                id=str(uuid4()),
                workspace_id=workspace.id,
                developer_id=sample_developer.id,
                role="owner",
                status="active",
            )
        )
        await db_session.flush()

        response = await client.get(
            "/api/v1/slack/install",
            headers=_auth(sample_developer.id),
            params={"organization_id": workspace.id},
        )

        # The endpoint checks its own configuration before anything else, so an
        # environment with no Slack app cannot reach the redirect at all.
        if response.status_code == 500 and "not configured" in response.text:
            pytest.skip("SLACK_CLIENT_ID / SLACK_CLIENT_SECRET are not set")

        assert response.status_code in (302, 307), response.text
        assert "slack.com/oauth" in response.headers.get("location", "")

    @pytest.mark.asyncio
    async def test_installation_url_refuses_non_admins(
        self, client: AsyncClient, db_session, sample_developer
    ):
        """A member who is not owner/admin of the workspace gets a 403."""
        from uuid import uuid4

        from aexy.models.workspace import Workspace, WorkspaceMember

        workspace = Workspace(
            id=str(uuid4()),
            name="Someone Else Co",
            slug=f"other-{uuid4().hex[:8]}",
            owner_id=sample_developer.id,
            next_task_key=1,
        )
        db_session.add(workspace)
        db_session.add(
            WorkspaceMember(
                id=str(uuid4()),
                workspace_id=workspace.id,
                developer_id=sample_developer.id,
                role="member",
                status="active",
            )
        )
        await db_session.flush()

        response = await client.get(
            "/api/v1/slack/install",
            headers=_auth(sample_developer.id),
            params={"organization_id": workspace.id},
        )

        if response.status_code == 500 and "not configured" in response.text:
            pytest.skip("SLACK_CLIENT_ID / SLACK_CLIENT_SECRET are not set")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_oauth_callback_invalid_code(self, client: AsyncClient):
        """Test GET /slack/callback with an unknown state.

        The state is looked up in Redis before the code is used; an unknown
        state is rejected with 400.
        """
        response = await client.get(
            "/api/v1/slack/callback",
            params={"code": "invalid-code", "state": "unknown-state"},
        )

        assert response.status_code in [400, 401, 302, 307]

    @pytest.mark.asyncio
    async def test_oauth_callback_missing_code(self, client: AsyncClient):
        """Test GET /slack/callback without code (required query param)."""
        response = await client.get(
            "/api/v1/slack/callback",
            params={"state": "test-state"},
        )

        assert response.status_code in [400, 422]

    # Slash Command Tests

    @pytest.mark.asyncio
    async def test_handle_slash_command_profile(
        self, client: AsyncClient, sample_slack_command, valid_slack_signature
    ):
        """Test POST /slack/commands endpoint for profile command."""
        sample_slack_command["text"] = "profile @testuser"
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/commands",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "response_type" in data or "text" in data or "blocks" in data

    @pytest.mark.asyncio
    async def test_handle_slash_command_match(
        self, client: AsyncClient, sample_slack_command, valid_slack_signature
    ):
        """Test /aexy match command."""
        sample_slack_command["text"] = "match Implement OAuth authentication"
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/commands",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_handle_slash_command_team(
        self, client: AsyncClient, sample_slack_command, valid_slack_signature
    ):
        """Test /aexy team command."""
        sample_slack_command["text"] = "team"
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/commands",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_handle_slash_command_help(
        self, client: AsyncClient, sample_slack_command, valid_slack_signature
    ):
        """Test /aexy help command."""
        sample_slack_command["text"] = "help"
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/commands",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200
        data = response.json()
        # Help should return usage information
        assert "text" in data or "blocks" in data

    @pytest.mark.asyncio
    async def test_slash_command_invalid_signature(
        self, client: AsyncClient, sample_slack_command
    ):
        """Test slash command with invalid signature."""
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())

        response = await client.post(
            "/api/v1/slack/commands",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": str(int(time.time())),
                "X-Slack-Signature": "v0=invalid_signature",
            },
        )

        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_slash_command_expired_timestamp(
        self, client: AsyncClient, sample_slack_command
    ):
        """Test slash command with expired timestamp."""
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())
        old_timestamp = str(int(time.time()) - 600)  # 10 minutes ago
        _, signature = _sign(body, old_timestamp)

        response = await client.post(
            "/api/v1/slack/commands",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": old_timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code in [401, 403]

    # Event Webhook Tests

    @pytest.mark.asyncio
    async def test_handle_url_verification(
        self, client: AsyncClient, valid_slack_signature
    ):
        """Test Slack URL verification challenge."""
        payload = {
            "type": "url_verification",
            "challenge": "test-challenge-token",
        }
        body = json.dumps(payload)
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/events",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("challenge") == "test-challenge-token"

    @pytest.mark.asyncio
    async def test_handle_app_mention_event(
        self, client: AsyncClient, valid_slack_signature
    ):
        """Test handling app_mention event."""
        payload = {
            "type": "event_callback",
            "team_id": "T12345",
            "event": {
                "type": "app_mention",
                "user": "U12345",
                "text": "<@BOTID> profile @testuser",
                "channel": "C12345",
                "ts": "1234567890.123456",
            },
        }
        body = json.dumps(payload)
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/events",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        # Should acknowledge the event (no integration installed -> still 200)
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_handle_member_joined_event(
        self, client: AsyncClient, valid_slack_signature
    ):
        """Test handling member_joined_channel event."""
        payload = {
            "type": "event_callback",
            "team_id": "T12345",
            "event": {
                "type": "member_joined_channel",
                "user": "U12345",
                "channel": "C12345",
            },
        }
        body = json.dumps(payload)
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/events",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200

    # Interactive Components Tests

    @pytest.mark.asyncio
    async def test_handle_button_action(
        self, client: AsyncClient, valid_slack_signature
    ):
        """Test handling button click interaction."""
        payload = {
            "type": "block_actions",
            "user": {"id": "U12345", "username": "testuser"},
            "team": {"id": "T12345"},
            "channel": {"id": "C12345"},
            "actions": [
                {
                    "action_id": "view_profile",
                    "value": "developer-123",
                    "type": "button",
                }
            ],
            "trigger_id": "123456.789",
            "response_url": "https://hooks.slack.com/actions/xxx",
        }
        body = f"payload={json.dumps(payload)}"
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/interactions",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_handle_select_action(
        self, client: AsyncClient, valid_slack_signature
    ):
        """Test handling select menu interaction."""
        payload = {
            "type": "block_actions",
            "user": {"id": "U12345", "username": "testuser"},
            "team": {"id": "T12345"},
            "channel": {"id": "C12345"},
            "actions": [
                {
                    "action_id": "select_developer",
                    "selected_option": {"value": "dev-1"},
                    "type": "static_select",
                }
            ],
            "trigger_id": "123456.789",
        }
        body = f"payload={json.dumps(payload)}"
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/interactions",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_handle_view_submission(
        self, client: AsyncClient, valid_slack_signature
    ):
        """Test handling modal submission."""
        payload = {
            "type": "view_submission",
            "user": {"id": "U12345", "username": "testuser"},
            "team": {"id": "T12345"},
            "view": {
                "callback_id": "report_config",
                "state": {
                    "values": {
                        "report_name": {
                            "input": {"value": "Weekly Report"}
                        },
                    }
                },
            },
            "trigger_id": "123456.789",
        }
        body = f"payload={json.dumps(payload)}"
        timestamp, signature = valid_slack_signature(body)

        response = await client.post(
            "/api/v1/slack/interactions",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 200


class TestSlackAPIValidation:
    """Tests for Slack API input validation."""

    @pytest.mark.asyncio
    async def test_commands_missing_headers(self, client: AsyncClient):
        """Test slash command without required signature headers.

        With no X-Slack-Request-Timestamp header the route rejects the request
        as unauthenticated (401) instead of 500-ing on `int("")`.
        """
        response = await client.post(
            "/api/v1/slack/commands",
            content="text=test",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_events_invalid_json(self, client: AsyncClient):
        """Test events webhook with invalid JSON.

        The /slack/events route now guards json.loads(body) and returns a
        clean 400 for malformed JSON instead of 500-ing.
        """
        body = "not-valid-json"
        timestamp, signature = _sign(body)

        response = await client.post(
            "/api/v1/slack/events",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_interactions_missing_payload(self, client: AsyncClient):
        """Test interactions without payload."""
        body = ""
        timestamp, signature = _sign(body)

        response = await client.post(
            "/api/v1/slack/interactions",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": timestamp,
                "X-Slack-Signature": signature,
            },
        )

        # Empty payload -> json.loads("{}") default -> handled -> 200.
        assert response.status_code in [200, 400, 422]
