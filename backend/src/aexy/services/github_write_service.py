"""The only place Aexy writes into somebody else's pull request.

A small file on purpose. `GitHubAppService` is 850 lines and read-only in spirit,
and the counter-example is already in the tree: `github_sync_service` performs a
`PUT .../contents/{path}` from a raw `httpx` call buried in a 900-line service
with no permission handling — which is how `contents: write` came to be a
requirement that the setup guide never mentions. Anything that can change a
customer's repository should be auditable in one screen.

Two writes, and they behave oppositely on purpose:

* **A comment is edited in place.** One per pull request, PATCHed on each push.
  The message states current state rather than announcing an event, so a new
  comment per push would be a worse version of the same sentence — and a bot that
  comments on every push is the surest way to get an integration switched off.
* **A check run is created fresh per head sha.** A check run belongs to a commit;
  updating the old one would leave the new commit unannotated.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import GitHubInstallation
from aexy.models.repository import Repository
from aexy.services.github_app_service import GitHubAppService

logger = logging.getLogger(__name__)

# GitHub reports a granted permission as "write" or "admin"; "read" and absence
# both mean no.
_WRITE_LEVELS = frozenset({"write", "admin"})

# The marker that makes our comment recognisable — to us on the next push, and to
# a human wondering what wrote it.
COMMENT_MARKER = "<!-- aexy:doc-impact -->"

CHECK_RUN_NAME = "Documentation impact"


class GitHubWriteError(Exception):
    """A write into a repository failed for a reason worth recording."""


class GitHubPermissionError(GitHubWriteError):
    """The installation does not have the permission this write needs.

    Carries enough to tell somebody how to fix it, because the person who can is
    an org admin looking at a settings screen — not the pull request author.
    """

    def __init__(
        self,
        permission: str,
        *,
        installation_id: int | None = None,
        account_login: str | None = None,
        account_type: str | None = None,
    ):
        self.permission = permission
        self.installation_id = installation_id
        self.account_login = account_login
        self.account_type = account_type
        super().__init__(
            f"The Aexy GitHub App needs \"{_readable(permission)}\" on "
            f"{account_login or 'this account'}."
        )

    @property
    def settings_url(self) -> str | None:
        """Where the permission is actually granted."""
        if not self.installation_id:
            return None
        if (self.account_type or "").lower() == "organization" and self.account_login:
            return (
                f"https://github.com/organizations/{self.account_login}"
                f"/settings/installations/{self.installation_id}"
            )
        return f"https://github.com/settings/installations/{self.installation_id}"


def _readable(permission: str) -> str:
    return {
        "pull_requests": "Pull requests: write",
        "checks": "Checks: write",
        "contents": "Contents: write",
    }.get(permission, f"{permission}: write")


@dataclass(frozen=True)
class WriteTarget:
    """An installation that can reach one repository, and what it may do there."""

    installation_id: int
    token: str
    owner: str
    repo: str
    account_login: str | None = None
    account_type: str | None = None
    permissions: dict[str, Any] = field(default_factory=dict)

    def may(self, permission: str) -> bool:
        return str(self.permissions.get(permission, "")).lower() in _WRITE_LEVELS


class GitHubWriteService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.app_service = GitHubAppService(db)
        self.api_base_url = get_settings().github_api_base_url

    async def resolve_target(
        self, repository: Repository, developer_id: str | None = None
    ) -> WriteTarget | None:
        """Which installation to write through, and what it is allowed to do.

        Wraps `resolve_repository_access` — repository owner first, then the
        developer — and joins the installation row so its cached `permissions`
        travel with the token. That cache is the only permission source; a second
        store with its own TTL could disagree with this one, and then nobody knows
        which is right.
        """
        access = await self.app_service.resolve_repository_access(
            repository, developer_id
        )
        if not access:
            return None

        installation_id, token = access
        owner, _, name = (repository.full_name or "").partition("/")
        if not owner or not name:
            return None

        installation = await self.db.scalar(
            select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
        )

        return WriteTarget(
            installation_id=installation_id,
            token=token,
            owner=owner,
            repo=name,
            account_login=installation.account_login if installation else owner,
            account_type=installation.account_type if installation else None,
            permissions=(installation.permissions or {}) if installation else {},
        )

    async def refresh_installation_permissions(
        self, installation_id: int
    ) -> dict | None:
        """Re-read the installation and overwrite the cached permissions.

        Called when a write is refused despite the cache saying otherwise, because
        the cache is stale by construction: it is written during OAuth sync, and an
        admin granting a permission afterwards produces no OAuth sync. Repairing it
        here means the *next* pull request short-circuits before the API call
        instead of burning another 403, and the settings screen stops lying.

        Authenticated with the App JWT rather than an installation token, so it
        works even when no installation token can be minted.
        """
        try:
            app_jwt = self.app_service._generate_jwt()
        except Exception:
            logger.exception("Could not sign an App JWT to refresh permissions")
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_base_url}/app/installations/{installation_id}",
                    headers={
                        "Authorization": f"Bearer {app_jwt}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
            if response.status_code != 200:
                logger.warning(
                    "Could not refresh installation %s: HTTP %s",
                    installation_id,
                    response.status_code,
                )
                return None
            permissions = response.json().get("permissions") or {}
        except Exception:
            logger.exception("Could not refresh installation %s", installation_id)
            return None

        installation = await self.db.scalar(
            select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id
            )
        )
        if installation:
            installation.permissions = permissions
            await self.db.flush()
        return permissions

    def _require(self, target: WriteTarget, permission: str) -> None:
        if target.may(permission):
            return
        raise GitHubPermissionError(
            permission,
            installation_id=target.installation_id,
            account_login=target.account_login,
            account_type=target.account_type,
        )

    def _headers(self, target: WriteTarget) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {target.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def _refused(self, target: WriteTarget, permission: str) -> None:
        """Treat a 403/404 as authoritative, and repair the cache before raising."""
        await self.refresh_installation_permissions(target.installation_id)
        raise GitHubPermissionError(
            permission,
            installation_id=target.installation_id,
            account_login=target.account_login,
            account_type=target.account_type,
        )

    async def upsert_pr_comment(
        self,
        target: WriteTarget,
        pull_request_number: int,
        body: str,
        comment_id: int | None = None,
    ) -> int:
        """Post the comment, or edit the one already there. Returns its id."""
        self._require(target, "pull_requests")
        base = f"{self.api_base_url}/repos/{target.owner}/{target.repo}"

        async with httpx.AsyncClient() as client:
            if comment_id:
                response = await client.patch(
                    f"{base}/issues/comments/{comment_id}",
                    headers=self._headers(target),
                    json={"body": body},
                )
                if response.status_code == 404:
                    # Somebody deleted it. Post a new one rather than losing the
                    # message — a deleted comment is not a decision to stay quiet.
                    comment_id = None
                elif response.status_code in (401, 403):
                    await self._refused(target, "pull_requests")
                elif response.status_code >= 300:
                    raise GitHubWriteError(
                        f"Could not edit comment: {response.status_code} - "
                        f"{response.text[:200]}"
                    )
                else:
                    return int(response.json()["id"])

            response = await client.post(
                f"{base}/issues/{pull_request_number}/comments",
                headers=self._headers(target),
                json={"body": body},
            )

        if response.status_code in (401, 403):
            await self._refused(target, "pull_requests")
        if response.status_code >= 300:
            raise GitHubWriteError(
                f"Could not comment: {response.status_code} - {response.text[:200]}"
            )
        return int(response.json()["id"])

    async def upsert_check_run(
        self,
        target: WriteTarget,
        head_sha: str,
        *,
        conclusion: str,
        title: str,
        summary: str,
        details_url: str | None = None,
        check_run_id: int | None = None,
        check_run_head_sha: str | None = None,
    ) -> int:
        """Annotate the commit. A new sha gets a new run, never an update."""
        self._require(target, "checks")
        base = f"{self.api_base_url}/repos/{target.owner}/{target.repo}"
        payload: dict[str, Any] = {
            "name": CHECK_RUN_NAME,
            "head_sha": head_sha,
            "status": "completed",
            "conclusion": conclusion,
            "output": {"title": title, "summary": summary},
        }
        if details_url:
            payload["details_url"] = details_url

        same_commit = check_run_id and check_run_head_sha == head_sha

        async with httpx.AsyncClient() as client:
            if same_commit:
                response = await client.patch(
                    f"{base}/check-runs/{check_run_id}",
                    headers=self._headers(target),
                    json={k: v for k, v in payload.items() if k != "head_sha"},
                )
                if response.status_code == 404:
                    same_commit = False
                elif response.status_code in (401, 403):
                    await self._refused(target, "checks")
                elif response.status_code >= 300:
                    raise GitHubWriteError(
                        f"Could not update check run: {response.status_code} - "
                        f"{response.text[:200]}"
                    )
                else:
                    return int(response.json()["id"])

            response = await client.post(
                f"{base}/check-runs", headers=self._headers(target), json=payload
            )

        # 404 here means the App has no `checks` access at all — GitHub hides the
        # endpoint rather than refusing it.
        if response.status_code in (401, 403, 404):
            await self._refused(target, "checks")
        if response.status_code >= 300:
            raise GitHubWriteError(
                f"Could not create check run: {response.status_code} - "
                f"{response.text[:200]}"
            )
        return int(response.json()["id"])
