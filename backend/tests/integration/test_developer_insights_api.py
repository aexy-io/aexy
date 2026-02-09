"""Integration tests for Developer Insights API endpoints.

Tests the full HTTP flow: auth → endpoint → service → DB → response.
Also includes E2E smoke tests for the complete flow.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.models.team import Team, TeamMember

settings = get_settings()


def _utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


def _token(developer_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    payload = {"sub": developer_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _auth(developer_id: str) -> dict:
    return {"Authorization": f"Bearer {_token(developer_id)}"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def setup(db_session: AsyncSession):
    """Create a workspace with 2 developers and some activity data."""
    owner = Developer(
        id=str(uuid4()),
        email=f"owner-{uuid4().hex[:6]}@test.com",
        name="Owner Dev",
    )
    dev2 = Developer(
        id=str(uuid4()),
        email=f"dev2-{uuid4().hex[:6]}@test.com",
        name="Developer Two",
    )
    db_session.add_all([owner, dev2])
    await db_session.flush()

    ws = Workspace(
        id=str(uuid4()),
        name="Insights WS",
        slug=f"insights-ws-{uuid4().hex[:6]}",
        owner_id=owner.id,
    )
    db_session.add(ws)
    await db_session.flush()

    # Add members
    for d in [owner, dev2]:
        db_session.add(WorkspaceMember(
            workspace_id=ws.id,
            developer_id=d.id,
            role="admin",
        ))

    # Commits for owner (weekday commits)
    for i in range(5):
        db_session.add(Commit(
            sha=f"int-{owner.id}-{i}",
            developer_id=owner.id,
            repository="repo-main",
            message=f"feat: commit {i}",
            additions=100 + i * 10,
            deletions=20 + i * 2,
            files_changed=3,
            committed_at=_utc(2024, 1, 8 + i, 10, 0),
        ))

    # Commits for dev2
    for i in range(3):
        db_session.add(Commit(
            sha=f"int-{dev2.id}-{i}",
            developer_id=dev2.id,
            repository="repo-main",
            message=f"fix: commit {i}",
            additions=30,
            deletions=10,
            committed_at=_utc(2024, 1, 8 + i, 14, 0),
        ))

    # PRs for owner
    pr = PullRequest(
        github_id=50000,
        number=1,
        developer_id=owner.id,
        repository="repo-main",
        title="Add feature X",
        state="merged",
        additions=200,
        deletions=50,
        created_at_github=_utc(2024, 1, 8, 10, 0),
        merged_at=_utc(2024, 1, 10, 10, 0),
    )
    db_session.add(pr)

    # Review by dev2 on owner's PR
    db_session.add(CodeReview(
        github_id=60000,
        developer_id=dev2.id,
        pull_request_github_id=50000,
        repository="repo-main",
        state="approved",
        comments_count=3,
        submitted_at=_utc(2024, 1, 9, 10, 0),
    ))

    await db_session.commit()

    return {
        "owner": owner,
        "dev2": dev2,
        "workspace": ws,
    }


# ---------------------------------------------------------------------------
# Cycle 7: API Endpoint Tests
# ---------------------------------------------------------------------------

class TestDeveloperInsightsEndpoint:

    @pytest.mark.asyncio
    async def test_get_developer_insights(self, client, setup):
        owner = setup["owner"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{owner.id}",
            headers=_auth(owner.id),
            params={
                "period_type": "weekly",
                "start_date": "2024-01-01T00:00:00Z",
                "end_date": "2024-01-31T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["developer_id"] == owner.id
        assert data["workspace_id"] == ws.id
        assert data["velocity"]["commits_count"] == 5
        assert data["velocity"]["prs_merged"] == 1
        assert data["velocity"]["lines_added"] > 0
        assert data["efficiency"]["pr_merge_rate"] == 1.0
        assert "quality" in data
        assert "sustainability" in data
        assert "collaboration" in data

    @pytest.mark.asyncio
    async def test_get_developer_insights_with_comparison(self, client, setup):
        owner = setup["owner"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{owner.id}",
            headers=_auth(owner.id),
            params={
                "period_type": "weekly",
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
                "compare_previous": "true",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "previous" in data
        # Previous period should have no data
        if data["previous"]:
            assert data["previous"]["velocity"]["commits_count"] == 0

    @pytest.mark.asyncio
    async def test_get_developer_insights_unauthenticated(self, client, setup):
        ws = setup["workspace"]
        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/some-id",
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_developer_with_zero_activity(self, client, setup):
        """Developer with no commits/PRs should return zero metrics."""
        dev2 = setup["dev2"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{dev2.id}",
            headers=_auth(dev2.id),
            params={
                "start_date": "2024-02-01T00:00:00Z",
                "end_date": "2024-02-28T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["velocity"]["commits_count"] == 0
        assert data["velocity"]["prs_merged"] == 0


class TestDeveloperTrendsEndpoint:

    @pytest.mark.asyncio
    async def test_get_trends_empty(self, client, setup):
        owner = setup["owner"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{owner.id}/trends",
            headers=_auth(owner.id),
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0  # No snapshots saved yet


class TestTeamInsightsEndpoint:

    @pytest.mark.asyncio
    async def test_get_team_insights(self, client, setup):
        owner = setup["owner"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/team",
            headers=_auth(owner.id),
            params={
                "start_date": "2024-01-01T00:00:00Z",
                "end_date": "2024-01-31T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["workspace_id"] == ws.id
        assert data["member_count"] == 2
        assert data["aggregate"]["total_commits"] == 8  # 5 + 3
        assert len(data["distribution"]["member_metrics"]) == 2


class TestTeamCompareEndpoint:

    @pytest.mark.asyncio
    async def test_compare_developers(self, client, setup):
        owner = setup["owner"]
        dev2 = setup["dev2"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/team/compare",
            headers=_auth(owner.id),
            params={
                "developer_ids": f"{owner.id},{dev2.id}",
                "start_date": "2024-01-01T00:00:00Z",
                "end_date": "2024-01-31T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # Owner has more commits
        owner_data = next(d for d in data if d["developer_id"] == owner.id)
        dev2_data = next(d for d in data if d["developer_id"] == dev2.id)
        assert owner_data["velocity"]["commits_count"] > dev2_data["velocity"]["commits_count"]


class TestLeaderboardEndpoint:

    @pytest.mark.asyncio
    async def test_get_leaderboard(self, client, setup):
        owner = setup["owner"]
        ws = setup["workspace"]

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/team/leaderboard",
            headers=_auth(owner.id),
            params={
                "metric": "commits",
                "start_date": "2024-01-01T00:00:00Z",
                "end_date": "2024-01-31T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["metric"] == "commits"
        assert len(data["entries"]) == 2
        # Owner should be rank 1
        assert data["entries"][0]["rank"] == 1
        assert data["entries"][0]["value"] == 5.0


class TestSnapshotGenerateEndpoint:

    @pytest.mark.asyncio
    async def test_generate_snapshots(self, client, setup):
        owner = setup["owner"]
        ws = setup["workspace"]

        response = await client.post(
            f"/api/v1/workspaces/{ws.id}/insights/snapshots/generate",
            headers=_auth(owner.id),
            json={
                "period_type": "weekly",
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["developer_snapshots_created"] == 2
        assert data["team_snapshot_created"] is True

    @pytest.mark.asyncio
    async def test_generate_then_read_trends(self, client, setup):
        """Generate a snapshot then verify it appears in trends."""
        owner = setup["owner"]
        ws = setup["workspace"]

        # Generate
        gen_response = await client.post(
            f"/api/v1/workspaces/{ws.id}/insights/snapshots/generate",
            headers=_auth(owner.id),
            json={
                "period_type": "weekly",
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
            },
        )
        assert gen_response.status_code == 200

        # Read trends
        trends_response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{owner.id}/trends",
            headers=_auth(owner.id),
            params={"period_type": "weekly"},
        )
        assert trends_response.status_code == 200
        data = trends_response.json()
        assert len(data) >= 1
        assert data[0]["velocity_metrics"]["commits_count"] == 5


# ---------------------------------------------------------------------------
# Cycle 8: E2E Smoke Tests
# ---------------------------------------------------------------------------

class TestE2ESmokeTests:

    @pytest.mark.asyncio
    async def test_full_flow(self, client, db_session):
        """E2E: create devs → activity → generate snapshots → query insights → verify."""
        # 1. Create developers
        dev_a = Developer(
            id=str(uuid4()),
            email=f"e2e-a-{uuid4().hex[:6]}@test.com",
            name="E2E Dev A",
        )
        dev_b = Developer(
            id=str(uuid4()),
            email=f"e2e-b-{uuid4().hex[:6]}@test.com",
            name="E2E Dev B",
        )
        db_session.add_all([dev_a, dev_b])
        await db_session.flush()

        ws = Workspace(
            id=str(uuid4()),
            name="E2E WS",
            slug=f"e2e-ws-{uuid4().hex[:6]}",
            owner_id=dev_a.id,
        )
        db_session.add(ws)
        await db_session.flush()

        for d in [dev_a, dev_b]:
            db_session.add(WorkspaceMember(
                workspace_id=ws.id, developer_id=d.id, role="admin",
            ))

        # 2. Create activity data
        for i in range(10):
            db_session.add(Commit(
                sha=f"e2e-a-{uuid4().hex[:8]}-{i}",
                developer_id=dev_a.id,
                repository="e2e-repo",
                message=f"commit {i}",
                additions=50,
                deletions=10,
                committed_at=_utc(2024, 1, 8 + (i % 5), 10 + i, 0),
            ))

        for i in range(3):
            db_session.add(Commit(
                sha=f"e2e-b-{uuid4().hex[:8]}-{i}",
                developer_id=dev_b.id,
                repository="e2e-repo",
                message=f"commit {i}",
                additions=20,
                deletions=5,
                committed_at=_utc(2024, 1, 9 + i, 14, 0),
            ))

        pr = PullRequest(
            github_id=99000,
            number=1,
            developer_id=dev_a.id,
            repository="e2e-repo",
            title="E2E PR",
            state="merged",
            additions=150,
            deletions=30,
            created_at_github=_utc(2024, 1, 8, 10, 0),
            merged_at=_utc(2024, 1, 10, 10, 0),
        )
        db_session.add(pr)

        db_session.add(CodeReview(
            github_id=99100,
            developer_id=dev_b.id,
            pull_request_github_id=99000,
            repository="e2e-repo",
            state="approved",
            comments_count=4,
            submitted_at=_utc(2024, 1, 9, 10, 0),
        ))

        await db_session.commit()

        headers = _auth(dev_a.id)

        # 3. Generate snapshots
        gen = await client.post(
            f"/api/v1/workspaces/{ws.id}/insights/snapshots/generate",
            headers=headers,
            json={
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
                "period_type": "weekly",
            },
        )
        assert gen.status_code == 200
        assert gen.json()["developer_snapshots_created"] == 2

        # 4. Query individual insights
        ind = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{dev_a.id}",
            headers=headers,
            params={
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
            },
        )
        assert ind.status_code == 200
        ind_data = ind.json()
        assert ind_data["velocity"]["commits_count"] == 10
        assert ind_data["velocity"]["prs_merged"] == 1
        assert ind_data["efficiency"]["pr_merge_rate"] == 1.0
        assert ind_data["collaboration"]["review_received_count"] == 1

        # 5. Query team insights
        team = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/team",
            headers=headers,
            params={
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
            },
        )
        assert team.status_code == 200
        team_data = team.json()
        assert team_data["member_count"] == 2
        assert team_data["aggregate"]["total_commits"] == 13

        # 6. Leaderboard
        lb = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/team/leaderboard",
            headers=headers,
            params={
                "metric": "commits",
                "start_date": "2024-01-08T00:00:00Z",
                "end_date": "2024-01-14T00:00:00Z",
            },
        )
        assert lb.status_code == 200
        lb_data = lb.json()
        assert lb_data["entries"][0]["value"] == 10.0  # dev_a
        assert lb_data["entries"][0]["rank"] == 1

        # 7. Verify trends show the generated snapshot
        trends = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/developers/{dev_a.id}/trends",
            headers=headers,
            params={"period_type": "weekly"},
        )
        assert trends.status_code == 200
        assert len(trends.json()) >= 1

    @pytest.mark.asyncio
    async def test_single_person_team(self, client, db_session):
        """Edge case: team with only one member."""
        dev = Developer(
            id=str(uuid4()),
            email=f"solo-{uuid4().hex[:6]}@test.com",
            name="Solo Dev",
        )
        db_session.add(dev)
        await db_session.flush()

        ws = Workspace(
            id=str(uuid4()),
            name="Solo WS",
            slug=f"solo-ws-{uuid4().hex[:6]}",
            owner_id=dev.id,
        )
        db_session.add(ws)
        await db_session.flush()

        db_session.add(WorkspaceMember(
            workspace_id=ws.id, developer_id=dev.id, role="owner",
        ))
        await db_session.commit()

        headers = _auth(dev.id)

        response = await client.get(
            f"/api/v1/workspaces/{ws.id}/insights/team",
            headers=headers,
            params={
                "start_date": "2024-01-01T00:00:00Z",
                "end_date": "2024-01-31T00:00:00Z",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["member_count"] == 1
        assert data["distribution"]["gini_coefficient"] == 0.0
