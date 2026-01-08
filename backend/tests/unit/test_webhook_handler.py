"""Unit tests for GitHub Webhook Handler - TDD approach."""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.services.webhook_handler import (
    WebhookHandler,
    WebhookEvent,
    WebhookVerificationError,
    UnsupportedEventError,
)


class TestWebhookVerification:
    """Test webhook signature verification."""

    def test_verify_valid_signature(self):
        """Should verify valid GitHub webhook signature."""
        handler = WebhookHandler(webhook_secret="test_secret")
        payload = b'{"action": "opened"}'

        # Generate valid signature
        signature = "sha256=" + hmac.new(
            b"test_secret",
            payload,
            hashlib.sha256
        ).hexdigest()

        assert handler.verify_signature(payload, signature) is True

    def test_reject_invalid_signature(self):
        """Should reject invalid signature."""
        handler = WebhookHandler(webhook_secret="test_secret")
        payload = b'{"action": "opened"}'

        invalid_signature = "sha256=invalid_signature_here"

        assert handler.verify_signature(payload, invalid_signature) is False

    def test_reject_missing_signature_prefix(self):
        """Should reject signature without sha256= prefix."""
        handler = WebhookHandler(webhook_secret="test_secret")
        payload = b'{"action": "opened"}'

        signature_no_prefix = hmac.new(
            b"test_secret",
            payload,
            hashlib.sha256
        ).hexdigest()

        assert handler.verify_signature(payload, signature_no_prefix) is False

    def test_reject_empty_signature(self):
        """Should reject empty signature."""
        handler = WebhookHandler(webhook_secret="test_secret")
        payload = b'{"action": "opened"}'

        assert handler.verify_signature(payload, "") is False
        assert handler.verify_signature(payload, None) is False


class TestEventParsing:
    """Test webhook event parsing."""

    def test_parse_push_event(self):
        """Should parse push event correctly."""
        handler = WebhookHandler(webhook_secret="secret")
        payload = {
            "ref": "refs/heads/main",
            "repository": {
                "id": 123,
                "full_name": "owner/repo",
            },
            "pusher": {
                "name": "testuser",
                "email": "test@example.com",
            },
            "commits": [
                {
                    "id": "abc123",
                    "message": "Add feature",
                    "author": {"name": "Test", "email": "test@example.com"},
                    "added": ["new_file.py"],
                    "modified": ["existing.py"],
                    "removed": [],
                }
            ],
        }

        event = handler.parse_event("push", payload)

        assert event.event_type == "push"
        assert event.repository == "owner/repo"
        assert len(event.commits) == 1
        assert event.commits[0]["id"] == "abc123"

    def test_parse_pull_request_event(self):
        """Should parse pull request event correctly."""
        handler = WebhookHandler(webhook_secret="secret")
        payload = {
            "action": "opened",
            "number": 42,
            "pull_request": {
                "id": 98765,
                "number": 42,
                "title": "Add new feature",
                "body": "Description here",
                "state": "open",
                "user": {"login": "testuser", "id": 123},
                "head": {"ref": "feature-branch"},
                "base": {"ref": "main"},
                "additions": 100,
                "deletions": 20,
                "changed_files": 5,
            },
            "repository": {
                "id": 123,
                "full_name": "owner/repo",
            },
        }

        event = handler.parse_event("pull_request", payload)

        assert event.event_type == "pull_request"
        assert event.action == "opened"
        assert event.pull_request["number"] == 42
        assert event.repository == "owner/repo"

    def test_parse_pull_request_review_event(self):
        """Should parse pull request review event correctly."""
        handler = WebhookHandler(webhook_secret="secret")
        payload = {
            "action": "submitted",
            "review": {
                "id": 555,
                "user": {"login": "reviewer", "id": 456},
                "body": "LGTM!",
                "state": "approved",
                "submitted_at": "2024-01-15T10:00:00Z",
            },
            "pull_request": {
                "id": 98765,
                "number": 42,
            },
            "repository": {
                "id": 123,
                "full_name": "owner/repo",
            },
        }

        event = handler.parse_event("pull_request_review", payload)

        assert event.event_type == "pull_request_review"
        assert event.action == "submitted"
        assert event.review["state"] == "approved"

    def test_parse_issues_event(self):
        """Should parse issues event correctly."""
        handler = WebhookHandler(webhook_secret="secret")
        payload = {
            "action": "opened",
            "issue": {
                "id": 111,
                "number": 5,
                "title": "Bug report",
                "body": "Found a bug",
                "user": {"login": "reporter", "id": 789},
            },
            "repository": {
                "id": 123,
                "full_name": "owner/repo",
            },
        }

        event = handler.parse_event("issues", payload)

        assert event.event_type == "issues"
        assert event.action == "opened"
        assert event.issue["number"] == 5

    def test_unsupported_event_type(self):
        """Should raise error for unsupported event types."""
        handler = WebhookHandler(webhook_secret="secret")

        with pytest.raises(UnsupportedEventError):
            handler.parse_event("unknown_event", {})


class TestEventFiltering:
    """Test event filtering logic."""

    def test_should_process_push_to_main(self):
        """Should process push events to main branch."""
        handler = WebhookHandler(webhook_secret="secret")
        event = WebhookEvent(
            event_type="push",
            repository="owner/repo",
            ref="refs/heads/main",
            commits=[{"id": "abc"}],
        )

        assert handler.should_process(event) is True

    def test_should_process_pr_opened(self):
        """Should process PR opened events."""
        handler = WebhookHandler(webhook_secret="secret")
        event = WebhookEvent(
            event_type="pull_request",
            action="opened",
            repository="owner/repo",
            pull_request={"id": 123},
        )

        assert handler.should_process(event) is True

    def test_should_process_pr_merged(self):
        """Should process PR merged events."""
        handler = WebhookHandler(webhook_secret="secret")
        event = WebhookEvent(
            event_type="pull_request",
            action="closed",
            repository="owner/repo",
            pull_request={"id": 123, "merged": True},
        )

        assert handler.should_process(event) is True

    def test_should_skip_pr_labeled(self):
        """Should skip PR labeled events (not relevant)."""
        handler = WebhookHandler(webhook_secret="secret")
        event = WebhookEvent(
            event_type="pull_request",
            action="labeled",
            repository="owner/repo",
            pull_request={"id": 123},
        )

        assert handler.should_process(event) is False

    def test_should_process_review_submitted(self):
        """Should process review submitted events."""
        handler = WebhookHandler(webhook_secret="secret")
        event = WebhookEvent(
            event_type="pull_request_review",
            action="submitted",
            repository="owner/repo",
            review={"id": 456, "state": "approved"},
        )

        assert handler.should_process(event) is True


class TestEventHandling:
    """Test event handling and processing."""

    @pytest.mark.asyncio
    async def test_handle_push_event(self):
        """Should handle push event and store commits."""
        handler = WebhookHandler(webhook_secret="secret")
        mock_db = AsyncMock()
        mock_ingestion = AsyncMock()

        event = WebhookEvent(
            event_type="push",
            repository="owner/repo",
            ref="refs/heads/main",
            sender={"login": "testuser", "id": 123},
            commits=[
                {
                    "id": "abc123",
                    "message": "Add feature",
                    "author": {"name": "Test", "email": "test@example.com"},
                    "timestamp": "2024-01-15T10:00:00Z",
                    "added": ["new.py"],
                    "modified": [],
                    "removed": [],
                }
            ],
        )

        result = await handler.handle_event(event, mock_db, mock_ingestion)

        assert result["processed"] is True
        assert result["event_type"] == "push"
        assert result["commits_count"] == 1

    @pytest.mark.asyncio
    async def test_handle_pr_event(self):
        """Should handle PR event and store PR data."""
        handler = WebhookHandler(webhook_secret="secret")
        mock_db = AsyncMock()
        mock_ingestion = AsyncMock()

        event = WebhookEvent(
            event_type="pull_request",
            action="opened",
            repository="owner/repo",
            sender={"login": "testuser", "id": 123},
            pull_request={
                "id": 98765,
                "number": 42,
                "title": "Add feature",
                "additions": 100,
                "deletions": 20,
            },
        )

        result = await handler.handle_event(event, mock_db, mock_ingestion)

        assert result["processed"] is True
        assert result["event_type"] == "pull_request"

    @pytest.mark.asyncio
    async def test_handle_review_event(self):
        """Should handle review event and store review data."""
        handler = WebhookHandler(webhook_secret="secret")
        mock_db = AsyncMock()
        mock_ingestion = AsyncMock()

        event = WebhookEvent(
            event_type="pull_request_review",
            action="submitted",
            repository="owner/repo",
            sender={"login": "reviewer", "id": 456},
            review={
                "id": 555,
                "state": "approved",
                "body": "LGTM!",
            },
            pull_request={"id": 98765, "number": 42},
        )

        result = await handler.handle_event(event, mock_db, mock_ingestion)

        assert result["processed"] is True
        assert result["event_type"] == "pull_request_review"


class TestWebhookEventDataclass:
    """Test WebhookEvent dataclass."""

    def test_create_push_event(self):
        """Should create push event with all fields."""
        event = WebhookEvent(
            event_type="push",
            repository="owner/repo",
            ref="refs/heads/main",
            commits=[{"id": "abc"}],
        )

        assert event.event_type == "push"
        assert event.repository == "owner/repo"
        assert event.action is None  # Not applicable for push

    def test_create_pr_event(self):
        """Should create PR event with action."""
        event = WebhookEvent(
            event_type="pull_request",
            action="opened",
            repository="owner/repo",
            pull_request={"id": 123},
        )

        assert event.event_type == "pull_request"
        assert event.action == "opened"

    def test_event_has_optional_fields(self):
        """Should handle optional fields gracefully."""
        event = WebhookEvent(
            event_type="push",
            repository="owner/repo",
        )

        assert event.commits is None
        assert event.pull_request is None
        assert event.review is None
        assert event.issue is None
