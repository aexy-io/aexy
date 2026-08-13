"""The monthly contribution report, and the sync fields it stands on.

A report about people's work gets read as a judgement about people, so the
arithmetic has to be defensible: bots and merge commits out, ports counted
once, lines meaning source lines, and everything it could not measure stated
rather than rounded to zero.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from aexy.models.activity import Commit, PullRequest
from aexy.models.developer import Developer
from aexy.models.repository import Repository, WorkspaceRepository
from aexy.models.workspace import Workspace
from aexy.services.engineering_report import (
    EngineeringReportService,
    ReportScope,
    month_window,
)
from aexy.services.engineering_report_markdown import render_markdown
from aexy.services.sync_enrichment import content_hash, counts_as_source, source_churn

JULY = "2026-07"


def _file(name: str, additions: int, deletions: int, patch: str | None = None) -> dict:
    return {
        "filename": name,
        "additions": additions,
        "deletions": deletions,
        "patch": patch or f"@@ -1,2 +1,3 @@\n+{name} added\n-{name} removed",
    }


class TestSourceChurn:
    def test_a_lockfile_is_not_somebodys_writing(self):
        churn = source_churn(
            [_file("src/app.ts", 30, 5), _file("package-lock.json", 12000, 900)]
        )
        assert churn == (30, 5, 1), (
            "one npm install would outweigh a month of work in every total"
        )

    def test_build_output_and_vendored_trees_are_excluded(self):
        assert counts_as_source("src/main.py") is True
        assert counts_as_source("tests/test_main.py") is True
        assert counts_as_source("docs/guide.md") is True
        assert counts_as_source("dist/bundle.js") is False
        assert counts_as_source("vendor/lib/thing.go") is False
        assert counts_as_source("web/static/app.min.js") is False
        assert counts_as_source("yarn.lock") is False
        assert counts_as_source("frontend/pnpm-lock.yaml") is False

    def test_no_file_list_is_unknown_not_zero(self):
        assert source_churn(None) is None
        assert source_churn([]) is None


class TestContentHash:
    def test_the_same_change_on_another_branch_hashes_the_same(self):
        """A cherry-pick gets a new sha; the work is the same work."""
        on_master = [_file("src/app.ts", 2, 1, "@@ -10,3 +10,4 @@\n+added line\n-old line")]
        # Same edit, different position in the file, so different hunk header.
        on_release = [_file("src/app.ts", 2, 1, "@@ -84,3 +84,4 @@\n+added line\n-old line")]

        assert content_hash(on_master) == content_hash(on_release)

    def test_a_different_change_hashes_differently(self):
        first = [_file("src/app.ts", 1, 0, "@@ -1,1 +1,2 @@\n+one")]
        second = [_file("src/app.ts", 1, 0, "@@ -1,1 +1,2 @@\n+two")]
        assert content_hash(first) != content_hash(second)

    def test_file_order_does_not_matter(self):
        a = _file("a.py", 1, 0, "@@ -1 +1,2 @@\n+a")
        b = _file("b.py", 1, 0, "@@ -1 +1,2 @@\n+b")
        assert content_hash([a, b]) == content_hash([b, a])

    def test_nothing_to_hash_is_none(self):
        assert content_hash(None) is None
        assert content_hash([{"filename": "merge.txt"}]) is None


@pytest.fixture
async def workspace(db_session):
    owner = Developer(email="lead@example.com", name="Lead")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(name="Platform", slug="platform", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest.fixture
async def repo(db_session, workspace):
    repository = Repository(
        id=str(uuid4()),
        github_id=5150,
        full_name="acme/codebase-v2",
        name="codebase-v2",
        owner_login="acme",
        owner_type="Organization",
    )
    db_session.add(repository)
    await db_session.flush()
    db_session.add(
        WorkspaceRepository(
            id=str(uuid4()),
            workspace_id=workspace.id,
            repository_id=repository.id,
            is_active=True,
            sync_status="synced",
            last_sync_at=datetime(2026, 8, 2, tzinfo=timezone.utc),
        )
    )
    await db_session.flush()
    return repository


async def _developer(db_session, name: str) -> Developer:
    dev = Developer(email=f"{name.lower()}@example.com", name=name)
    db_session.add(dev)
    await db_session.flush()
    return dev


def _commit(dev, repo_name: str, day: int, **kwargs) -> Commit:
    defaults = dict(
        id=str(uuid4()),
        developer_id=dev.id,
        repository=repo_name,
        sha=uuid4().hex[:40],
        message="feat(api): add the thing",
        additions=100,
        deletions=10,
        files_changed=3,
        source_additions=40,
        source_deletions=4,
        source_files_changed=2,
        author_class="human",
        is_merge=False,
        is_revert=False,
        committed_at=datetime(2026, 7, day, 10, 0, tzinfo=timezone.utc),
    )
    defaults.update(kwargs)
    return Commit(**defaults)


class TestMonthWindow:
    def test_the_month_is_local_not_utc(self):
        start, end, _ = month_window(JULY, "Asia/Kolkata")
        # 1 July 00:00 IST is 30 June 18:30 UTC — a UTC-based window would hand
        # the team's first morning to the previous month.
        assert start == datetime(2026, 6, 30, 18, 30, tzinfo=timezone.utc)
        assert end == datetime(2026, 7, 31, 18, 30, tzinfo=timezone.utc)

    def test_a_nonsense_month_is_rejected(self):
        with pytest.raises(ValueError):
            month_window("2026-13", "UTC")
        with pytest.raises(ValueError):
            month_window("July", "UTC")
        with pytest.raises(ValueError):
            month_window(JULY, "Mars/Olympus")


class TestReport:
    async def test_it_counts_what_a_person_would_count(self, db_session, workspace, repo):
        writer = await _developer(db_session, "Writer")
        db_session.add_all(
            [
                _commit(writer, repo.full_name, 2),
                _commit(writer, repo.full_name, 3),
                _commit(writer, repo.full_name, 3, message="fix(api): second of the day"),
            ]
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.commits == 3
        assert report.contributors == 1
        assert report.active_days == 2
        assert (report.source_additions, report.source_deletions) == (120, 12)
        assert report.members[0].name == "Writer"
        assert report.members[0].repositories == [repo.full_name]

    async def test_bots_and_merges_do_not_count_as_contribution(
        self, db_session, workspace, repo
    ):
        human = await _developer(db_session, "Human")
        bot = await _developer(db_session, "renovate")
        db_session.add_all(
            [
                _commit(human, repo.full_name, 5),
                _commit(bot, repo.full_name, 5, author_class="bot", source_additions=9000),
                _commit(human, repo.full_name, 6, is_merge=True, source_additions=5000),
            ]
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.commits == 1
        assert report.bot_commits_excluded == 1
        assert report.merge_commits_excluded == 1
        assert report.source_additions == 40

    async def test_the_same_change_on_three_branches_counts_once(
        self, db_session, workspace, repo
    ):
        porter = await _developer(db_session, "Porter")
        fingerprint = "deadbeef" * 8
        db_session.add_all(
            [
                _commit(porter, repo.full_name, 10, content_hash=fingerprint, branch="master"),
                _commit(porter, repo.full_name, 11, content_hash=fingerprint, branch="uat-pat"),
                _commit(
                    porter, repo.full_name, 11, content_hash=fingerprint, branch="pat-production"
                ),
            ]
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.commits_before_dedup == 3
        assert report.commits == 1
        assert report.ported_commits == 2
        assert report.members[0].ported_commits == 2
        assert report.source_additions == 40, "the ported copies are not extra work"

    async def test_the_same_edit_in_two_repos_is_two_pieces_of_work(
        self, db_session, workspace, repo
    ):
        """A shared header or an identical bump is not a port between branches."""
        other = Repository(
            id=str(uuid4()),
            github_id=6161,
            full_name="acme/infra",
            name="infra",
            owner_login="acme",
            owner_type="Organization",
        )
        db_session.add(other)
        await db_session.flush()
        db_session.add(
            WorkspaceRepository(
                id=str(uuid4()),
                workspace_id=workspace.id,
                repository_id=other.id,
                is_active=True,
                sync_status="synced",
                last_sync_at=datetime(2026, 8, 2, tzinfo=timezone.utc),
            )
        )
        dev = await _developer(db_session, "Sharer")
        same_edit = "beadfeed" * 8
        db_session.add_all(
            [
                _commit(dev, repo.full_name, 15, content_hash=same_edit),
                _commit(dev, other.full_name, 15, content_hash=same_edit),
            ]
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.commits == 2, (
            "deduplicating across repositories deletes real work from the month"
        )
        assert report.ported_commits == 0

    async def test_a_commit_with_no_fingerprint_is_counted_and_disclosed(
        self, db_session, workspace, repo
    ):
        dev = await _developer(db_session, "Legacy")
        db_session.add_all(
            [
                _commit(dev, repo.full_name, 12, content_hash=None),
                _commit(dev, repo.full_name, 13, content_hash=None),
            ]
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.commits == 2
        assert any("no content fingerprint" in note for note in report.limitations)

    async def test_unmeasured_line_counts_are_disclosed_not_zeroed(
        self, db_session, workspace, repo
    ):
        dev = await _developer(db_session, "Old")
        db_session.add(
            _commit(
                dev,
                repo.full_name,
                14,
                additions=500,
                deletions=20,
                source_additions=None,
                source_deletions=None,
                source_files_changed=None,
            )
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.source_additions == 500, "falling back to raw beats reporting 0"
        assert any("predate source-only" in note for note in report.limitations)

    async def test_integration_load_is_attributed_to_the_merger(
        self, db_session, workspace, repo
    ):
        author = await _developer(db_session, "Author")
        integrator = await _developer(db_session, "Integrator")
        for number in range(4):
            db_session.add(
                PullRequest(
                    id=str(uuid4()),
                    developer_id=author.id,
                    repository=repo.full_name,
                    github_id=9000 + number,
                    number=number + 1,
                    title="feat: something",
                    state="merged",
                    additions=40,
                    deletions=2,
                    files_changed=3,
                    merged_by_developer_id=integrator.id,
                    merged_by_login="integrator",
                    created_at_github=datetime(2026, 7, 5, tzinfo=timezone.utc),
                    merged_at=datetime(2026, 7, 6, tzinfo=timezone.utc),
                )
            )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )
        by_name = {m.name: m for m in report.members}

        assert report.prs_merged == 4
        assert by_name["Author"].prs_authored == 4
        assert by_name["Author"].prs_merged_by_them == 0
        assert by_name["Integrator"].prs_merged_by_them == 4

    async def test_merges_with_no_recorded_merger_are_disclosed(
        self, db_session, workspace, repo
    ):
        author = await _developer(db_session, "Author")
        db_session.add(
            PullRequest(
                id=str(uuid4()),
                developer_id=author.id,
                repository=repo.full_name,
                github_id=7777,
                number=99,
                title="feat: legacy",
                state="merged",
                created_at_github=datetime(2026, 7, 5, tzinfo=timezone.utc),
                merged_at=datetime(2026, 7, 6, tzinfo=timezone.utc),
            )
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert any("no recorded merger" in note for note in report.limitations)

    async def test_work_outside_the_month_is_not_in_it(
        self, db_session, workspace, repo
    ):
        dev = await _developer(db_session, "Steady")
        db_session.add_all(
            [
                _commit(dev, repo.full_name, 1),
                Commit(
                    id=str(uuid4()),
                    developer_id=dev.id,
                    repository=repo.full_name,
                    sha=uuid4().hex[:40],
                    message="feat: june work",
                    author_class="human",
                    committed_at=datetime(2026, 6, 30, 12, tzinfo=timezone.utc),
                ),
            ]
        )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )
        assert report.commits == 1

    async def test_a_repo_outside_the_workspace_is_not_reported(
        self, db_session, workspace, repo
    ):
        dev = await _developer(db_session, "Elsewhere")
        db_session.add(_commit(dev, "someone-else/private-thing", 8))
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )
        assert report.commits == 0

    async def test_low_signal_subjects_are_flagged_but_short_ones_are_not(
        self, db_session, workspace, repo
    ):
        dev = await _developer(db_session, "Terse")
        subjects = ["code changes"] * 6 + ["merge COnflict Resolved"] * 2
        subjects += ["fix(auth): stop the redirect loop"] * 4
        for index, subject in enumerate(subjects):
            db_session.add(
                _commit(dev, repo.full_name, 1 + (index % 20), message=subject)
            )
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert report.members[0].low_signal_subjects == 8
        assert any("Commit-message quality" in obs for obs in report.observations)

    async def test_it_renders_without_a_month_of_data(self, db_session, workspace, repo):
        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )
        markdown = render_markdown(report)

        assert "No commits landed in this period." in markdown
        assert "## Methodology" in markdown

    async def test_the_markdown_carries_the_numbers_and_the_caveats(
        self, db_session, workspace, repo
    ):
        dev = await _developer(db_session, "Renderer")
        db_session.add_all([_commit(dev, repo.full_name, d) for d in (2, 3, 4)])
        await db_session.flush()

        report = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )
        markdown = render_markdown(report)

        assert "# Engineering Contribution Report — July 2026" in markdown
        assert "Renderer" in markdown
        assert "acme/codebase-v2" in markdown
        assert "### Known limitations" in markdown
        assert "leave no git trace" in markdown


class TestDepartmentScope:
    """A head's report is their department's, recomputed — not the workspace's
    with rows hidden, and never a partial total that reads as a whole one."""

    async def _two_teams(self, db_session, repo):
        mine = await _developer(db_session, "Mine")
        theirs = await _developer(db_session, "Theirs")
        db_session.add_all(
            [
                _commit(mine, repo.full_name, 2),
                _commit(mine, repo.full_name, 3),
                _commit(theirs, repo.full_name, 4),
                _commit(theirs, repo.full_name, 5),
                _commit(theirs, repo.full_name, 6),
            ]
        )
        await db_session.flush()
        return mine, theirs

    async def test_the_totals_are_the_departments_not_the_workspaces(
        self, db_session, workspace, repo
    ):
        mine, _theirs = await self._two_teams(db_session, repo)

        scoped = await EngineeringReportService(db_session).build_monthly(
            workspace.id,
            JULY,
            scope=ReportScope(developer_ids={str(mine.id)}, departments=["Platform"]),
        )

        assert scoped.commits == 2, "the other team's three commits are not theirs"
        assert scoped.contributors == 1
        assert [m.name for m in scoped.members] == ["Mine"]
        assert scoped.source_additions == 80
        assert scoped.active_days == 2
        assert scoped.repositories[0].commits == 2, (
            "the repository table is recomputed too, not left workspace-wide"
        )

    async def test_a_scoped_report_says_so_in_its_own_text(
        self, db_session, workspace, repo
    ):
        mine, _theirs = await self._two_teams(db_session, repo)

        scoped = await EngineeringReportService(db_session).build_monthly(
            workspace.id,
            JULY,
            scope=ReportScope(developer_ids={str(mine.id)}, departments=["Platform"]),
        )
        markdown = render_markdown(scoped)

        assert scoped.scope_departments == ["Platform"]
        assert any("Platform" in note for note in scoped.limitations)
        assert "**Scope: Platform.**" in markdown, (
            "a departmental total pasted into a thread must not read as the "
            "whole company's"
        )

    async def test_the_unscoped_report_says_nothing_about_scope(
        self, db_session, workspace, repo
    ):
        await self._two_teams(db_session, repo)

        full = await EngineeringReportService(db_session).build_monthly(
            workspace.id, JULY
        )

        assert full.commits == 5
        assert full.scope_departments == []
        assert "Scope:" not in render_markdown(full)

    async def test_a_head_still_sees_merges_they_made_on_other_peoples_work(
        self, db_session, workspace, repo
    ):
        """Integration load is the point of the column; scoping must not hide it."""
        head = await _developer(db_session, "Head")
        outsider = await _developer(db_session, "Outsider")
        db_session.add(
            PullRequest(
                id=str(uuid4()),
                developer_id=outsider.id,
                repository=repo.full_name,
                github_id=31337,
                number=7,
                title="feat: from another team",
                state="merged",
                merged_by_developer_id=head.id,
                merged_by_login="head",
                created_at_github=datetime(2026, 7, 4, tzinfo=timezone.utc),
                merged_at=datetime(2026, 7, 6, tzinfo=timezone.utc),
            )
        )
        await db_session.flush()

        scoped = await EngineeringReportService(db_session).build_monthly(
            workspace.id,
            JULY,
            scope=ReportScope(developer_ids={str(head.id)}, departments=["Platform"]),
        )
        by_name = {m.name: m for m in scoped.members}

        assert by_name["Head"].prs_merged_by_them == 1
        assert "Outsider" not in by_name, (
            "the other team's author should not gain a row from being merged"
        )

    async def test_an_empty_department_reports_nothing_not_everything(
        self, db_session, workspace, repo
    ):
        await self._two_teams(db_session, repo)

        scoped = await EngineeringReportService(db_session).build_monthly(
            workspace.id,
            JULY,
            scope=ReportScope(developer_ids=set(), departments=["Empty"]),
        )

        assert scoped.commits == 0, "an empty scope is not 'no filter'"
