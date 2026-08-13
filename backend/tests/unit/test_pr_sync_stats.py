"""Pull requests arriving from a backfill sync with their numbers intact.

GitHub's *list* endpoint returns none of additions, deletions, changed files,
commits, comments or review comments — only the per-PR detail call does. The
sync read them off the list response, so every backfilled PR stored six zeros,
and the zeros made `size_bucket` "xs", which the AI pass reads as "too small to
bother with" — stamping `ai_analyzed_at` as it skips, so the PR was never
looked at again. It also meant nobody could tell who merged anything.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from aexy.models.activity import PullRequest
from aexy.models.developer import Developer, GitHubConnection
from aexy.models.repository import Repository
from aexy.services.sync_service import SyncService

OWNER, REPO = "acme", "codebase-v2"
FULL_NAME = f"{OWNER}/{REPO}"


def _list_entry(number: int, merged: bool = True) -> dict:
    """What `GET /repos/{o}/{r}/pulls` actually returns — no metrics, no merger."""
    return {
        "id": 41000 + number,
        "number": number,
        "title": "feat(api): the thing",
        "state": "closed",
        "user": {"id": 900, "login": "author"},
        "created_at": "2026-07-05T09:00:00Z",
        "merged_at": "2026-07-06T09:00:00Z" if merged else None,
        "closed_at": "2026-07-06T09:00:00Z",
    }


def _detail(number: int, merger_id: int = 901) -> dict:
    entry = _list_entry(number)
    entry.update(
        {
            "additions": 420,
            "deletions": 37,
            "changed_files": 12,
            "commits": 6,
            "comments": 3,
            "review_comments": 8,
            "merged_by": {"id": merger_id, "login": "integrator"},
        }
    )
    return entry


class FakeGitHub:
    def __init__(self, listed: list[dict], details: dict[int, dict]):
        self._listed = listed
        self._details = details
        self.detail_calls: list[int] = []

    async def get_pull_requests(self, owner, repo, state="all", per_page=100, page=1):
        return self._listed if page == 1 else []

    async def get_pull_request(self, owner, repo, number):
        self.detail_calls.append(number)
        return self._details[number]


@pytest.fixture
async def adopter(db_session):
    developer = Developer(email="adopter@example.com", name="Adopter")
    db_session.add(developer)
    await db_session.flush()
    db_session.add(
        GitHubConnection(
            developer_id=developer.id,
            github_id=7,
            github_username="adopter",
            access_token="gho_x",
        )
    )
    await db_session.flush()
    return developer


@pytest.fixture
async def repository(db_session):
    repo = Repository(
        id=str(uuid4()),
        github_id=31337,
        full_name=FULL_NAME,
        name=REPO,
        owner_login=OWNER,
        owner_type="Organization",
    )
    db_session.add(repo)
    await db_session.flush()
    return repo


def _service(db_session) -> SyncService:
    service = SyncService(db_session)
    # Normally primed by sync_repository before the per-artifact passes run.
    service._dev_cache_by_github_id = {}
    service._dev_cache_by_email = {}
    return service


class TestNewPullRequests:
    async def test_the_metrics_come_from_the_detail_call(
        self, db_session, adopter, repository
    ):
        gh = FakeGitHub([_list_entry(1)], {1: _detail(1)})
        service = _service(db_session)

        await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )

        pr = (
            await db_session.execute(
                PullRequest.__table__.select().where(PullRequest.number == 1)
            )
        ).one()
        assert (pr.additions, pr.deletions, pr.files_changed) == (420, 37, 12)
        assert (pr.commits_count, pr.comments_count, pr.review_comments_count) == (6, 3, 8)
        assert pr.size_bucket == "l", (
            "zeroed metrics bucket every PR as xs, which the AI pass skips for good"
        )

    async def test_the_merger_is_recorded_and_is_not_the_author(
        self, db_session, adopter, repository
    ):
        gh = FakeGitHub([_list_entry(2)], {2: _detail(2)})
        service = _service(db_session)

        await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )

        pr = (
            await db_session.execute(
                PullRequest.__table__.select().where(PullRequest.number == 2)
            )
        ).one()
        assert pr.merged_by_login == "integrator"
        assert pr.merged_by_developer_id is not None
        assert pr.merged_by_developer_id != pr.developer_id

    async def test_a_merge_queue_does_not_become_a_person(
        self, db_session, adopter, repository
    ):
        """A bot merger is recorded by name, not invented as a developer.

        `_resolve_developer_for_pr` creates a ghost for an unknown login, which
        is right for an author and wrong for a merge queue: the contribution
        report would credit Mergify with the team's integration load.
        """
        detail = _detail(6)
        detail["merged_by"] = {"id": 12345, "login": "mergify[bot]"}
        gh = FakeGitHub([_list_entry(6)], {6: detail})
        service = _service(db_session)

        await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )

        pr = (
            await db_session.execute(
                PullRequest.__table__.select().where(PullRequest.number == 6)
            )
        ).one()
        assert pr.merged_by_login == "mergify[bot]", "who merged it is still recorded"
        assert pr.merged_by_developer_id is None
        ghosts = (
            await db_session.execute(
                Developer.__table__.select().where(Developer.name == "mergify[bot]")
            )
        ).all()
        assert ghosts == []

    async def test_a_failed_detail_call_still_stores_the_pull_request(
        self, db_session, adopter, repository
    ):
        class Failing(FakeGitHub):
            async def get_pull_request(self, owner, repo, number):
                from aexy.services.github_service import GitHubAPIError

                raise GitHubAPIError("502")

        gh = Failing([_list_entry(3)], {})
        service = _service(db_session)

        synced = await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )

        assert synced == 1, "losing the PR entirely is worse than losing its metrics"


class TestBackfill:
    async def test_a_zeroed_row_is_refilled_once(self, db_session, adopter, repository):
        db_session.add(
            PullRequest(
                id=str(uuid4()),
                developer_id=adopter.id,
                repository=FULL_NAME,
                github_id=_list_entry(4)["id"],
                number=4,
                title="feat: legacy",
                state="merged",
                additions=0,
                deletions=0,
                files_changed=0,
                size_bucket="xs",
                # The AI pass stamped this on its way past without analysing.
                ai_analyzed_at=datetime(2026, 7, 7, tzinfo=timezone.utc),
                created_at_github=datetime(2026, 7, 5, tzinfo=timezone.utc),
                merged_at=datetime(2026, 7, 6, tzinfo=timezone.utc),
            )
        )
        await db_session.flush()

        gh = FakeGitHub([_list_entry(4)], {4: _detail(4)})
        service = _service(db_session)
        await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )

        pr = (
            await db_session.execute(
                PullRequest.__table__.select().where(PullRequest.number == 4)
            )
        ).one()
        assert pr.additions == 420
        assert pr.merged_by_login == "integrator"
        assert pr.ai_analyzed_at is None, (
            "the PR was marked analysed without ever being analysed"
        )

        # Second pass: the row no longer looks unfilled, so no further requests.
        gh.detail_calls.clear()
        await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )
        assert gh.detail_calls == [], "a refetch per PR per sync would be a rate-limit bill"

    async def test_a_genuinely_analysed_small_pr_keeps_its_stamp(
        self, db_session, adopter, repository
    ):
        analysed_at = datetime(2026, 7, 7, tzinfo=timezone.utc)
        db_session.add(
            PullRequest(
                id=str(uuid4()),
                developer_id=adopter.id,
                repository=FULL_NAME,
                github_id=_list_entry(5)["id"],
                number=5,
                title="chore: typo",
                state="merged",
                additions=0,
                deletions=0,
                files_changed=0,
                size_bucket="xs",
                ai_analysis={"summary": "typo fix"},
                ai_analyzed_at=analysed_at,
                created_at_github=datetime(2026, 7, 5, tzinfo=timezone.utc),
                merged_at=datetime(2026, 7, 6, tzinfo=timezone.utc),
            )
        )
        await db_session.flush()

        tiny = _detail(5)
        tiny.update({"additions": 1, "deletions": 1, "changed_files": 1})
        gh = FakeGitHub([_list_entry(5)], {5: tiny})
        service = _service(db_session)
        await service._sync_pull_requests_with_session(
            db_session, gh, OWNER, REPO, adopter.id, repository.id
        )

        pr = (
            await db_session.execute(
                PullRequest.__table__.select().where(PullRequest.number == 5)
            )
        ).one()
        assert pr.ai_analyzed_at is not None
