"""What happens when the GitHub App cannot do what a workspace asked for.

The rule that matters most: **a missing GitHub permission must never suppress the
in-app notification.** It is an org misconfiguration, the pull request author
cannot fix it, and going quiet about their documentation to punish them for
somebody else's settings would be the wrong failure in every direction.

The rest is about telling the truth precisely. "Could not post" is useless;
"the App needs Pull requests: write on acme, here is the link" is actionable —
and it belongs on the settings screen, where the person who can grant it is.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from aexy.models.document_impact import GitHubWriteStatus
from aexy.models.workspace_doc_impact_settings import (
    CheckRunConclusion,
    WorkspaceDocImpactSettings,
)
from aexy.services.document_impact_service import DocumentImpactService
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


class TestTheDefaultsAreOff:
    async def test_an_unconfigured_workspace_writes_nothing_to_github(self, db_session):
        """A deploy must not start commenting on a customer's pull requests. The
        notification is on, because it is not externally visible."""
        workspace_id = await seed_workspace(db_session)

        settings = await DocumentImpactService(db_session).get_settings(workspace_id)

        assert settings["enabled"] is True
        assert settings["pr_comment_enabled"] is False
        assert settings["check_run_enabled"] is False

    async def test_the_check_never_blocks_a_merge_by_default(self, db_session):
        """A check that fails over a possibly-stale screenshot gets made
        non-required within a week — and then it is ignored *and* red."""
        workspace_id = await seed_workspace(db_session)

        settings = await DocumentImpactService(db_session).get_settings(workspace_id)

        assert settings["check_run_conclusion"] == CheckRunConclusion.NEUTRAL

    async def test_no_row_is_written_just_by_reading(self, db_session):
        """An absent row *is* the default. Materialising one per workspace would
        only create something to keep in sync."""
        workspace_id = await seed_workspace(db_session)
        await DocumentImpactService(db_session).get_settings(workspace_id)

        assert (
            await db_session.scalar(
                select(WorkspaceDocImpactSettings).where(
                    WorkspaceDocImpactSettings.workspace_id == workspace_id
                )
            )
            is None
        )


class TestChangingThem:
    async def test_the_row_appears_on_first_write(self, db_session):
        workspace_id = await seed_workspace(db_session)
        service = DocumentImpactService(db_session)

        settings = await service.update_settings(
            workspace_id, {"pr_comment_enabled": True}, developer_id=None
        )

        assert settings["pr_comment_enabled"] is True
        assert settings["check_run_enabled"] is False

    async def test_touching_one_control_leaves_the_others_alone(self, db_session):
        """A PATCH-shaped PUT. Sending the whole object back would let a client
        with a stale read silently re-disable something somebody else turned on."""
        workspace_id = await seed_workspace(db_session)
        service = DocumentImpactService(db_session)

        await service.update_settings(
            workspace_id,
            {"pr_comment_enabled": True, "check_run_enabled": True},
            developer_id=None,
        )
        after = await service.update_settings(
            workspace_id, {"enabled": False}, developer_id=None
        )

        assert after["enabled"] is False
        assert after["pr_comment_enabled"] is True
        assert after["check_run_enabled"] is True

    async def test_it_records_who_changed_it(self, db_session):
        workspace_id = await seed_workspace(db_session)
        developer_id = str(uuid.uuid4())
        from aexy.models.developer import Developer

        db_session.add(Developer(id=developer_id, name="Admin"))
        await db_session.flush()

        await DocumentImpactService(db_session).update_settings(
            workspace_id, {"check_run_enabled": True}, developer_id=developer_id
        )

        row = await db_session.scalar(
            select(WorkspaceDocImpactSettings).where(
                WorkspaceDocImpactSettings.workspace_id == workspace_id
            )
        )
        assert str(row.updated_by_id) == developer_id


class TestTheBlockBanner:
    async def test_a_refusal_is_remembered_where_somebody_can_act_on_it(
        self, db_session
    ):
        """Denormalised onto the settings row so the banner is one read, and
        because "is anything currently broken" is a workspace-level question — not
        one to answer by scanning every pull request."""
        workspace_id = await seed_workspace(db_session)
        service = DocumentImpactService(db_session)

        await service.record_github_write_block(
            workspace_id, 'The Aexy GitHub App needs "Pull requests: write" on acme.'
        )

        settings = await service.get_settings(workspace_id)
        assert "Pull requests: write" in settings["github_write_block_reason"]
        assert settings["github_write_blocked_at"] is not None

    async def test_the_first_success_clears_it(self, db_session):
        """Or the banner outlives the problem, which trains people to ignore
        banners."""
        workspace_id = await seed_workspace(db_session)
        service = DocumentImpactService(db_session)

        await service.record_github_write_block(workspace_id, "nope")
        await service.record_github_write_block(workspace_id, None)

        settings = await service.get_settings(workspace_id)
        assert settings["github_write_block_reason"] is None
        assert settings["github_write_blocked_at"] is None

    async def test_clearing_a_workspace_that_never_had_a_problem_writes_no_row(
        self, db_session
    ):
        """Nothing configured and nothing wrong needs no row — otherwise every
        successful pull request in every workspace creates one."""
        workspace_id = await seed_workspace(db_session)
        service = DocumentImpactService(db_session)

        await service.record_github_write_block(workspace_id, None)

        assert (
            await db_session.scalar(
                select(WorkspaceDocImpactSettings).where(
                    WorkspaceDocImpactSettings.workspace_id == workspace_id
                )
            )
            is None
        )


class TestTheStatusVocabulary:
    def test_a_missing_permission_is_distinguishable_from_a_failure(self):
        """One is an org admin's thirty-second fix and the page can say exactly
        what to do; the other is ours to investigate. Collapsing them would show
        every customer the same unhelpful sentence either way."""
        assert (
            GitHubWriteStatus.PERMISSION_MISSING != GitHubWriteStatus.FAILED
        )

    def test_pending_is_distinguishable_from_skipped(self):
        """"We have not tried" and "the workspace turned this off" are different
        answers to "why is there no comment"."""
        assert GitHubWriteStatus.PENDING != GitHubWriteStatus.SKIPPED


class TestTheNotificationSurvivesAGitHubProblem:
    async def test_writing_to_github_is_not_a_precondition_for_notifying(self):
        """Read from the activity's structure, because this is an ordering
        property rather than a value: `_write_to_github` is called *before* the
        notification and its result is never consulted.

        Stated as a test because the tempting refactor — "return early if the
        GitHub write failed" — is a one-line change that silently stops telling
        anybody about their documentation whenever an org's App permissions are
        wrong.
        """
        import ast
        import inspect
        import textwrap

        from aexy.temporal.activities import document_impact

        source = textwrap.dedent(
            inspect.getsource(document_impact.evaluate_document_impact)
        )
        tree = ast.parse(source)

        returns_after_github = []
        seen_github_call = False
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and "_write_to_github" in ast.dump(node.func):
                seen_github_call = True
            if seen_github_call and isinstance(node, ast.Return):
                returns_after_github.append(node)

        # There are returns after it — the "nothing new to notify" paths — but none
        # of them may be guarded by the github result.
        guards = [
            ast.dump(node.test)
            for node in ast.walk(tree)
            if isinstance(node, ast.If)
        ]
        assert not any("github" in guard for guard in guards), (
            "a branch is testing the GitHub result; a refused App permission must "
            "never suppress the in-app notification"
        )
