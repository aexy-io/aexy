"""Unit tests for the Developer Insights Service.

Covers: models, velocity, efficiency, quality, sustainability,
collaboration, team distribution, snapshot persistence, and Gini computation.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.developer import Developer
from aexy.models.developer_insights import (
    DeveloperMetricsSnapshot,
    PeriodType,
    TeamMetricsSnapshot,
)
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.developer_insights_service import (
    DeveloperInsightsService,
    compute_gini,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def workspace(db_session: AsyncSession):
    ws = Workspace(
        id=str(uuid4()),
        name="Test Workspace",
        slug="test-ws",
        owner_id=str(uuid4()),
    )
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest_asyncio.fixture
async def dev(db_session: AsyncSession):
    developer = Developer(
        id=str(uuid4()),
        email=f"dev-{uuid4().hex[:8]}@test.com",
        name="Test Dev",
    )
    db_session.add(developer)
    await db_session.flush()
    return developer


@pytest_asyncio.fixture
async def dev2(db_session: AsyncSession):
    developer = Developer(
        id=str(uuid4()),
        email=f"dev2-{uuid4().hex[:8]}@test.com",
        name="Dev Two",
    )
    db_session.add(developer)
    await db_session.flush()
    return developer


@pytest_asyncio.fixture
async def dev3(db_session: AsyncSession):
    developer = Developer(
        id=str(uuid4()),
        email=f"dev3-{uuid4().hex[:8]}@test.com",
        name="Dev Three",
    )
    db_session.add(developer)
    await db_session.flush()
    return developer


# ---------------------------------------------------------------------------
# Cycle 0: Data Model Foundation
# ---------------------------------------------------------------------------

class TestDataModels:

    def test_period_type_enum_values(self):
        assert PeriodType.daily.value == "daily"
        assert PeriodType.weekly.value == "weekly"
        assert PeriodType.sprint.value == "sprint"
        assert PeriodType.monthly.value == "monthly"

    def test_developer_metrics_snapshot_creation(self):
        snapshot = DeveloperMetricsSnapshot(
            id=str(uuid4()),
            developer_id=str(uuid4()),
            workspace_id=str(uuid4()),
            period_start=_utc(2024, 1, 1),
            period_end=_utc(2024, 1, 7),
            period_type=PeriodType.weekly,
            velocity_metrics={"commits_count": 10},
            efficiency_metrics={"avg_pr_cycle_time_hours": 24.5},
            quality_metrics={"avg_review_depth": 3.2},
            sustainability_metrics={"weekend_commit_ratio": 0.1},
            collaboration_metrics={"unique_collaborators": 5},
            raw_counts={"commits": 10, "prs_merged": 3},
        )
        assert snapshot.period_type == PeriodType.weekly
        assert snapshot.velocity_metrics["commits_count"] == 10
        assert snapshot.raw_counts["prs_merged"] == 3

    def test_team_metrics_snapshot_creation(self):
        snapshot = TeamMetricsSnapshot(
            id=str(uuid4()),
            workspace_id=str(uuid4()),
            team_id=None,
            period_start=_utc(2024, 1, 1),
            period_end=_utc(2024, 1, 7),
            period_type=PeriodType.weekly,
            aggregate_metrics={"total_commits": 50},
            distribution_metrics={"gini_coefficient": 0.3},
            member_count=5,
        )
        assert snapshot.team_id is None
        assert snapshot.member_count == 5
        assert snapshot.aggregate_metrics["total_commits"] == 50


# ---------------------------------------------------------------------------
# Cycle 1: Velocity Metrics
# ---------------------------------------------------------------------------

class TestVelocityMetrics:

    @pytest.mark.asyncio
    async def test_compute_velocity_no_data(self, db_session, dev):
        service = DeveloperInsightsService(db_session)
        result = await service.compute_velocity_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.commits_count == 0
        assert result.prs_merged == 0
        assert result.lines_added == 0
        assert result.commit_frequency == 0

    @pytest.mark.asyncio
    async def test_compute_velocity_with_commits(self, db_session, dev):
        # 5 commits across weekdays in Jan 2024
        for i in range(5):
            c = Commit(
                sha=f"sha-vel-{i}-{dev.id}",
                developer_id=dev.id,
                repository="repo-a",
                message=f"commit {i}",
                additions=100,
                deletions=20,
                files_changed=3,
                committed_at=_utc(2024, 1, 8 + i),  # Mon-Fri
            )
            db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_velocity_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.commits_count == 5
        assert result.lines_added == 500
        assert result.lines_removed == 100
        assert result.net_lines == 400
        assert result.avg_commit_size == 120.0  # (500 + 100) / 5

    @pytest.mark.asyncio
    async def test_compute_velocity_pr_throughput(self, db_session, dev):
        # 2 merged PRs in a 2-week window
        for i in range(2):
            pr = PullRequest(
                github_id=9000 + i,
                number=i + 1,
                developer_id=dev.id,
                repository="repo-a",
                title=f"PR {i}",
                state="merged",
                additions=50,
                deletions=10,
                created_at_github=_utc(2024, 1, 8 + i * 3),
                merged_at=_utc(2024, 1, 10 + i * 3),
            )
            db_session.add(pr)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_velocity_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 14)
        )

        assert result.prs_merged == 2
        assert result.pr_throughput > 0


# ---------------------------------------------------------------------------
# Cycle 2: Efficiency Metrics
# ---------------------------------------------------------------------------

class TestEfficiencyMetrics:

    @pytest.mark.asyncio
    async def test_efficiency_no_prs(self, db_session, dev):
        service = DeveloperInsightsService(db_session)
        result = await service.compute_efficiency_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.avg_pr_cycle_time_hours == 0
        assert result.pr_merge_rate == 0

    @pytest.mark.asyncio
    async def test_efficiency_with_merged_prs(self, db_session, dev, dev2):
        # PR created Mon, merged Wed = 48h cycle time
        pr = PullRequest(
            github_id=8000,
            number=1,
            developer_id=dev.id,
            repository="repo-a",
            title="Feature PR",
            state="merged",
            additions=100,
            deletions=20,
            created_at_github=_utc(2024, 1, 8, 10, 0),  # Mon 10am
            merged_at=_utc(2024, 1, 10, 10, 0),  # Wed 10am
        )
        db_session.add(pr)

        # Review by dev2 after 4 hours
        review = CodeReview(
            github_id=3000,
            developer_id=dev2.id,
            pull_request_github_id=8000,
            repository="repo-a",
            state="approved",
            submitted_at=_utc(2024, 1, 8, 14, 0),  # Mon 2pm
        )
        db_session.add(review)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_efficiency_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.avg_pr_cycle_time_hours == pytest.approx(48.0, abs=0.1)
        assert result.avg_time_to_first_review_hours == pytest.approx(4.0, abs=0.1)
        assert result.pr_merge_rate == 1.0
        assert result.avg_pr_size == 120.0

    @pytest.mark.asyncio
    async def test_efficiency_rework_ratio(self, db_session, dev, dev2):
        pr = PullRequest(
            github_id=8100,
            number=2,
            developer_id=dev.id,
            repository="repo-a",
            title="Rework PR",
            state="merged",
            additions=50,
            deletions=10,
            created_at_github=_utc(2024, 1, 8, 10, 0),
            merged_at=_utc(2024, 1, 12, 10, 0),
        )
        db_session.add(pr)

        # Two changes_requested reviews = rework
        for i in range(2):
            r = CodeReview(
                github_id=3100 + i,
                developer_id=dev2.id,
                pull_request_github_id=8100,
                repository="repo-a",
                state="changes_requested",
                submitted_at=_utc(2024, 1, 9 + i, 10, 0),
            )
            db_session.add(r)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_efficiency_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.rework_ratio == 1.0  # 1 PR, all with rework


# ---------------------------------------------------------------------------
# Cycle 3: Quality + Sustainability Metrics
# ---------------------------------------------------------------------------

class TestQualityMetrics:

    @pytest.mark.asyncio
    async def test_quality_no_reviews(self, db_session, dev):
        service = DeveloperInsightsService(db_session)
        result = await service.compute_quality_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.review_participation_rate == 0
        assert result.avg_review_depth == 0

    @pytest.mark.asyncio
    async def test_quality_review_depth(self, db_session, dev, dev2):
        # dev reviews dev2's PR with 5 comments
        pr = PullRequest(
            github_id=7000,
            number=1,
            developer_id=dev2.id,
            repository="repo-a",
            title="PR for review",
            state="merged",
            additions=80,
            deletions=10,
            created_at_github=_utc(2024, 1, 8, 9, 0),
            merged_at=_utc(2024, 1, 9, 9, 0),
        )
        db_session.add(pr)

        review = CodeReview(
            github_id=4000,
            developer_id=dev.id,
            pull_request_github_id=7000,
            repository="repo-a",
            state="approved",
            comments_count=5,
            submitted_at=_utc(2024, 1, 8, 14, 0),
        )
        db_session.add(review)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_quality_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.avg_review_depth == 5.0
        assert result.review_turnaround_hours == pytest.approx(5.0, abs=0.1)

    @pytest.mark.asyncio
    async def test_self_merge_rate(self, db_session, dev):
        # dev creates and merges PR with no external reviews
        pr = PullRequest(
            github_id=7100,
            number=2,
            developer_id=dev.id,
            repository="repo-a",
            title="Self merged PR",
            state="merged",
            additions=30,
            deletions=5,
            created_at_github=_utc(2024, 1, 8),
            merged_at=_utc(2024, 1, 8, 12, 0),
        )
        db_session.add(pr)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_quality_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.self_merge_rate == 1.0


class TestSustainabilityMetrics:

    @pytest.mark.asyncio
    async def test_sustainability_no_commits(self, db_session, dev):
        service = DeveloperInsightsService(db_session)
        result = await service.compute_sustainability_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.weekend_commit_ratio == 0
        assert result.longest_streak_days == 0

    @pytest.mark.asyncio
    async def test_weekend_and_late_night_ratios(self, db_session, dev):
        # 2 weekday commits + 1 weekend + 1 late night
        commits_data = [
            (_utc(2024, 1, 8, 10, 0), "repo-a"),   # Mon 10am
            (_utc(2024, 1, 9, 14, 0), "repo-a"),   # Tue 2pm
            (_utc(2024, 1, 13, 11, 0), "repo-a"),  # Sat 11am (weekend)
            (_utc(2024, 1, 10, 23, 0), "repo-a"),  # Wed 11pm (late night)
        ]
        for i, (ts, repo) in enumerate(commits_data):
            c = Commit(
                sha=f"sust-{i}-{dev.id}",
                developer_id=dev.id,
                repository=repo,
                message=f"commit {i}",
                additions=10,
                deletions=2,
                committed_at=ts,
            )
            db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_sustainability_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.weekend_commit_ratio == pytest.approx(0.25, abs=0.01)
        assert result.late_night_commit_ratio == pytest.approx(0.25, abs=0.01)

    @pytest.mark.asyncio
    async def test_longest_streak(self, db_session, dev):
        # 3 consecutive days then a gap then 1 more day
        dates = [
            _utc(2024, 1, 8, 10, 0),  # Mon
            _utc(2024, 1, 9, 10, 0),  # Tue
            _utc(2024, 1, 10, 10, 0), # Wed
            _utc(2024, 1, 15, 10, 0), # Mon (gap)
        ]
        for i, dt in enumerate(dates):
            c = Commit(
                sha=f"streak-{i}-{dev.id}",
                developer_id=dev.id,
                repository="repo-a",
                message=f"commit {i}",
                additions=5,
                deletions=1,
                committed_at=dt,
            )
            db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_sustainability_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.longest_streak_days == 3

    @pytest.mark.asyncio
    async def test_focus_score_single_repo(self, db_session, dev):
        for i in range(5):
            c = Commit(
                sha=f"focus-{i}-{dev.id}",
                developer_id=dev.id,
                repository="only-repo",
                message=f"commit {i}",
                additions=10,
                deletions=2,
                committed_at=_utc(2024, 1, 8 + i, 10, 0),
            )
            db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_sustainability_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        # All commits in one repo → focus_score = 1.0 (HHI = 1²)
        assert result.focus_score == pytest.approx(1.0, abs=0.01)


# ---------------------------------------------------------------------------
# Cycle 4: Collaboration + Team Distribution
# ---------------------------------------------------------------------------

class TestCollaborationMetrics:

    @pytest.mark.asyncio
    async def test_collaboration_no_data(self, db_session, dev):
        service = DeveloperInsightsService(db_session)
        result = await service.compute_collaboration_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.unique_collaborators == 0
        assert result.review_given_count == 0
        assert result.review_received_count == 0

    @pytest.mark.asyncio
    async def test_collaboration_reviews_given_and_received(self, db_session, dev, dev2):
        # dev creates PR, dev2 reviews it
        pr = PullRequest(
            github_id=6000,
            number=1,
            developer_id=dev.id,
            repository="repo-a",
            title="Collab PR",
            state="merged",
            additions=50,
            deletions=10,
            created_at_github=_utc(2024, 1, 8),
            merged_at=_utc(2024, 1, 9),
        )
        db_session.add(pr)

        review = CodeReview(
            github_id=5000,
            developer_id=dev2.id,
            pull_request_github_id=6000,
            repository="repo-a",
            state="approved",
            submitted_at=_utc(2024, 1, 8, 15, 0),
        )
        db_session.add(review)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)

        # From dev's perspective: 1 review received, dev2 is a collaborator
        result = await service.compute_collaboration_metrics(
            dev.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.review_received_count == 1
        assert result.unique_collaborators >= 1

        # From dev2's perspective: 1 review given
        result2 = await service.compute_collaboration_metrics(
            dev2.id, _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result2.review_given_count == 1


class TestTeamDistribution:

    @pytest.mark.asyncio
    async def test_distribution_empty(self, db_session):
        service = DeveloperInsightsService(db_session)
        result = await service.compute_team_distribution(
            [], _utc(2024, 1, 1), _utc(2024, 1, 31)
        )
        assert result.gini_coefficient == 0
        assert result.member_metrics == []

    @pytest.mark.asyncio
    async def test_distribution_even_workload(self, db_session, dev, dev2):
        # Both devs with identical commits
        for d in [dev, dev2]:
            for i in range(5):
                c = Commit(
                    sha=f"dist-{d.id}-{i}",
                    developer_id=d.id,
                    repository="repo-a",
                    message=f"commit {i}",
                    additions=10,
                    deletions=2,
                    committed_at=_utc(2024, 1, 8 + i, 10, 0),
                )
                db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_team_distribution(
            [dev.id, dev2.id], _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.gini_coefficient == pytest.approx(0.0, abs=0.01)
        assert result.top_contributor_share == pytest.approx(0.5, abs=0.01)
        assert len(result.member_metrics) == 2
        assert result.bottleneck_developers == []

    @pytest.mark.asyncio
    async def test_distribution_detects_bottleneck(self, db_session, dev, dev2, dev3):
        # dev: 30 commits, dev2: 5, dev3: 5 → dev is bottleneck (>2x avg)
        for i in range(30):
            c = Commit(
                sha=f"bottle-{dev.id}-{i}",
                developer_id=dev.id,
                repository="repo-a",
                message=f"commit {i}",
                additions=10,
                deletions=2,
                committed_at=_utc(2024, 1, 2 + (i % 28), 10, 0),
            )
            db_session.add(c)
        for d in [dev2, dev3]:
            for i in range(5):
                c = Commit(
                    sha=f"bottle-{d.id}-{i}",
                    developer_id=d.id,
                    repository="repo-a",
                    message=f"commit {i}",
                    additions=10,
                    deletions=2,
                    committed_at=_utc(2024, 1, 8 + i, 10, 0),
                )
                db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        result = await service.compute_team_distribution(
            [dev.id, dev2.id, dev3.id], _utc(2024, 1, 1), _utc(2024, 1, 31)
        )

        assert result.gini_coefficient > 0.3
        assert dev.id in result.bottleneck_developers


# ---------------------------------------------------------------------------
# Gini coefficient unit tests
# ---------------------------------------------------------------------------

class TestGiniCoefficient:

    def test_gini_equal(self):
        assert compute_gini([10, 10, 10, 10]) == pytest.approx(0.0, abs=0.001)

    def test_gini_max_inequality(self):
        # One person does everything
        assert compute_gini([0, 0, 0, 100]) == pytest.approx(0.75, abs=0.01)

    def test_gini_empty(self):
        assert compute_gini([]) == 0.0

    def test_gini_all_zero(self):
        assert compute_gini([0, 0, 0]) == 0.0

    def test_gini_moderate(self):
        result = compute_gini([10, 20, 30, 40])
        assert 0.1 < result < 0.4


# ---------------------------------------------------------------------------
# Cycle 5: Snapshot Persistence
# ---------------------------------------------------------------------------

class TestSnapshotPersistence:

    @pytest.mark.asyncio
    async def test_save_developer_snapshot(self, db_session, dev, workspace):
        # Add member to workspace
        member = WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=dev.id,
            role="admin",
        )
        db_session.add(member)

        # Add some data
        c = Commit(
            sha=f"snap-{dev.id}",
            developer_id=dev.id,
            repository="repo-a",
            message="snapshot commit",
            additions=50,
            deletions=10,
            committed_at=_utc(2024, 1, 10, 10, 0),
        )
        db_session.add(c)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        snapshot = await service.save_developer_snapshot(
            dev.id, workspace.id, PeriodType.weekly,
            _utc(2024, 1, 8), _utc(2024, 1, 14),
        )

        assert snapshot.id is not None
        assert snapshot.developer_id == dev.id
        assert snapshot.workspace_id == workspace.id
        assert snapshot.velocity_metrics is not None
        assert snapshot.velocity_metrics["commits_count"] == 1

    @pytest.mark.asyncio
    async def test_save_developer_snapshot_upsert(self, db_session, dev, workspace):
        member = WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=dev.id,
            role="admin",
        )
        db_session.add(member)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)

        # First save
        snap1 = await service.save_developer_snapshot(
            dev.id, workspace.id, PeriodType.weekly,
            _utc(2024, 1, 8), _utc(2024, 1, 14),
        )
        snap1_id = snap1.id
        await db_session.commit()

        # Add a commit and save again (same period = upsert)
        c = Commit(
            sha=f"snap-upsert-{dev.id}",
            developer_id=dev.id,
            repository="repo-a",
            message="new commit",
            additions=100,
            deletions=20,
            committed_at=_utc(2024, 1, 10, 10, 0),
        )
        db_session.add(c)
        await db_session.flush()

        snap2 = await service.save_developer_snapshot(
            dev.id, workspace.id, PeriodType.weekly,
            _utc(2024, 1, 8), _utc(2024, 1, 14),
        )

        # Should update same record, not create new
        assert snap2.id == snap1_id
        assert snap2.velocity_metrics["commits_count"] == 1

    @pytest.mark.asyncio
    async def test_save_team_snapshot(self, db_session, dev, dev2, workspace):
        for d in [dev, dev2]:
            member = WorkspaceMember(
                workspace_id=workspace.id,
                developer_id=d.id,
                role="member",
            )
            db_session.add(member)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)
        snapshot = await service.save_team_snapshot(
            workspace.id, None, PeriodType.weekly,
            _utc(2024, 1, 8), _utc(2024, 1, 14),
            [dev.id, dev2.id],
        )

        assert snapshot.id is not None
        assert snapshot.member_count == 2
        assert snapshot.aggregate_metrics is not None
        assert snapshot.distribution_metrics is not None

    @pytest.mark.asyncio
    async def test_get_developer_snapshots(self, db_session, dev, workspace):
        member = WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=dev.id,
            role="admin",
        )
        db_session.add(member)
        await db_session.flush()

        service = DeveloperInsightsService(db_session)

        # Save 3 snapshots with different periods
        for week in range(3):
            start = _utc(2024, 1, 8 + week * 7)
            end = _utc(2024, 1, 14 + week * 7)
            await service.save_developer_snapshot(
                dev.id, workspace.id, PeriodType.weekly, start, end,
            )
        await db_session.flush()

        snapshots = await service.get_developer_snapshots(
            dev.id, PeriodType.weekly, limit=10
        )

        assert len(snapshots) == 3
        # Ordered by period_start desc
        assert snapshots[0].period_start > snapshots[1].period_start


# ---------------------------------------------------------------------------
# Cycle 6: Schema Validation
# ---------------------------------------------------------------------------

class TestSchemaValidation:

    def test_velocity_metrics_schema(self):
        from aexy.schemas.developer_insights import VelocityMetrics
        m = VelocityMetrics(commits_count=10, prs_merged=3, lines_added=500)
        assert m.commits_count == 10
        assert m.net_lines == 0  # default

    def test_efficiency_metrics_bounds(self):
        from aexy.schemas.developer_insights import EfficiencyMetrics
        m = EfficiencyMetrics(pr_merge_rate=0.8, rework_ratio=0.2)
        assert 0 <= m.pr_merge_rate <= 1
        assert 0 <= m.rework_ratio <= 1

    def test_developer_insights_response(self):
        from aexy.schemas.developer_insights import (
            DeveloperInsightsResponse,
            VelocityMetrics,
            EfficiencyMetrics,
            QualityMetrics,
            SustainabilityMetrics,
            CollaborationMetrics,
        )
        resp = DeveloperInsightsResponse(
            developer_id="dev-1",
            workspace_id="ws-1",
            period_start=_utc(2024, 1, 1),
            period_end=_utc(2024, 1, 7),
            period_type="weekly",
            velocity=VelocityMetrics(),
            efficiency=EfficiencyMetrics(),
            quality=QualityMetrics(),
            sustainability=SustainabilityMetrics(),
            collaboration=CollaborationMetrics(),
        )
        assert resp.developer_id == "dev-1"
        assert resp.previous is None

    def test_team_insights_response(self):
        from aexy.schemas.developer_insights import (
            TeamInsightsResponse,
            TeamAggregate,
            TeamDistribution,
        )
        resp = TeamInsightsResponse(
            workspace_id="ws-1",
            period_start=_utc(2024, 1, 1),
            period_end=_utc(2024, 1, 7),
            period_type="weekly",
            member_count=5,
            aggregate=TeamAggregate(total_commits=50),
            distribution=TeamDistribution(gini_coefficient=0.3),
        )
        assert resp.member_count == 5

    def test_snapshot_generate_request(self):
        from aexy.schemas.developer_insights import SnapshotGenerateRequest
        req = SnapshotGenerateRequest(
            start_date=_utc(2024, 1, 1),
            end_date=_utc(2024, 1, 7),
        )
        assert req.period_type.value == "weekly"

    def test_leaderboard_response(self):
        from aexy.schemas.developer_insights import LeaderboardResponse, LeaderboardEntry
        resp = LeaderboardResponse(
            metric="commits",
            period_type="weekly",
            period_start=_utc(2024, 1, 1),
            period_end=_utc(2024, 1, 7),
            entries=[
                LeaderboardEntry(developer_id="d1", value=50, rank=1),
                LeaderboardEntry(developer_id="d2", value=30, rank=2),
            ],
        )
        assert len(resp.entries) == 2
        assert resp.entries[0].rank == 1
