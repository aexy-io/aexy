"""Developer profile service."""

from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.developer import Developer, GitHubConnection, GoogleConnection, MicrosoftConnection
from aexy.schemas.developer import DeveloperCreate, DeveloperUpdate


import logging

logger = logging.getLogger(__name__)


class DeveloperServiceError(Exception):
    """Base exception for developer service errors."""

    pass


class DeveloperNotFoundError(DeveloperServiceError):
    """Developer not found error."""

    pass


class DeveloperAlreadyExistsError(DeveloperServiceError):
    """Developer already exists error."""

    pass


class DeveloperService:
    """Service for managing developer profiles."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize developer service."""
        self.db = db

    async def _dispatch_signup_handler(
        self,
        developer: Developer,
        signup_provider: str,
    ) -> None:
        """Dispatch Temporal activity to create CRM contact + start onboarding.

        Never raises — signup must not fail due to post-signup automation.
        """
        from aexy.core.config import get_settings

        settings = get_settings()
        if not settings.platform_org_id:
            return

        try:
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.platform import HandleNewSignupInput

            await dispatch(
                "handle_new_signup",
                HandleNewSignupInput(
                    developer_id=str(developer.id),
                    email=developer.email or "",
                    name=developer.name,
                    avatar_url=developer.avatar_url,
                    signup_provider=signup_provider,
                ),
                task_queue=TaskQueue.OPERATIONS,
                workflow_id=f"signup-{developer.id}",
            )
        except Exception:
            logger.exception("Failed to dispatch signup handler (non-fatal)")

    async def get_by_id(self, developer_id: str) -> Developer:
        """Get developer by ID."""
        stmt = (
            select(Developer)
            .where(Developer.id == developer_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
        )
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise DeveloperNotFoundError(f"Developer with ID {developer_id} not found")

        return developer

    async def get_by_email(self, email: str) -> Developer | None:
        """Get developer by email."""
        stmt = (
            select(Developer)
            .where(Developer.email == email)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_github_id(self, github_id: int) -> Developer | None:
        """Get developer by GitHub ID."""
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_id == github_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_github_username(self, username: str) -> Developer | None:
        """Get developer by GitHub username."""
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_username == username)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_google_id(self, google_id: str) -> Developer | None:
        """Get developer by Google ID."""
        stmt = (
            select(Developer)
            .join(GoogleConnection)
            .where(GoogleConnection.google_id == google_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_microsoft_id(self, microsoft_id: str) -> Developer | None:
        """Get developer by Microsoft (Entra ID) object ID."""
        stmt = (
            select(Developer)
            .join(MicrosoftConnection)
            .where(MicrosoftConnection.microsoft_id == microsoft_id)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, data: DeveloperCreate) -> Developer:
        """Create a new developer."""
        existing = await self.get_by_email(data.email)
        if existing:
            raise DeveloperAlreadyExistsError(f"Developer with email {data.email} already exists")

        developer = Developer(
            email=data.email,
            name=data.name,
        )
        self.db.add(developer)
        await self.db.flush()
        await self.db.refresh(developer)
        return developer

    async def update(self, developer_id: str, data: DeveloperUpdate) -> Developer:
        """Update a developer profile."""
        developer = await self.get_by_id(developer_id)

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                if hasattr(value, "model_dump"):
                    setattr(developer, field, value.model_dump())
                else:
                    setattr(developer, field, value)

        await self.db.flush()
        await self.db.refresh(developer)
        return developer

    async def connect_github(
        self,
        developer_id: str,
        github_id: int,
        github_username: str,
        access_token: str,
        github_name: str | None = None,
        github_avatar_url: str | None = None,
        scopes: list[str] | None = None,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
    ) -> GitHubConnection:
        """Connect a GitHub account to a developer."""
        developer = await self.get_by_id(developer_id)

        # Check if GitHub account is already connected to another developer
        existing = await self.get_by_github_id(github_id)
        if existing and existing.id != developer_id:
            raise DeveloperServiceError(
                f"GitHub account {github_username} is already connected to another developer"
            )

        connection = GitHubConnection(
            developer_id=developer.id,
            github_id=github_id,
            github_username=github_username,
            github_name=github_name,
            github_avatar_url=github_avatar_url,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            scopes=scopes,
        )
        self.db.add(connection)
        await self.db.flush()

        # Update developer avatar if not set
        if not developer.avatar_url and github_avatar_url:
            developer.avatar_url = github_avatar_url
            await self.db.flush()

        await self.db.refresh(connection)
        return connection

    async def list_workspace_ghosts(
        self,
        workspace_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List ghost developers whose activity touches a workspace's repos,
        with per-ghost activity counts and suggested match candidates.

        A "match candidate" is a workspace member whose Developer.name or
        GitHubConnection.github_username case-insensitively matches the
        ghost's name. Suggestions are an ordered list (best match first);
        empty when no fuzzy match exists.

        Output rows look like:
          {
            "ghost_id": "...",
            "name": "<github-login-or-display-name>",
            "commits": 47,
            "prs": 12,
            "reviews": 8,
            "suggestions": [
              { "developer_id": "...", "name": "...", "github_username": "...", "reason": "github_username_match" },
              ...
            ],
          }
        """
        from aexy.models.activity import Commit, PullRequest, CodeReview
        from aexy.models.developer import GitHubConnection
        from aexy.models.repository import Repository, WorkspaceRepository
        from aexy.models.workspace import WorkspaceMember

        # 1) Resolve which repository full_names are in this workspace.
        adopted_repos = (
            await self.db.execute(
                select(Repository.full_name)
                .join(
                    WorkspaceRepository,
                    WorkspaceRepository.repository_id == Repository.id,
                )
                .where(
                    WorkspaceRepository.workspace_id == workspace_id,
                    WorkspaceRepository.is_active == True,  # noqa: E712
                )
            )
        ).scalars().all()
        if not adopted_repos:
            return []
        repo_set = set(adopted_repos)

        # 2) Find all "ghost" developer ids referenced by commits in those
        # repos. A ghost is one with email IS NULL and no GitHubConnection.
        # We deliberately do the no-conn filter via NOT EXISTS so the count
        # query stays cheap even at scale.
        ghost_commit_counts_stmt = (
            select(
                Commit.developer_id,
                Developer.name,
                func.count(Commit.id).label("commits"),
            )
            .join(Developer, Developer.id == Commit.developer_id)
            .where(
                Commit.repository.in_(repo_set),
                Developer.email.is_(None),
                ~select(GitHubConnection.id)
                .where(GitHubConnection.developer_id == Developer.id)
                .exists(),
            )
            .group_by(Commit.developer_id, Developer.name)
            .order_by(func.count(Commit.id).desc())
            .limit(limit)
        )
        ghost_rows = (await self.db.execute(ghost_commit_counts_stmt)).all()
        if not ghost_rows:
            return []

        ghost_ids = [str(g.developer_id) for g in ghost_rows]
        ghost_names = {str(g.developer_id): (g.name or "") for g in ghost_rows}

        # 3) Per-ghost PR + review counts (scoped to the same repos).
        pr_counts_stmt = (
            select(PullRequest.developer_id, func.count(PullRequest.id))
            .where(
                PullRequest.developer_id.in_(ghost_ids),
                PullRequest.repository.in_(repo_set),
            )
            .group_by(PullRequest.developer_id)
        )
        pr_counts = {
            str(dev_id): cnt
            for dev_id, cnt in (await self.db.execute(pr_counts_stmt)).all()
        }
        review_counts_stmt = (
            select(CodeReview.developer_id, func.count(CodeReview.id))
            .where(
                CodeReview.developer_id.in_(ghost_ids),
                CodeReview.repository.in_(repo_set),
            )
            .group_by(CodeReview.developer_id)
        )
        review_counts = {
            str(dev_id): cnt
            for dev_id, cnt in (await self.db.execute(review_counts_stmt)).all()
        }

        # 4) Build a name → developer index for the workspace's members so
        # we can suggest matches. Two index keys per developer: their
        # Developer.name and their GitHubConnection.github_username.
        member_stmt = (
            select(
                Developer.id,
                Developer.name,
                Developer.avatar_url,
                GitHubConnection.github_username,
            )
            .outerjoin(
                GitHubConnection,
                GitHubConnection.developer_id == Developer.id,
            )
            .join(
                WorkspaceMember,
                WorkspaceMember.developer_id == Developer.id,
            )
            .where(WorkspaceMember.workspace_id == workspace_id)
        )
        member_rows = (await self.db.execute(member_stmt)).all()
        by_login: dict[str, dict[str, Any]] = {}
        by_name: dict[str, dict[str, Any]] = {}
        for row in member_rows:
            entry = {
                "developer_id": str(row.id),
                "name": row.name,
                "github_username": row.github_username,
                "avatar_url": row.avatar_url,
            }
            if row.github_username:
                by_login[row.github_username.lower()] = entry
            if row.name:
                by_name[row.name.lower()] = entry

        # 5) Assemble output.
        out: list[dict[str, Any]] = []
        for g in ghost_rows:
            ghost_id_str = str(g.developer_id)
            display_name = ghost_names.get(ghost_id_str, "")
            key = display_name.lower() if display_name else ""

            suggestions: list[dict[str, Any]] = []
            seen: set[str] = set()
            for candidate, reason in (
                (by_login.get(key), "github_username_match"),
                (by_name.get(key), "developer_name_match"),
            ):
                if candidate and candidate["developer_id"] not in seen:
                    suggestions.append({**candidate, "reason": reason})
                    seen.add(candidate["developer_id"])

            out.append(
                {
                    "ghost_id": ghost_id_str,
                    "name": display_name,
                    "commits": int(g.commits),
                    "prs": pr_counts.get(ghost_id_str, 0),
                    "reviews": review_counts.get(ghost_id_str, 0),
                    "suggestions": suggestions,
                }
            )
        return out

    async def merge_ghost_by_id(
        self,
        ghost_developer_id: str,
        target_developer_id: str,
    ) -> dict[str, int]:
        """Admin-driven merge: move all activity rows from a specific ghost
        into a specific target developer, then delete the ghost.

        Same safety check as `merge_ghost_into_developer` (ghost must have
        no GitHubConnection of its own). Used by the workspace-admin UI
        when the auto-merge couldn't find a match (e.g. github_username
        casing drift or username change).
        """
        from sqlalchemy import update

        from aexy.models.activity import CodeReview, Commit, PullRequest
        from aexy.models.developer import GitHubConnection

        if ghost_developer_id == target_developer_id:
            return {"commits": 0, "prs": 0, "reviews": 0, "ghost_deleted": 0}

        ghost = await self.db.get(Developer, ghost_developer_id)
        target = await self.db.get(Developer, target_developer_id)
        if ghost is None or target is None:
            return {"commits": 0, "prs": 0, "reviews": 0, "ghost_deleted": 0}

        # Safety: don't merge two "real" developers — only ghost → real.
        if ghost.email is not None:
            raise ValueError("Source row is not a ghost (has an email)")
        has_conn = (
            await self.db.execute(
                select(GitHubConnection.id)
                .where(GitHubConnection.developer_id == ghost.id)
                .limit(1)
            )
        ).first() is not None
        if has_conn:
            raise ValueError("Source row is not a ghost (has a GitHub connection)")

        commits_updated = (
            await self.db.execute(
                update(Commit)
                .where(Commit.developer_id == ghost.id)
                .values(developer_id=target.id)
            )
        ).rowcount or 0
        prs_updated = (
            await self.db.execute(
                update(PullRequest)
                .where(PullRequest.developer_id == ghost.id)
                .values(developer_id=target.id)
            )
        ).rowcount or 0
        reviews_updated = (
            await self.db.execute(
                update(CodeReview)
                .where(CodeReview.developer_id == ghost.id)
                .values(developer_id=target.id)
            )
        ).rowcount or 0

        await self.db.delete(ghost)
        await self.db.flush()

        return {
            "commits": commits_updated,
            "prs": prs_updated,
            "reviews": reviews_updated,
            "ghost_deleted": 1,
        }

    async def preview_ghost_match(
        self,
        canonical_developer_id: str,
        github_username: str,
    ) -> dict[str, Any]:
        """Read-only preview of what `merge_ghost_into_developer` would do.

        Returns the matching ghost developer's id (if any) plus the count
        of activity rows currently attached to it. Used to show users
        "we found N commits we can claim for you" before they hit the
        merge button.
        """
        from sqlalchemy import or_

        from aexy.models.activity import CodeReview, Commit, PullRequest
        from aexy.models.developer import GitHubConnection

        # Same widened lookup as `merge_ghost_into_developer` — catches
        # both email-NULL ghosts (PR-resolver) and no-reply-email
        # pseudo-ghosts (commit-resolver). Aggregate counts across all
        # of them so the preview reflects the full reclaimable scope.
        lower_username = github_username.lower()
        noreply_legacy = f"{lower_username}@users.noreply.github.com"
        noreply_modern = f"%+{lower_username}@users.noreply.github.com"
        ghost_stmt = (
            select(Developer)
            .where(
                Developer.id != canonical_developer_id,
                or_(
                    and_(
                        func.lower(Developer.name) == lower_username,
                        Developer.email.is_(None),
                    ),
                    func.lower(Developer.email) == noreply_legacy,
                    func.lower(Developer.email).like(noreply_modern),
                ),
            )
        )
        ghosts = (await self.db.execute(ghost_stmt)).scalars().all()
        if not ghosts:
            return {
                "ghost_id": None,
                "commits": 0,
                "prs": 0,
                "reviews": 0,
            }

        # Filter to true ghosts: any row that has its own GitHubConnection is
        # a real account that happens to share a name and must be left alone.
        ghost_ids: list[str] = []
        for g in ghosts:
            has_conn = (
                await self.db.execute(
                    select(GitHubConnection.id)
                    .where(GitHubConnection.developer_id == g.id)
                    .limit(1)
                )
            ).first() is not None
            if not has_conn:
                ghost_ids.append(g.id)

        if not ghost_ids:
            return {
                "ghost_id": None,
                "commits": 0,
                "prs": 0,
                "reviews": 0,
            }

        commit_count = (
            await self.db.execute(
                select(func.count(Commit.id)).where(
                    Commit.developer_id.in_(ghost_ids)
                )
            )
        ).scalar_one()
        pr_count = (
            await self.db.execute(
                select(func.count(PullRequest.id)).where(
                    PullRequest.developer_id.in_(ghost_ids)
                )
            )
        ).scalar_one()
        review_count = (
            await self.db.execute(
                select(func.count(CodeReview.id)).where(
                    CodeReview.developer_id.in_(ghost_ids)
                )
            )
        ).scalar_one()

        # UI only uses `ghost_id` as a "is there something to claim" flag,
        # so returning one representative id is sufficient even when
        # multiple ghosts exist.
        return {
            "ghost_id": str(ghost_ids[0]),
            "commits": commit_count,
            "prs": pr_count,
            "reviews": review_count,
        }

    async def merge_ghost_into_developer(
        self,
        canonical_developer_id: str,
        github_username: str,
    ) -> dict[str, int]:
        """Reassign all activity rows from a matching ghost developer
        into the canonical developer, then delete the ghost.

        A "ghost developer" is one we auto-created during sync to attribute
        commits/PRs/reviews from a contributor we couldn't resolve to a real
        Developer row. They're identified by:
            * email IS NULL          (never logged in)
            * name == github_username  (sync uses login as the name)
            * no github_connection   (otherwise they're a real account)

        Returns counts of rows reassigned. Idempotent — if no ghost exists,
        returns zeros and does nothing.
        """
        from sqlalchemy import update

        from sqlalchemy import or_

        from aexy.models.activity import CodeReview, Commit, PullRequest
        from aexy.models.developer import GitHubConnection

        # Find every orphan attribution row for this login. Two flavors:
        #   1. Email-NULL ghost (created by `_resolve_developer_for_pr`)
        #      — name == github_username, no email
        #   2. Commit-resolver "pseudo-ghost" (created by step 3 of
        #      `_resolve_developer_for_commit`) — has the GitHub no-reply
        #      email set, name is the git-config commit name, no
        #      GitHubConnection. Matched by email pattern only.
        #
        # GitHub no-reply emails come in two formats:
        #     {username}@users.noreply.github.com               (legacy)
        #     {numeric_id}+{username}@users.noreply.github.com  (modern)
        # We match both with ILIKE.
        lower_username = github_username.lower()
        noreply_legacy = f"{lower_username}@users.noreply.github.com"
        noreply_modern = f"%+{lower_username}@users.noreply.github.com"
        ghost_stmt = (
            select(Developer)
            .where(
                Developer.id != canonical_developer_id,
                or_(
                    # email-NULL ghost (PR-resolver path)
                    and_(
                        func.lower(Developer.name) == lower_username,
                        Developer.email.is_(None),
                    ),
                    # no-reply-email pseudo-ghost (commit-resolver path)
                    func.lower(Developer.email) == noreply_legacy,
                    func.lower(Developer.email).like(noreply_modern),
                ),
            )
        )
        ghosts = (await self.db.execute(ghost_stmt)).scalars().all()
        if not ghosts:
            return {"commits": 0, "prs": 0, "reviews": 0, "ghost_deleted": 0}

        # Belt-and-suspenders: refuse to merge any "ghost" that has a
        # GitHubConnection of its own (real account that shares a name).
        # We filter the candidate set rather than skipping the whole
        # operation, so a duplicate ghost alongside a real account still
        # gets cleaned up.
        true_ghosts: list[Developer] = []
        for g in ghosts:
            has_conn = (
                await self.db.execute(
                    select(GitHubConnection.id)
                    .where(GitHubConnection.developer_id == g.id)
                    .limit(1)
                )
            ).first() is not None
            if not has_conn:
                true_ghosts.append(g)

        if not true_ghosts:
            return {"commits": 0, "prs": 0, "reviews": 0, "ghost_deleted": 0}

        ghost_id_list = [g.id for g in true_ghosts]
        commits_updated = (
            await self.db.execute(
                update(Commit)
                .where(Commit.developer_id.in_(ghost_id_list))
                .values(developer_id=canonical_developer_id)
            )
        ).rowcount or 0
        prs_updated = (
            await self.db.execute(
                update(PullRequest)
                .where(PullRequest.developer_id.in_(ghost_id_list))
                .values(developer_id=canonical_developer_id)
            )
        ).rowcount or 0
        reviews_updated = (
            await self.db.execute(
                update(CodeReview)
                .where(CodeReview.developer_id.in_(ghost_id_list))
                .values(developer_id=canonical_developer_id)
            )
        ).rowcount or 0

        # Delete every merged ghost row. Any FK rows we didn't explicitly
        # reassign (workspace_members, etc.) are zero for true ghosts;
        # ON DELETE CASCADE handles edge cases.
        for g in true_ghosts:
            await self.db.delete(g)
        await self.db.flush()

        return {
            "commits": commits_updated,
            "prs": prs_updated,
            "reviews": reviews_updated,
            "ghost_deleted": len(true_ghosts),
        }

    async def get_or_create_by_github(
        self,
        github_id: int,
        github_username: str,
        email: str,
        access_token: str,
        github_name: str | None = None,
        github_avatar_url: str | None = None,
        scopes: list[str] | None = None,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
    ) -> Developer:
        """Get or create developer from GitHub OAuth."""
        # Try to find by GitHub ID first
        developer = await self.get_by_github_id(github_id)
        if developer:
            # Update access token and reset auth status
            if developer.github_connection:
                developer.github_connection.access_token = access_token
                developer.github_connection.auth_status = "active"
                developer.github_connection.auth_error = None
                if refresh_token:
                    developer.github_connection.refresh_token = refresh_token
                if token_expires_at:
                    developer.github_connection.token_expires_at = token_expires_at
                if scopes:
                    developer.github_connection.scopes = scopes
                await self.db.flush()
            # Re-run ghost merge in case past syncs created ghosts under a
            # case-variant of this login (the dedup is one-shot on login).
            await self.merge_ghost_into_developer(developer.id, github_username)
            return developer

        # Try to find by email
        developer = await self.get_by_email(email)
        if developer:
            # Connect GitHub to existing developer
            await self.connect_github(
                developer_id=developer.id,
                github_id=github_id,
                github_username=github_username,
                access_token=access_token,
                github_name=github_name,
                github_avatar_url=github_avatar_url,
                scopes=scopes,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
            )
            await self.db.refresh(developer)
            await self.merge_ghost_into_developer(developer.id, github_username)
            return developer

        # Create new developer
        developer = Developer(
            email=email,
            name=github_name,
            avatar_url=github_avatar_url,
        )
        self.db.add(developer)
        await self.db.flush()

        # Connect GitHub
        await self.connect_github(
            developer_id=developer.id,
            github_id=github_id,
            github_username=github_username,
            access_token=access_token,
            github_name=github_name,
            github_avatar_url=github_avatar_url,
            scopes=scopes,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
        )

        await self.db.refresh(developer, ["github_connection"])
        await self.merge_ghost_into_developer(developer.id, github_username)
        await self._dispatch_signup_handler(developer, "github")
        return developer

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[Developer]:
        """List all developers with pagination."""
        stmt = (
            select(Developer)
            .options(
                selectinload(Developer.github_connection),
                selectinload(Developer.google_connection),
                selectinload(Developer.microsoft_connection),
            )
            .offset(skip)
            .limit(limit)
            .order_by(Developer.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def connect_google(
        self,
        developer_id: str,
        google_id: str,
        google_email: str,
        access_token: str,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
        google_name: str | None = None,
        google_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> GoogleConnection:
        """Connect a Google account to a developer."""
        developer = await self.get_by_id(developer_id)

        # Check if Google account is already connected to another developer
        existing = await self.get_by_google_id(google_id)
        if existing and existing.id != developer_id:
            raise DeveloperServiceError(
                f"Google account {google_email} is already connected to another developer"
            )

        # Check if developer already has a Google connection
        if developer.google_connection:
            # Update tokens only if new scopes include CRM scopes or existing has none
            existing_scopes = set(developer.google_connection.scopes or [])
            new_scopes = set(scopes or [])

            # CRM-specific scopes that we want to preserve
            crm_scopes = {
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/calendar",
            }

            existing_has_crm = bool(existing_scopes & crm_scopes)
            new_has_crm = bool(new_scopes & crm_scopes)

            # Only update tokens if:
            # 1. New login has CRM scopes (broader permission), OR
            # 2. Existing doesn't have CRM scopes (nothing to preserve)
            if new_has_crm or not existing_has_crm:
                developer.google_connection.access_token = access_token
                if refresh_token:
                    developer.google_connection.refresh_token = refresh_token
                if token_expires_at:
                    developer.google_connection.token_expires_at = token_expires_at

            # Always merge scope lists
            if scopes:
                developer.google_connection.scopes = list(existing_scopes | new_scopes)

            await self.db.flush()
            await self.db.refresh(developer.google_connection)
            return developer.google_connection

        connection = GoogleConnection(
            developer_id=developer.id,
            google_id=google_id,
            google_email=google_email,
            google_name=google_name,
            google_avatar_url=google_avatar_url,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            scopes=scopes,
        )
        self.db.add(connection)
        await self.db.flush()

        # Update developer avatar if not set
        if not developer.avatar_url and google_avatar_url:
            developer.avatar_url = google_avatar_url
            await self.db.flush()

        await self.db.refresh(connection)
        return connection

    async def get_or_create_by_google(
        self,
        google_id: str,
        google_email: str,
        access_token: str,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
        google_name: str | None = None,
        google_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> Developer:
        """Get or create developer from Google OAuth."""
        # Try to find by Google ID first
        developer = await self.get_by_google_id(google_id)
        if developer:
            # Update tokens only if new scopes include CRM scopes or existing has none
            if developer.google_connection:
                existing_scopes = set(developer.google_connection.scopes or [])
                new_scopes = set(scopes or [])

                # CRM-specific scopes that we want to preserve
                crm_scopes = {
                    "https://www.googleapis.com/auth/gmail.readonly",
                    "https://www.googleapis.com/auth/calendar",
                }

                existing_has_crm = bool(existing_scopes & crm_scopes)
                new_has_crm = bool(new_scopes & crm_scopes)

                # Only update tokens if:
                # 1. New login has CRM scopes (broader permission), OR
                # 2. Existing doesn't have CRM scopes (nothing to preserve)
                if new_has_crm or not existing_has_crm:
                    developer.google_connection.access_token = access_token
                    if refresh_token:
                        developer.google_connection.refresh_token = refresh_token
                    if token_expires_at:
                        developer.google_connection.token_expires_at = token_expires_at

                # Always merge scope lists
                if scopes:
                    developer.google_connection.scopes = list(existing_scopes | new_scopes)

                await self.db.flush()
            return developer

        # Try to find by email
        developer = await self.get_by_email(google_email)
        if developer:
            # Connect Google to existing developer
            await self.connect_google(
                developer_id=developer.id,
                google_id=google_id,
                google_email=google_email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                google_name=google_name,
                google_avatar_url=google_avatar_url,
                scopes=scopes,
            )
            await self.db.refresh(developer)
            return developer

        # Create new developer
        developer = Developer(
            email=google_email,
            name=google_name,
            avatar_url=google_avatar_url,
        )
        self.db.add(developer)
        await self.db.flush()

        # Connect Google
        await self.connect_google(
            developer_id=developer.id,
            google_id=google_id,
            google_email=google_email,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            google_name=google_name,
            google_avatar_url=google_avatar_url,
            scopes=scopes,
        )

        await self.db.refresh(developer, ["google_connection"])
        await self._dispatch_signup_handler(developer, "google")
        return developer

    # -------------------------- Microsoft OAuth --------------------------

    async def connect_microsoft(
        self,
        developer_id: str,
        microsoft_id: str,
        microsoft_email: str,
        access_token: str,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
        microsoft_name: str | None = None,
        microsoft_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> MicrosoftConnection:
        """Connect a Microsoft account to a developer."""
        developer = await self.get_by_id(developer_id)

        existing = await self.get_by_microsoft_id(microsoft_id)
        if existing and existing.id != developer_id:
            raise DeveloperServiceError(
                f"Microsoft account {microsoft_email} is already connected to another developer"
            )

        # Scopes we want to preserve across logins (mirror Google's pattern)
        crm_scopes = {"Mail.Read", "Calendars.ReadWrite"}

        if developer.microsoft_connection:
            existing_scopes = set(developer.microsoft_connection.scopes or [])
            new_scopes = set(scopes or [])

            existing_has_crm = bool(existing_scopes & crm_scopes)
            new_has_crm = bool(new_scopes & crm_scopes)

            if new_has_crm or not existing_has_crm:
                developer.microsoft_connection.access_token = access_token
                if refresh_token:
                    developer.microsoft_connection.refresh_token = refresh_token
                if token_expires_at:
                    developer.microsoft_connection.token_expires_at = token_expires_at

            if scopes:
                developer.microsoft_connection.scopes = list(existing_scopes | new_scopes)

            # Keep profile fields in sync with what Graph just returned
            developer.microsoft_connection.microsoft_email = microsoft_email
            if microsoft_name is not None:
                developer.microsoft_connection.microsoft_name = microsoft_name
            if microsoft_avatar_url is not None:
                developer.microsoft_connection.microsoft_avatar_url = microsoft_avatar_url

            await self.db.flush()
            await self.db.refresh(developer.microsoft_connection)
            return developer.microsoft_connection

        connection = MicrosoftConnection(
            developer_id=developer.id,
            microsoft_id=microsoft_id,
            microsoft_email=microsoft_email,
            microsoft_name=microsoft_name,
            microsoft_avatar_url=microsoft_avatar_url,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            scopes=scopes,
        )
        self.db.add(connection)
        await self.db.flush()

        if not developer.avatar_url and microsoft_avatar_url:
            developer.avatar_url = microsoft_avatar_url
            await self.db.flush()

        await self.db.refresh(connection)
        return connection

    async def get_or_create_by_microsoft(
        self,
        microsoft_id: str,
        microsoft_email: str,
        access_token: str,
        refresh_token: str | None = None,
        token_expires_at: datetime | None = None,
        microsoft_name: str | None = None,
        microsoft_avatar_url: str | None = None,
        scopes: list[str] | None = None,
    ) -> Developer:
        """Get or create developer from Microsoft OAuth."""
        crm_scopes = {"Mail.Read", "Calendars.ReadWrite"}

        developer = await self.get_by_microsoft_id(microsoft_id)
        if developer:
            if developer.microsoft_connection:
                existing_scopes = set(developer.microsoft_connection.scopes or [])
                new_scopes = set(scopes or [])

                existing_has_crm = bool(existing_scopes & crm_scopes)
                new_has_crm = bool(new_scopes & crm_scopes)

                if new_has_crm or not existing_has_crm:
                    developer.microsoft_connection.access_token = access_token
                    if refresh_token:
                        developer.microsoft_connection.refresh_token = refresh_token
                    if token_expires_at:
                        developer.microsoft_connection.token_expires_at = token_expires_at

                if scopes:
                    developer.microsoft_connection.scopes = list(existing_scopes | new_scopes)

                # Keep profile fields in sync with what Graph just returned
                developer.microsoft_connection.microsoft_email = microsoft_email
                if microsoft_name is not None:
                    developer.microsoft_connection.microsoft_name = microsoft_name
                if microsoft_avatar_url is not None:
                    developer.microsoft_connection.microsoft_avatar_url = microsoft_avatar_url

                await self.db.flush()
            return developer

        # Link Microsoft to an existing developer with matching email
        developer = await self.get_by_email(microsoft_email)
        if developer:
            await self.connect_microsoft(
                developer_id=developer.id,
                microsoft_id=microsoft_id,
                microsoft_email=microsoft_email,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                microsoft_name=microsoft_name,
                microsoft_avatar_url=microsoft_avatar_url,
                scopes=scopes,
            )
            await self.db.refresh(developer, ["microsoft_connection"])
            return developer

        # New developer
        developer = Developer(
            email=microsoft_email,
            name=microsoft_name,
            avatar_url=microsoft_avatar_url,
        )
        self.db.add(developer)
        await self.db.flush()

        await self.connect_microsoft(
            developer_id=developer.id,
            microsoft_id=microsoft_id,
            microsoft_email=microsoft_email,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
            microsoft_name=microsoft_name,
            microsoft_avatar_url=microsoft_avatar_url,
            scopes=scopes,
        )

        await self.db.refresh(developer, ["microsoft_connection"])
        await self._dispatch_signup_handler(developer, "microsoft")
        return developer
