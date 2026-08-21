"""Per-workspace issue keys, allocated rather than counted.

Three generators read a number in one statement and wrote it in another:

    bugs     SELECT count(*) + 1
    stories  SELECT count(*) + 1
    tickets  SELECT max(*) + 1

so two concurrent creates took the same number. `tickets` had a unique
constraint, so it failed as a 500 on a public form; bugs and stories had none, so
the duplicate was silent — two rows both called BUG-004, and every reference to
"BUG-004" ambiguous from then on.

Counting was also wrong on its own terms: delete BUG-003 and the next bug is
BUG-003 again. A counter never reuses.

The listeners do what `SprintTask.task_key` already did — UPDATE...RETURNING on
the workspace row, which serializes concurrent inserts on that row.
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from aexy.models.bug import Bug
from aexy.models.developer import Developer
from aexy.models.story import UserStory
from aexy.models.workspace import Workspace


async def _workspace(db: AsyncSession, name: str = "Acme") -> Workspace:
    owner = Developer(name="Owner", email=f"{name.lower()}@example.com")
    db.add(owner)
    await db.flush()
    workspace = Workspace(name=name, slug=name.lower(), owner_id=owner.id)
    db.add(workspace)
    await db.flush()
    return workspace


class TestKeysAreAssignedOnInsert:
    async def test_a_bug_gets_its_key_without_being_told(
        self, db_session: AsyncSession
    ) -> None:
        # The listener covers every creation path, so no caller has to remember.
        workspace = await _workspace(db_session)
        bug = Bug(workspace_id=workspace.id, title="Export is broken")
        db_session.add(bug)
        await db_session.flush()
        assert bug.key == "BUG-001"

    async def test_a_story_too(self, db_session: AsyncSession) -> None:
        workspace = await _workspace(db_session)
        story = UserStory(
            workspace_id=workspace.id,
            title="Export the ledger",
            as_a="finance manager",
            i_want="export the ledger",
        )
        db_session.add(story)
        await db_session.flush()
        assert story.key == "STORY-001"

    async def test_keys_run_in_sequence(self, db_session: AsyncSession) -> None:
        workspace = await _workspace(db_session)
        for _ in range(3):
            db_session.add(Bug(workspace_id=workspace.id, title="x"))
        await db_session.flush()

        keys = (
            await db_session.execute(select(Bug.key).order_by(Bug.key))
        ).scalars().all()
        assert list(keys) == ["BUG-001", "BUG-002", "BUG-003"]

    async def test_a_batch_gets_distinct_keys(
        self, db_session: AsyncSession
    ) -> None:
        # The intake creates a batch in one flush. Before the listener it counted
        # once and incremented locally, which worked inside the batch and raced
        # with everything outside it.
        workspace = await _workspace(db_session)
        bugs = [Bug(workspace_id=workspace.id, title=f"Issue {i}") for i in range(10)]
        for bug in bugs:
            db_session.add(bug)
        await db_session.flush()
        assert len({bug.key for bug in bugs}) == 10

    async def test_an_explicit_key_is_respected(
        self, db_session: AsyncSession
    ) -> None:
        # An importer bringing keys from another tracker must be able to keep
        # them, so the listener only fills a key that is absent.
        workspace = await _workspace(db_session)
        bug = Bug(workspace_id=workspace.id, title="x", key="JIRA-4021")
        db_session.add(bug)
        await db_session.flush()
        assert bug.key == "JIRA-4021"


class TestTheCounterNeverReuses:
    async def test_a_deleted_key_is_not_reissued(
        self, db_session: AsyncSession
    ) -> None:
        # The bug that had nothing to do with concurrency: `count(*) + 1` after a
        # delete hands out a key that already existed.
        workspace = await _workspace(db_session)
        first = Bug(workspace_id=workspace.id, title="one")
        second = Bug(workspace_id=workspace.id, title="two")
        db_session.add_all([first, second])
        await db_session.flush()
        assert (first.key, second.key) == ("BUG-001", "BUG-002")

        await db_session.delete(second)
        await db_session.flush()

        third = Bug(workspace_id=workspace.id, title="three")
        db_session.add(third)
        await db_session.flush()
        # Not BUG-002, which is what counting rows would have produced.
        assert third.key == "BUG-003"


class TestWorkspacesCountSeparately:
    async def test_each_workspace_starts_at_one(
        self, db_session: AsyncSession
    ) -> None:
        mine = await _workspace(db_session, "Mine")
        theirs = await _workspace(db_session, "Theirs")

        ours = Bug(workspace_id=mine.id, title="x")
        yours = Bug(workspace_id=theirs.id, title="y")
        db_session.add_all([ours, yours])
        await db_session.flush()

        # A key is only meaningful within its workspace, so both are BUG-001.
        assert ours.key == "BUG-001"
        assert yours.key == "BUG-001"

    async def test_one_workspace_does_not_advance_another(
        self, db_session: AsyncSession
    ) -> None:
        mine = await _workspace(db_session, "Mine")
        theirs = await _workspace(db_session, "Theirs")
        for _ in range(5):
            db_session.add(Bug(workspace_id=mine.id, title="x"))
        await db_session.flush()

        theirs_first = Bug(workspace_id=theirs.id, title="y")
        db_session.add(theirs_first)
        await db_session.flush()
        assert theirs_first.key == "BUG-001"


class TestTheCounterIsWhatMoves:
    async def test_the_workspace_counter_advances(
        self, db_session: AsyncSession
    ) -> None:
        # The counter holds the value to assign NEXT, like `next_task_key`.
        workspace = await _workspace(db_session)
        assert workspace.next_bug_key == 1

        db_session.add(Bug(workspace_id=workspace.id, title="x"))
        await db_session.flush()
        await db_session.refresh(workspace)
        assert workspace.next_bug_key == 2

    async def test_bugs_and_stories_use_separate_counters(
        self, db_session: AsyncSession
    ) -> None:
        # Sharing one would make BUG-001 and STORY-002 out of two creates, which
        # reads as a missing story.
        workspace = await _workspace(db_session)
        bug = Bug(workspace_id=workspace.id, title="x")
        story = UserStory(
            workspace_id=workspace.id, title="y", as_a="a", i_want="b"
        )
        db_session.add_all([bug, story])
        await db_session.flush()
        assert bug.key == "BUG-001"
        assert story.key == "STORY-001"


class TestConcurrentCreatesDoNotCollide:
    async def test_two_sessions_racing_get_distinct_keys(
        self, test_engine
    ) -> None:
        """The race itself, run against two real sessions.

        Skipped on SQLite: the whole point is that the UPDATE...RETURNING takes a
        row lock, and SQLite serialises the entire database anyway — so a pass
        there would prove nothing about Postgres, which is where this runs.
        """
        if test_engine.dialect.name != "postgresql":
            pytest.skip("row-level locking is not meaningful on SQLite")

        maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

        async with maker() as setup:
            workspace = await _workspace(setup)
            workspace_id = workspace.id
            await setup.commit()

        async def _create(title: str) -> str:
            async with maker() as session:
                bug = Bug(workspace_id=workspace_id, title=title)
                session.add(bug)
                await session.commit()
                return bug.key

        keys = await asyncio.gather(*(_create(f"race {i}") for i in range(8)))
        assert len(set(keys)) == 8, f"collided: {sorted(keys)}"
