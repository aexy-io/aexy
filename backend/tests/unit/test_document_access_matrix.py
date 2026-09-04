"""Who can see which document, enumerated.

This file exists because the knowledge base had three access-control concepts —
``Document.visibility``, ``DocumentSpaceMember`` roles and
``DocumentCollaborator`` grades — stored, returned in API responses, and
enforced on no read path at all. A private document was readable by any
workspace viewer holding its id, and ``search_documents`` filtered on
``workspace_id`` alone, so the id was searchable by content.

Two properties are pinned here, and the second is the one that rots:

1. every (document kind × person) pair resolves to the level it should;
2. **``resolve`` and ``visible_clause`` agree.** They are two implementations
   of one rule — one in Python for a single document, one in SQL for listings —
   and nothing but a test makes them stay the same. A listing that is more
   permissive than the detail endpoint is the original leak; one that is less
   permissive is a document that appears in the sidebar and 404s when clicked.
"""

import uuid

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.documentation import (
    Document,
    DocumentCollaborator,
    DocumentPermission,
    DocumentSpace,
    DocumentSpaceMember,
    DocumentSpaceRole,
    DocumentSpaceVisibility,
    DocumentVisibility,
)
from aexy.services.document_access import AccessLevel, DocumentAccess
from tests.conftest import seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


async def _developer(db, name: str) -> str:
    developer = Developer(id=str(uuid.uuid4()), name=name)
    db.add(developer)
    await db.flush()
    return str(developer.id)


async def _space(db, workspace_id: str, *, restricted: bool) -> str:
    space = DocumentSpace(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        name="Space",
        slug=f"space-{uuid.uuid4().hex[:8]}",
        visibility=(
            DocumentSpaceVisibility.RESTRICTED.value
            if restricted
            else DocumentSpaceVisibility.OPEN.value
        ),
    )
    db.add(space)
    await db.flush()
    return str(space.id)


async def _document(
    db,
    workspace_id: str,
    author_id: str,
    *,
    visibility: str = DocumentVisibility.WORKSPACE.value,
    space_id: str | None = None,
) -> Document:
    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Page",
        content={},
        visibility=visibility,
        space_id=space_id,
        created_by_id=author_id,
    )
    db.add(document)
    await db.flush()
    return document


async def _listing(db, workspace_id: str, developer_id: str) -> set[str]:
    """What `visible_clause` lets this person see, as a set of ids."""
    clause = await DocumentAccess(db).visible_clause(workspace_id, developer_id)
    rows = await db.execute(select(Document.id).where(clause))
    return {str(r) for r in rows.scalars().all()}


async def _both(db, document: Document, developer_id: str) -> tuple[AccessLevel, bool]:
    """`resolve`'s answer and `visible_clause`'s, for the same document."""
    access = DocumentAccess(db)
    level = await access.resolve(
        document, developer_id, workspace_id=str(document.workspace_id)
    )
    listed = str(document.id) in await _listing(
        db, str(document.workspace_id), developer_id
    )
    return level, listed


# ──────────────────────────────────────────────────────────────────────
# The matrix


async def test_a_private_document_is_invisible_to_a_colleague(db_session):
    """The defect this module was written for.

    A workspace member with no relationship to the document could read it by id
    and find it by searching its contents.
    """
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    colleague = await _developer(db_session, "Colleague")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, colleague)

    document = await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )

    level, listed = await _both(db_session, document, colleague)
    assert level == AccessLevel.NONE
    assert listed is False

    author_level, author_listed = await _both(db_session, document, author)
    assert author_level == AccessLevel.ADMIN
    assert author_listed is True


async def test_a_private_document_is_readable_by_an_explicit_collaborator(db_session):
    """Sharing is what "private" is supposed to permit."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    invitee = await _developer(db_session, "Invitee")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, invitee)

    document = await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )
    db_session.add(
        DocumentCollaborator(
            id=str(uuid.uuid4()),
            document_id=str(document.id),
            developer_id=invitee,
            permission=DocumentPermission.COMMENT.value,
        )
    )
    await db_session.flush()

    level, listed = await _both(db_session, document, invitee)
    assert level == AccessLevel.COMMENT
    assert listed is True


async def test_a_restricted_space_hides_its_documents(db_session):
    """The membership list predates the flag and governed only the space's own
    endpoints, so a restricted HR space was a label on documents anyone could
    open."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    outsider = await _developer(db_session, "Outsider")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, outsider)

    space = await _space(db_session, workspace, restricted=True)
    document = await _document(db_session, workspace, author, space_id=space)

    level, listed = await _both(db_session, document, outsider)
    assert level == AccessLevel.NONE
    assert listed is False


async def test_a_restricted_space_member_gets_their_role(db_session):
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    reader = await _developer(db_session, "Reader")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, reader)

    space = await _space(db_session, workspace, restricted=True)
    db_session.add(
        DocumentSpaceMember(
            id=str(uuid.uuid4()),
            space_id=space,
            developer_id=reader,
            role=DocumentSpaceRole.VIEWER.value,
        )
    )
    await db_session.flush()

    document = await _document(db_session, workspace, author, space_id=space)

    level, listed = await _both(db_session, document, reader)
    assert level == AccessLevel.VIEW
    assert listed is True


async def test_an_open_space_behaves_as_it_always_did(db_session):
    """`open` is the migration default, so every space that existed before the
    flag keeps working exactly as it did."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    colleague = await _developer(db_session, "Colleague")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, colleague)

    space = await _space(db_session, workspace, restricted=False)
    document = await _document(db_session, workspace, author, space_id=space)

    level, listed = await _both(db_session, document, colleague)
    assert level == AccessLevel.EDIT
    assert listed is True


async def test_a_private_document_stays_private_inside_an_open_space(db_session):
    """Filing a private draft in a shared space is not consent to share it."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    colleague = await _developer(db_session, "Colleague")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, colleague)

    space = await _space(db_session, workspace, restricted=False)
    document = await _document(
        db_session,
        workspace,
        author,
        visibility=DocumentVisibility.PRIVATE.value,
        space_id=space,
    )

    level, listed = await _both(db_session, document, colleague)
    assert level == AccessLevel.NONE
    assert listed is False


async def test_a_workspace_viewer_cannot_edit_an_open_document(db_session):
    """A role that cannot create a document must not be able to rewrite one
    because a space happens to be open."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    viewer = await _developer(db_session, "Viewer")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, viewer, role="viewer")

    document = await _document(db_session, workspace, author)

    level, listed = await _both(db_session, document, viewer)
    assert level == AccessLevel.VIEW
    assert listed is True


async def test_a_workspace_admin_sees_everything(db_session):
    """Including a private document whose author has left — otherwise nobody
    can ever unblock it."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    admin = await _developer(db_session, "Admin")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, admin, role="admin")

    space = await _space(db_session, workspace, restricted=True)
    private = await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )
    restricted = await _document(db_session, workspace, author, space_id=space)

    for document in (private, restricted):
        level, listed = await _both(db_session, document, admin)
        assert level == AccessLevel.ADMIN
        assert listed is True


async def test_another_workspaces_member_sees_nothing(db_session):
    """Tenancy. A collaborator row for an outsider must not rescue them either
    — that would turn a share into a tenancy hole."""
    mine = await seed_workspace(db_session)
    theirs = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    stranger = await _developer(db_session, "Stranger")
    await seed_member(db_session, mine, author)
    await seed_member(db_session, theirs, stranger)

    document = await _document(db_session, mine, author)
    db_session.add(
        DocumentCollaborator(
            id=str(uuid.uuid4()),
            document_id=str(document.id),
            developer_id=stranger,
            permission=DocumentPermission.ADMIN.value,
        )
    )
    await db_session.flush()

    level, listed = await _both(db_session, document, stranger)
    assert level == AccessLevel.NONE
    assert listed is False


async def test_a_non_member_sees_nothing(db_session):
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    nobody = await _developer(db_session, "Nobody")
    await seed_member(db_session, workspace, author)

    document = await _document(db_session, workspace, author)

    level, listed = await _both(db_session, document, nobody)
    assert level == AccessLevel.NONE
    assert listed is False


async def test_a_removed_member_sees_nothing(db_session):
    """Membership status, not merely the presence of a row. Offboarding writes
    `status='removed'` rather than deleting."""
    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    leaver = await _developer(db_session, "Leaver")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, leaver, status="removed")

    document = await _document(db_session, workspace, author)

    level, listed = await _both(db_session, document, leaver)
    assert level == AccessLevel.NONE
    assert listed is False


async def test_a_trashed_document_resolves_to_nothing(db_session):
    """Even for its author. Restore goes through the trash endpoints, which
    look it up deliberately."""
    from datetime import datetime, timezone

    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    await seed_member(db_session, workspace, author)

    document = await _document(db_session, workspace, author)
    document.deleted_at = datetime.now(timezone.utc)
    await db_session.flush()

    level, listed = await _both(db_session, document, author)
    assert level == AccessLevel.NONE
    assert listed is False


async def test_search_returns_only_what_the_caller_may_read(db_session):
    """The leak with a discovery mechanism attached: `search_documents`
    filtered on `workspace_id` alone, so a viewer could find another person's
    private document *by its contents*."""
    from aexy.services.document_service import DocumentService

    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    colleague = await _developer(db_session, "Colleague")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, colleague)

    secret = await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )
    secret.title = "Acquisition terms"
    secret.content_text = "we are buying Northwind for 40 million"

    shared = await _document(db_session, workspace, author)
    shared.title = "Northwind onboarding"
    shared.content_text = "how we onboard Northwind staff"
    await db_session.flush()

    service = DocumentService(db_session)
    access = DocumentAccess(db_session)

    theirs = await service.search_documents(
        workspace_id=workspace,
        query="Northwind",
        access_clause=await access.visible_clause(workspace, colleague),
    )
    assert {hit.document.title for hit in theirs} == {"Northwind onboarding"}

    mine = await service.search_documents(
        workspace_id=workspace,
        query="Northwind",
        access_clause=await access.visible_clause(workspace, author),
    )
    assert {hit.document.title for hit in mine} == {
        "Northwind onboarding",
        "Acquisition terms",
    }


async def test_the_tree_hides_what_the_caller_may_not_read(db_session):
    """The sidebar restricted private documents only when the caller passed an
    explicit `visibility="private"` filter — which it never did."""
    from aexy.services.document_service import DocumentService

    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    colleague = await _developer(db_session, "Colleague")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, colleague)

    await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )
    shared = await _document(db_session, workspace, author)

    tree = await DocumentService(db_session).get_document_tree(
        workspace_id=workspace,
        developer_id=colleague,
        access_clause=await DocumentAccess(db_session).visible_clause(
            workspace, colleague
        ),
    )
    assert [node["id"] for node in tree] == [shared.id]


async def test_a_shared_child_of_a_hidden_parent_still_appears(db_session):
    """A page you were explicitly given must not vanish from your sidebar
    because of where its author filed it."""
    from aexy.services.document_service import DocumentService

    workspace = await seed_workspace(db_session)
    author = await _developer(db_session, "Author")
    invitee = await _developer(db_session, "Invitee")
    await seed_member(db_session, workspace, author)
    await seed_member(db_session, workspace, invitee)

    parent = await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )
    child = await _document(
        db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
    )
    child.parent_id = str(parent.id)
    db_session.add(
        DocumentCollaborator(
            id=str(uuid.uuid4()),
            document_id=str(child.id),
            developer_id=invitee,
            permission=DocumentPermission.VIEW.value,
        )
    )
    await db_session.flush()

    tree = await DocumentService(db_session).get_document_tree(
        workspace_id=workspace,
        developer_id=invitee,
        access_clause=await DocumentAccess(db_session).visible_clause(
            workspace, invitee
        ),
    )
    assert [node["id"] for node in tree] == [child.id]


# ──────────────────────────────────────────────────────────────────────
# The request-scoped cache
#
# Access is resolved twice on the hot path by design — `guard_document_route`
# is a router-level dependency that fails closed, and each endpoint then asks
# for the level it actually needs. The cache lives on the *session* rather than
# on a `DocumentAccess` instance so those two layers share it without a
# parameter threaded through every call site.
#
# That buys speed and costs two things worth testing: a cache hit must not
# bypass the cross-tenant check, and a write that changes access must not be
# answered from before itself.


def _count_queries(db):
    """Count SELECTs issued on this session, as a resettable counter."""
    from sqlalchemy import event

    seen = {"n": 0}
    sync_engine = db.get_bind().engine

    def before(conn, cursor, statement, *args):
        if statement.lstrip().upper().startswith("SELECT"):
            seen["n"] += 1

    event.listen(sync_engine, "before_cursor_execute", before)
    return seen, lambda: event.remove(sync_engine, "before_cursor_execute", before)


class TestRequestScopedCache:
    async def test_two_instances_share_one_cache(self, db_session):
        """The guard and the endpoint build their own `DocumentAccess`. If the
        cache were per-instance it would never be hit on the path it exists
        for."""
        workspace = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        await seed_member(db_session, workspace, author)
        document = await _document(db_session, workspace, author)

        # Whatever the first resolution costs, the second must cost nothing.
        await DocumentAccess(db_session).resolve(document, author)

        seen, stop = _count_queries(db_session)
        try:
            level = await DocumentAccess(db_session).resolve(document, author)
        finally:
            stop()

        assert level == AccessLevel.ADMIN
        assert seen["n"] == 0, "a second DocumentAccess re-queried"

    async def test_a_cache_hit_still_refuses_another_workspace(self, db_session):
        """The tenancy assertion must be answered by the cache, not skipped by
        it. Caching the level alone would make `resolve(id, dev)` and
        `resolve(id, dev, workspace_id=<someone else's>)` share a result."""
        workspace = await seed_workspace(db_session)
        other_workspace = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        await seed_member(db_session, workspace, author)
        document = await _document(db_session, workspace, author)

        access = DocumentAccess(db_session)
        assert await access.resolve(document, author) == AccessLevel.ADMIN

        # Same document, same person, now asserted against the wrong workspace.
        assert (
            await access.resolve(document, author, workspace_id=other_workspace)
            == AccessLevel.NONE
        )
        # …and the correct one still works, so the refusal was not poisoning.
        assert (
            await access.resolve(document, author, workspace_id=workspace)
            == AccessLevel.ADMIN
        )

    async def test_sharing_is_visible_within_the_same_request(self, db_session):
        """The staleness the cache introduces, and the invalidation that fixes
        it: `add_collaborator` must not be answered from before its own
        write."""
        from aexy.services.document_service import DocumentService

        workspace = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        invitee = await _developer(db_session, "Invitee")
        await seed_member(db_session, workspace, author)
        await seed_member(db_session, workspace, invitee)

        document = await _document(
            db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
        )

        access = DocumentAccess(db_session)
        assert await access.resolve(document, invitee) == AccessLevel.NONE

        await DocumentService(db_session).add_collaborator(
            document_id=str(document.id),
            developer_id=invitee,
            permission=DocumentPermission.EDIT.value,
            invited_by_id=author,
        )

        assert await access.resolve(document, invitee) == AccessLevel.EDIT

    async def test_unsharing_is_visible_within_the_same_request(self, db_session):
        from aexy.services.document_service import DocumentService

        workspace = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        invitee = await _developer(db_session, "Invitee")
        await seed_member(db_session, workspace, author)
        await seed_member(db_session, workspace, invitee)

        document = await _document(
            db_session, workspace, author, visibility=DocumentVisibility.PRIVATE.value
        )
        service = DocumentService(db_session)
        await service.add_collaborator(
            document_id=str(document.id),
            developer_id=invitee,
            permission=DocumentPermission.EDIT.value,
            invited_by_id=author,
        )

        access = DocumentAccess(db_session)
        assert await access.resolve(document, invitee) == AccessLevel.EDIT

        await service.remove_collaborator(str(document.id), invitee)

        assert await access.resolve(document, invitee) == AccessLevel.NONE

    async def test_a_space_membership_change_clears_everything(self, db_session):
        """A space decides access to every document filed under it, and the
        space service has no list of those — so its invalidation is total."""
        from aexy.services.document_space_service import DocumentSpaceService

        workspace = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        outsider = await _developer(db_session, "Outsider")
        await seed_member(db_session, workspace, author)
        await seed_member(db_session, workspace, outsider)

        space = await _space(db_session, workspace, restricted=True)
        document = await _document(db_session, workspace, author, space_id=space)

        access = DocumentAccess(db_session)
        assert await access.resolve(document, outsider) == AccessLevel.NONE

        await DocumentSpaceService(db_session).add_member(
            space_id=space,
            developer_id=outsider,
            role=DocumentSpaceRole.VIEWER.value,
        )

        assert await access.resolve(document, outsider) == AccessLevel.VIEW

    async def test_a_deleted_document_is_not_cached(self, db_session):
        """`resolve` returns NONE before it consults anything else, and caching
        that would keep answering NONE after a restore in the same request."""
        from aexy.services.document_service import DocumentService

        workspace = await seed_workspace(db_session)
        author = await _developer(db_session, "Author")
        await seed_member(db_session, workspace, author)
        document = await _document(db_session, workspace, author)

        await DocumentService(db_session).delete_document(
            str(document.id), workspace, deleted_by_id=author
        )
        await db_session.refresh(document)

        access = DocumentAccess(db_session)
        assert await access.resolve(document, author) == AccessLevel.NONE

        document.deleted_at = None
        await db_session.flush()

        assert await access.resolve(document, author) == AccessLevel.ADMIN
