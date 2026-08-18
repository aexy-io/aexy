"""Evaluate a pull request against the pages that describe its code.

Dispatched rather than run inline in the webhook. This does one GitHub read and,
in the configured case, up to two GitHub writes — three round trips against
GitHub's ten-second webhook budget, on a request that already runs ingestion,
task sync, document sync and profile sync. A slow response here means redelivered
webhooks, which is worse than a notification arriving a second later.
"""

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from temporalio import activity

from aexy.core.config import get_settings
from aexy.core.database import get_async_session

logger = logging.getLogger(__name__)


@dataclass
class EvaluateDocImpactInput:
    repository_id: str
    pull_request_number: int
    head_sha: str
    # "opened" | "synchronize" | "merged"
    moment: str
    title: str | None = None
    author_developer_id: str | None = None
    author_login: str | None = None


@activity.defn
async def evaluate_document_impact(input: EvaluateDocImpactInput) -> dict[str, Any]:
    """Record what a pull request affects, then tell its author — once."""
    from aexy.models.activity import PullRequest
    from aexy.models.repository import Repository
    from aexy.services.document_impact_service import DocumentImpactService
    from aexy.services.github_app_service import GitHubAppService
    from aexy.services.notification_service import (
        notify_document_impact_pr_merged,
        notify_document_impact_pr_opened,
    )

    async with get_async_session() as db:
        repository = (
            await db.execute(
                select(Repository).where(Repository.id == input.repository_id)
            )
        ).scalar_one_or_none()
        if not repository:
            return {"status": "no_repository"}

        owner, _, name = (repository.full_name or "").partition("/")
        if not owner or not name:
            return {"status": "bad_repository_name"}

        # The one unavoidable GitHub read: the pull_request payload carries no
        # file list, and unlike a push there is no merge commit to diff. Needs
        # only `pull_requests: read`, which the App already has.
        app_service = GitHubAppService(db)
        access = await app_service.resolve_repository_access(
            repository, input.author_developer_id
        )
        if not access:
            # No installation reaches this repository. Nothing to be done, and
            # nothing worth telling the author — they cannot install an App.
            return {"status": "no_installation"}

        installation_id, _token = access
        try:
            changed_paths, truncated = await app_service.list_pull_request_files(
                installation_id, owner, name, input.pull_request_number
            )
        except Exception as exc:
            logger.warning(
                "Could not list files for %s#%s: %s",
                repository.full_name,
                input.pull_request_number,
                exc,
            )
            return {"status": "list_files_failed"}

        if not changed_paths:
            return {"status": "no_paths"}

        # The local pull request row, when ingestion has already written one. Its
        # absence is not a failure: the author's login off the webhook is enough
        # to name them, and `author_developer_id` is enough to notify them.
        pull_request_id = None
        if input.author_developer_id:
            local = (
                await db.execute(
                    select(PullRequest).where(
                        PullRequest.repository == repository.full_name,
                        PullRequest.number == input.pull_request_number,
                    )
                )
            ).scalar_one_or_none()
            pull_request_id = str(local.id) if local else None

        service = DocumentImpactService(db)
        outcome = await service.record_impact(
            repository_id=str(repository.id),
            pull_request_number=input.pull_request_number,
            changed_paths=changed_paths,
            head_sha=input.head_sha,
            moment=input.moment,
            pull_request_id=pull_request_id,
            title=input.title,
            author_developer_id=input.author_developer_id,
            author_login=input.author_login,
            truncated=truncated,
        )
        if outcome is None:
            # Nothing in this repository is documented. The common case, and it
            # leaves no row behind.
            return {"status": "repository_not_documented"}

        titles, screenshot_pages, workspace_id = await _describe(
            service, db, outcome, input
        )

        # The GitHub side runs whether or not anybody is notified, and its result
        # never gates the notification. For an external contributor with no account
        # here it is the *only* channel that reaches them.
        github = {}
        if workspace_id and outcome["affected_count"]:
            github = await _write_to_github(
                db,
                repository=repository,
                impact_id=outcome["impact_id"],
                workspace_id=workspace_id,
                pull_request_number=input.pull_request_number,
                head_sha=input.head_sha,
                merged=input.moment == "merged",
                truncated=truncated,
                author_developer_id=input.author_developer_id,
            )

        if not outcome["notify"] or not input.author_developer_id:
            # Either there is nothing new to say, or the author has no account
            # here to say it to.
            return {
                "status": "recorded",
                "notify": outcome["notify"],
                "affected": outcome["affected_count"],
                "notifiable_author": bool(input.author_developer_id),
                "github": github,
            }

        if not workspace_id:
            return {"status": "recorded", "notify": None, "github": github}

        emit = (
            notify_document_impact_pr_opened
            if outcome["notify"] == "opened"
            else notify_document_impact_pr_merged
        )
        sent = await emit(
            db,
            input.author_developer_id,
            repository_id=str(repository.id),
            pr_number=input.pull_request_number,
            repository=repository.full_name,
            document_titles=titles,
            screenshot_page_count=screenshot_pages,
            workspace_id=workspace_id,
        )

        return {
            "status": "notified",
            "notify": outcome["notify"],
            "affected": outcome["affected_count"],
            "sent": sent,
            "truncated": truncated,
            "github": github,
        }


async def _write_to_github(
    db,
    *,
    repository,
    impact_id: str,
    workspace_id: str,
    pull_request_number: int,
    head_sha: str,
    merged: bool,
    truncated: bool,
    author_developer_id: str | None,
) -> dict[str, str]:
    """Comment on the pull request and annotate the commit, if configured to.

    Never raises, and never lets a GitHub problem suppress the in-app
    notification: a missing App permission is an org misconfiguration, and going
    silent about the documentation because of it would punish the wrong person.
    Whatever happened is recorded on the impact row so the page can say it
    precisely.
    """
    from aexy.models.document_impact import GitHubWriteStatus, PullRequestDocImpact
    from aexy.services.document_impact_service import (
        DocumentImpactService,
        render_check_run,
        render_pr_comment,
    )
    from aexy.services.github_write_service import (
        GitHubPermissionError,
        GitHubWriteService,
    )

    service = DocumentImpactService(db)
    settings = await service.get_settings(workspace_id)
    outcome: dict[str, str] = {}

    impact = await db.scalar(
        select(PullRequestDocImpact).where(PullRequestDocImpact.id == impact_id)
    )
    if impact is None:
        return outcome

    wants_comment = settings["enabled"] and settings["pr_comment_enabled"]
    wants_check = settings["enabled"] and settings["check_run_enabled"]
    if not wants_comment and not wants_check:
        # Both off is the default. Not "skipped because something failed".
        return outcome

    pages = await _pages_for_github(db, impact)

    # Nothing outstanding — every affected page was marked as needing no update,
    # or none matched. If a comment is already on the pull request it has to be
    # corrected, or it goes on claiming "2 pages affected" after somebody
    # answered: the comment states current state, so a stale one is a wrong one.
    #
    # Never *posts* in this case. A comment that exists only to say nothing is
    # wrong is the kind of noise this whole feature is trying not to be.
    if not pages:
        if impact.pr_comment_id and wants_comment:
            try:
                await _resolve_github_artifacts(db, impact, repository, workspace_id,
                                                pull_request_number, author_developer_id)
                outcome["pr_comment"] = "resolved"
            except Exception:
                logger.exception(
                    "Could not clear the doc-impact comment on %s#%s",
                    repository.full_name,
                    pull_request_number,
                )
        return outcome

    writer = GitHubWriteService(db)
    target = await writer.resolve_target(repository, author_developer_id)
    if target is None:
        return outcome

    frontend = get_settings().frontend_url.rstrip("/")
    impact_url = (
        f"{frontend}/docs/impact/{repository.id}/{pull_request_number}"
    )
    blocked_reason: str | None = None

    if wants_comment:
        try:
            impact.pr_comment_id = await writer.upsert_pr_comment(
                target,
                pull_request_number,
                render_pr_comment(
                    pages=pages,
                    impact_url=impact_url,
                    merged=merged,
                    truncated=truncated,
                ),
                comment_id=impact.pr_comment_id,
            )
            impact.pr_comment_status = GitHubWriteStatus.POSTED
            impact.pr_comment_error = None
        except GitHubPermissionError as refused:
            impact.pr_comment_status = GitHubWriteStatus.PERMISSION_MISSING
            impact.pr_comment_error = str(refused)
            blocked_reason = str(refused)
        except Exception as exc:
            # Anything else is ours to look at, not the customer's to fix — so it
            # is recorded as failed rather than as a missing permission.
            impact.pr_comment_status = GitHubWriteStatus.FAILED
            impact.pr_comment_error = str(exc)[:500]
        outcome["pr_comment"] = impact.pr_comment_status

    if wants_check:
        try:
            title, summary = render_check_run(pages=pages, merged=merged)
            impact.check_run_id = await writer.upsert_check_run(
                target,
                head_sha,
                conclusion=settings["check_run_conclusion"],
                title=title,
                summary=summary,
                details_url=impact_url,
                check_run_id=impact.check_run_id,
                check_run_head_sha=impact.check_run_head_sha,
            )
            impact.check_run_head_sha = head_sha
            impact.check_run_status = GitHubWriteStatus.POSTED
            impact.check_run_error = None
        except GitHubPermissionError as refused:
            impact.check_run_status = GitHubWriteStatus.PERMISSION_MISSING
            impact.check_run_error = str(refused)
            blocked_reason = blocked_reason or str(refused)
        except Exception as exc:
            impact.check_run_status = GitHubWriteStatus.FAILED
            impact.check_run_error = str(exc)[:500]
        outcome["check_run"] = impact.check_run_status

    # Cleared on the first success, so the banner does not outlive the problem.
    await service.record_github_write_block(workspace_id, blocked_reason)
    await db.flush()
    return outcome


async def _resolve_github_artifacts(
    db, impact, repository, workspace_id, pull_request_number, author_developer_id
) -> None:
    """Rewrite an existing comment to say there is nothing left to do.

    Only ever an edit. The comment is a statement of current state, so when the
    state becomes "somebody answered this", the sentence has to change — but the
    absence of a comment is itself the right answer for a pull request with
    nothing outstanding, so this never creates one.
    """
    from aexy.services.document_impact_service import render_resolved_pr_comment
    from aexy.services.github_write_service import GitHubWriteService

    writer = GitHubWriteService(db)
    target = await writer.resolve_target(repository, author_developer_id)
    if target is None:
        return

    frontend = get_settings().frontend_url.rstrip("/")
    await writer.upsert_pr_comment(
        target,
        pull_request_number,
        render_resolved_pr_comment(
            impact_url=f"{frontend}/docs/impact/{repository.id}/{pull_request_number}"
        ),
        comment_id=impact.pr_comment_id,
    )


async def _pages_for_github(db, impact) -> list[dict]:
    """The same statements the page shows, for the comment and the check run.

    Read back through the impact items rather than passed down, so a reviewer
    reading the comment and a person opening the page are told the same thing.
    """
    from aexy.models.document_impact import PullRequestDocImpactItem
    from aexy.models.documentation import Document, DocumentCodeLink
    from aexy.services.document_impact_service import (
        derive_guidance,
        summarise_images,
    )

    items = (
        await db.execute(
            select(PullRequestDocImpactItem).where(
                PullRequestDocImpactItem.impact_id == impact.id,
                PullRequestDocImpactItem.dismissed_at.is_(None),
            )
        )
    ).scalars().all()
    if not items:
        return []

    documents = {
        str(doc.id): doc
        for doc in (
            await db.execute(
                select(Document).where(
                    Document.id.in_([str(i.document_id) for i in items])
                )
            )
        ).scalars()
    }
    link_ids = [
        entry.get("code_link_id")
        for item in items
        for entry in (item.matched or [])
        if entry.get("code_link_id")
    ]
    links = {
        str(link.id): link
        for link in (
            await db.execute(
                select(DocumentCodeLink).where(DocumentCodeLink.id.in_(link_ids))
            )
        ).scalars()
    } if link_ids else {}

    frontend = get_settings().frontend_url.rstrip("/")
    pages: list[dict] = []
    for item in items:
        document = documents.get(str(item.document_id))
        if not document:
            continue
        matched = item.matched or []
        paths = [p for e in matched for p in (e.get("matched_paths") or [])]
        category = next(
            (
                links[e["code_link_id"]].template_category
                for e in matched
                if e.get("code_link_id") in links
                and links[e["code_link_id"]].template_category
            ),
            None,
        )
        images = summarise_images(document.content)
        pages.append(
            {
                "title": document.title,
                "url": f"{frontend}/docs/{document.id}",
                "paths": paths,
                "screenshots": images["count"],
                "guidance": derive_guidance(
                    matched_paths=paths,
                    content=document.content,
                    template_category=category,
                    images=images,
                ),
            }
        )
    return pages


async def _describe(service, db, outcome: dict, input: EvaluateDocImpactInput):
    """Titles and screenshot counts for the pages we are about to name.

    Read from the impact items rather than passed through `record_impact`, so the
    notification says the same thing the page will show.

    The workspace is resolved even when there is nothing to notify about: a
    `synchronize` with no new pages still has to refresh the pull request comment,
    and returning None here would leave it stating a set of files two pushes old.
    """
    from aexy.models.documentation import Document
    from aexy.services.document_impact_service import summarise_images

    workspace_id = await _workspace_for(db, outcome["impact_id"])

    notify_ids = outcome["notify_document_ids"]
    if not notify_ids:
        return [], 0, workspace_id

    documents = (
        await db.execute(select(Document).where(Document.id.in_(notify_ids)))
    ).scalars().all()

    titles = [document.title for document in documents]
    screenshot_pages = sum(
        1 for document in documents if summarise_images(document.content)["count"]
    )
    return titles, screenshot_pages, workspace_id


async def _workspace_for(db, impact_id: str) -> str | None:
    """Whose pages these are. Denormalised onto the item for exactly this read."""
    from aexy.models.document_impact import PullRequestDocImpactItem

    workspace_id = (
        await db.execute(
            select(PullRequestDocImpactItem.workspace_id).where(
                PullRequestDocImpactItem.impact_id == impact_id
            )
        )
    ).scalars().first()
    return str(workspace_id) if workspace_id else None
