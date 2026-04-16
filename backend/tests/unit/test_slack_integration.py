"""
Tests for SlackIntegrationService.

These tests verify:
- OAuth flow completion
- Message sending
- Slash command handling
- Request verification
"""

import pytest
import hmac
import hashlib
import time
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from aexy.services.slack_integration import SlackIntegrationService
from aexy.schemas.integrations import (
    SlackMessage,
    SlackSlashCommand,
    SlackInteraction,
    SlackOAuthCallback,
    SlackCommandResponse,
    SlackNotificationType,
)


class TestSlackIntegrationService:
    """Tests for SlackIntegrationService."""

    @pytest.fixture
    def service(self):
        """Create service instance with mocked settings."""
        with patch("aexy.services.slack_integration.settings") as mock_settings:
            mock_settings.slack_client_id = "test-client-id"
            mock_settings.slack_client_secret = "test-client-secret"
            mock_settings.slack_signing_secret = "test-signing-secret"
            mock_settings.slack_redirect_uri = "https://aexy.io/slack/callback"
            svc = SlackIntegrationService()
        return svc

    # OAuth Tests

    def test_get_install_url(self, service):
        """Test generating OAuth installation URL."""
        url = service.get_install_url(state="random-state-token")

        assert "https://slack.com/oauth" in url
        assert "client_id=test-client-id" in url
        assert "state=random-state-token" in url

    # Slash Command Tests

    @pytest.mark.asyncio
    async def test_handle_slash_command_help(
        self, service, db_session, sample_slack_command
    ):
        """Test /aexy help command."""
        sample_slack_command["text"] = "help"

        payload = SlackSlashCommand(**sample_slack_command)

        # Need a mock integration to be found
        with patch.object(service, "get_integration_by_team") as mock_get:
            mock_integration = MagicMock()
            mock_integration.is_active = True
            mock_integration.user_mappings = {}
            mock_get.return_value = mock_integration

            result = await service.handle_slash_command(payload, db_session)

        assert result is not None
        assert isinstance(result, SlackCommandResponse)
        assert result.text is not None

    @pytest.mark.asyncio
    async def test_handle_slash_command_unknown(
        self, service, db_session, sample_slack_command
    ):
        """Test handling unknown command defaults to help."""
        sample_slack_command["text"] = "unknown_command arg1 arg2"

        payload = SlackSlashCommand(**sample_slack_command)

        with patch.object(service, "get_integration_by_team") as mock_get:
            mock_integration = MagicMock()
            mock_integration.is_active = True
            mock_integration.user_mappings = {}
            mock_get.return_value = mock_integration

            result = await service.handle_slash_command(payload, db_session)

        assert result is not None

    @pytest.mark.asyncio
    async def test_handle_slash_command_no_integration(
        self, service, db_session, sample_slack_command
    ):
        """Test command when integration is not installed."""
        payload = SlackSlashCommand(**sample_slack_command)

        with patch.object(service, "get_integration_by_team", return_value=None):
            result = await service.handle_slash_command(payload, db_session)

        assert result is not None
        assert "not installed" in result.text.lower() or "install" in result.text.lower()

    # Request Verification Tests

    def test_verify_request_valid(self, service):
        """Test request signature verification with valid signature."""
        timestamp = str(int(time.time()))
        body = b"test=body&data=value"

        sig_basestring = f"v0:{timestamp}:{body.decode()}"
        expected_signature = "v0=" + hmac.new(
            b"test-signing-secret",
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()

        is_valid = service.verify_request(
            timestamp=timestamp,
            signature=expected_signature,
            body=body,
        )

        assert is_valid is True

    def test_verify_request_invalid_signature(self, service):
        """Test request verification with invalid signature."""
        timestamp = str(int(time.time()))
        body = b"test=body"

        is_valid = service.verify_request(
            timestamp=timestamp,
            signature="v0=invalid_signature",
            body=body,
        )

        assert is_valid is False

    def test_verify_request_expired_timestamp(self, service):
        """Test request verification with old timestamp."""
        # 10 minutes ago (beyond 5 minute window)
        old_timestamp = str(int(time.time()) - 600)
        body = b"test=body"

        sig_basestring = f"v0:{old_timestamp}:{body.decode()}"
        signature = "v0=" + hmac.new(
            b"test-signing-secret",
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()

        is_valid = service.verify_request(
            timestamp=old_timestamp,
            signature=signature,
            body=body,
        )

        assert is_valid is False

    # Integration Management Tests

    @pytest.mark.asyncio
    async def test_get_integration_not_found(self, service, db_session):
        """Test getting non-existent integration."""
        result = await service.get_integration("nonexistent-id", db_session)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_integration_by_team_not_found(self, service, db_session):
        """Test getting integration by team ID when not found."""
        result = await service.get_integration_by_team("T99999", db_session)

        assert result is None

    @pytest.mark.asyncio
    async def test_uninstall_nonexistent(self, service, db_session):
        """Test uninstalling non-existent integration."""
        result = await service.uninstall("nonexistent-id", db_session)

        assert result is False


class TestSlackEventHandling:
    """Tests for Slack event handling."""

    @pytest.fixture
    def service(self):
        """Create service instance with mocked settings."""
        with patch("aexy.services.slack_integration.settings") as mock_settings:
            mock_settings.slack_client_id = "test-client-id"
            mock_settings.slack_client_secret = "test-client-secret"
            mock_settings.slack_signing_secret = "test-signing-secret"
            mock_settings.slack_redirect_uri = "https://aexy.io/slack/callback"
            svc = SlackIntegrationService()
        return svc

    @pytest.mark.asyncio
    async def test_handle_event_no_integration(self, service, db_session):
        """Test event handling when integration not found."""
        result = await service.handle_event(
            event_type="message",
            event_data={"text": "hello"},
            team_id="T99999",
            db=db_session,
        )

        assert result.get("ok") is False

    @pytest.mark.asyncio
    async def test_handle_event_bot_message_ignored(self, service, db_session):
        """Test that bot messages are ignored."""
        with patch.object(service, "get_integration_by_team") as mock_get:
            mock_integration = MagicMock()
            mock_integration.is_active = True
            mock_get.return_value = mock_integration

            result = await service.handle_event(
                event_type="message",
                event_data={"text": "hello", "bot_id": "B12345"},
                team_id="T12345",
                db=db_session,
            )

        assert result.get("ok") is True
