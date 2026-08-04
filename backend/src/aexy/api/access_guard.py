"""Reusable FastAPI dependencies for enforcing workspace app (module) access.

Workspace admins can disable a module for the whole workspace, but that toggle
was never enforced on the API — only the sidebar hid the module. These
dependencies close the API hole:

- ``require_app_access`` for routers whose paths carry ``{workspace_id}``.
- ``require_app_access_sprint_scoped`` for routers whose paths carry
  ``{sprint_id}``/``{team_id}`` and resolve the workspace server-side.
- ``require_app_access_document_scoped`` for routers whose paths carry
  ``{document_id}``.
- ``ensure_app_enabled`` for endpoints that resolve the workspace id
  themselves (body/query params, or via a referenced entity).
"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.app_definitions import APP_CATALOG
from aexy.models.developer import Developer
from aexy.models.permissions import PERMISSIONS
from aexy.models.documentation import Document
from aexy.models.sprint import Sprint
from aexy.models.team import Team
from aexy.services.app_access_service import AppAccessService


def _validate_app_id(app_id: str) -> None:
    """Fail loudly at import/startup: a typo'd app id would otherwise make the
    guard silently never enforce (check_workspace_app_enabled defaults to True
    for unknown ids)."""
    if app_id not in APP_CATALOG:
        raise ValueError(f"Unknown app id {app_id!r}: not in APP_CATALOG")


def _validate_permission(permission: str) -> None:
    """Fail loudly at import/startup on an unknown permission key.

    The mirror image of ``_validate_app_id``, and the more dangerous of the two:
    an unknown app id makes a guard permissive, but an unknown *permission* makes
    it absolute. Nobody can hold a permission that isn't in the catalogue, so a
    single typo here locks every user — including the workspace owner — out of the
    module, with a 403 that looks exactly like a legitimate denial.
    """
    if permission not in PERMISSIONS:
        raise ValueError(f"Unknown permission {permission!r}: not in PERMISSIONS")


async def ensure_app_enabled(
    db: AsyncSession, workspace_id: str, app_id: str
) -> None:
    """Raise 403 when `app_id` is disabled workspace-wide.

    The workspace-level module toggle only — it says nothing about *who* is
    asking, so it is the right check where there is no authenticated caller to
    ask about (the websocket-scoped guards below) and the wrong one everywhere
    else. Pair it with ``ensure_member_app_access``, which
    ``require_app_access`` does for you.
    """
    _validate_app_id(app_id)
    if not await AppAccessService(db).check_workspace_app_enabled(
        str(workspace_id), app_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"The {app_id} module is disabled for this workspace",
        )


async def ensure_member_app_access(
    db: AsyncSession, workspace_id: str, developer_id: str, app_id: str
) -> None:
    """Raise 403 when this member may not reach `app_id`.

    Per-member access used to be enforced nowhere: the sidebar hid an app the
    person's profile didn't grant, and the API answered for it anyway. So access
    control was a navigation filter, and anyone who kept a URL, used the API
    directly, or followed a link from a colleague walked straight in.

    Reads ``can_access`` rather than ``enabled``, so admins and owners keep reach
    over everything the workspace has enabled even when their own profile keeps
    it out of their sidebar — they have to be able to administer it.

    Resolution is served from a short-lived cache; see AppAccessService.
    """
    _validate_app_id(app_id)
    if not await AppAccessService(db).check_app_access(
        str(workspace_id), str(developer_id), app_id
    ):
        # Distinct from the workspace-disabled message on purpose: one means
        # "nobody here uses this", the other "ask an admin for it", and there is
        # a request flow behind the second.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"You do not have access to the {app_id} module. "
                "Request access from a workspace admin."
            ),
        )


def require_app_access(app_id: str):
    """Return a dependency that 403s unless the caller may reach `app_id`.

    Checks both layers, in the order that produces the more useful error:

    1. the workspace-wide module toggle — "this workspace does not use CRM";
    2. the caller's own effective access — "you do not have CRM".

    Requires the caller to be authenticated (via get_current_developer) and
    `{workspace_id}` in the route path, e.g.:

        api_router.include_router(
            crm_router, dependencies=[Depends(require_app_access("crm"))]
        )
    """
    _validate_app_id(app_id)

    async def _guard(
        workspace_id: str,
        current_developer: Developer = Depends(get_current_developer),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        await ensure_app_enabled(db, workspace_id, app_id)
        await ensure_member_app_access(
            db, workspace_id, str(current_developer.id), app_id
        )

    return _guard


def require_workspace_member(min_role: str = "member"):
    """Return a dependency that 403s unless the caller is an active member of
    ``{workspace_id}`` with at least ``min_role``.

    ``require_app_access`` now also checks the caller's own access, and a
    non-member resolves to no access at all — but it still says nothing about
    *role*, and an app with no explicit workspace setting defaults to enabled.
    Mount this alongside it when a router needs a role floor, or wants the
    clearer "not in this workspace" error rather than "no access to this module":

        api_router.include_router(
            service_desk_router,
            dependencies=[
                Depends(require_app_access("service_desk")),
                Depends(require_workspace_member()),
            ],
        )

    Role-level gates for individual mutating endpoints still belong on the
    endpoint (see ``PermissionService``); this is the baseline "are you even in
    this workspace" check.
    """
    async def _guard(
        workspace_id: str,
        current_developer: Developer = Depends(get_current_developer),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        from aexy.services.workspace_service import WorkspaceService

        if not await WorkspaceService(db).check_permission(
            str(workspace_id), str(current_developer.id), min_role
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this workspace",
            )

    return _guard


def require_workspace_permission(permission: str):
    """Return a dependency that 403s unless the caller holds ``permission``
    in ``{workspace_id}``.

    For the *view* half of a module's permission pair. The catalog can declare
    ``can_view_x`` and ``app_definitions`` can advertise it, but neither
    enforces anything — the permission is real only when a route checks it.
    Mount alongside ``require_workspace_member`` to gate a whole module::

        dependencies=[..., Depends(require_workspace_permission("can_view_org"))]

    Note this is coarser than row-level scoping: it decides whether the caller
    may open the module at all, not which rows they see.
    """
    _validate_permission(permission)

    async def _guard(
        workspace_id: str,
        current_developer: Developer = Depends(get_current_developer),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        from aexy.services.permission_service import PermissionService

        if not await PermissionService(db).check_permission(
            str(workspace_id), str(current_developer.id), permission
        ):
            # Name the permission: "you do not have permission" leaves an admin
            # guessing which of 61 to grant, and support guessing with them.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This requires the {permission!r} permission in this workspace",
            )

    return _guard


def require_workspace_permission_for_writes(permission: str):
    """Like ``require_workspace_permission``, but only for mutating requests.

    Settings routers are read by more than their own settings page: teams are
    listed by escalation routing, on-call rotations and standups; task statuses by
    every board; integrations by half the app. Gating a whole router on its
    ``can_manage_*`` permission would therefore break ordinary members' *reads* to
    protect writes nobody outside the settings page makes.

    So this enforces on POST/PUT/PATCH/DELETE and lets GET/HEAD/OPTIONS through to
    the baseline member check. One dependency per router closes the write hole
    without auditing several hundred individual endpoints — and unlike a
    per-endpoint gate, a route added later is covered automatically.

    Endpoints needing something stricter (owner-only deletes, row-level scoping)
    still add their own check; this is the floor, not the ceiling.
    """
    _validate_permission(permission)

    _SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

    async def _guard(
        request: Request,
        workspace_id: str,
        current_developer: Developer = Depends(get_current_developer),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        if request.method in _SAFE_METHODS:
            return

        from aexy.services.permission_service import PermissionService

        if not await PermissionService(db).check_permission(
            str(workspace_id), str(current_developer.id), permission
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Changing this requires the {permission!r} permission in this workspace"
                ),
            )

    return _guard


def require_app_access_sprint_scoped(app_id: str):
    """Like `require_app_access`, for routers whose paths carry `{sprint_id}`
    and/or `{team_id}` instead of `{workspace_id}` (sprint analytics, planning
    poker, retrospectives): resolves the workspace server-side.

    Deliberately does NOT depend on get_current_developer: planning poker's
    websocket authenticates via token after the handshake, and a bearer-header
    dependency would reject every browser websocket even when the app is
    enabled. Endpoint-level auth still applies. Unknown/missing ids are left
    for the endpoint to 404.

    Because there is no authenticated caller here, this checks the workspace
    toggle only — it cannot ask "may *this person* reach it". Per-member
    enforcement for these routes belongs at the endpoint, after the websocket
    has authenticated.
    """
    _validate_app_id(app_id)

    async def _guard(
        sprint_id: str | None = None,
        team_id: str | None = None,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        workspace_id = None
        if team_id:
            workspace_id = (
                await db.execute(select(Team.workspace_id).where(Team.id == team_id))
            ).scalar_one_or_none()
        elif sprint_id:
            workspace_id = (
                await db.execute(
                    select(Sprint.workspace_id).where(Sprint.id == sprint_id)
                )
            ).scalar_one_or_none()
        if workspace_id:
            await ensure_app_enabled(db, str(workspace_id), app_id)

    return _guard


def require_app_access_document_scoped(app_id: str):
    """Like `require_app_access`, for routers whose paths carry `{document_id}`
    (collaboration): resolves the document's workspace server-side.

    Auth-free for the same websocket reason as the sprint-scoped variant, and
    workspace-toggle-only for the same consequence.
    """
    _validate_app_id(app_id)

    async def _guard(
        document_id: str | None = None,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        if not document_id:
            return
        workspace_id = (
            await db.execute(
                select(Document.workspace_id).where(Document.id == document_id)
            )
        ).scalar_one_or_none()
        if workspace_id:
            await ensure_app_enabled(db, str(workspace_id), app_id)

    return _guard
