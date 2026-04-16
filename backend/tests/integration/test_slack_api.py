"""
Integration tests for Slack API endpoints.

These tests verify:
- OAuth installation flow
- Slash command handling
- Event webhooks
- Interactive components

Note: Slack endpoints use Slack's own request signature verification,
not JWT auth. The /install and /callback endpoints are public-facing.
The /commands, /events, and /interactions endpoints verify via
X-Slack-Request-Timestamp and X-Slack-Signature headers.
"""

import pytest
import hmac
import hashlib
import time
import json
from httpx import AsyncClient


class TestSlackAPI:
    """Integration tests for /slack endpoints."""

    @pytest.fixture
    def valid_slack_signature(self):
        """Generate a valid Slack signature for testing."""
        def _generate(body: str, signing_secret: str = "test-signing-secret"):
            timestamp = str(int(time.time()))
            sig_basestring = f"v0:{timestamp}:{body}"
            signature = "v0=" + hmac.new(
                signing_secret.encode(),
                sig_basestring.encode(),
                hashlib.sha256,
            ).hexdigest()
            return timestamp, signature
        return _generate

    # OAuth Tests

    @pytest.mark.asyncio
    async def test_get_installation_url(self, client: AsyncClient):
        """Test GET /slack/install endpoint requires organization_id and installer_id."""
        response = await client.get(
            "/api/v1/slack/install",
            params={
                "organization_id": "test-org-id",
                "installer_id": "test-installer-id",
            },
        )

        # Should redirect to Slack OAuth or return 500 if not configured
        assert response.status_code in [200, 302, 307, 500]
        if response.status_code in [302, 307]:
            location = response.headers.get("location", "")
            assert "slack.com" in location or "oauth" in location

    @pytest.mark.asyncio
    async def test_oauth_callback_invalid_state(self, client: AsyncClient):
        """Test GET /slack/callback with invalid state."""
        response = await client.get(
            "/api/v1/slack/callback",
            params={"code": "invalid-code", "state": "invalid-state"},
        )

        # Should fail - invalid/expired OAuth state
        assert response.status_code in [400, 302, 307]

    @pytest.mark.asyncio
    async def test_oauth_callback_missing_code(self, client: AsyncClient):
        """Test GET /slack/callback without code."""
        response = await client.get(
            "/api/v1/slack/callback",
            params={"state": "test-state"},
        )

        assert response.status_code == 422

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

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_slash_command_expired_timestamp(
        self, client: AsyncClient, sample_slack_command, valid_slack_signature
    ):
        """Test slash command with expired timestamp."""
        body = "&".join(f"{k}={v}" for k, v in sample_slack_command.items())
        old_timestamp = str(int(time.time()) - 600)  # 10 minutes ago

        sig_basestring = f"v0:{old_timestamp}:{body}"
        signature = "v0=" + hmac.new(
            b"test-signing-secret",
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()

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

        # Should acknowledge the event
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
        """Test slash command without required Slack signature headers."""
        response = await client.post(
            "/api/v1/slack/commands",
            content="text=test",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

        # Missing signature headers should result in 401
        assert response.status_code in [401, 422]

    @pytest.mark.asyncio
    async def test_events_invalid_json(self, client: AsyncClient):
        """Test events webhook with invalid JSON."""
        response = await client.post(
            "/api/v1/slack/events",
            content="not-valid-json",
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": str(int(time.time())),
                "X-Slack-Signature": "v0=test",
            },
        )

        assert response.status_code in [400, 422, 500]

    @pytest.mark.asyncio
    async def test_interactions_missing_payload(self, client: AsyncClient):
        """Test interactions without payload."""
        response = await client.post(
            "/api/v1/slack/interactions",
            content="",
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Slack-Request-Timestamp": str(int(time.time())),
                "X-Slack-Signature": "v0=test",
            },
        )

        assert response.status_code in [400, 401, 422]
