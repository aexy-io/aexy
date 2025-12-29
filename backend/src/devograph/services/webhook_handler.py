"""GitHub Webhook Handler Service."""

import hashlib
import hmac
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


class WebhookVerificationError(Exception):
    """Webhook signature verification failed."""

    pass


class UnsupportedEventError(Exception):
    """Unsupported webhook event type."""

    pass


@dataclass
class WebhookEvent:
    """Parsed webhook event data."""

    event_type: str
    repository: str
    action: str | None = None
    ref: str | None = None
    sender: dict[str, Any] | None = None
    commits: list[dict[str, Any]] | None = None
    pull_request: dict[str, Any] | None = None
    review: dict[str, Any] | None = None
    issue: dict[str, Any] | None = None


# Supported event types
SUPPORTED_EVENTS = {"push", "pull_request", "pull_request_review", "issues"}

# Actions that we should process
PROCESSABLE_PR_ACTIONS = {"opened", "closed", "synchronize", "reopened", "edited"}
PROCESSABLE_REVIEW_ACTIONS = {"submitted", "edited", "dismissed"}
PROCESSABLE_ISSUE_ACTIONS = {"opened", "closed", "reopened", "edited"}


class WebhookHandler:
    """Handler for GitHub webhook events."""

    def __init__(self, webhook_secret: str) -> None:
        """Initialize webhook handler with secret for verification."""
        self.webhook_secret = webhook_secret

    def verify_signature(self, payload: bytes, signature: str | None) -> bool:
        """Verify GitHub webhook signature.

        Args:
            payload: Raw request body bytes
            signature: X-Hub-Signature-256 header value

        Returns:
            True if signature is valid, False otherwise
        """
        if not signature:
            return False

        if not signature.startswith("sha256="):
            return False

        expected_signature = "sha256=" + hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(signature, expected_signature)

    def parse_event(self, event_type: str, payload: dict[str, Any]) -> WebhookEvent:
        """Parse webhook payload into WebhookEvent.

        Args:
            event_type: GitHub event type from X-GitHub-Event header
            payload: Parsed JSON payload

        Returns:
            WebhookEvent with extracted data

        Raises:
            UnsupportedEventError: If event type is not supported
        """
        if event_type not in SUPPORTED_EVENTS:
            raise UnsupportedEventError(f"Event type '{event_type}' is not supported")

        repository = payload.get("repository", {}).get("full_name", "")
        action = payload.get("action")
        sender = payload.get("sender") or payload.get("pusher")

        if event_type == "push":
            return WebhookEvent(
                event_type=event_type,
                repository=repository,
                ref=payload.get("ref"),
                sender=sender,
                commits=payload.get("commits", []),
            )

        elif event_type == "pull_request":
            return WebhookEvent(
                event_type=event_type,
                action=action,
                repository=repository,
                sender=sender,
                pull_request=payload.get("pull_request"),
            )

        elif event_type == "pull_request_review":
            return WebhookEvent(
                event_type=event_type,
                action=action,
                repository=repository,
                sender=sender,
                review=payload.get("review"),
                pull_request=payload.get("pull_request"),
            )

        elif event_type == "issues":
            return WebhookEvent(
                event_type=event_type,
                action=action,
                repository=repository,
                sender=sender,
                issue=payload.get("issue"),
            )

        # Fallback (shouldn't reach here due to SUPPORTED_EVENTS check)
        return WebhookEvent(event_type=event_type, repository=repository)

    def should_process(self, event: WebhookEvent) -> bool:
        """Determine if event should be processed.

        Args:
            event: Parsed webhook event

        Returns:
            True if event should be processed
        """
        if event.event_type == "push":
            # Process pushes to main branches
            if event.ref and event.commits:
                return True
            return False

        elif event.event_type == "pull_request":
            # Only process relevant PR actions
            return event.action in PROCESSABLE_PR_ACTIONS

        elif event.event_type == "pull_request_review":
            # Only process review submissions
            return event.action in PROCESSABLE_REVIEW_ACTIONS

        elif event.event_type == "issues":
            return event.action in PROCESSABLE_ISSUE_ACTIONS

        return False

    async def handle_event(
        self,
        event: WebhookEvent,
        db: AsyncSession,
        ingestion_service: Any,
    ) -> dict[str, Any]:
        """Handle and process a webhook event.

        Args:
            event: Parsed webhook event
            db: Database session
            ingestion_service: Service for ingesting data

        Returns:
            Dict with processing results
        """
        result = {
            "processed": True,
            "event_type": event.event_type,
            "repository": event.repository,
        }

        if event.event_type == "push":
            commits = event.commits or []
            result["commits_count"] = len(commits)

            # Delegate to ingestion service
            if ingestion_service:
                await ingestion_service.ingest_commits(
                    repository=event.repository,
                    commits=commits,
                    sender=event.sender,
                    db=db,
                )

        elif event.event_type == "pull_request":
            result["action"] = event.action
            result["pr_number"] = event.pull_request.get("number") if event.pull_request else None

            if ingestion_service and event.pull_request:
                await ingestion_service.ingest_pull_request(
                    repository=event.repository,
                    pull_request=event.pull_request,
                    action=event.action,
                    sender=event.sender,
                    db=db,
                )

        elif event.event_type == "pull_request_review":
            result["action"] = event.action
            result["review_state"] = event.review.get("state") if event.review else None

            if ingestion_service and event.review:
                await ingestion_service.ingest_review(
                    repository=event.repository,
                    review=event.review,
                    pull_request=event.pull_request,
                    sender=event.sender,
                    db=db,
                )

        elif event.event_type == "issues":
            result["action"] = event.action
            result["issue_number"] = event.issue.get("number") if event.issue else None

        return result
