"""Recording what a pull request affects, and only saying so once.

The rules that carry this feature, and each of them is a way it could quietly
become noise:

* a repository nobody documents leaves no trace at all, or every pull request in
  every connected repository writes a row forever for nothing;
* a later push tells the author only what is *new*, or every commit re-sends the
  same three pages until they mute the category;
* "no update needed" suppresses the merge nudge structurally, or it is a mute
  with extra steps;
* a repository adopted by two workspaces shows each of them only its own pages.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentCodeLink
from aexy.models.repository import Repository
from aexy.services.document_impact_service import DocumentImpactService
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio

UI_FILE = "frontend/src/components/tickets/FilterBar.tsx"
OTHER_FILE = "frontend/src/components/tickets/FilterChip.tsx"


def content_with_image() -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Creating a filter"}],
            },
            {"type": "image", "attrs": {"src": "/i/filter-bar.png"}},
        ],
    }


async def seed_repository(db, *, full_name="acme/app") -> Repository:
    repository = Repository(
        id=str(uuid.uuid4()),
        github_id=abs(hash(full_name)) % 10_000_000,
        full_name=full_name,
        name=full_name.split("/")[-1],
        owner_login=full_name.split("/")[0],
        owner_type="Organization",
    )
    db.add(repository)
    await db.flush()
    return repository


async def seed_developer(db, name="Author") -> Developer:
    developer = Developer(id=str(uuid.uuid4()), name=name, email=f"{name}@x.test")
    db.add(developer)
    await db.flush()
    return developer


async def seed_document(
    db, *, workspace_id, repository, path, content=None, sync_mode="propose",
    title="Filtering tickets", created_by_id=None, template_category=None,
) -> Document:
    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title=title,
        content=content if content is not None else {"type": "doc", "content": []},
        created_by_id=created_by_id,
    )
    db.add(document)
    await db.flush()
    db.add(
        DocumentCodeLink(
            id=str(uuid.uuid4()),
            document_id=document.id,
            repository_id=repository.id,
            path=path,
            link_type="directory",
            branch="main",
            sync_mode=sync_mode,
            template_category=template_category,
        )
    )
    await db.flush()
    return document


class TestSilenceIsFree:
    async def test_a_repository_nobody_documents_leaves_no_row(self, db_session):
        """The common case, and it must cost one COUNT. Without this guard every
        pull request in every connected repository writes a row forever, for
        repositories where no document exists that could ever match."""
        repository = await seed_repository(db_session)

        result = await DocumentImpactService(db_session).record_impact(
            repository_id=repository.id,
            pull_request_number=1,
            changed_paths=[UI_FILE],
            head_sha="a" * 40,
            moment="opened",
        )

        assert result is None

    async def test_a_documented_repository_a_pull_request_misses(self, db_session):
        """A row, because we looked — but nothing to notify about. The page needs
        to tell "we checked and there was nothing" apart from "we never looked"."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="backend/src",
        )

        result = await DocumentImpactService(db_session).record_impact(
            repository_id=repository.id,
            pull_request_number=2,
            changed_paths=[UI_FILE],
            head_sha="b" * 40,
            moment="opened",
        )

        assert result is not None
        assert result["affected_count"] == 0
        assert result["notify"] is None
        assert result["notify_document_ids"] == []

    async def test_a_lockfile_only_pull_request_notifies_nobody(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )

        result = await DocumentImpactService(db_session).record_impact(
            repository_id=repository.id,
            pull_request_number=3,
            changed_paths=["frontend/package-lock.json"],
            head_sha="c" * 40,
            moment="opened",
        )

        assert result["notify"] is None
        assert result["affected_count"] == 0

    async def test_a_muted_page_is_not_reported(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src", sync_mode="off",
        )

        result = await DocumentImpactService(db_session).record_impact(
            repository_id=repository.id,
            pull_request_number=4,
            changed_paths=[UI_FILE],
            head_sha="d" * 40,
            moment="opened",
        )

        assert result["affected_count"] == 0


class TestSayingItOnce:
    async def test_the_first_look_notifies(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )

        result = await DocumentImpactService(db_session).record_impact(
            repository_id=repository.id,
            pull_request_number=5,
            changed_paths=[UI_FILE],
            head_sha="e" * 40,
            moment="opened",
        )

        assert result["notify"] == "opened"
        assert result["notify_document_ids"] == [str(document.id)]

    async def test_a_push_that_changes_nothing_relevant_is_silent(self, db_session):
        """The rule that decides whether this feature survives contact with a
        busy branch. Ten pushes must not be ten notifications."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)

        first = await service.record_impact(
            repository_id=repository.id, pull_request_number=6,
            changed_paths=[UI_FILE], head_sha="f" * 40, moment="opened",
        )
        second = await service.record_impact(
            repository_id=repository.id, pull_request_number=6,
            changed_paths=[UI_FILE, OTHER_FILE], head_sha="0" * 40,
            moment="synchronize",
        )

        assert first["notify"] == "opened"
        assert second["notify"] is None

    async def test_a_push_that_adds_a_page_names_only_the_new_one(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        first_doc = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src/components", title="Components",
        )
        second_doc = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="backend/src/aexy/api", title="The API",
        )
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=7,
            changed_paths=[UI_FILE], head_sha="1" * 40, moment="opened",
        )
        grew = await service.record_impact(
            repository_id=repository.id, pull_request_number=7,
            changed_paths=[UI_FILE, "backend/src/aexy/api/things.py"],
            head_sha="2" * 40, moment="synchronize",
        )

        assert grew["notify"] == "opened"
        # Only the addition — "2 more pages are now affected", not all of them
        # again.
        assert grew["notify_document_ids"] == [str(second_doc.id)]
        assert str(first_doc.id) not in grew["notify_document_ids"]
        assert grew["affected_count"] == 2

    async def test_reverting_a_file_and_re_adding_it_cannot_re_notify(
        self, db_session
    ):
        """`notified_document_ids` is a high-water mark and never shrinks. This is
        the case that would otherwise re-notify on every push of a branch that
        keeps touching the same module."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=8,
            changed_paths=[UI_FILE], head_sha="3" * 40, moment="opened",
        )
        # A push that touches nothing documented at all...
        await service.record_impact(
            repository_id=repository.id, pull_request_number=8,
            changed_paths=["README.md"], head_sha="4" * 40, moment="synchronize",
        )
        # ...then one that brings the file back.
        again = await service.record_impact(
            repository_id=repository.id, pull_request_number=8,
            changed_paths=[UI_FILE], head_sha="5" * 40, moment="synchronize",
        )

        assert again["notify"] is None

    async def test_the_merge_notifies_once_and_only_once(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=9,
            changed_paths=[UI_FILE], head_sha="6" * 40, moment="opened",
        )
        merged = await service.record_impact(
            repository_id=repository.id, pull_request_number=9,
            changed_paths=[UI_FILE], head_sha="6" * 40, moment="merged",
        )
        again = await service.record_impact(
            repository_id=repository.id, pull_request_number=9,
            changed_paths=[UI_FILE], head_sha="6" * 40, moment="merged",
        )

        assert merged["notify"] == "merged"
        assert again["notify"] is None

    async def test_a_merge_can_notify_even_when_the_open_moment_did(self, db_session):
        """Two moments, two things. The open nudge is "you can still fix this
        here"; the merge one is "it is now wrong". One does not consume the
        other."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=10,
            changed_paths=[UI_FILE], head_sha="7" * 40, moment="opened",
        )
        merged = await service.record_impact(
            repository_id=repository.id, pull_request_number=10,
            changed_paths=[UI_FILE], head_sha="7" * 40, moment="merged",
        )

        assert merged["notify"] == "merged"
        assert merged["notify_document_ids"] == [str(document.id)]


class TestTheCardDoesNotForget:
    async def test_a_later_push_unions_the_matched_paths(self, db_session):
        """What the author needs is everything this pull request did, not
        everything its most recent commit did."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=11,
            changed_paths=[UI_FILE], head_sha="8" * 40, moment="opened",
        )
        await service.record_impact(
            repository_id=repository.id, pull_request_number=11,
            changed_paths=[OTHER_FILE], head_sha="9" * 40, moment="synchronize",
        )

        impact = await service.get_impact(
            workspace_id=workspace_id,
            repository_id=repository.id,
            pull_request_number=11,
        )
        matched = impact["items"][0]["links"][0]["matched_paths"]
        assert sorted(matched) == sorted([UI_FILE, OTHER_FILE])
        assert str(document.id) == impact["items"][0]["document_id"]

    async def test_a_document_watching_two_paths_is_still_one_card(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src/components",
        )
        db_session.add(
            DocumentCodeLink(
                id=str(uuid.uuid4()),
                document_id=document.id,
                repository_id=repository.id,
                path="frontend/src",
                link_type="directory",
                branch="main",
                sync_mode="propose",
            )
        )
        await db_session.flush()

        result = await DocumentImpactService(db_session).record_impact(
            repository_id=repository.id, pull_request_number=12,
            changed_paths=[UI_FILE], head_sha="a" * 40, moment="opened",
        )

        assert result["affected_count"] == 1
        assert result["notify_document_ids"] == [str(document.id)]


class TestNoUpdateNeeded:
    async def test_dismissing_suppresses_the_merge_nudge(self, db_session):
        """Structurally, not by a second check at the delivery end. If saying no
        did not stop the merge nudge, the only way to stop being asked would be
        to mute the category — and then every other page goes quiet too."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        developer = await seed_developer(db_session)
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=13,
            changed_paths=[UI_FILE], head_sha="b" * 40, moment="opened",
        )
        assert await service.set_dismissed(
            workspace_id=workspace_id,
            repository_id=repository.id,
            pull_request_number=13,
            document_id=str(document.id),
            developer_id=str(developer.id),
            dismissed=True,
            reason="Renamed a prop, prose unaffected",
        )

        merged = await service.record_impact(
            repository_id=repository.id, pull_request_number=13,
            changed_paths=[UI_FILE], head_sha="b" * 40, moment="merged",
        )

        assert merged["notify"] is None
        assert merged["notify_document_ids"] == []

    async def test_it_does_not_clear_the_pages_own_staleness(self, db_session):
        """"No update needed for this change" is not "this page is in sync with
        all of its code". The sidebar dot keeps its own truth, and the microcopy
        says so."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        developer = await seed_developer(db_session)
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=14,
            changed_paths=[UI_FILE], head_sha="c" * 40, moment="opened",
        )

        # Something else already flagged the page behind — a merge, in practice.
        link = await db_session.scalar(
            select(DocumentCodeLink).where(
                DocumentCodeLink.document_id == document.id
            )
        )
        link.has_pending_changes = True
        await db_session.flush()

        await service.set_dismissed(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=14, document_id=str(document.id),
            developer_id=str(developer.id), dismissed=True,
        )
        await db_session.refresh(link)

        assert link.has_pending_changes is True

    async def test_undoing_restores_it(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        developer = await seed_developer(db_session)
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=15,
            changed_paths=[UI_FILE], head_sha="d" * 40, moment="opened",
        )
        await service.set_dismissed(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=15, document_id=str(document.id),
            developer_id=str(developer.id), dismissed=True, reason="No change",
        )
        await service.set_dismissed(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=15, document_id=str(document.id),
            developer_id=str(developer.id), dismissed=False,
        )

        impact = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=15,
        )
        item = impact["items"][0]
        assert item["status"] == "needs_review"
        assert item["dismissed_at"] is None
        assert item["dismiss_reason"] is None

    async def test_dismissing_something_you_were_never_shown_is_not_found(
        self, db_session
    ):
        """You can only dismiss something you were shown, so this is a real
        error for the caller to turn into a 404 — unlike reading an unevaluated
        pull request, which is ordinary."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)

        assert not await DocumentImpactService(db_session).set_dismissed(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=999, document_id=str(uuid.uuid4()),
            developer_id=None, dismissed=True,
        )


class TestReadingItBack:
    async def test_an_unevaluated_pull_request_is_not_an_error(self, db_session):
        """The most ordinary situation in the product. A 404 here would put a red
        toast in front of somebody for whom nothing is wrong."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)

        impact = await DocumentImpactService(db_session).get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=404,
        )

        assert impact["analyzed"] is False
        assert impact["items"] == []
        assert impact["repository_document_count"] == 0

    async def test_the_screenshot_summary_is_computed_not_stored(self, db_session):
        """Deleting the images has to change the answer. Storing the count would
        mean telling somebody about screenshots that are no longer there."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src", content=content_with_image(),
        )
        service = DocumentImpactService(db_session)
        await service.record_impact(
            repository_id=repository.id, pull_request_number=16,
            changed_paths=[UI_FILE], head_sha="e" * 40, moment="opened",
        )

        before = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=16,
        )
        assert before["items"][0]["screenshots"]["count"] == 1
        assert [g["id"] for g in before["items"][0]["guidance"]] == ["screenshots"]

        document.content = {"type": "doc", "content": []}
        await db_session.flush()

        after = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=16,
        )
        assert after["items"][0]["screenshots"]["count"] == 0
        assert after["items"][0]["guidance"] == []

    async def test_another_workspace_sees_none_of_it(self, db_session):
        """A repository can be adopted by two workspaces. One's pages must never
        appear on the other's page."""
        mine = await seed_workspace(db_session)
        theirs = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=mine, repository=repository, path="frontend/src",
        )
        service = DocumentImpactService(db_session)
        await service.record_impact(
            repository_id=repository.id, pull_request_number=17,
            changed_paths=[UI_FILE], head_sha="f" * 40, moment="opened",
        )

        ours = await service.get_impact(
            workspace_id=mine, repository_id=repository.id, pull_request_number=17,
        )
        others = await service.get_impact(
            workspace_id=theirs, repository_id=repository.id, pull_request_number=17,
        )

        assert len(ours["items"]) == 1
        # Analysed — it happened — but with nothing in it for them.
        assert others["analyzed"] is True
        assert others["items"] == []

    async def test_an_author_who_edited_the_page_is_credited_not_nagged(
        self, db_session
    ):
        """Computed from `updated_at`, and labelled "edited since" rather than
        "updated" — autosave bumps that column on any keystroke, so the copy must
        not claim more than it knows."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        document = await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)
        await service.record_impact(
            repository_id=repository.id, pull_request_number=18,
            changed_paths=[UI_FILE], head_sha="0" * 40, moment="opened",
        )

        from datetime import timedelta

        impact_row = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=18,
        )
        assert impact_row["items"][0]["status"] == "needs_review"

        document.updated_at = document.updated_at + timedelta(hours=1)
        await db_session.flush()

        after = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=18,
        )
        assert after["items"][0]["status"] == "edited"

    async def test_the_state_records_the_merge(self, db_session):
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)
        await service.record_impact(
            repository_id=repository.id, pull_request_number=19,
            changed_paths=[UI_FILE], head_sha="1" * 40, moment="opened",
        )
        await service.record_impact(
            repository_id=repository.id, pull_request_number=19,
            changed_paths=[UI_FILE], head_sha="1" * 40, moment="merged",
        )

        impact = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=19,
        )
        assert impact["state"] == "merged"
        assert impact["merged_at"] is not None

    async def test_an_author_with_no_account_is_still_named(self, db_session):
        """An external contributor synced from GitHub has no developer row. The
        login is the only handle, and the page must not print "Unknown"."""
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src",
        )
        service = DocumentImpactService(db_session)
        await service.record_impact(
            repository_id=repository.id, pull_request_number=20,
            changed_paths=[UI_FILE], head_sha="2" * 40, moment="opened",
            author_developer_id=None, author_login="octocat",
            title="Rework the filters",
        )

        impact = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=20,
        )
        assert impact["author_developer_id"] is None
        assert impact["author_login"] == "octocat"
        assert impact["pull_request_title"] == "Rework the filters"


class TestTheCoverageLineIsArithmeticallyPossible:
    async def test_a_later_smaller_push_does_not_shrink_the_total(self, db_session):
        """The page says "{matched} of {total} changed files are described by a
        page here". `matched` counts every item the pull request has accumulated,
        so `total` has to span the same range — otherwise a second push of one
        unrelated file made it read "2 of 1", which is not a sentence anybody can
        believe.
        """
        workspace_id = await seed_workspace(db_session)
        repository = await seed_repository(db_session)
        await seed_document(
            db_session, workspace_id=workspace_id, repository=repository,
            path="frontend/src/components",
        )
        service = DocumentImpactService(db_session)

        await service.record_impact(
            repository_id=repository.id, pull_request_number=21,
            changed_paths=[UI_FILE, OTHER_FILE, "README.md", "src/a.py", "src/b.py"],
            head_sha="1" * 40, moment="opened",
        )
        # One file, matching nothing.
        await service.record_impact(
            repository_id=repository.id, pull_request_number=21,
            changed_paths=["CHANGELOG.md"], head_sha="2" * 40, moment="synchronize",
        )

        impact = await service.get_impact(
            workspace_id=workspace_id, repository_id=repository.id,
            pull_request_number=21,
        )
        assert impact["changed_path_count"] >= len(impact["items"])
        assert impact["changed_path_count"] == 5
