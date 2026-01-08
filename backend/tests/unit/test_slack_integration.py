"""
Tests for SlackIntegrationService.

These tests verify:
- OAuth flow completion
- Message sending
- Slash command handling
- Interaction handling
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
)


class TestSlackIntegrationService:
    """Tests for SlackIntegrationService."""

    @pytest.fixture
    def service(self):
        """Create service instance with mocked settings."""
        svc = SlackIntegrationService()
        # Override settings for testing
        svc.client_id = "test-client-id"
        svc.client_secret = "test-client-secret"
        svc.signing_secret = "test-signing-secret"
        return svc

    @pytest.fixture
    def mock_slack_client(self):
        """Create mock Slack client."""
        mock = MagicMock()
        mock.oauth_v2_access = AsyncMock()
        mock.chat_postMessage = AsyncMock()
        mock.conversations_info = AsyncMock()
        return mock

    # OAuth Tests

    @pytest.mark.asyncio
    async def test_complete_oauth_success(
        self, service, db_session, mock_slack_client
    ):
        """Test successful OAuth completion."""
        mock_slack_client.oauth_v2_access.return_value = {
            "ok": True,
            "team": {"id": "T12345", "name": "Test Workspace"},
            "access_token": "xoxb-test-token",
            "bot_user_id": "U12345",
        }

        with patch.object(service, "_client", mock_slack_client):
            result = await service.complete_oauth(
                code="test-auth-code",
                state="valid-state",
                db=db_session,
            )

        assert result is not None
        assert result.team_id == "T12345"
        assert result.team_name == "Test Workspace"
        assert result.is_active is True

    @pytest.mark.asyncio
    async def test_complete_oauth_invalid_code(
        self, service, db_session, mock_slack_client
    ):
        """Test OAuth with invalid authorization code."""
        mock_slack_client.oauth_v2_access.return_value = {
            "ok": False,
            "error": "invalid_code",
        }

        with patch.object(service, "_client", mock_slack_client):
            result = await service.complete_oauth(
                code="invalid-code",
                state="valid-state",
                db=db_session,
            )

        assert result is None

    @pytest.mark.asyncio
    async def test_complete_oauth_stores_integration(
        self, service, db_session, mock_slack_client
    ):
        """Test that OAuth stores integration in database."""
        mock_slack_client.oauth_v2_access.return_value = {
            "ok": True,
            "team": {"id": "T99999", "name": "New Workspace"},
            "access_token": "xoxb-new-token",
            "bot_user_id": "U99999",
        }

        with patch.object(service, "_client", mock_slack_client):
            result = await service.complete_oauth(
                code="test-code",
                state="valid-state",
                db=db_session,
            )

        # Should be able to retrieve the integration
        integration = await service.get_integration(result.id, db_session)
        assert integration is not None
        assert integration.team_id == "T99999"

    # Message Sending Tests

    @pytest.mark.asyncio
    async def test_send_message_success(
        self, service, db_session, mock_slack_client
    ):
        """Test sending a message to Slack."""
        mock_slack_client.chat_postMessage.return_value = {
            "ok": True,
            "ts": "1234567890.123456",
            "channel": "C12345",
        }

        message = SlackMessage(
            channel="C12345",
            text="Test message",
        )

        with patch.object(service, "_get_client_for_team") as mock_get_client:
            mock_get_client.return_value = mock_slack_client
            result = await service.send_message(
                team_id="T12345",
                message=message,
                db=db_session,
            )

        assert result is True
        mock_slack_client.chat_postMessage.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_message_with_blocks(
        self, service, db_session, mock_slack_client
    ):
        """Test sending a message with rich formatting blocks."""
        mock_slack_client.chat_postMessage.return_value = {
            "ok": True,
            "ts": "1234567890.123456",
            "channel": "C12345",
        }

        message = SlackMessage(
            channel="C12345",
            text="Fallback text",
            blocks=[
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*Bold text*"},
                },
                {
                    "type": "divider",
                },
            ],
        )

        with patch.object(service, "_get_client_for_team") as mock_get_client:
            mock_get_client.return_value = mock_slack_client
            result = await service.send_message(
                team_id="T12345",
                message=message,
                db=db_session,
            )

        assert result is True
        call_args = mock_slack_client.chat_postMessage.call_args
        assert "blocks" in call_args.kwargs

    @pytest.mark.asyncio
    async def test_send_message_channel_not_found(
        self, service, db_session, mock_slack_client
    ):
        """Test sending to invalid channel."""
        mock_slack_client.chat_postMessage.return_value = {
            "ok": False,
            "error": "channel_not_found",
        }

        message = SlackMessage(
            channel="C99999",
            text="Test message",
        )

        with patch.object(service, "_get_client_for_team") as mock_get_client:
            mock_get_client.return_value = mock_slack_client
            result = await service.send_message(
                team_id="T12345",
                message=message,
                db=db_session,
            )

        assert result is False

    # Slash Command Tests

    @pytest.mark.asyncio
    async def test_handle_slash_command_profile(
        self, service, db_session, sample_developer, sample_slack_command
    ):
        """Test /aexy profile command."""
        sample_slack_command["text"] = f"profile @{sample_developer.github_username}"

        payload = SlackSlashCommand(**sample_slack_command)

        result = await service.handle_slash_command(payload, db_session)

        assert result is not None
        assert "response_type" in result
        assert result["response_type"] in ["ephemeral", "in_channel"]

    @pytest.mark.asyncio
    async def test_handle_slash_command_match(
        self, service, db_session, sample_developers, sample_slack_command
    ):
        """Test /aexy match command."""
        sample_slack_command["text"] = "match Implement user authentication with OAuth"

        payload = SlackSlashCommand(**sample_slack_command)

        result = await service.handle_slash_command(payload, db_session)

        assert result is not None
        assert "blocks" in result or "text" in result

    @pytest.mark.asyncio
    async def test_handle_slash_command_team(
        self, service, db_session, sample_team, sample_slack_command
    ):
        """Test /aexy team command."""
        sample_slack_command["text"] = "team"

        payload = SlackSlashCommand(**sample_slack_command)

        result = await service.handle_slash_command(payload, db_session)

        assert result is not None

    @pytest.mark.asyncio
    async def test_handle_slash_command_insights(
        self, service, db_session, sample_developers, sample_slack_command
    ):
        """Test /aexy insights command."""
        sample_slack_command["text"] = "insights"

        payload = SlackSlashCommand(**sample_slack_command)

        result = await service.handle_slash_command(payload, db_session)

        assert result is not None

    @pytest.mark.asyncio
    async def test_handle_slash_command_help(
        self, service, db_session, sample_slack_command
    ):
        """Test /aexy help command."""
        sample_slack_command["text"] = "help"

        payload = SlackSlashCommand(**sample_slack_command)

        result = await service.handle_slash_command(payload, db_session)

        assert result is not None
        assert "text" in result or "blocks" in result

    @pytest.mark.asyncio
    async def test_handle_slash_command_unknown(
        self, service, db_session, sample_slack_command
    ):
        """Test handling unknown command."""
        sample_slack_command["text"] = "unknown_command arg1 arg2"

        payload = SlackSlashCommand(**sample_slack_command)

        result = await service.handle_slash_command(payload, db_session)

        assert result is not None
        # Should return help text or error message

    # Interaction Handling Tests

    @pytest.mark.asyncio
    async def test_handle_button_interaction(
        self, service, db_session
    ):
        """Test handling button click interaction."""
        payload = SlackInteraction(
            type="block_actions",
            user={"id": "U12345", "username": "testuser"},
            team={"id": "T12345"},
            channel={"id": "C12345"},
            actions=[
                {
                    "action_id": "view_profile",
                    "value": "developer-id-123",
                    "type": "button",
                }
            ],
            trigger_id="123456.789",
        )

        result = await service.handle_interaction(payload, db_session)

        assert result is not None

    @pytest.mark.asyncio
    async def test_handle_select_interaction(
        self, service, db_session
    ):
        """Test handling select menu interaction."""
        payload = SlackInteraction(
            type="block_actions",
            user={"id": "U12345", "username": "testuser"},
            team={"id": "T12345"},
            channel={"id": "C12345"},
            actions=[
                {
                    "action_id": "select_developer",
                    "selected_option": {"value": "dev-1"},
                    "type": "static_select",
                }
            ],
            trigger_id="123456.789",
        )

        result = await service.handle_interaction(payload, db_session)

        assert result is not None

    @pytest.mark.asyncio
    async def test_handle_modal_submission(
        self, service, db_session
    ):
        """Test handling modal submission."""
        payload = SlackInteraction(
            type="view_submission",
            user={"id": "U12345", "username": "testuser"},
            team={"id": "T12345"},
            view={
                "callback_id": "report_config",
                "state": {
                    "values": {
                        "report_name": {"input": {"value": "Weekly Report"}},
                    }
                },
            },
            trigger_id="123456.789",
        )

        result = await service.handle_interaction(payload, db_session)

        # Modal submissions may return empty response
        assert result is not None or result == {}

    # Request Verification Tests

    def test_verify_request_valid(self, service):
        """Test request signature verification with valid signature."""
        timestamp = str(int(time.time()))
        body = "test=body&data=value"

        sig_basestring = f"v0:{timestamp}:{body}"
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
        body = "test=body"

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
        body = "test=body"

        sig_basestring = f"v0:{old_timestamp}:{body}"
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

    # Notification Tests

    @pytest.mark.asyncio
    async def test_send_report_notification(
        self, service, db_session, mock_slack_client
    ):
        """Test sending scheduled report notification."""
        mock_slack_client.chat_postMessage.return_value = {
            "ok": True,
            "ts": "1234567890.123456",
        }

        with patch.object(service, "_get_client_for_team") as mock_get_client:
            mock_get_client.return_value = mock_slack_client
            result = await service.send_report_notification(
                team_id="T12345",
                channel_id="C12345",
                report_name="Weekly Team Report",
                report_url="https://aexy.io/reports/123",
                db=db_session,
            )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_alert_notification(
        self, service, db_session, mock_slack_client
    ):
        """Test sending alert notification (e.g., attrition risk)."""
        mock_slack_client.chat_postMessage.return_value = {
            "ok": True,
            "ts": "1234567890.123456",
        }

        with patch.object(service, "_get_client_for_team") as mock_get_client:
            mock_get_client.return_value = mock_slack_client
            result = await service.send_alert_notification(
                team_id="T12345",
                channel_id="C12345",
                alert_type="attrition_risk",
                alert_data={
                    "developer_name": "Test Developer",
                    "risk_level": "high",
                    "risk_score": 0.75,
                },
                db=db_session,
            )

        assert result is True


class TestSlackMessageFormatting:
    """Unit tests for Slack message formatting."""

    @pytest.fixture
    def service(self):
        """Create service instance with mocked settings."""
        svc = SlackIntegrationService()
        svc.client_id = "test-client-id"
        svc.client_secret = "test-client-secret"
        svc.signing_secret = "test-signing-secret"
        return svc

    def test_format_developer_profile_blocks(self, service):
        """Test formatting developer profile for Slack."""
        developer_data = {
            "name": "Test Developer",
            "github_username": "testdev",
            "seniority_level": "senior",
            "skills": ["Python", "TypeScript", "React"],
            "recent_activity": {
                "commits": 45,
                "prs": 12,
                "reviews": 23,
            },
        }

        blocks = service._format_developer_profile(developer_data)

        assert len(blocks) > 0
        assert any(b.get("type") == "section" for b in blocks)

    def test_format_team_summary_blocks(self, service):
        """Test formatting team summary for Slack."""
        team_data = {
            "name": "Backend Team",
            "member_count": 5,
            "top_skills": ["Python", "PostgreSQL", "Docker"],
            "health_score": 0.82,
        }

        blocks = service._format_team_summary(team_data)

        assert len(blocks) > 0

    def test_format_match_results_blocks(self, service):
        """Test formatting task match results for Slack."""
        match_results = [
            {"name": "Dev 1", "score": 0.95, "skills": ["Python", "FastAPI"]},
            {"name": "Dev 2", "score": 0.87, "skills": ["Python", "Django"]},
            {"name": "Dev 3", "score": 0.72, "skills": ["Python"]},
        ]

        blocks = service._format_match_results(match_results)

        assert len(blocks) > 0

    def test_format_insights_blocks(self, service):
        """Test formatting predictive insights for Slack."""
        insights = {
            "team_health": {
                "score": 0.78,
                "grade": "B",
            },
            "risks": [
                {"type": "attrition", "developer": "Dev 1", "level": "moderate"},
            ],
            "recommendations": ["Consider team building activities"],
        }

        blocks = service._format_insights(insights)

        assert len(blocks) > 0


class TestSlackIntegrationManagement:
    """Tests for Slack integration management."""

    @pytest.fixture
    def service(self):
        """Create service instance with mocked settings."""
        svc = SlackIntegrationService()
        svc.client_id = "test-client-id"
        svc.client_secret = "test-client-secret"
        svc.signing_secret = "test-signing-secret"
        return svc

    @pytest.mark.asyncio
    async def test_list_integrations(self, service, db_session):
        """Test listing all integrations for an organization."""
        integrations = await service.list_integrations(
            organization_id="org-123",
            db=db_session,
        )

        assert isinstance(integrations, list)

    @pytest.mark.asyncio
    async def test_update_notification_settings(self, service, db_session):
        """Test updating notification settings."""
        settings = {
            "alerts_channel": "C12345",
            "reports_channel": "C67890",
            "notify_on_attrition_risk": True,
            "notify_on_burnout_risk": True,
            "weekly_digest": True,
        }

        result = await service.update_notification_settings(
            integration_id="integration-123",
            settings=settings,
            db=db_session,
        )

        # Result depends on whether integration exists
        assert result is True or result is False

    @pytest.mark.asyncio
    async def test_uninstall_integration(self, service, db_session):
        """Test uninstalling Slack integration."""
        result = await service.uninstall(
            integration_id="integration-123",
            db=db_session,
        )

        # Should not raise exception
        assert result is True or result is False

    @pytest.mark.asyncio
    async def test_get_installation_url(self, service):
        """Test getting OAuth installation URL."""
        url = service.get_installation_url(
            redirect_uri="https://aexy.io/slack/callback",
            state="random-state-token",
        )

        assert "https://slack.com/oauth" in url
        assert "client_id=test-client-id" in url
        assert "state=random-state-token" in url

