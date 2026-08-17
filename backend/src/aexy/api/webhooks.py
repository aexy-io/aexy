"""GitHub Webhook API endpoints."""

import logging
import re

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.email_tracking import get_client_ip
from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.services.webhook_handler import (
    WebhookHandler,
    WebhookVerificationError,
    UnsupportedEventError,
)
from aexy.services.ingestion_service import IngestionService
from aexy.services.profile_sync import ProfileSyncService
from aexy.services.github_task_sync_service import GitHubTaskSyncService

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


# WS-082: per-source rate limiting on webhook ingestion. Combined with the
# fail-closed signature checks (WS-056, WS-059), this caps the rate at
# which a misconfigured or malicious sender can dispatch Temporal
# workflows (each of which consumes LLM tokens).
_GITHUB_WEBHOOK_LIMIT_PER_IP_PER_MIN = 600     # GitHub sends bursts on big pushes; generous cap.
_AUTOMATION_WEBHOOK_LIMIT_PER_ID_PER_MIN = 60  # External system per automation.


def _changed_paths(commits: list[dict]) -> list[str]:
    """Every path a push touched, deduplicated, order preserved.

    GitHub reports `added`, `removed` and `modified` per commit. All three
    matter to a document: a deleted file is as much a reason to revisit the
    prose as an edited one, and a rename arrives as a remove plus an add.
    """
    seen: dict[str, None] = {}
    for commit in commits:
        for key in ("added", "modified", "removed"):
            for path in commit.get(key) or []:
                seen.setdefault(path, None)
    return list(seen)


# GitHub's own merge-commit subjects. A merge keeps "Merge pull request #N
# from …"; a squash puts "(#N)" at the end of the title. A rebase merge carries
# no reference at all, which is why the caller treats absence as ordinary.
_MERGE_COMMIT_PR = re.compile(r"^Merge pull request #(\d{1,7})\b")
_SQUASH_COMMIT_PR = re.compile(r"\(#(\d{1,7})\)\s*$")


def _pull_request_from_commits(commits: list[dict]) -> int | None:
    """The pull request a push closed, when the push says so.

    A push payload has no pull request field — GitHub does not put one there —
    so the number has to come from the merge commit's own subject, which GitHub
    writes. Newest commit first: a push can contain several merges, and the last
    one is the one whose review this push belongs to.

    This is the only thing that ever populates `trigger["pull_request"]`, which
    `ProposedChange` has documented and the review inbox has grouped on since it
    was built. Without it every proposal grouped by commit, so one merge across
    four commits became four groups of one — the opposite of the "the auth
    rework touched these four pages" decision the grouping exists to offer.
    """
    for commit in reversed(commits):
        subject = (commit.get("message") or "").strip().split("\n", 1)[0]
        if not subject:
            continue
        for pattern in (_MERGE_COMMIT_PR, _SQUASH_COMMIT_PR):
            found = pattern.search(subject)
            if found:
                return int(found.group(1))
    return None


async def _sync_documents_for_push(db: AsyncSession, event) -> dict | None:
    """Flag documents whose linked code this push touched.

    Returns a summary for the webhook response, or None when the push is
    irrelevant to Docs. Never raises: see the call site.
    """
    from sqlalchemy import select

    from aexy.models.repository import Repository
    from aexy.services.document_sync_service import DocumentSyncService

    commits = event.commits or []
    paths = _changed_paths(commits)
    if not paths:
        return None

    head_sha = ""
    for commit in reversed(commits):
        head_sha = commit.get("id") or commit.get("sha") or ""
        if head_sha:
            break
    if not head_sha:
        return None

    try:
        repo = (
            await db.execute(
                select(Repository).where(Repository.full_name == event.repository)
            )
        ).scalar_one_or_none()
        if not repo:
            return None

        return await DocumentSyncService(db).handle_code_change(
            repository_id=str(repo.id),
            commit_sha=head_sha,
            changed_paths=paths,
            pull_request=_pull_request_from_commits(commits),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception(
            "Document sync failed for push to %s: %s", event.repository, exc
        )
        return None


async def _enforce_webhook_rate_limit(scope_key: str, limit: int, window_seconds: int = 60) -> None:
    """Sliding-window via Redis INCR + EXPIRE; fail-open on Redis errors."""
    try:
        import redis.asyncio as _aioredis
        client = _aioredis.from_url(settings.redis_url)
    except Exception:
        return
    try:
        count = await client.incr(scope_key)
        if count == 1:
            await client.expire(scope_key, window_seconds)
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Webhook rate limit exceeded",
            )
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


@router.post("/github")
async def handle_github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_hub_signature_256: str | None = Header(None),
    x_github_event: str | None = Header(None),
    x_github_delivery: str | None = Header(None),
) -> dict:
    """Handle incoming GitHub webhook events.

    Verifies signature, parses event, and processes accordingly.
    """
    if not x_github_event:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-GitHub-Event header",
        )

    # WS-082: rate-limit by source IP. GitHub's IPs are stable per
    # installation; if an attacker spoofs a valid signature (after WS-059
    # closed the fail-open) they still can't blast workflows.
    await _enforce_webhook_rate_limit(
        f"webhook:github:ip:{get_client_ip(request)}",
        _GITHUB_WEBHOOK_LIMIT_PER_IP_PER_MIN,
    )

    # Get raw body for signature verification
    body = await request.body()

    # Initialize handler
    webhook_secret = settings.github_webhook_secret if hasattr(settings, 'github_webhook_secret') else ""
    handler = WebhookHandler(webhook_secret=webhook_secret)

    # Signature verification — fail closed in production. The previous
    # `if secret and signature` shape silently accepted unsigned
    # webhooks whenever the secret was misconfigured (empty), turning a
    # config error into an open ingestion endpoint.
    if webhook_secret:
        if not x_hub_signature_256:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing X-Hub-Signature-256 header",
            )
        if not handler.verify_signature(body, x_hub_signature_256):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature",
            )
    elif not settings.debug:
        # No secret AND not in debug mode → refuse rather than fan
        # out workflow dispatch from unauthenticated callers.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub webhook is not configured",
        )

    # Parse JSON payload
    try:
        payload = await request.json()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON payload: {e}",
        )

    # Parse event
    try:
        event = handler.parse_event(x_github_event, payload)
    except UnsupportedEventError:
        # Return 200 for unsupported events (GitHub expects this)
        return {
            "status": "ignored",
            "event_type": x_github_event,
            "reason": "Unsupported event type",
        }

    # Check if event should be processed
    if not handler.should_process(event):
        return {
            "status": "ignored",
            "event_type": x_github_event,
            "action": event.action,
            "reason": "Event action not processable",
        }

    # Process event
    ingestion_service = IngestionService()
    result = await handler.handle_event(event, db, ingestion_service)

    # Process task sync for commits and PRs
    task_sync_service = GitHubTaskSyncService(db)

    if event.event_type == "push" and event.commits:
        # Process each commit for task references
        task_links_created = 0
        for commit_data in event.commits:
            sha = commit_data.get("id", commit_data.get("sha", ""))
            if sha:
                from aexy.models.activity import Commit
                from sqlalchemy import select
                stmt = select(Commit).where(Commit.sha == sha)
                commit_result = await db.execute(stmt)
                commit = commit_result.scalar_one_or_none()
                if commit:
                    links = await task_sync_service.process_commit(
                        commit=commit,
                        repository=event.repository,
                    )
                    task_links_created += len(links)
        if task_links_created > 0:
            result["task_links_created"] = task_links_created

        # Tell Docs the code moved. `handle_code_change` marks every code
        # link whose path the push touched, then routes each linked document
        # by its owner's plan tier — regenerate now, queue for the daily
        # batch, or just flag it. Until this call existed the method had no
        # callers at all, so no document ever learned that its source had
        # changed and the whole freshness pipeline behind it was inert.
        #
        # Deliberately after task sync and deliberately non-fatal: a failure
        # here must not make GitHub retry a delivery whose ingestion already
        # succeeded.
        doc_sync = await _sync_documents_for_push(db, event)
        if doc_sync:
            result["document_sync"] = doc_sync

    elif event.event_type == "pull_request" and event.pull_request:
        # Process PR for task references and status updates
        github_id = event.pull_request.get("id")
        if github_id:
            from aexy.models.activity import PullRequest
            from sqlalchemy import select
            stmt = select(PullRequest).where(PullRequest.github_id == github_id)
            pr_result = await db.execute(stmt)
            pr = pr_result.scalar_one_or_none()
            if pr:
                links = await task_sync_service.process_pull_request(
                    pull_request=pr,
                    repository=event.repository,
                    action=event.action,
                )
                if links:
                    result["task_links_created"] = len(links)

                # Realtime AI analysis (C1): only the big moments — opened
                # + ready_for_review. In-progress edits get caught by the
                # 30-min active-PR poll (C2). Alignment is fanned out as
                # the tail of analyze_pr so it always reads fresh data.
                if event.action in {"opened", "ready_for_review"}:
                    try:
                        import hashlib as _hashlib

                        from aexy.temporal.activities.analysis import AnalyzePRInput
                        from aexy.temporal.dispatch import dispatch
                        from aexy.temporal.task_queues import TaskQueue

                        # Content-hash workflow_id so re-triggers on edits
                        # don't collide with prior runs within the same day.
                        content = f"{pr.title or ''}\n{pr.description or ''}"
                        content_hash = _hashlib.sha256(
                            content.encode("utf-8")
                        ).hexdigest()[:8]

                        await dispatch(
                            "analyze_pr",
                            AnalyzePRInput(
                                developer_id=str(pr.developer_id),
                                pr_id=str(pr.id),
                            ),
                            task_queue=TaskQueue.ANALYSIS,
                            workflow_id=(
                                f"analyze_pr-{pr.id}-realtime-{event.action}-{content_hash}"
                            ),
                        )
                        result["realtime_ai_dispatched"] = True
                    except Exception:
                        # Don't fail the webhook on a dispatch hiccup — the
                        # 30-min poll will catch up.
                        result["realtime_ai_dispatched"] = False

    elif event.event_type == "issues" and event.issue:
        # Auto-link tasks mentioned via [slug:key] in the issue body/title.
        # No internal record of the GH issue is needed — the link rows hold
        # the issue's repo/number/title/state as cached display metadata.
        links = await task_sync_service.process_issue(
            issue=event.issue,
            repository=event.repository,
            action=event.action,
        )
        if links:
            result["task_links_created"] = len(links)

    # Trigger profile sync for affected developer(s)
    if event.sender:
        sender_id = event.sender.get("id")
        if sender_id:
            sync_service = ProfileSyncService()
            developer = await ingestion_service.find_developer_by_github_id(sender_id, db)
            if developer:
                try:
                    await sync_service.sync_developer_profile(developer.id, db)
                    result["profile_synced"] = True
                except Exception:
                    result["profile_synced"] = False

    return {
        "status": "processed",
        "delivery_id": x_github_delivery,
        **result,
    }


@router.get("/github/status")
async def webhook_status() -> dict:
    """Check webhook endpoint status."""
    return {
        "status": "active",
        "supported_events": ["push", "pull_request", "pull_request_review", "issues"],
    }


# =============================================================================
# AUTOMATION WORKFLOW WEBHOOK TRIGGERS
# =============================================================================


def derive_automation_webhook_secret(automation_id: str) -> str:
    """Per-automation HMAC secret derived from the global settings.secret_key.

    Avoids a migration to add a `webhook_secret` column on CRMAutomation.
    The UI surfaces this derived value as the automation's webhook secret;
    customers configure their external system to sign requests with it.
    """
    import hashlib
    import hmac as _hmac
    return _hmac.new(
        settings.secret_key.encode("utf-8"),
        f"automation:{automation_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _verify_automation_signature(automation_id: str, signature_header: str | None, body: bytes) -> bool:
    """Verify `X-Aexy-Signature: sha256=<hex>` against the derived per-automation secret."""
    import hashlib
    import hmac as _hmac
    if not signature_header:
        return False
    # Accept both `sha256=<hex>` and bare `<hex>` for client flexibility.
    sig = signature_header.split("=", 1)[1] if "=" in signature_header else signature_header
    secret = derive_automation_webhook_secret(automation_id)
    expected = _hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return _hmac.compare_digest(expected, sig)


@router.post("/automations/{automation_id}/trigger")
async def trigger_automation_webhook(
    automation_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Trigger an automation workflow via webhook.

    Authenticated by HMAC: caller signs the raw body with the per-automation
    secret returned by `derive_automation_webhook_secret`, sets the result
    in `X-Aexy-Signature: sha256=<hex>`. In debug mode an unsigned request
    is allowed for local testing; in production a missing/invalid signature
    is a hard 401. (WS-056)
    """
    from datetime import datetime, timezone
    from uuid import uuid4
    from sqlalchemy import select

    from aexy.models.crm import CRMAutomation, CRMRecord
    from aexy.models.workflow import (
        WorkflowDefinition,
        WorkflowExecution,
        WorkflowExecutionStatus,
    )
    from aexy.temporal.client import get_temporal_client
    from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow, CRMWorkflowInput

    # WS-082: per-automation rate limit so a leaked HMAC secret can't
    # be used to fan out Temporal workflows unbounded.
    await _enforce_webhook_rate_limit(
        f"webhook:automation:{automation_id}",
        _AUTOMATION_WEBHOOK_LIMIT_PER_ID_PER_MIN,
    )

    # Read raw body once so we can both verify the signature and JSON-parse it.
    raw_body = await request.body()
    signature_header = request.headers.get("X-Aexy-Signature") or request.headers.get("x-aexy-signature")
    if not _verify_automation_signature(automation_id, signature_header, raw_body):
        if not settings.debug:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid X-Aexy-Signature",
            )

    # Get payload
    try:
        import json as _json
        payload = _json.loads(raw_body) if raw_body else {}
    except Exception:
        payload = {}

    # Find automation
    stmt = select(CRMAutomation).where(CRMAutomation.id == automation_id)
    result = await db.execute(stmt)
    automation = result.scalar_one_or_none()

    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    if not automation.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Automation is not active",
        )

    # Get workflow
    stmt = select(WorkflowDefinition).where(WorkflowDefinition.automation_id == automation_id)
    result = await db.execute(stmt)
    workflow = result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found for this automation",
        )

    if not workflow.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workflow is not published",
        )

    # Build trigger data
    trigger_data = {
        "type": "webhook",
        "workspace_id": automation.workspace_id,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
        # WS-083: use the shared get_client_ip helper which honours
        # X-Forwarded-For; behind a load balancer `request.client.host`
        # records the LB IP, blinding abuse forensics.
        "source_ip": get_client_ip(request),
    }

    # Check for record_id in payload. The record must belong to the same
    # workspace as the automation — without this, a caller with a valid
    # signature for automation A in workspace WS-A can pump WS-B's CRM
    # record data into WS-A's workflow context (WS-056).
    record_id = payload.get("record_id")
    record_data = {}

    if record_id:
        stmt = select(CRMRecord).where(
            CRMRecord.id == record_id,
            CRMRecord.workspace_id == automation.workspace_id,
        )
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
        if record:
            record_data = {
                "id": record.id,
                "object_id": record.object_id,
                "values": record.values,
                "owner_id": record.owner_id,
            }

    # Create execution
    execution = WorkflowExecution(
        id=str(uuid4()),
        workflow_id=workflow.id,
        automation_id=automation_id,
        workspace_id=automation.workspace_id,
        record_id=record_id,
        status=WorkflowExecutionStatus.PENDING.value,
        context={
            "record_data": record_data,
            "trigger_data": trigger_data,
            "variables": {},
            "executed_nodes": [],
        },
        trigger_data=trigger_data,
        is_dry_run=False,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Dispatch to Temporal
    client = await get_temporal_client()
    await client.start_workflow(
        CRMAutomationWorkflow.run,
        CRMWorkflowInput(
            execution_id=execution.id,
            workflow_id=workflow.id,
            workspace_id=automation.workspace_id,
            trigger_data=trigger_data,
            record_id=record_id,
            record_data=record_data,
            nodes=workflow.nodes or [],
            edges=workflow.edges or [],
        ),
        id=f"crm-workflow-{execution.id}",
        task_queue="workflows",
    )

    return {
        "status": "accepted",
        "execution_id": execution.id,
        "automation_id": automation_id,
        "message": "Workflow execution started",
    }
