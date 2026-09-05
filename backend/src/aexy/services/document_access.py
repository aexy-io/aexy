"""One answer to "may this person touch this document".

Before this module the knowledge base had three access-control concepts —
``Document.visibility``, ``DocumentSpaceMember`` roles, and
``DocumentCollaborator`` grades — and enforced none of them on the read path.
``DocumentService.check_permission`` implemented the collaborator grade
correctly and was called only from the three endpoints that *manage*
collaborators, so a private document was readable by any workspace viewer who
knew its id, and search would tell them the id.

Two methods, because there are two shapes of the question and answering the
second one in Python is how the leak comes back:

``DocumentAccess.resolve``         one document, already loaded or by id.
``DocumentAccess.visible_clause``  a SQL predicate for list / tree / search.

Everything that reads or writes a document goes through one of them. A new
endpoint that forgets is a new leak, so the test matrix in
``tests/unit/test_document_access_matrix.py`` enumerates the endpoints rather
than the service.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum

from sqlalchemy import ColumnElement, and_, exists, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from aexy.models.workspace import WorkspaceMember
from aexy.services.workspace_service import ROLE_HIERARCHY, role_level


class AccessLevel(IntEnum):
    """Ordered so callers can compare rather than enumerate.

    Mirrors ``DocumentPermission`` but as a total order with an explicit
    bottom, so "no access" is a value rather than a ``None`` every caller has
    to remember to test.
    """

    NONE = 0
    VIEW = 1
    COMMENT = 2
    EDIT = 3
    ADMIN = 4

    @classmethod
    def from_permission(cls, permission: str | None) -> "AccessLevel":
        return {
            DocumentPermission.VIEW.value: cls.VIEW,
            DocumentPermission.COMMENT.value: cls.COMMENT,
            DocumentPermission.EDIT.value: cls.EDIT,
            DocumentPermission.ADMIN.value: cls.ADMIN,
        }.get(permission or "", cls.NONE)

    @classmethod
    def from_space_role(cls, role: str | None) -> "AccessLevel":
        return {
            DocumentSpaceRole.VIEWER.value: cls.VIEW,
            DocumentSpaceRole.EDITOR.value: cls.EDIT,
            DocumentSpaceRole.ADMIN.value: cls.ADMIN,
        }.get(role or "", cls.NONE)


#: Workspace roles that see everything in the workspace. Deliberately not
#: "member": a workspace member is a colleague, not an auditor, and the whole
#: point of a private document is that colleagues cannot read it.
_WORKSPACE_OVERRIDE_LEVEL = ROLE_HIERARCHY["admin"]


#: Where the per-request cache lives. `AsyncSession.info` is a plain dict
#: SQLAlchemy provides for exactly this, and `get_db` yields one session per
#: request — so hanging the cache off the session makes it request-scoped for
#: free, at every construction site, with no signature to thread through.
_CACHE_KEY = "aexy.document_access_cache"

#: A request resolves a handful of documents; a background job that holds one
#: session for a whole workspace could resolve thousands. Bounded so a
#: long-lived session cannot grow one of these without limit — cleared rather
#: than evicted, because an LRU here would cost more than the queries it saves.
_CACHE_LIMIT = 2048


@dataclass
class _AccessCache:
    workspace_level: dict[tuple[str, str], int] = field(default_factory=dict)
    #: (document_id, developer_id) -> (level, the document's own workspace id).
    #: The workspace rides along so a cache hit can still answer the tenancy
    #: assertion instead of bypassing it.
    resolved: dict[tuple[str, str], tuple[AccessLevel, str]] = field(
        default_factory=dict
    )

    def clear_if_large(self) -> None:
        if len(self.resolved) + len(self.workspace_level) > _CACHE_LIMIT:
            self.resolved.clear()
            self.workspace_level.clear()


class DocumentAccess:
    """Resolves effective access.

    Construct it freely: the cache lives on the *session*, not the instance, so
    two `DocumentAccess(db)` built in different layers of one request share it.
    That matters because access is deliberately checked twice on the hot path —
    `guard_document_route` is a router-level dependency that fails closed, and
    each endpoint then asks for the level it actually needs. Without a shared
    cache that is two identical resolutions, three queries each, on every
    document read.

    **Writes that change access must invalidate.** `resolve` is memoised for the
    life of the session, so a request that adds a collaborator and then re-reads
    access would otherwise get the answer from before its own write. The
    mutating service methods call `invalidate`; if you add another, so must it.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._cache = self._cache_for(db)

    @staticmethod
    def _cache_for(db: AsyncSession) -> _AccessCache:
        cache = db.info.get(_CACHE_KEY)
        if cache is None:
            cache = _AccessCache()
            db.info[_CACHE_KEY] = cache
        return cache

    @classmethod
    def invalidate(cls, db: AsyncSession, document_id: str | None = None) -> None:
        """Forget cached decisions after something that changes them.

        `document_id` drops just that document's entries; omitting it drops
        everything, which is what a workspace-membership or space-visibility
        change needs — those move the answer for documents this code has no
        list of.
        """
        cache = db.info.get(_CACHE_KEY)
        if cache is None:
            return
        if document_id is None:
            cache.resolved.clear()
            cache.workspace_level.clear()
            return
        key = str(document_id)
        for cached in [k for k in cache.resolved if k[0] == key]:
            del cache.resolved[cached]

    # ------------------------------------------------------------------
    # Workspace standing

    async def workspace_level(self, workspace_id: str, developer_id: str) -> int:
        """The caller's rank in the workspace, or 0 if they are not an active
        member. Cached per (workspace, developer) for the life of the request."""
        key = (workspace_id, developer_id)
        cached = self._cache.workspace_level.get(key)
        if cached is not None:
            return cached

        member = (
            await self.db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()

        level = 0
        if member is not None and member.status == "active":
            level = role_level(member)

        self._cache.workspace_level[key] = level
        self._cache.clear_if_large()
        return level

    # ------------------------------------------------------------------
    # Single document

    async def resolve(
        self,
        document: Document | str,
        developer_id: str,
        *,
        workspace_id: str | None = None,
        allow_deleted: bool = False,
    ) -> AccessLevel:
        """Effective access to one document.

        Accepts a loaded ``Document`` or an id. A deleted document resolves to
        ``NONE`` for everyone; ``allow_deleted`` asks the question the trash
        needs instead — *could this person have opened it before it was
        deleted?* Only the restore path passes it, and it must, because the
        alternative answers there are both wrong: refusing makes a document
        unrestorable by the person who deleted it, and checking workspace
        membership alone lets any colleague pull somebody's private page back
        out of the bin.

        ``workspace_id``, when given, is also an assertion: a document that
        belongs to a different workspace resolves to ``NONE`` rather than
        leaking the fact that the id exists.
        """
        document_id = str(document if isinstance(document, str) else document.id)
        cache_key = (document_id, str(developer_id))

        # A pre-deletion answer is never cached and never served from cache:
        # it is a different question from the one every other caller asks, and
        # sharing an entry between the two would leak the exemption.
        cached = None if allow_deleted else self._cache.resolved.get(cache_key)
        if cached is not None:
            level, owning_workspace = cached
            # The document's own workspace is cached beside the level so the
            # tenancy assertion is answered from cache rather than skipped by
            # it. Caching the level alone would make `resolve(id, dev)` and
            # `resolve(id, dev, workspace_id=<someone else's>)` share a result
            # — which is the cross-tenant check becoming a cache hit.
            if workspace_id is not None and owning_workspace != str(workspace_id):
                return AccessLevel.NONE
            return level

        if isinstance(document, str):
            doc = (
                await self.db.execute(
                    select(Document).where(Document.id == document)
                )
            ).scalar_one_or_none()
            if doc is None:
                return AccessLevel.NONE
        else:
            doc = document

        if doc.deleted_at is not None and not allow_deleted:
            # Not cached. A restore inside the same request would otherwise
            # keep answering NONE for a document that is no longer deleted.
            return AccessLevel.NONE

        if workspace_id is not None and str(doc.workspace_id) != str(workspace_id):
            return AccessLevel.NONE

        level = await self._resolve_uncached(doc, developer_id)
        if not allow_deleted:
            self._cache.resolved[cache_key] = (level, str(doc.workspace_id))
            self._cache.clear_if_large()
        return level

    async def _resolve_uncached(
        self, doc: Document, developer_id: str
    ) -> AccessLevel:
        ws_level = await self.workspace_level(str(doc.workspace_id), developer_id)
        if ws_level <= 0:
            # Not a member of the workspace at all. No document-level grant
            # can rescue this: collaborator rows are scoped to a workspace's
            # own people, and honouring one for an outsider would turn a share
            # into a tenancy hole.
            return AccessLevel.NONE

        if ws_level >= _WORKSPACE_OVERRIDE_LEVEL:
            return AccessLevel.ADMIN

        best = AccessLevel.NONE

        # The creator keeps admin on their own page, including a private one.
        if doc.created_by_id and str(doc.created_by_id) == str(developer_id):
            best = AccessLevel.ADMIN

        # Explicit collaborator grant. Deliberately evaluated even for a
        # private document: sharing one with a named person is what "private"
        # is supposed to permit, and it is the only grant that survives it.
        if best < AccessLevel.ADMIN:
            collaborator = (
                await self.db.execute(
                    select(DocumentCollaborator.permission).where(
                        DocumentCollaborator.document_id == doc.id,
                        DocumentCollaborator.developer_id == developer_id,
                    )
                )
            ).scalar_one_or_none()
            best = max(best, AccessLevel.from_permission(collaborator))

        if doc.visibility == DocumentVisibility.PRIVATE.value:
            # A private document is its creator's and whoever they named. Being
            # a member of the space it happens to sit in is not consent — the
            # space is where it is filed, not who it is for.
            return best

        # How far an *implicit* grant may go. A workspace viewer is read-only
        # everywhere by definition; giving them edit because a space happens to
        # be open would let a role that cannot create a document rewrite one.
        implicit_cap = (
            AccessLevel.EDIT
            if ws_level >= ROLE_HIERARCHY["member"]
            else AccessLevel.VIEW
        )

        if best < AccessLevel.ADMIN and doc.space_id:
            best = max(
                best,
                await self._space_level(str(doc.space_id), developer_id, implicit_cap),
            )
        elif not doc.space_id:
            # No space: workspace visibility alone decides.
            best = max(best, implicit_cap)

        return best

    async def _space_level(
        self,
        space_id: str,
        developer_id: str,
        implicit_cap: AccessLevel,
    ) -> AccessLevel:
        visibility = (
            await self.db.execute(
                select(DocumentSpace.visibility).where(DocumentSpace.id == space_id)
            )
        ).scalar_one_or_none()
        if visibility is None:
            return AccessLevel.NONE

        member_role = (
            await self.db.execute(
                select(DocumentSpaceMember.role).where(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()

        explicit = AccessLevel.from_space_role(member_role)
        if visibility == DocumentSpaceVisibility.RESTRICTED.value:
            # A restricted space is exactly its membership list. No implicit
            # floor — that is the entire difference between the two kinds.
            return explicit
        return max(explicit, implicit_cap)

    async def require(
        self,
        document: Document | str,
        developer_id: str,
        minimum: AccessLevel,
        *,
        workspace_id: str | None = None,
    ) -> AccessLevel:
        """``resolve`` that raises the right HTTP error instead of returning.

        404 rather than 403 when the caller has nothing at all: telling
        somebody that a document exists but is not theirs is itself a
        disclosure, and the search leak this module exists to close was exactly
        that fact made searchable.
        """
        from fastapi import HTTPException, status

        level = await self.resolve(document, developer_id, workspace_id=workspace_id)
        if level == AccessLevel.NONE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )
        if level < minimum:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This document requires {minimum.name.lower()} access",
            )
        return level

    # ------------------------------------------------------------------
    # Many documents

    async def visible_clause(
        self,
        workspace_id: str,
        developer_id: str,
        *,
        include_deleted: bool = False,
    ) -> ColumnElement[bool]:
        """A predicate for ``WHERE`` that keeps only documents this person may
        read.

        Returned as SQL rather than applied by filtering rows in Python so that
        ``LIMIT``/``OFFSET``, ranking and counts stay correct — a search that
        fetches 20 rows and then hides 12 of them is a broken pager as well as
        a leak waiting to be reintroduced.
        """
        base = Document.workspace_id == workspace_id
        if not include_deleted:
            base = and_(base, Document.deleted_at.is_(None))

        ws_level = await self.workspace_level(workspace_id, developer_id)
        if ws_level <= 0:
            return and_(base, false())
        if ws_level >= _WORKSPACE_OVERRIDE_LEVEL:
            return base

        # Mirrors `resolve` clause for clause. When you change one, change the
        # other and extend `test_document_access_matrix` — a listing that
        # disagrees with the detail endpoint is either a leak or a document
        # that appears in the sidebar and 404s when clicked.

        mine = Document.created_by_id == developer_id

        shared = exists().where(
            and_(
                DocumentCollaborator.document_id == Document.id,
                DocumentCollaborator.developer_id == developer_id,
            )
        )

        in_space_i_belong_to = exists().where(
            and_(
                DocumentSpaceMember.space_id == Document.space_id,
                DocumentSpaceMember.developer_id == developer_id,
            )
        )

        in_open_space = exists().where(
            and_(
                DocumentSpace.id == Document.space_id,
                DocumentSpace.visibility == DocumentSpaceVisibility.OPEN.value,
            )
        )

        not_private = Document.visibility != DocumentVisibility.PRIVATE.value

        return and_(
            base,
            or_(
                mine,
                shared,
                and_(
                    not_private,
                    or_(
                        Document.space_id.is_(None),
                        in_open_space,
                        in_space_i_belong_to,
                    ),
                ),
            ),
        )
