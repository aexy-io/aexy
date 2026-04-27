"""GitHub Task Sync Service for linking commits/PRs to tasks and updating status.

This service processes GitHub activity (commits and PRs) to:
1. Parse text for task references
2. Link commits/PRs to SprintTasks via TaskGitHubLink
3. Automatically update task status based on PR lifecycle
"""

import logging
import re
from datetime import datetime
from typing import Any

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.activity import Commit, PullRequest
from aexy.models.sprint import SprintTask, TaskGitHubLink, Sprint
from aexy.services.task_reference_parser import (
    TaskReferenceParser,
    TaskReference,
    TaskReferenceSource,
    ReferenceType,
)

logger = logging.getLogger(__name__)


GITHUB_ISSUE_URL_RE = re.compile(
    r"github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/issues/(\d+)",
    re.IGNORECASE,
)


# Task status progression (prevents regression)
STATUS_ORDER = {
    "backlog": 0,
    "todo": 1,
    "in_progress": 2,
    "review": 3,
    "done": 4,
}


class GitHubTaskSyncService:
    """Service for syncing GitHub activity with sprint tasks."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.parser = TaskReferenceParser()

    async def process_commit(
        self,
        commit: Commit,
        repository: str,
    ) -> list[TaskGitHubLink]:
        """Process a commit and link it to any referenced tasks.

        Args:
            commit: The Commit record from the database
            repository: Repository full name (owner/repo)

        Returns:
            List of created TaskGitHubLink records
        """
        if not commit.message:
            return []

        # Parse commit message for task references
        references = self.parser.parse(commit.message)
        if not references:
            return []

        logger.info(
            f"Found {len(references)} task references in commit {commit.sha[:8]}"
        )

        links = []
        for ref in references:
            task = await self._find_task_for_reference(ref, repository)
            if not task:
                continue

            # Create link if it doesn't exist
            link = await self._create_commit_link(task, commit, ref)
            if link:
                links.append(link)

        await self.db.flush()
        return links

    async def process_pull_request(
        self,
        pull_request: PullRequest,
        repository: str,
        action: str | None = None,
    ) -> list[TaskGitHubLink]:
        """Process a PR and link it to any referenced tasks, updating status.

        Args:
            pull_request: The PullRequest record from the database
            repository: Repository full name (owner/repo)
            action: PR action (opened, closed, synchronize, etc.)

        Returns:
            List of created TaskGitHubLink records
        """
        # Parse PR title and description for task references
        text_to_parse = f"{pull_request.title or ''}\n{pull_request.description or ''}"
        references = self.parser.parse(text_to_parse)

        if not references:
            return []

        logger.info(
            f"Found {len(references)} task references in PR #{pull_request.number}"
        )

        links = []
        for ref in references:
            task = await self._find_task_for_reference(ref, repository)
            if not task:
                continue

            # Create link if it doesn't exist
            link = await self._create_pr_link(task, pull_request, ref)
            if link:
                links.append(link)

            # Update task status based on PR state
            await self._update_task_status(task, pull_request, ref, action)

        await self.db.flush()
        return links

    async def _find_task_for_reference(
        self,
        ref: TaskReference,
        repository: str,
    ) -> SprintTask | None:
        """Find a SprintTask matching the task reference.

        Args:
            ref: Parsed task reference
            repository: Repository full name for GitHub issues

        Returns:
            Matching SprintTask or None
        """
        if ref.source == TaskReferenceSource.GITHUB_ISSUE:
            # Look for GitHub issue in active sprints
            return await self._find_github_issue_task(ref.identifier, repository)

        elif ref.source in (TaskReferenceSource.JIRA, TaskReferenceSource.LINEAR):
            # Look for Jira/Linear task by key
            return await self._find_external_task(
                ref.identifier,
                "jira" if ref.source == TaskReferenceSource.JIRA else "linear",
            )

        elif ref.source == TaskReferenceSource.GENERIC:
            # Try to match by source_id in any source type
            return await self._find_generic_task(ref.identifier)

        return None

    async def _find_github_issue_task(
        self,
        issue_number: str,
        repository: str,
    ) -> SprintTask | None:
        """Find a task linked to a GitHub issue."""
        # The source_url typically contains the issue URL
        issue_url_pattern = f"github.com/{repository}/issues/{issue_number}"

        stmt = (
            select(SprintTask)
            .join(Sprint)
            .where(
                and_(
                    SprintTask.source_type == "github_issue",
                    or_(
                        SprintTask.source_id == issue_number,
                        SprintTask.source_url.contains(issue_url_pattern),
                    ),
                    Sprint.status.in_(["planning", "active", "review"]),
                )
            )
            .order_by(Sprint.start_date.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    def issue_url(repository: str, issue_number: int | str) -> str:
        """Build a GitHub issue URL."""
        return f"https://github.com/{repository}/issues/{issue_number}"

    @staticmethod
    def repository_from_issue_url(url: str | None) -> str | None:
        """Extract owner/repo from a GitHub issue URL."""
        if not url:
            return None
        match = GITHUB_ISSUE_URL_RE.search(url)
        return match.group(1) if match else None

    @staticmethod
    def issue_number_from_issue_url(url: str | None) -> int | None:
        """Extract issue number from a GitHub issue URL."""
        if not url:
            return None
        match = GITHUB_ISSUE_URL_RE.search(url)
        return int(match.group(2)) if match else None

    async def get_project_issue_repositories(self, team_id: str) -> list[str]:
        """Return distinct GitHub issue repositories known in a project/team."""
        stmt = select(SprintTask.source_url).where(
            and_(
                SprintTask.team_id == team_id,
                SprintTask.source_type == "github_issue",
                SprintTask.source_url.is_not(None),
            )
        )
        result = await self.db.execute(stmt)
        repositories = {
            repo
            for url in result.scalars().all()
            if (repo := self.repository_from_issue_url(url))
        }
        return sorted(repositories)

    async def infer_repository_for_task(self, task: SprintTask) -> str | None:
        """Infer a repository for bare #123 references when unambiguous."""
        if task.source_type == "github_issue":
            return self.repository_from_issue_url(task.source_url)

        if task.team_id:
            repositories = await self.get_project_issue_repositories(str(task.team_id))
            if len(repositories) == 1:
                return repositories[0]
        return None

    async def find_imported_issue_task(
        self,
        repository: str,
        issue_number: int | str,
        *,
        team_id: str | None = None,
        workspace_id: str | None = None,
    ) -> SprintTask | None:
        """Find an imported GitHub issue task for display metadata."""
        issue_number_str = str(issue_number)
        issue_url_pattern = f"github.com/{repository}/issues/{issue_number_str}"
        stmt = select(SprintTask).where(
            and_(
                SprintTask.source_type == "github_issue",
                or_(
                    SprintTask.source_id == issue_number_str,
                    SprintTask.source_url.contains(issue_url_pattern),
                ),
            )
        )
        if team_id:
            stmt = stmt.where(SprintTask.team_id == team_id)
        if workspace_id:
            stmt = stmt.where(SprintTask.workspace_id == workspace_id)
        stmt = stmt.order_by(SprintTask.updated_at.desc()).limit(1)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def search_imported_issues(
        self,
        *,
        team_id: str,
        query: str | None = None,
        limit: int = 20,
    ) -> list[SprintTask]:
        """Search imported GitHub issue tasks in a project/team."""
        stmt = select(SprintTask).where(
            and_(
                SprintTask.team_id == team_id,
                SprintTask.source_type == "github_issue",
            )
        )
        if query:
            stripped_query = query.strip()
            search = f"%{stripped_query}%"
            conditions = [
                SprintTask.title.ilike(search),
                SprintTask.source_url.ilike(search),
            ]
            if stripped_query.isdigit():
                conditions.append(SprintTask.source_id == stripped_query)
            stmt = stmt.where(or_(*conditions))
        stmt = stmt.order_by(SprintTask.updated_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def link_issue_manually(
        self,
        task_id: str,
        repository: str,
        issue_number: int,
        *,
        title: str | None = None,
        state: str | None = None,
        url: str | None = None,
        reference_text: str | None = None,
        reference_pattern: str | None = None,
        is_auto_linked: bool = False,
    ) -> TaskGitHubLink | None:
        """Link a GitHub issue reference to a task."""
        task = await self.db.get(SprintTask, task_id)
        if not task:
            return None

        normalized_repository = repository.strip()
        if not normalized_repository or "/" not in normalized_repository:
            return None

        issue_task = await self.find_imported_issue_task(
            normalized_repository,
            issue_number,
            team_id=str(task.team_id) if task.team_id else None,
            workspace_id=str(task.workspace_id) if task.workspace_id else None,
        )
        display_title = title or (issue_task.title if issue_task else None)
        display_state = state or (issue_task.status if issue_task else None)
        display_url = url or (issue_task.source_url if issue_task else None) or self.issue_url(normalized_repository, issue_number)

        stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task_id,
                TaskGitHubLink.github_issue_repository == normalized_repository,
                TaskGitHubLink.github_issue_number == issue_number,
            )
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            return None

        link = TaskGitHubLink(
            task_id=task_id,
            link_type="github_issue",
            github_issue_repository=normalized_repository,
            github_issue_number=issue_number,
            github_issue_title=display_title,
            github_issue_state=display_state,
            github_issue_url=display_url,
            reference_text=reference_text,
            reference_pattern=reference_pattern,
            is_auto_linked=is_auto_linked,
        )
        self.db.add(link)
        await self.db.flush()
        return link

    async def auto_link_issue_references(self, task: SprintTask) -> list[TaskGitHubLink]:
        """Auto-link GitHub issues referenced in an Aexy task title/description."""
        text_to_parse = f"{task.title or ''}\n{task.description or ''}"
        references = [
            ref
            for ref in self.parser.parse(text_to_parse)
            if ref.source == TaskReferenceSource.GITHUB_ISSUE
        ]
        if not references:
            return []

        default_repository = await self.infer_repository_for_task(task)
        links: list[TaskGitHubLink] = []
        for ref in references:
            repository = ref.repository or default_repository
            if not repository:
                logger.info(
                    "Skipped bare GitHub issue reference %s for task %s because repository is ambiguous",
                    ref.matched_text,
                    task.id,
                )
                continue
            link = await self.link_issue_manually(
                str(task.id),
                repository,
                int(ref.identifier),
                reference_text=ref.matched_text,
                reference_pattern=ref.reference_type.value,
                is_auto_linked=True,
            )
            if link:
                links.append(link)
        return links

    async def _find_external_task(
        self,
        task_key: str,
        source_type: str,
    ) -> SprintTask | None:
        """Find a task from Jira or Linear by its key."""
        stmt = (
            select(SprintTask)
            .join(Sprint)
            .where(
                and_(
                    SprintTask.source_type == source_type,
                    or_(
                        SprintTask.source_id == task_key,
                        SprintTask.source_id == task_key.upper(),
                    ),
                    Sprint.status.in_(["planning", "active", "review"]),
                )
            )
            .order_by(Sprint.start_date.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _find_generic_task(
        self,
        task_id: str,
    ) -> SprintTask | None:
        """Find a task by generic ID (could be any source)."""
        stmt = (
            select(SprintTask)
            .join(Sprint)
            .where(
                and_(
                    SprintTask.source_id == task_id,
                    Sprint.status.in_(["planning", "active", "review"]),
                )
            )
            .order_by(Sprint.start_date.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _create_commit_link(
        self,
        task: SprintTask,
        commit: Commit,
        ref: TaskReference,
    ) -> TaskGitHubLink | None:
        """Create a link between a task and a commit."""
        # Check if link already exists
        stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task.id,
                TaskGitHubLink.commit_id == commit.id,
            )
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            return None

        link = TaskGitHubLink(
            task_id=task.id,
            link_type="commit",
            commit_id=commit.id,
            reference_text=ref.matched_text,
            reference_pattern=ref.reference_type.value,
            is_auto_linked=True,
        )
        self.db.add(link)
        logger.info(f"Linked commit {commit.sha[:8]} to task {task.title[:30]}")
        return link

    async def _create_pr_link(
        self,
        task: SprintTask,
        pr: PullRequest,
        ref: TaskReference,
    ) -> TaskGitHubLink | None:
        """Create a link between a task and a pull request."""
        # Check if link already exists
        stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task.id,
                TaskGitHubLink.pull_request_id == pr.id,
            )
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            return None

        link = TaskGitHubLink(
            task_id=task.id,
            link_type="pull_request",
            pull_request_id=pr.id,
            reference_text=ref.matched_text,
            reference_pattern=ref.reference_type.value,
            is_auto_linked=True,
        )
        self.db.add(link)
        logger.info(f"Linked PR #{pr.number} to task {task.title[:30]}")
        return link

    async def _update_task_status(
        self,
        task: SprintTask,
        pr: PullRequest,
        ref: TaskReference,
        action: str | None,
    ) -> None:
        """Update task status based on PR state.

        Status progression:
        - PR opened → in_progress (if task is in backlog/todo)
        - PR ready for review → review (if task is in in_progress)
        - PR merged → done (if reference is "fixes/closes/resolves")
        """
        current_order = STATUS_ORDER.get(task.status, 0)
        new_status = None
        now = datetime.now()

        if pr.state == "open":
            # PR is open - task should be in progress
            if current_order < STATUS_ORDER["in_progress"]:
                new_status = "in_progress"
                if not task.started_at:
                    task.started_at = now

            # Check if PR is ready for review (has "review" label or draft=False)
            # For now, we just check if it's not a draft (we'd need more data for full check)
            if action == "ready_for_review" or (
                current_order < STATUS_ORDER["review"]
                and current_order >= STATUS_ORDER["in_progress"]
            ):
                # Only move to review if specifically marked
                if action == "ready_for_review":
                    new_status = "review"

        elif pr.state == "closed" and pr.merged_at:
            # PR was merged
            if self.parser.is_closing_reference(ref):
                # Only auto-complete if it's a closing reference
                if current_order < STATUS_ORDER["done"]:
                    new_status = "done"
                    task.completed_at = pr.merged_at

        if new_status and new_status != task.status:
            old_status = task.status
            task.status = new_status
            task.updated_at = now
            logger.info(
                f"Updated task '{task.title[:30]}' status: {old_status} → {new_status}"
            )

    async def link_commit_manually(
        self,
        task_id: str,
        commit_id: str,
    ) -> TaskGitHubLink | None:
        """Manually link a commit to a task.

        Args:
            task_id: SprintTask ID
            commit_id: Commit ID

        Returns:
            Created TaskGitHubLink or None if already exists
        """
        # Verify task exists
        task = await self.db.get(SprintTask, task_id)
        if not task:
            return None

        # Verify commit exists
        commit = await self.db.get(Commit, commit_id)
        if not commit:
            return None

        # Check if link already exists
        stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task_id,
                TaskGitHubLink.commit_id == commit_id,
            )
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            return None

        link = TaskGitHubLink(
            task_id=task_id,
            link_type="commit",
            commit_id=commit_id,
            is_auto_linked=False,
        )
        self.db.add(link)
        await self.db.flush()
        return link

    async def link_pr_manually(
        self,
        task_id: str,
        pull_request_id: str,
    ) -> TaskGitHubLink | None:
        """Manually link a pull request to a task.

        Args:
            task_id: SprintTask ID
            pull_request_id: PullRequest ID

        Returns:
            Created TaskGitHubLink or None if already exists
        """
        # Verify task exists
        task = await self.db.get(SprintTask, task_id)
        if not task:
            return None

        # Verify PR exists
        pr = await self.db.get(PullRequest, pull_request_id)
        if not pr:
            return None

        # Check if link already exists
        stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task_id,
                TaskGitHubLink.pull_request_id == pull_request_id,
            )
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            return None

        link = TaskGitHubLink(
            task_id=task_id,
            link_type="pull_request",
            pull_request_id=pull_request_id,
            is_auto_linked=False,
        )
        self.db.add(link)
        await self.db.flush()
        return link

    async def remove_link(
        self,
        link_id: str,
    ) -> bool:
        """Remove a task-GitHub activity link.

        Args:
            link_id: TaskGitHubLink ID

        Returns:
            True if removed, False if not found
        """
        link = await self.db.get(TaskGitHubLink, link_id)
        if not link:
            return False

        await self.db.delete(link)
        await self.db.flush()
        return True

    async def get_task_links(
        self,
        task_id: str,
    ) -> list[TaskGitHubLink]:
        """Get all GitHub links for a task.

        Args:
            task_id: SprintTask ID

        Returns:
            List of TaskGitHubLink records
        """
        stmt = (
            select(TaskGitHubLink)
            .where(TaskGitHubLink.task_id == task_id)
            .order_by(TaskGitHubLink.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
