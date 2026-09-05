"""Other ways to read a document you cannot open.

`DocumentAccess` closed the documents router. It did not close everything,
because other modules read `Document` rows for their own reasons and were
written before the access layer existed. Two of them were found by asking a
different question from "is the documents router safe": *which routers select
from `documents` at all?*

**The review queue** (`api/review_items.py`) listed every pending proposal in
the workspace and rendered each with the document's title, the heading names
inside the change, and an AI-written summary of what the change does. A
workspace member could therefore read a description of a private page's
contents, in prose, without ever being served the page.

**The knowledge graph** (`services/knowledge_graph_service.py`) is built *from*
document content. Its entity and connection views listed the titles of the
documents each entity was extracted from — so browsing the graph named private
pages and showed the concepts inside them side by side.

Both are the same class of defect as the original search leak: not a
permissions check that was wrong, but a surface nobody thought of as a document
read.
"""

import uuid

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentVisibility
from aexy.services.document_access import DocumentAccess
from tests.conftest import requires_postgres, seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


async def _people(db):
    workspace_id = await seed_workspace(db)
    author = Developer(id=str(uuid.uuid4()), name="Author")
    colleague = Developer(id=str(uuid.uuid4()), name="Colleague")
    db.add_all([author, colleague])
    await db.flush()
    await seed_member(db, workspace_id, str(author.id))
    await seed_member(db, workspace_id, str(colleague.id))
    return workspace_id, str(author.id), str(colleague.id)


async def _private_document(db, workspace_id: str, author_id: str) -> Document:
    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Q3 layoff plan",
        content={},
        content_text="who goes and when",
        visibility=DocumentVisibility.PRIVATE.value,
        created_by_id=author_id,
    )
    db.add(document)
    await db.flush()
    return document


class TestTheReviewQueue:
    async def test_a_private_documents_proposal_is_not_listed(self, db_session):
        """The title and the change summary are the leak; the proposal itself
        never needed to be readable."""
        from aexy.api.review_items import list_review_items
        from aexy.models.proposed_change import (
            ChangeKind,
            ChangeStatus,
            ProposedChange,
        )

        workspace_id, author_id, colleague_id = await _people(db_session)
        secret = await _private_document(db_session, workspace_id, author_id)

        db_session.add(
            ProposedChange(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                entity_type="document",
                entity_id=str(secret.id),
                kind=ChangeKind.CONTENT.value,
                status=ChangeStatus.PENDING.value,
                summary={"summary": "Adds the severance table"},
                requested_by_id=author_id,
            )
        )
        await db_session.flush()

        colleague = (
            await db_session.execute(
                select(Developer).where(Developer.id == colleague_id)
            )
        ).scalar_one()
        author = (
            await db_session.execute(
                select(Developer).where(Developer.id == author_id)
            )
        ).scalar_one()

        theirs = await list_review_items(
            workspace_id=workspace_id, limit=100, db=db_session, current_user=colleague
        )
        assert theirs == [], "a private document's proposal reached the queue"

        mine = await list_review_items(
            workspace_id=workspace_id, limit=100, db=db_session, current_user=author
        )
        assert [i.title for i in mine] == ["Q3 layoff plan"]

    async def test_the_badge_agrees_with_the_list(self, db_session):
        """A count that includes what the list hides is itself a signal about
        documents the reader cannot see."""
        from aexy.api.review_items import review_summary
        from aexy.models.proposed_change import (
            ChangeKind,
            ChangeStatus,
            ProposedChange,
        )

        workspace_id, author_id, colleague_id = await _people(db_session)
        secret = await _private_document(db_session, workspace_id, author_id)

        db_session.add(
            ProposedChange(
                id=str(uuid.uuid4()),
                workspace_id=workspace_id,
                entity_type="document",
                entity_id=str(secret.id),
                kind=ChangeKind.CONTENT.value,
                status=ChangeStatus.PENDING.value,
                requested_by_id=author_id,
            )
        )
        await db_session.flush()

        colleague = (
            await db_session.execute(
                select(Developer).where(Developer.id == colleague_id)
            )
        ).scalar_one()

        summary = await review_summary(
            workspace_id=workspace_id, db=db_session, current_user=colleague
        )
        assert summary.document_proposals == 0


class TestTheKnowledgeGraph:
    @requires_postgres
    async def test_an_entitys_documents_are_filtered(self, db_session):
        """The graph is derived from document content, so naming the documents
        an entity came from is a disclosure about what those documents say.

        Postgres-only for a fixture reason, not a logic one: `aliases` is an
        `ARRAY(String)` with `default=list`, and SQLite cannot bind a Python
        list to it — the DDL shim makes the column JSON but the ARRAY bind
        processor still rejects the value. The two `get_document_connections`
        tests below exercise the same filter on SQLite.
        """
        from aexy.models.knowledge_graph import (
            KnowledgeEntity,
            KnowledgeEntityMention,
        )
        from aexy.services.knowledge_graph_service import KnowledgeGraphService

        workspace_id, author_id, colleague_id = await _people(db_session)
        secret = await _private_document(db_session, workspace_id, author_id)

        entity = KnowledgeEntity(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            name="Severance",
            normalized_name="severance",
            entity_type="concept",
        )
        db_session.add(entity)
        await db_session.flush()

        db_session.add(
            KnowledgeEntityMention(
                id=str(uuid.uuid4()),
                entity_id=str(entity.id),
                document_id=str(secret.id),
            )
        )
        await db_session.flush()

        service = KnowledgeGraphService(db_session)

        theirs = await service.get_entity_by_id(
            workspace_id, str(entity.id), viewer_id=colleague_id
        )
        assert theirs is not None
        assert theirs["documents"] == [], "a private document was named"

        mine = await service.get_entity_by_id(
            workspace_id, str(entity.id), viewer_id=author_id
        )
        assert [d["title"] for d in mine["documents"]] == ["Q3 layoff plan"]

    async def test_document_connections_refuse_a_document_you_cannot_open(
        self, db_session
    ):
        from aexy.services.knowledge_graph_service import KnowledgeGraphService

        workspace_id, author_id, colleague_id = await _people(db_session)
        secret = await _private_document(db_session, workspace_id, author_id)

        service = KnowledgeGraphService(db_session)

        theirs = await service.get_document_connections(
            workspace_id, str(secret.id), viewer_id=colleague_id
        )
        # The service reports "no such document" the same way it would for a
        # document that does not exist.
        assert not theirs.get("document") or not theirs["document"].get("title")

    async def test_no_viewer_means_no_filtering(self, db_session):
        """Background callers — extraction, rebuilds — have no viewer and must
        keep working. The filter is opt-in for exactly that reason, which is
        also why every *endpoint* has to pass one."""
        from aexy.services.knowledge_graph_service import KnowledgeGraphService

        workspace_id, author_id, _colleague_id = await _people(db_session)
        secret = await _private_document(db_session, workspace_id, author_id)

        result = await KnowledgeGraphService(db_session).get_document_connections(
            workspace_id, str(secret.id)
        )
        assert result["document"]["title"] == "Q3 layoff plan"


async def test_the_access_predicate_is_what_both_fixes_use(db_session):
    """Both doors are closed with the same `visible_clause` the documents
    router uses, rather than a second implementation of the rule — which is
    how the two would drift apart."""
    workspace_id, author_id, colleague_id = await _people(db_session)
    secret = await _private_document(db_session, workspace_id, author_id)

    clause = await DocumentAccess(db_session).visible_clause(
        workspace_id, colleague_id
    )
    visible = (
        (await db_session.execute(select(Document.id).where(clause)))
        .scalars()
        .all()
    )
    assert str(secret.id) not in {str(v) for v in visible}
