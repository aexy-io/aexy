"""Audit, analytics, publishing and export.

The properties worth pinning are the ones where a mistake is a disclosure
rather than a bug:

* **the portal reads only published snapshots.** `is_published` and
  `visibility="public"` shipped on every document and were read by nothing.
  Making them real means an unauthenticated endpoint now exists, and the thing
  that keeps it safe is that it queries `published_documents` — an internal page
  cannot leak through a forgotten filter because it is not in that table.

* **publishing is a snapshot.** A published page that follows its source means
  an accidental edit to an internal document is instantly public, made by
  somebody who does not know the page is externally visible.

* **the audit trail outlives its subjects.** `document_id` and `actor_id` are
  deliberately not foreign keys: purging a document must not erase the record
  that it existed and who read it.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.document_audit import DocumentAuditAction, DocumentAuditEvent
from aexy.models.documentation import Document, PublishedDocument
from aexy.services.document_audit_service import Actor, DocumentAuditService
from aexy.services.document_export_service import (
    DocumentExportService,
    tiptap_to_markdown,
)
from aexy.services.document_publishing_service import (
    DocumentPublishingService,
    PublishingError,
)
from tests.conftest import requires_postgres, seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


def _body(*paragraphs: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": p}]}
            for p in paragraphs
        ],
    }


async def _setup(db, *, content=None, title="Refund policy"):
    workspace_id = await seed_workspace(db)
    author = Developer(id=str(uuid.uuid4()), name="Author", email="a@example.test")
    db.add(author)
    await db.flush()
    await seed_member(db, workspace_id, str(author.id))

    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title=title,
        content=content or _body("Refunds are issued within 14 days."),
        content_text="Refunds are issued within 14 days.",
        created_by_id=str(author.id),
    )
    db.add(document)
    await db.flush()
    return workspace_id, author, document


# ──────────────────────────────────────────────────────────────────────
# Audit


class TestAuditTrail:
    async def test_an_event_records_who_from_where(self, db_session):
        workspace_id, author, document = await _setup(db_session)

        await DocumentAuditService(db_session).log(
            workspace_id=workspace_id,
            action=DocumentAuditAction.VIEWED,
            actor=Actor(
                id=str(author.id),
                name="Author",
                email="a@example.test",
                ip="203.0.113.7",
                user_agent="Firefox",
            ),
            document=document,
        )

        event = (
            await db_session.execute(select(DocumentAuditEvent))
        ).scalar_one()
        assert event.action == "viewed"
        assert event.actor_name == "Author"
        assert str(event.ip_address) == "203.0.113.7"
        assert event.user_agent == "Firefox"
        # Denormalised, so the trail still says what it was about after a purge.
        assert event.document_title == "Refund policy"

    async def test_the_trail_survives_the_document(self, db_session):
        """`document_id` is not a foreign key on purpose."""
        workspace_id, author, document = await _setup(db_session)
        document_id = str(document.id)

        await DocumentAuditService(db_session).log(
            workspace_id=workspace_id,
            action=DocumentAuditAction.DELETED,
            actor=Actor(id=str(author.id), name="Author"),
            document=document,
        )
        await db_session.flush()

        await db_session.delete(document)
        await db_session.flush()

        event = (await db_session.execute(select(DocumentAuditEvent))).scalar_one()
        assert event.document_id == document_id
        assert event.document_title == "Refund policy"

    async def test_a_failed_write_does_not_raise(self, db_session):
        """An audit log that can 500 a document read is an availability problem
        wearing a compliance badge, and the first incident teaches everyone to
        switch it off."""
        service = DocumentAuditService(db_session)

        await service.log(
            workspace_id=str(uuid.uuid4()),  # not a real workspace
            action=DocumentAuditAction.VIEWED,
            actor=Actor(id=None),
            document_id=str(uuid.uuid4()),
        )
        # Reaching here at all is the assertion.

    @requires_postgres
    async def test_a_failed_write_leaves_the_session_usable(self, db_session):
        """The half of the promise that a bare try/except does not keep.

        A failed `flush` poisons the session: swallowing the exception is not
        enough, because the *caller's* next statement then raises
        PendingRollbackError and the audit log breaks the document read anyway.
        `log` uses a SAVEPOINT so only the audit insert rolls back.

        Postgres-only, and that is the point of the marker: SQLite does not
        enforce foreign keys by default, so the bogus workspace id below simply
        inserts and this test would pass against a broken implementation.
        """
        await DocumentAuditService(db_session).log(
            workspace_id=str(uuid.uuid4()),  # violates the FK on Postgres
            action=DocumentAuditAction.VIEWED,
            actor=Actor(id=None),
            document_id=str(uuid.uuid4()),
        )

        # The caller's own next write must still succeed.
        survivor = Developer(id=str(uuid.uuid4()), name="After the failure")
        db_session.add(survivor)
        await db_session.flush()

        found = (
            await db_session.execute(
                select(Developer).where(Developer.id == str(survivor.id))
            )
        ).scalar_one_or_none()
        assert found is not None

    async def test_permission_changes_carry_before_and_after(self, db_session):
        workspace_id, author, document = await _setup(db_session)

        await DocumentAuditService(db_session).log(
            workspace_id=workspace_id,
            action=DocumentAuditAction.VISIBILITY_CHANGED,
            actor=Actor(id=str(author.id)),
            document=document,
            before={"visibility": "private"},
            after={"visibility": "workspace"},
        )

        event = (await db_session.execute(select(DocumentAuditEvent))).scalar_one()
        assert event.before == {"visibility": "private"}
        assert event.after == {"visibility": "workspace"}


class TestViewCounting:
    async def test_repeat_reads_in_a_day_are_one_row(self, db_session):
        """Per open, a document pinned in a browser tab would write thousands
        of rows and drown both the table and the analytics."""
        from aexy.models.document_audit import DocumentView

        workspace_id, author, document = await _setup(db_session)
        service = DocumentAuditService(db_session)

        for _ in range(5):
            await service.record_view(document=document, viewer_id=str(author.id))

        rows = list(
            (await db_session.execute(select(DocumentView))).scalars().all()
        )
        assert len(rows) == 1
        assert rows[0].view_count == 5

    async def test_stats_separate_views_from_readers(self, db_session):
        workspace_id, author, document = await _setup(db_session)
        other = Developer(id=str(uuid.uuid4()), name="Other")
        db_session.add(other)
        await db_session.flush()
        await seed_member(db_session, workspace_id, str(other.id))

        service = DocumentAuditService(db_session)
        await service.record_view(document=document, viewer_id=str(author.id))
        await service.record_view(document=document, viewer_id=str(author.id))
        await service.record_view(document=document, viewer_id=str(other.id))

        stats = await service.document_stats(str(document.id))
        assert stats["views"] == 3
        assert stats["unique_readers"] == 2

    async def test_never_read_pages_are_reported(self, db_session):
        """The list that earns its place: a knowledge base's real problem is
        rarely its popular pages."""
        workspace_id, author, read_doc = await _setup(db_session)

        unread = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Nobody reads this",
            content={},
            created_by_id=str(author.id),
        )
        db_session.add(unread)
        await db_session.flush()

        service = DocumentAuditService(db_session)
        await service.record_view(document=read_doc, viewer_id=str(author.id))

        stats = await service.workspace_stats(workspace_id)
        assert [i["title"] for i in stats["most_read"]] == ["Refund policy"]
        assert [i["title"] for i in stats["never_read"]] == ["Nobody reads this"]


# ──────────────────────────────────────────────────────────────────────
# Publishing


class TestPublishing:
    async def test_publishing_creates_a_public_snapshot(self, db_session):
        workspace_id, author, document = await _setup(db_session)

        published = await DocumentPublishingService(db_session).publish(
            document, published_by_id=str(author.id)
        )

        assert published.slug == "refund-policy"
        assert published.title == "Refund policy"
        assert document.is_published is True

    async def test_an_edit_does_not_reach_the_published_copy(self, db_session):
        """The design decision the whole feature turns on. A published page
        that follows its source means an accidental edit to an internal
        document is instantly public."""
        workspace_id, author, document = await _setup(db_session)
        service = DocumentPublishingService(db_session)
        await service.publish(document, published_by_id=str(author.id))

        document.content = _body("Refunds are issued within 3 days.")
        document.content_text = "Refunds are issued within 3 days."
        await db_session.flush()

        article = await service.get_article("refund-policy")
        assert article is not None
        assert "14 days" in (article.content_text or "")

    async def test_a_stale_publication_is_reported(self, db_session):
        """The counterweight to snapshotting: a snapshot nobody is told has
        gone stale is just an out-of-date public page."""
        workspace_id, author, document = await _setup(db_session)
        service = DocumentPublishingService(db_session)
        await service.publish(document, published_by_id=str(author.id))

        assert await service.stale_publications(workspace_id) == []

        document.content = _body("Refunds are issued within 3 days.")
        await db_session.flush()

        stale = await service.stale_publications(workspace_id)
        assert [p.slug for p in stale] == ["refund-policy"]

    async def test_republishing_keeps_the_slug(self, db_session):
        """Changing the public URL because somebody renamed the page would
        break every link anyone had shared."""
        workspace_id, author, document = await _setup(db_session)
        service = DocumentPublishingService(db_session)
        await service.publish(document, published_by_id=str(author.id))

        document.title = "Refunds and returns"
        await db_session.flush()
        again = await service.publish(document, published_by_id=str(author.id))

        assert again.slug == "refund-policy"
        assert again.title == "Refunds and returns"

    async def test_slugs_do_not_collide(self, db_session):
        workspace_id, author, first = await _setup(db_session)
        second = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Refund policy",
            content={},
            created_by_id=str(author.id),
        )
        db_session.add(second)
        await db_session.flush()

        service = DocumentPublishingService(db_session)
        a = await service.publish(first, published_by_id=str(author.id))
        b = await service.publish(second, published_by_id=str(author.id))

        assert a.slug == "refund-policy"
        # A counter, not a random suffix: `refund-policy-2` is a URL somebody
        # can read out.
        assert b.slug == "refund-policy-2"

    async def test_a_workspace_audience_article_is_not_public(self, db_session):
        workspace_id, author, document = await _setup(db_session)
        service = DocumentPublishingService(db_session)
        await service.publish(
            document, published_by_id=str(author.id), audience="workspace"
        )

        assert await service.get_article("refund-policy") is None
        assert (
            await service.get_article(
                "refund-policy", workspace_member_of=workspace_id
            )
        ) is not None

    async def test_another_workspaces_member_cannot_read_it(self, db_session):
        """The slug namespace is shared across the deployment, so the audience
        check has to compare the workspace, not merely notice that somebody is
        signed in."""
        workspace_id, author, document = await _setup(db_session)
        other_workspace = await seed_workspace(db_session)

        service = DocumentPublishingService(db_session)
        await service.publish(
            document, published_by_id=str(author.id), audience="workspace"
        )

        assert (
            await service.get_article(
                "refund-policy", workspace_member_of=other_workspace
            )
        ) is None

    async def test_unpublishing_removes_the_public_row(self, db_session):
        workspace_id, author, document = await _setup(db_session)
        service = DocumentPublishingService(db_session)
        await service.publish(document, published_by_id=str(author.id))

        await service.unpublish(document)

        assert (
            await db_session.execute(select(PublishedDocument))
        ).scalar_one_or_none() is None
        assert document.is_published is False
        assert await service.get_article("refund-policy") is None

    async def test_a_trashed_document_cannot_be_published(self, db_session):
        workspace_id, author, document = await _setup(db_session)
        document.deleted_at = datetime.now(timezone.utc)
        await db_session.flush()

        with pytest.raises(PublishingError):
            await DocumentPublishingService(db_session).publish(
                document, published_by_id=str(author.id)
            )

    async def test_portal_search_finds_only_public_articles(self, db_session):
        """This is what ticket deflection calls. An internal page must not be
        reachable through it — and cannot be, because the index is the
        snapshot table."""
        workspace_id, author, public_doc = await _setup(db_session)
        internal = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Internal refund escalation",
            content={},
            content_text="refund escalation path for staff",
            created_by_id=str(author.id),
        )
        db_session.add(internal)
        await db_session.flush()

        service = DocumentPublishingService(db_session)
        await service.publish(public_doc, published_by_id=str(author.id))
        await service.publish(
            internal, published_by_id=str(author.id), audience="workspace"
        )

        results = await service.search_portal("refund")
        assert [r.title for r in results] == ["Refund policy"]


# ──────────────────────────────────────────────────────────────────────
# Export


class TestExport:
    def test_markdown_keeps_structure_and_marks(self):
        content = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Runbook"}],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Restart the "},
                        {
                            "type": "text",
                            "text": "worker",
                            "marks": [{"type": "bold"}],
                        },
                    ],
                },
                {
                    "type": "codeBlock",
                    "attrs": {"language": "bash"},
                    "content": [{"type": "text", "text": "systemctl restart"}],
                },
            ],
        }
        out = tiptap_to_markdown(content)
        assert "## Runbook" in out
        assert "**worker**" in out
        assert "```bash" in out

    def test_an_unknown_block_keeps_its_words(self):
        """An export that silently drops content is worse than one that loses
        formatting."""
        content = {
            "type": "doc",
            "content": [
                {
                    "type": "someFutureBlock",
                    "content": [{"type": "text", "text": "important sentence"}],
                }
            ],
        }
        assert "important sentence" in tiptap_to_markdown(content)

    async def test_the_archive_only_contains_readable_documents(self, db_session):
        """An export is a read of every document in it. An export endpoint that
        skipped the access predicate would be the most efficient possible
        version of the leak this work closed."""
        import io
        import zipfile

        from aexy.models.documentation import DocumentVisibility
        from aexy.services.document_access import DocumentAccess

        workspace_id, author, mine = await _setup(db_session, title="Shared page")
        colleague = Developer(id=str(uuid.uuid4()), name="Colleague")
        db_session.add(colleague)
        await db_session.flush()
        await seed_member(db_session, workspace_id, str(colleague.id))

        secret = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Private page",
            content=_body("secret"),
            visibility=DocumentVisibility.PRIVATE.value,
            created_by_id=str(author.id),
        )
        db_session.add(secret)
        await db_session.flush()

        clause = await DocumentAccess(db_session).visible_clause(
            workspace_id, str(colleague.id)
        )
        tree = await DocumentExportService(db_session).export_tree(
            workspace_id, access_clause=clause
        )

        names = zipfile.ZipFile(io.BytesIO(tree.archive)).namelist()
        assert any("Shared page" in n for n in names)
        assert not any("Private page" in n for n in names)

    async def test_the_archive_mirrors_the_hierarchy(self, db_session):
        import io
        import zipfile

        from aexy.services.document_access import DocumentAccess

        workspace_id, author, parent = await _setup(db_session, title="Handbook")
        child = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Onboarding",
            content=_body("welcome"),
            parent_id=str(parent.id),
            created_by_id=str(author.id),
        )
        db_session.add(child)
        await db_session.flush()

        clause = await DocumentAccess(db_session).visible_clause(
            workspace_id, str(author.id)
        )
        tree = await DocumentExportService(db_session).export_tree(
            workspace_id, access_clause=clause
        )

        names = zipfile.ZipFile(io.BytesIO(tree.archive)).namelist()
        assert "Handbook/Onboarding.md" in names


# ──────────────────────────────────────────────────────────────────────
# Version retention


class TestVersionRetention:
    async def test_manual_saves_are_never_pruned(self, db_session):
        from aexy.models.documentation import DocumentVersion
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)
        old = datetime.now(timezone.utc) - timedelta(days=90)

        for n in range(1, 6):
            db_session.add(
                DocumentVersion(
                    id=str(uuid.uuid4()),
                    document_id=str(document.id),
                    version_number=n,
                    content={},
                    created_by_id=str(author.id),
                    is_auto_save=False,
                    created_at=old + timedelta(hours=n),
                )
            )
        await db_session.flush()

        assert await DocumentService(db_session).prune_versions(str(document.id)) == 0

    async def test_old_autosaves_collapse_to_one_per_day(self, db_session):
        from aexy.models.documentation import DocumentVersion
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)
        day = datetime.now(timezone.utc) - timedelta(days=5)

        for n in range(1, 11):
            db_session.add(
                DocumentVersion(
                    id=str(uuid.uuid4()),
                    document_id=str(document.id),
                    version_number=n,
                    content={},
                    created_by_id=str(author.id),
                    is_auto_save=True,
                    created_at=day + timedelta(minutes=n),
                )
            )
        await db_session.flush()

        removed = await DocumentService(db_session).prune_versions(str(document.id))

        remaining = list(
            (
                await db_session.execute(
                    select(DocumentVersion).where(
                        DocumentVersion.document_id == str(document.id)
                    )
                )
            )
            .scalars()
            .all()
        )
        # The newest is always kept, plus one survivor for that day.
        assert len(remaining) == 2
        assert removed == 8

    async def test_recent_autosaves_are_kept_in_full(self, db_session):
        """The recent window is where "undo what I just did" lives."""
        from aexy.models.documentation import DocumentVersion
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)
        now = datetime.now(timezone.utc)

        for n in range(1, 8):
            db_session.add(
                DocumentVersion(
                    id=str(uuid.uuid4()),
                    document_id=str(document.id),
                    version_number=n,
                    content={},
                    created_by_id=str(author.id),
                    is_auto_save=True,
                    created_at=now - timedelta(minutes=n),
                )
            )
        await db_session.flush()

        assert await DocumentService(db_session).prune_versions(str(document.id)) == 0

    async def test_a_pinned_version_survives(self, db_session):
        """A version somebody restored from is one somebody cares about."""
        from aexy.models.documentation import DocumentVersion
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)
        day = datetime.now(timezone.utc) - timedelta(days=10)

        for n in range(1, 6):
            db_session.add(
                DocumentVersion(
                    id=str(uuid.uuid4()),
                    document_id=str(document.id),
                    version_number=n,
                    content={},
                    created_by_id=str(author.id),
                    is_auto_save=True,
                    is_pinned=(n == 2),
                    created_at=day + timedelta(minutes=n),
                )
            )
        await db_session.flush()

        await DocumentService(db_session).prune_versions(str(document.id))

        remaining = list(
            (
                await db_session.execute(
                    select(DocumentVersion).where(
                        DocumentVersion.document_id == str(document.id)
                    )
                )
            )
            .scalars()
            .all()
        )
        assert 2 in {v.version_number for v in remaining}


# ──────────────────────────────────────────────────────────────────────
# Trash


class TestTrash:
    async def test_deleting_hides_the_subtree_without_removing_it(self, db_session):
        from aexy.services.document_service import DocumentService

        workspace_id, author, parent = await _setup(db_session, title="Section")
        child = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Page",
            content={},
            parent_id=str(parent.id),
            created_by_id=str(author.id),
        )
        db_session.add(child)
        await db_session.flush()

        service = DocumentService(db_session)
        assert await service.delete_document(
            str(parent.id), workspace_id, deleted_by_id=str(author.id)
        )

        # Gone from the ordinary read path…
        assert await service.get_document(str(parent.id), workspace_id) is None
        assert await service.get_document(str(child.id), workspace_id) is None
        # …but still there.
        rows = list(
            (
                await db_session.execute(
                    select(Document).where(Document.workspace_id == workspace_id)
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 2

    async def test_restoring_brings_the_subtree_back(self, db_session):
        from aexy.services.document_service import DocumentService

        workspace_id, author, parent = await _setup(db_session, title="Section")
        child = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Page",
            content={},
            parent_id=str(parent.id),
            created_by_id=str(author.id),
        )
        db_session.add(child)
        await db_session.flush()

        service = DocumentService(db_session)
        await service.delete_document(
            str(parent.id), workspace_id, deleted_by_id=str(author.id)
        )
        await service.restore_document(
            str(parent.id), workspace_id, restored_by_id=str(author.id)
        )

        assert await service.get_document(str(parent.id), workspace_id) is not None
        assert await service.get_document(str(child.id), workspace_id) is not None

    async def test_the_trash_lists_roots_not_every_page(self, db_session):
        """Deleting a section is one action and should be one row to restore,
        not one per page it contained."""
        from aexy.services.document_service import DocumentService

        workspace_id, author, parent = await _setup(db_session, title="Section")
        for n in range(3):
            db_session.add(
                Document(
                    id=str(uuid.uuid4()),
                    workspace_id=workspace_id,
                    title=f"Page {n}",
                    content={},
                    parent_id=str(parent.id),
                    created_by_id=str(author.id),
                )
            )
        await db_session.flush()

        service = DocumentService(db_session)
        await service.delete_document(
            str(parent.id), workspace_id, deleted_by_id=str(author.id)
        )

        trash = await service.list_trash(workspace_id)
        assert [d.title for d in trash] == ["Section"]

    async def test_a_restored_orphan_comes_back_to_the_root(self, db_session):
        """Restoring into a parent that is still deleted produces a document
        that exists, is not deleted, and appears nowhere."""
        from aexy.services.document_service import DocumentService

        workspace_id, author, parent = await _setup(db_session, title="Section")
        child = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Page",
            content={},
            parent_id=str(parent.id),
            created_by_id=str(author.id),
        )
        db_session.add(child)
        await db_session.flush()

        service = DocumentService(db_session)
        await service.delete_document(
            str(parent.id), workspace_id, deleted_by_id=str(author.id)
        )
        restored = await service.restore_document(
            str(child.id), workspace_id, restored_by_id=str(author.id)
        )

        assert restored is not None
        assert restored.parent_id is None

    async def test_purge_respects_the_retention_window(self, db_session):
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)
        service = DocumentService(db_session)
        await service.delete_document(
            str(document.id), workspace_id, deleted_by_id=str(author.id)
        )

        assert await service.purge_expired(workspace_id, retention_days=30) == 0

        document.deleted_at = datetime.now(timezone.utc) - timedelta(days=31)
        await db_session.commit()

        assert await service.purge_expired(workspace_id, retention_days=30) == 1


class TestCycleSafety:
    async def test_a_document_cannot_be_moved_into_its_own_page(self, db_session):
        """Two ordinary moves used to produce a parent cycle, after which
        `get_ancestors` — an unbounded `while` — pinned the worker on every
        page load."""
        from aexy.services.document_service import DocumentCycleError, DocumentService

        workspace_id, author, parent = await _setup(db_session, title="Parent")
        child = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Child",
            content={},
            parent_id=str(parent.id),
            created_by_id=str(author.id),
        )
        db_session.add(child)
        await db_session.flush()

        with pytest.raises(DocumentCycleError):
            await DocumentService(db_session).move_document(
                document_id=str(parent.id),
                workspace_id=workspace_id,
                new_parent_id=str(child.id),
                position=0,
            )

    async def test_a_document_cannot_be_its_own_parent(self, db_session):
        from aexy.services.document_service import DocumentCycleError, DocumentService

        workspace_id, author, document = await _setup(db_session)

        with pytest.raises(DocumentCycleError):
            await DocumentService(db_session).move_document(
                document_id=str(document.id),
                workspace_id=workspace_id,
                new_parent_id=str(document.id),
                position=0,
            )

    async def test_an_existing_cycle_truncates_rather_than_hangs(self, db_session):
        """Rows that predate the guard exist in deployed databases. The visited
        set turns one into a wrong-but-finite breadcrumb."""
        from aexy.services.document_service import DocumentService

        workspace_id, author, a = await _setup(db_session, title="A")
        b = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="B",
            content={},
            parent_id=str(a.id),
            created_by_id=str(author.id),
        )
        db_session.add(b)
        await db_session.flush()

        # Forge the cycle the guard now prevents.
        a.parent_id = str(b.id)
        await db_session.flush()

        ancestors = await DocumentService(db_session).get_ancestors(str(a.id))
        assert len(ancestors) <= 2


class TestRestoreAuthorization:
    """Taking a document out of the trash is the same authority as putting it
    there.

    `resolve` refuses a deleted document by design, so restore has to ask a
    different question — could this person have opened it *before* it was
    deleted? The first version of this endpoint answered it with workspace
    membership alone, which let any colleague pull somebody's private page back
    out of the bin.
    """

    async def test_a_colleague_cannot_restore_a_private_page(self, db_session):
        from aexy.models.documentation import DocumentVisibility
        from aexy.services.document_access import AccessLevel, DocumentAccess
        from aexy.services.document_service import DocumentService

        workspace_id, author, _doc = await _setup(db_session)
        colleague = Developer(id=str(uuid.uuid4()), name="Colleague")
        db_session.add(colleague)
        await db_session.flush()
        await seed_member(db_session, workspace_id, str(colleague.id))

        private = Document(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            title="Private notes",
            content={},
            visibility=DocumentVisibility.PRIVATE.value,
            created_by_id=str(author.id),
        )
        db_session.add(private)
        await db_session.flush()

        await DocumentService(db_session).delete_document(
            str(private.id), workspace_id, deleted_by_id=str(author.id)
        )
        await db_session.refresh(private)

        access = DocumentAccess(db_session)

        # The pre-deletion question, which is what restore asks.
        assert (
            await access.resolve(
                private,
                str(colleague.id),
                workspace_id=workspace_id,
                allow_deleted=True,
            )
            == AccessLevel.NONE
        )
        # And the author, who could open it, still can restore it.
        assert (
            await access.resolve(
                private,
                str(author.id),
                workspace_id=workspace_id,
                allow_deleted=True,
            )
            == AccessLevel.ADMIN
        )

    async def test_the_exemption_is_not_cached(self, db_session):
        """A pre-deletion answer must never be served to an ordinary caller —
        sharing a cache entry between the two questions would leak the
        exemption."""
        from aexy.services.document_access import AccessLevel, DocumentAccess
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)
        await DocumentService(db_session).delete_document(
            str(document.id), workspace_id, deleted_by_id=str(author.id)
        )
        await db_session.refresh(document)

        access = DocumentAccess(db_session)
        assert (
            await access.resolve(
                document,
                str(author.id),
                workspace_id=workspace_id,
                allow_deleted=True,
            )
            == AccessLevel.ADMIN
        )
        # The ordinary question must still answer NONE, not the cached ADMIN.
        assert (
            await access.resolve(document, str(author.id), workspace_id=workspace_id)
            == AccessLevel.NONE
        )


class TestBodySizeLimit:
    """Word documents have had a byte ceiling since they were added; TipTap
    bodies had none — and they are the format that costs most to leave
    unbounded, because every change snapshots the *whole* body into
    `document_versions` and re-chunks it for embeddings."""

    async def test_an_oversized_body_is_refused(self, db_session):
        from aexy.services.document_service import (
            MAX_DOCUMENT_BYTES,
            DocumentService,
            DocumentTooLargeError,
        )

        workspace_id, author, document = await _setup(db_session)

        huge = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "x" * (MAX_DOCUMENT_BYTES + 1)}],
                }
            ],
        }

        with pytest.raises(DocumentTooLargeError):
            await DocumentService(db_session).update_document(
                document_id=str(document.id),
                updated_by_id=str(author.id),
                content=huge,
            )

    async def test_an_ordinary_body_is_untouched(self, db_session):
        """The limit is far above anything a person writes; the cases that
        reach it are machine-produced."""
        from aexy.services.document_service import DocumentService

        workspace_id, author, document = await _setup(db_session)

        updated = await DocumentService(db_session).update_document(
            document_id=str(document.id),
            updated_by_id=str(author.id),
            content=_body("A perfectly normal paragraph." * 500),
        )
        assert updated is not None
