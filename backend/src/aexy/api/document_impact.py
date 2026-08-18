"""Which documented pages a pull request affects.

A separate router rather than more routes on `documents.py`: that file is 2500+
lines and carries an explicit warning that a literal path segment there collides
with `/{document_id}`. A distinct prefix sidesteps the whole class of problem.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.workspace_doc_impact_settings import CheckRunConclusion
from aexy.schemas.document_impact import (
    DocImpactResponse,
    DocImpactSettingsResponse,
    DocImpactSettingsUpdate,
    ImpactDismissRequest,
)
from aexy.services.document_impact_service import DocumentImpactService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/doc-impact", tags=["Documentation impact"]
)


async def _require(workspace_id: str, user: Developer, db: AsyncSession, role: str):
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(user.id), role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


@router.get("/settings", response_model=DocImpactSettingsResponse)
async def get_doc_impact_settings(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Whether Aexy writes into this workspace's pull requests.

    Readable by any member so the impact page can explain why a comment did not
    appear; only an admin may change it.
    """
    await _require(workspace_id, current_user, db, "viewer")
    return await DocumentImpactService(db).get_settings(workspace_id)


@router.put("/settings", response_model=DocImpactSettingsResponse)
async def update_doc_impact_settings(
    workspace_id: str,
    data: DocImpactSettingsUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Admin only.

    A pull request comment is one shared artifact that every reviewer sees, so it
    cannot be a per-developer preference — there is no honest way to reconcile
    four opinions about whether it exists. Admin because that is also who can
    grant the GitHub App permission it depends on.
    """
    await _require(workspace_id, current_user, db, "admin")

    if (
        data.check_run_conclusion is not None
        and data.check_run_conclusion not in CheckRunConclusion.ALL
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"check_run_conclusion must be one of {CheckRunConclusion.ALL}",
        )

    return await DocumentImpactService(db).update_settings(
        workspace_id,
        data.model_dump(exclude_unset=True),
        developer_id=str(current_user.id),
    )


@router.get("/{repository_id}/{pull_request_number}", response_model=DocImpactResponse)
async def get_document_impact(
    workspace_id: str,
    repository_id: str,
    pull_request_number: int,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """What this pull request affects, and specifically what to do about it.

    One entry per affected page: which of the pull request's files matched it,
    whether it is behind, and — the part nothing else in the product can answer —
    how many screenshots it carries and which sections they sit in.

    Returns 200 with `analyzed: false` when the pull request has never been
    evaluated, rather than 404. A pull request that touches no documented path is
    the ordinary case, and the client should not have to treat it as an error.
    """
    await _require(workspace_id, current_user, db, "viewer")

    return await DocumentImpactService(db).get_impact(
        workspace_id=workspace_id,
        repository_id=repository_id,
        pull_request_number=pull_request_number,
    )


@router.post(
    "/{repository_id}/{pull_request_number}/documents/{document_id}/dismiss",
    response_model=DocImpactResponse,
)
async def dismiss_document_impact(
    workspace_id: str,
    repository_id: str,
    pull_request_number: int,
    document_id: str,
    data: ImpactDismissRequest | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Say that this page needs no update for this pull request.

    The affordance the whole feature depends on. Without a way to say no, the
    only way to stop being asked is to mute the category — and then every other
    page goes quiet too.

    Scoped to this pull request, and narrow on purpose: it does **not** clear the
    page's own out-of-date badge. "No update needed for this change" is not "this
    page is in sync with all of its code".
    """
    await _require(workspace_id, current_user, db, "member")

    service = DocumentImpactService(db)
    found = await service.set_dismissed(
        workspace_id=workspace_id,
        repository_id=repository_id,
        pull_request_number=pull_request_number,
        document_id=document_id,
        developer_id=str(current_user.id),
        dismissed=True,
        reason=(data.reason if data else None),
    )
    if not found:
        # Unlike reading an unevaluated pull request, this is a real error: you
        # can only dismiss something you were shown.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This pull request does not affect that document",
        )

    return await service.get_impact(
        workspace_id=workspace_id,
        repository_id=repository_id,
        pull_request_number=pull_request_number,
    )


@router.delete(
    "/{repository_id}/{pull_request_number}/documents/{document_id}/dismiss",
    response_model=DocImpactResponse,
)
async def undismiss_document_impact(
    workspace_id: str,
    repository_id: str,
    pull_request_number: int,
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Undo a dismissal."""
    await _require(workspace_id, current_user, db, "member")

    service = DocumentImpactService(db)
    found = await service.set_dismissed(
        workspace_id=workspace_id,
        repository_id=repository_id,
        pull_request_number=pull_request_number,
        document_id=document_id,
        developer_id=str(current_user.id),
        dismissed=False,
    )
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This pull request does not affect that document",
        )

    return await service.get_impact(
        workspace_id=workspace_id,
        repository_id=repository_id,
        pull_request_number=pull_request_number,
    )
