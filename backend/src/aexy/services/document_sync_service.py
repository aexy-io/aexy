"""Service for handling document sync based on plan tier."""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.documentation import (
    Document,
    DocumentCodeLink,
    DocumentSyncMode,
    DocumentSyncQueue,
)
from aexy.models.developer import Developer
from aexy.models.plan import PlanTier
from aexy.services.limits_service import LimitsService

logger = logging.getLogger(__name__)


class SyncTriggerType(str, Enum):
    """Types of sync triggers based on plan tier."""

    REAL_TIME = "real_time"  # Premium: Immediate on code change
    DAILY_BATCH = "daily_batch"  # Pro: Once per day
    MANUAL = "manual"  # Free: User-initiated only


# Paths whose changing tells a reader of the documentation nothing.
#
# This is the cheapest saving in the pipeline and the one that matters most at
# scale: once a repository is documented module by module, most pushes touch
# *some* module, and without this filter each one buys a full regeneration —
# an LLM call, a proposal, and a person asked to review a document whose
# meaning did not change because a lockfile moved.
#
# Conservative on purpose. Anything not clearly noise is treated as
# substantive: a missed skip costs one generation, a wrong skip means a
# document stays wrong and nobody is told.
_NOISE_FILENAMES = frozenset(
    {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "poetry.lock",
        "uv.lock",
        "Cargo.lock",
        "Gemfile.lock",
        "composer.lock",
        "go.sum",
        "requirements.txt.lock",
    }
)

_NOISE_DIRECTORIES = ("node_modules/", "vendor/", "dist/", "build/", ".git/")

_NOISE_SUFFIXES = (
    ".min.js",
    ".min.css",
    ".map",
    ".snap",
    ".lock",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".pdf",
)


def _category_for_link(code_link):
    """The kind of document this link produces.

    Both sync paths hardcoded `FUNCTION_DOCS`, so re-syncing a module document
    rewrote it as function docs — the document silently changed kind, and the
    author's only clue was that the proposal read nothing like the page.
    Falls back to the old constant when the link predates the column.
    """
    from aexy.models.documentation import TemplateCategory

    stored = getattr(code_link, "template_category", None)
    if stored:
        try:
            return TemplateCategory(stored)
        except ValueError:
            logger.warning(
                f"Code link {code_link.id} has unknown category {stored!r}"
            )
    return TemplateCategory.FUNCTION_DOCS


def is_substantive_path(path: str) -> bool:
    """Could a change to this file alter what the documentation should say?

    Lockfiles, build output, vendored trees and binary assets cannot: they
    change constantly and describe nothing a reader of the prose cares about.
    """
    normalised = path.strip().lstrip("./")
    if not normalised:
        return False

    filename = normalised.rsplit("/", 1)[-1]
    if filename in _NOISE_FILENAMES:
        return False
    if any(
        normalised.startswith(directory) or f"/{directory}" in normalised
        for directory in _NOISE_DIRECTORIES
    ):
        return False
    if normalised.endswith(_NOISE_SUFFIXES):
        return False
    return True


class DocumentSyncService:
    """Service for orchestrating document sync based on plan tier."""

    def __init__(self, db: AsyncSession):
        """Initialize the document sync service.

        Args:
            db: Async database session.
        """
        self.db = db
        self.limits_service = LimitsService(db)

    async def get_sync_type_for_developer(
        self, developer_id: str
    ) -> SyncTriggerType:
        """Get the sync type allowed for a developer based on their plan.

        Args:
            developer_id: Developer ID.

        Returns:
            SyncTriggerType based on plan tier.
        """
        developer = await self.limits_service.get_developer_with_plan(developer_id)

        if not developer or not developer.plan:
            return SyncTriggerType.MANUAL

        plan = developer.plan

        # Check for real-time sync capability (premium plans)
        if plan.enable_real_time_sync:
            return SyncTriggerType.REAL_TIME

        # Check tier for batch sync (pro / enterprise plans).
        # NOTE: previously referenced `PlanTier.TEAM` which does not
        # exist on the enum — every call from a non-premium developer
        # hit AttributeError. Fixed to ENTERPRISE, matching the rest
        # of the codebase (knowledge_graph / notifications / app_access).
        if plan.tier in [PlanTier.PRO.value, PlanTier.ENTERPRISE.value]:
            return SyncTriggerType.DAILY_BATCH

        # Default to manual sync (free tier)
        return SyncTriggerType.MANUAL

    async def queue_document_for_sync(
        self,
        document_id: str,
        triggered_by_commit: str | None = None,
    ) -> DocumentSyncQueue | None:
        """Queue a document for batch sync.

        This is used for mid-tier plans with daily batch sync.

        Args:
            document_id: Document to queue.
            triggered_by_commit: Commit SHA that triggered the sync.

        Returns:
            Created queue entry or None if already queued.
        """
        # Check if already in queue with pending status
        stmt = select(DocumentSyncQueue).where(
            and_(
                DocumentSyncQueue.document_id == document_id,
                DocumentSyncQueue.status == "pending",
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Update the trigger commit if newer
            if triggered_by_commit:
                existing.triggered_by_commit = triggered_by_commit
                existing.triggered_at = datetime.now(timezone.utc)
            return existing

        # Create new queue entry
        queue_entry = DocumentSyncQueue(
            id=str(uuid4()),
            document_id=document_id,
            triggered_by_commit=triggered_by_commit,
            status="pending",
        )
        self.db.add(queue_entry)
        await self.db.flush()

        return queue_entry

    async def get_pending_sync_queue(
        self,
        limit: int = 100,
        workspace_id: str | None = None,
    ) -> list[DocumentSyncQueue]:
        """Get pending documents in the sync queue.

        Args:
            limit: Maximum number of items to return.
            workspace_id: Restrict to one workspace's documents.

        Returns:
            List of pending sync queue entries.
        """
        stmt = (
            select(DocumentSyncQueue)
            .where(DocumentSyncQueue.status == "pending")
            .options(selectinload(DocumentSyncQueue.document))
            .order_by(DocumentSyncQueue.triggered_at)
            .limit(limit)
        )
        if workspace_id is not None:
            # Filtered in SQL rather than after the fact. `process_queue` used
            # to take the global head of the queue and then drop the rows that
            # belonged to other workspaces, so a workspace whose entries sat
            # behind another's `limit` rows was never drained at all — it just
            # looked idle.
            stmt = stmt.join(
                Document, DocumentSyncQueue.document_id == Document.id
            ).where(Document.workspace_id == workspace_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_sync_processing(
        self, queue_ids: list[str]
    ) -> int:
        """Mark queue entries as processing.

        Args:
            queue_ids: List of queue entry IDs to mark.

        Returns:
            Number of entries updated.
        """
        stmt = (
            update(DocumentSyncQueue)
            .where(DocumentSyncQueue.id.in_(queue_ids))
            .values(status="processing")
        )
        result = await self.db.execute(stmt)
        return result.rowcount

    async def mark_sync_completed(
        self,
        queue_id: str,
        success: bool = True,
        error_message: str | None = None,
    ) -> None:
        """Mark a sync queue entry as completed or failed.

        Args:
            queue_id: Queue entry ID.
            success: Whether sync was successful.
            error_message: Error message if failed.
        """
        stmt = (
            update(DocumentSyncQueue)
            .where(DocumentSyncQueue.id == queue_id)
            .values(
                status="completed" if success else "failed",
                processed_at=datetime.now(timezone.utc),
                error_message=error_message,
            )
        )
        await self.db.execute(stmt)

    async def handle_code_change(
        self,
        repository_id: str,
        commit_sha: str,
        changed_paths: list[str],
    ) -> dict[str, Any]:
        """Handle a code change event (from webhook).

        This checks each linked document and either:
        - Triggers immediate regeneration (premium)
        - Queues for batch sync (pro)
        - Marks as having pending changes (free)

        Args:
            repository_id: Repository where change occurred.
            commit_sha: Commit SHA of the change.
            changed_paths: List of file paths that changed.

        Returns:
            Summary of actions taken.
        """
        # Drop the noise before anything is matched, flagged or generated. A
        # push of nothing but lockfiles reaches here regularly and must cost a
        # filter rather than one LLM call per document it happens to sit under.
        substantive_paths = [p for p in changed_paths if is_substantive_path(p)]
        if not substantive_paths:
            logger.info(
                f"Push {commit_sha[:8]} to repository {repository_id} touched "
                f"{len(changed_paths)} path(s), none substantive — skipping"
            )
            return {
                "real_time_synced": [],
                "queued_for_batch": [],
                "marked_pending": [],
                "no_match": 0,
                "skipped_non_substantive": len(changed_paths),
            }
        changed_paths = substantive_paths

        results = {
            "real_time_synced": [],
            "queued_for_batch": [],
            "marked_pending": [],
            "no_match": 0,
        }

        # Find all documents linked to files in this repository
        stmt = (
            select(DocumentCodeLink)
            .options(
                selectinload(DocumentCodeLink.document).selectinload(Document.created_by)
            )
            .where(DocumentCodeLink.repository_id == repository_id)
        )
        result = await self.db.execute(stmt)
        code_links = result.scalars().all()

        for link in code_links:
            # A muted link is not merely "do not propose" — it stops being
            # reported as behind at all. Flagging a document somebody has
            # explicitly said they do not want updated turns the badge into
            # noise, and a badge people learn to ignore is worse than none.
            if link.sync_mode == DocumentSyncMode.OFF.value:
                results["muted"] = results.get("muted", 0) + 1
                continue

            # Check if any changed path matches this link
            matches = self._path_matches_link(link.path, link.link_type, changed_paths)

            if not matches:
                results["no_match"] += 1
                continue

            # Update link to indicate pending changes
            link.has_pending_changes = True
            link.last_commit_sha = commit_sha

            # Route by the plan tier of whoever owns *this sync*, falling back
            # to the document's author for links created before ownership
            # existed. Reading the author alone was wrong in the ordinary case
            # — the person who writes a document is often not the person who
            # wires it to a repository — and badly wrong after a whole-repo
            # run, where one author's tier would govern every document in it.
            document = link.document
            if not document:
                continue

            sync_owner_id = link.owner_developer_id or document.created_by_id
            if not sync_owner_id:
                continue

            sync_type = await self.get_sync_type_for_developer(str(sync_owner_id))

            if sync_type == SyncTriggerType.REAL_TIME:
                # Trigger immediate regeneration
                await self._trigger_real_time_sync(document, link, commit_sha)
                results["real_time_synced"].append(str(document.id))

            elif sync_type == SyncTriggerType.DAILY_BATCH:
                # Queue for batch processing
                await self.queue_document_for_sync(
                    str(document.id), triggered_by_commit=commit_sha
                )
                results["queued_for_batch"].append(str(document.id))

            else:
                # Just mark as having pending changes (free tier)
                results["marked_pending"].append(str(document.id))

        await self.db.commit()
        return results

    async def list_documents_needing_update(
        self,
        workspace_id: str,
        repository_id: str | None = None,
        include_never_synced: bool = True,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Documents whose linked source has changed since they were written.

        The read side of the freshness pipeline. `handle_code_change` sets
        `has_pending_changes` when a push touches a link's path; this turns
        that flag into a work list somebody — or something — can act on.

        Deliberately free of model calls: everything here is a join. That is
        what makes it reasonable to expose over MCP and poll, and it is the
        argument for detecting centrally while generating elsewhere.

        Ordered oldest-first so the document that has been wrong longest is
        the one handed out first.
        """
        from aexy.models.documentation import DocumentProposedEdit, ProposedEditStatus

        conditions = [Document.workspace_id == workspace_id]
        if repository_id:
            conditions.append(DocumentCodeLink.repository_id == repository_id)

        staleness = [DocumentCodeLink.has_pending_changes.is_(True)]
        if include_never_synced:
            staleness.append(DocumentCodeLink.last_synced_at.is_(None))

        stmt = (
            select(DocumentCodeLink)
            .join(Document, DocumentCodeLink.document_id == Document.id)
            .options(
                selectinload(DocumentCodeLink.document),
                selectinload(DocumentCodeLink.repository),
            )
            .where(and_(*conditions))
            .where(or_(*staleness))
            # Nulls first: a document linked to code and never generated from
            # it is the most out of date thing there is, not the least.
            .order_by(DocumentCodeLink.last_synced_at.asc().nulls_first())
            .limit(limit)
        )
        links = (await self.db.execute(stmt)).scalars().all()
        if not links:
            return []

        # One query for every pending proposal rather than one per document.
        document_ids = [str(link.document_id) for link in links]
        counts_stmt = (
            select(
                DocumentProposedEdit.document_id,
                func.count(DocumentProposedEdit.id),
            )
            .where(DocumentProposedEdit.document_id.in_(document_ids))
            .where(DocumentProposedEdit.status == ProposedEditStatus.PENDING.value)
            .group_by(DocumentProposedEdit.document_id)
        )
        pending = {
            str(document_id): count
            for document_id, count in (await self.db.execute(counts_stmt)).all()
        }

        items: list[dict[str, Any]] = []
        for link in links:
            document = link.document
            if not document:
                continue
            items.append(
                {
                    "document_id": str(document.id),
                    "document_title": document.title,
                    "document_icon": document.icon,
                    "code_link_id": str(link.id),
                    "repository_id": str(link.repository_id),
                    "repository_full_name": (
                        link.repository.full_name if link.repository else None
                    ),
                    "path": link.path,
                    "link_type": link.link_type,
                    "branch": link.branch,
                    "reason": (
                        "code_changed" if link.last_synced_at else "never_synced"
                    ),
                    "last_synced_at": link.last_synced_at,
                    "last_seen_commit_sha": link.last_commit_sha,
                    "owner_developer_id": (
                        str(link.owner_developer_id)
                        if link.owner_developer_id
                        else None
                    ),
                    "pending_proposal_count": pending.get(str(document.id), 0),
                }
            )
        return items

    async def transfer_owned_syncs(
        self,
        departing_developer_id: str,
        workspace_id: str,
        new_owner_id: str | None = None,
    ) -> dict[str, Any]:
        """Move every doc-to-code sync owned by a departing developer.

        Called when someone is removed from a workspace. Their syncs keep
        running — that is the point of a sync — so leaving them pointed at a
        developer who is gone means their plan tier keeps deciding the
        behaviour and their GitHub connection keeps being the credential
        fallback, both of which will quietly stop working.

        Defaults to the workspace owner, who is the one member who cannot
        themselves be removed. Notifies the new owner once with a count
        rather than once per sync: a silent transfer is worse than none,
        because the first they would hear of it is a proposal they did not
        ask for on a document they did not know was theirs.

        Never raises — a documentation concern must not block a removal.
        """
        from aexy.models.workspace import Workspace
        from aexy.services.notification_service import (
            notify_document_sync_ownership_transferred,
        )

        try:
            links = (
                (
                    await self.db.execute(
                        select(DocumentCodeLink)
                        .join(Document, DocumentCodeLink.document_id == Document.id)
                        .where(DocumentCodeLink.owner_developer_id == departing_developer_id)
                        .where(Document.workspace_id == workspace_id)
                    )
                )
                .scalars()
                .all()
            )
            if not links:
                return {"transferred": 0, "new_owner_id": None}

            recipient_id = new_owner_id
            if not recipient_id:
                workspace = (
                    await self.db.execute(
                        select(Workspace).where(Workspace.id == workspace_id)
                    )
                ).scalar_one_or_none()
                recipient_id = str(workspace.owner_id) if workspace else None

            if not recipient_id or recipient_id == departing_developer_id:
                # Nobody sensible to hand them to. Leave the rows alone rather
                # than nulling them: an owner who has left still identifies the
                # installation the sync has been using, and a null owner would
                # discard that with nothing to replace it.
                logger.warning(
                    f"No transfer target for {len(links)} sync(s) owned by "
                    f"{departing_developer_id} in workspace {workspace_id}"
                )
                return {"transferred": 0, "new_owner_id": None}

            for link in links:
                link.owner_developer_id = recipient_id

            departing = (
                await self.db.execute(
                    select(Developer).where(Developer.id == departing_developer_id)
                )
            ).scalar_one_or_none()
            label = (departing.name if departing and departing.name else "A teammate")

            await notify_document_sync_ownership_transferred(
                self.db,
                recipient_id=recipient_id,
                sync_count=len(links),
                previous_owner_label=label,
                workspace_id=workspace_id,
            )

            logger.info(
                f"Transferred {len(links)} sync(s) from {departing_developer_id} "
                f"to {recipient_id} in workspace {workspace_id}"
            )
            return {"transferred": len(links), "new_owner_id": recipient_id}

        except Exception as exc:  # pragma: no cover - defensive
            logger.exception(
                f"Failed to transfer syncs for {departing_developer_id}: {exc}"
            )
            return {"transferred": 0, "new_owner_id": None}

    async def _build_github_reader(
        self,
        document: Document,
        code_link: DocumentCodeLink,
    ):
        """Resolve repository access for a background sync and return a
        reader the generation service can actually call.

        `DocumentGenerationService` asks for content by `(repository_full_name,
        path, branch)`; `GitHubAppService` answers by `(installation_id, owner,
        repo, path, ref)`. Passing the app service straight through raised
        `TypeError` on every background regeneration — caught and logged as a
        generic failure, so the path looked merely unlucky rather than broken.
        The API path has always wrapped it; this is the same wrapper.

        Access is resolved against the repository first and only then against
        the sync's owner. That order is the whole point: an installation
        reached through one person's connection disappears with that person,
        so a repository-first lookup is what keeps a team's documentation
        syncing after whoever set it up has left.
        """
        from aexy.services.github_app_service import (
            GitHubAppService,
            GitHubServiceAdapter,
        )

        repository = code_link.repository
        if not repository:
            logger.warning(f"Code link {code_link.id} has no repository — can't sync")
            return None

        app_service = GitHubAppService(self.db)
        token_result = await app_service.get_installation_token_for_account(
            repository.owner_login
        )
        if not token_result:
            # No installation covers the account directly. Fall back to whoever
            # owns the sync — and only then to the document's author, which is
            # what this read before code links had an owner of their own.
            fallback_id = code_link.owner_developer_id or document.created_by_id
            if fallback_id:
                token_result = await app_service.get_installation_token_for_developer(
                    str(fallback_id), repository.owner_login
                )
        if not token_result:
            logger.warning(
                f"No GitHub installation for document {document.id} "
                f"({repository.full_name}) — can't sync"
            )
            return None

        _token, installation_id = token_result
        return GitHubServiceAdapter(
            app_service=app_service,
            installation_id=installation_id,
            owner=repository.owner_login,
            repo=repository.name,
        )

    async def _trigger_real_time_sync(
        self,
        document: Document,
        code_link: DocumentCodeLink,
        commit_sha: str,
    ) -> bool:
        """Trigger immediate regeneration for a document.

        Args:
            document: Document to regenerate.
            code_link: Code link that triggered the sync.
            commit_sha: Commit SHA that triggered the sync.

        Returns:
            True if sync was triggered successfully.
        """
        try:
            # Import here to avoid circular imports
            from aexy.services.document_generation_service import (
                DocumentGenerationService,
            )

            gen_service = DocumentGenerationService(self.db)
            category = _category_for_link(code_link)

            github_service = await self._build_github_reader(document, code_link)
            if github_service is None:
                return False

            # Generate fresh docs from the linked code and route them
            # into the proposed-edit review queue. The user approves
            # before content lands — replaces the old "mark pending"
            # stub that never produced anything to act on.
            outcome = await self._generate_and_propose(
                document=document,
                code_link=code_link,
                category=category,
                gen_service=gen_service,
                github_service=github_service,
                source="code_change_sync",
            )

            # Mark the code link processed regardless — the proposal
            # is the new dirty state. Successive code changes will
            # create new proposals that supersede this one.
            code_link.last_commit_sha = commit_sha
            code_link.has_pending_changes = False
            code_link.last_synced_at = datetime.now(timezone.utc)
            if outcome is not None:
                # Only advance the base when there is prose written from this
                # commit. Moving it on a failure would make the next sync diff
                # against a version that was never written.
                code_link.last_synced_commit_sha = commit_sha

            logger.info(
                f"Real-time sync produced a proposal for document {document.id}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to trigger real-time sync: {e}")
            return False

    async def _revise(
        self,
        document,
        code_link,
        gen_service,
        github_service,
        developer_id: str | None,
    ) -> dict[str, Any] | None:
        """Revise the existing prose against what changed, or return None.

        A code change is a *diff*, and the document already says most of what
        it should. Rewriting the whole thing from source — which is what this
        path did — is both the most expensive option and the one most likely
        to discard good prose nothing asked to change.

        `update_documentation` and its `DOC_UPDATE_PROMPT` were already here,
        used only by the apply-a-suggestion route, which passes empty strings
        for both code arguments. The one caller that genuinely has an old
        version and a new version was not using it.

        Returns None — meaning "fall back to a full regeneration" — whenever a
        revision would be guesswork: no base commit recorded, nothing written
        yet, or the fetch failed. Guessing a base produces a diff against a
        version that never existed, which is worse than paying for a rewrite.
        """
        base_sha = getattr(code_link, "last_synced_commit_sha", None)
        if not base_sha:
            return None

        head_sha = code_link.last_commit_sha
        if not head_sha or head_sha == base_sha:
            return None

        existing = document.content
        if not existing or not existing.get("content"):
            # Nothing to revise. A first draft is a generation, not an edit.
            return None

        compare = getattr(github_service, "compare_commits", None)
        if compare is None:
            return None

        try:
            diff = await compare(
                code_link.repository.full_name, base_sha, head_sha, code_link.path
            )
        except Exception as e:
            logger.warning(
                f"compare {base_sha[:8]}..{head_sha[:8]} failed for doc "
                f"{document.id}: {e} — regenerating in full"
            )
            return None

        if not diff or not diff.get("patch"):
            return None

        try:
            result = await gen_service.update_documentation(
                existing_doc=existing,
                old_code="",
                new_code=diff["patch"],
                language=None,
                changes_summary=diff.get("summary"),
                developer_id=developer_id,
            )
        except Exception as e:
            logger.warning(
                f"Incremental update failed for doc {document.id}: {e} "
                f"— regenerating in full"
            )
            return None

        # `update_documentation` answers with {"updated_doc": ..., "changes_made":
        # [...]} rather than a bare document, and falls back to echoing the input
        # when the model's reply will not parse. An echo is not an update.
        revised = result.get("updated_doc") if isinstance(result, dict) else None
        if not isinstance(revised, dict) or not revised.get("content"):
            return None
        if revised == existing:
            return None

        logger.info(
            f"Revised doc {document.id} from {base_sha[:8]}..{head_sha[:8]} "
            f"instead of regenerating"
        )
        return revised

    async def _generate_and_propose(
        self,
        document,
        code_link,
        category,
        gen_service,
        github_service,
        source: str,
    ) -> dict[str, Any] | None:
        """Fetch code, generate docs, create a pending proposal.

        Shared between real-time and batch sync paths. Returns the
        created proposal id + content on success, or None if anything
        upstream failed (logged).
        """
        from aexy.services.proposed_edits_service import ProposedEditsService

        if not code_link.repository:
            logger.warning(
                f"Code link {code_link.id} has no repository — can't sync"
            )
            return None

        # Automated generation still costs tokens. Attributing it to the sync
        # owner puts it against the plan whose tier asked for the sync in the
        # first place; passing nothing, as this used to, made the platform's
        # single largest recurring AI cost belong to nobody and appear in no
        # workspace's usage.
        billed_to = code_link.owner_developer_id or document.created_by_id
        developer_id = str(billed_to) if billed_to else None

        content = await self._revise(
            document=document,
            code_link=code_link,
            gen_service=gen_service,
            github_service=github_service,
            developer_id=developer_id,
        )
        # Whether the existing prose was the *input* to this content, which is
        # what makes applying it unattended defensible: a revision carries
        # every hand-written sentence forward, a regeneration cannot know one
        # was ever there.
        was_revised = content is not None
        if content is None:
            try:
                content = await gen_service.generate_from_repository(
                    github_service=github_service,
                    repository_full_name=code_link.repository.full_name,
                    path=code_link.path,
                    template_category=category,
                    branch=code_link.branch or "main",
                    developer_id=developer_id,
                )
            except Exception as e:
                logger.error(
                    f"generate_from_repository failed for doc {document.id}: {e}"
                )
                return None

        proposed_edits = ProposedEditsService(self.db)
        proposal = await proposed_edits.create_proposal(
            document_id=str(document.id),
            source=source,
            proposed_content=content,
            # proposed_by_id stays None — system-generated.
        )

        # Auto-apply goes through the review queue rather than around it: the
        # proposal row is created, then immediately approved. Same versioning,
        # same audit trail, and a record of what landed and why — a silent
        # write would leave nothing to look at when someone asks where a
        # paragraph went.
        applied = False
        if code_link.sync_mode == DocumentSyncMode.AUTO.value:
            if was_revised:
                await proposed_edits.approve(
                    proposal_id=str(proposal.id),
                    # Attributed to whoever turned auto-apply on. Nobody
                    # clicked, but somebody authorised it.
                    reviewed_by_id=str(billed_to) if billed_to else None,
                )
                applied = True
            else:
                logger.info(
                    f"Doc {document.id} is set to auto-apply, but this was a "
                    f"full regeneration — proposing instead so hand-written "
                    f"prose is not overwritten unseen"
                )

        return {
            "proposal_id": proposal.id,
            "content": content,
            "applied": applied,
        }

    async def regenerate_document(
        self,
        document_id: str,
        workspace_id: str,
    ) -> dict[str, Any]:
        """Public regenerate entry point — called by the Temporal
        `regenerate_document` activity.

        Loads the document + its first code link, generates fresh
        docs, and lands them as a `pending` proposal (source =
        code_change_sync). Returns a status dict the activity can
        log; never raises so a single bad doc doesn't poison the
        queue.
        """
        from aexy.models.documentation import Document, DocumentCodeLink
        from aexy.services.document_generation_service import (
            DocumentGenerationService,
        )
        from sqlalchemy.orm import selectinload as _selectinload

        stmt = (
            select(Document)
            .where(Document.id == document_id)
            .options(_selectinload(Document.code_links))
        )
        result = await self.db.execute(stmt)
        document = result.scalar_one_or_none()
        if not document:
            return {"status": "skipped", "reason": "document not found"}

        code_links = list(document.code_links) if document.code_links else []
        if not code_links:
            return {"status": "skipped", "reason": "no code links"}

        code_link = code_links[0]
        # Reload the link with its repository relationship since the
        # selectinload above only covers the first hop.
        stmt2 = (
            select(DocumentCodeLink)
            .where(DocumentCodeLink.id == code_link.id)
            .options(_selectinload(DocumentCodeLink.repository))
        )
        result2 = await self.db.execute(stmt2)
        code_link = result2.scalar_one_or_none() or code_link

        gen_service = DocumentGenerationService(self.db, workspace_id=workspace_id)
        github_service = await self._build_github_reader(document, code_link)
        if github_service is None:
            return {"status": "failed", "document_id": document_id}

        outcome = await self._generate_and_propose(
            document=document,
            code_link=code_link,
            category=_category_for_link(code_link),
            gen_service=gen_service,
            github_service=github_service,
            source="code_change_sync",
        )
        if outcome is None:
            return {"status": "failed", "document_id": document_id}
        # Clear the dirty flag — the proposal IS the new dirty state.
        code_link.has_pending_changes = False
        code_link.last_synced_at = datetime.now(timezone.utc)
        # The prose now reflects the newest commit we have seen touch this path.
        if code_link.last_commit_sha:
            code_link.last_synced_commit_sha = code_link.last_commit_sha
        return {
            "status": "proposed",
            "document_id": document_id,
            "proposal_id": outcome["proposal_id"],
        }

    async def process_queue(
        self,
        workspace_id: str,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Drain the sync queue for a workspace, regenerating each
        document (into the proposed-edit queue, not direct overwrite).
        Called by the Temporal `process_document_sync_queue` activity.
        """
        queue_entries = await self.get_pending_sync_queue(
            limit=limit, workspace_id=workspace_id
        )
        results = {"processed": 0, "proposed": 0, "skipped": 0, "failed": 0}
        for entry in queue_entries:
            doc = entry.document
            if not doc:
                continue
            await self.mark_sync_processing([entry.id])
            outcome = await self.regenerate_document(
                document_id=str(doc.id), workspace_id=workspace_id
            )
            results["processed"] += 1
            results[outcome.get("status", "skipped")] = (
                results.get(outcome.get("status", "skipped"), 0) + 1
            )
            await self.mark_sync_completed(entry.id, success=outcome["status"] != "failed")
        return results

    def _path_matches_link(
        self,
        link_path: str,
        link_type: str,
        changed_paths: list[str],
    ) -> bool:
        """Check if any changed path matches a code link.

        Args:
            link_path: Path in the code link.
            link_type: Type of link (file or directory).
            changed_paths: List of changed file paths.

        Returns:
            True if there's a match.
        """
        for changed_path in changed_paths:
            if link_type == "file":
                # Exact match for file links
                if changed_path == link_path:
                    return True
            else:
                # Directory links match any file under that path
                if changed_path.startswith(link_path + "/") or changed_path == link_path:
                    return True

        return False

    async def get_sync_status(
        self, workspace_id: str
    ) -> dict[str, Any]:
        """Get sync status for all documents in a workspace.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Sync status summary.
        """
        # Count documents by sync status
        stmt = (
            select(
                Document.generation_status,
                func.count(Document.id).label("count"),
            )
            .where(Document.workspace_id == workspace_id)
            .group_by(Document.generation_status)
        )
        result = await self.db.execute(stmt)
        status_counts = {row[0]: row[1] for row in result.all()}

        # Count pending items in sync queue
        stmt = select(func.count(DocumentSyncQueue.id)).where(
            DocumentSyncQueue.status == "pending"
        )
        result = await self.db.execute(stmt)
        pending_in_queue = result.scalar() or 0

        # Count documents with pending changes
        stmt = (
            select(func.count(DocumentCodeLink.id))
            .join(Document)
            .where(
                and_(
                    Document.workspace_id == workspace_id,
                    DocumentCodeLink.has_pending_changes == True,
                )
            )
        )
        result = await self.db.execute(stmt)
        pending_changes = result.scalar() or 0

        return {
            "status_counts": status_counts,
            "pending_in_queue": pending_in_queue,
            "documents_with_pending_changes": pending_changes,
        }

    async def trigger_manual_sync(
        self,
        document_id: str,
        developer_id: str,
    ) -> bool:
        """Trigger a manual sync for a document.

        This is available for all plan tiers.

        Args:
            document_id: Document to sync.
            developer_id: Developer triggering the sync.

        Returns:
            True if sync was triggered.
        """
        # Get the document with code links
        stmt = (
            select(Document)
            .options(selectinload(Document.code_links))
            .where(Document.id == document_id)
        )
        result = await self.db.execute(stmt)
        document = result.scalar_one_or_none()

        if not document:
            raise ValueError("Document not found")

        if not document.code_links:
            raise ValueError("No code links found for document")

        # Queue for processing (even manual syncs go through the queue)
        await self.queue_document_for_sync(document_id)

        # Update document status
        document.generation_status = "pending_regeneration"
        await self.db.commit()

        return True
