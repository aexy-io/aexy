"""Asking the AI to edit a Word document, and the settings that govern it.

A router of its own rather than more routes on `documents.py`: that file is
3000+ lines and carries an explicit warning that a literal path segment there
collides with `/{document_id}`. A distinct prefix sidesteps the whole class of
problem, the same reasoning `document_impact.py` gives.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.llm.gateway import resolve_effective_model
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.schemas.docx_ai import DocxAiSettingsResponse, DocxAiSettingsUpdate
from aexy.services import docx_ai_settings
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/docx-ai", tags=["Word AI editing"])


async def _require(
    workspace_id: str, user: Developer, db: AsyncSession, role: str
) -> None:
    if not await WorkspaceService(db).check_permission(
        workspace_id, str(user.id), role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


async def _response(
    settings: docx_ai_settings.DocxAiSettings, *, workspace_id: str, can_manage: bool
) -> DocxAiSettingsResponse:
    """The settings, plus which model a draft would actually run on.

    The model is not configured here — it is at ``/settings/ai/models``, with
    every other AI feature. It is *reported* here so an admin setting up Word
    editing can see the answer without leaving the page.
    """
    effective = await resolve_effective_model(workspace_id, "docs.docx_edit")
    return DocxAiSettingsResponse(
        **settings.to_dict(),
        can_manage=can_manage,
        effective_provider=effective[0] if effective else None,
        effective_model=effective[1] if effective else None,
    )


@router.get("/settings", response_model=DocxAiSettingsResponse)
async def get_docx_ai_settings(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> DocxAiSettingsResponse:
    """Readable by any member.

    The editor itself reads this — it decides whether to offer the Ask Aexy
    control at all, and what name to put on a replayed redline — so gating the
    read on an admin role would break the feature for everyone else.
    """
    await _require(workspace_id, current_user, db, "viewer")
    settings = await docx_ai_settings.get_settings(db, workspace_id)
    can_manage = await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "admin"
    )
    return await _response(
        settings, workspace_id=workspace_id, can_manage=can_manage
    )


@router.patch("/settings", response_model=DocxAiSettingsResponse)
async def update_docx_ai_settings(
    workspace_id: str,
    data: DocxAiSettingsUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> DocxAiSettingsResponse:
    """Admin only.

    Not a per-developer preference, because none of it is personal: the handle
    that triggers a draft, the name on a tracked change and the cap on how many
    changes one proposal may carry are all properties of the document everyone
    reviews. There is no honest way to reconcile four opinions about what the
    AI is called inside one file.
    """
    await _require(workspace_id, current_user, db, "admin")

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    current = docx_ai_settings.settings_for_workspace(workspace)
    changes = data.model_dump(exclude_unset=True)

    # Validated here rather than coerced, unlike the JSONB reader: a person is
    # waiting to be told their handle was rejected, and silently storing
    # something else is how a workspace ends up watching for a mention nobody
    # types.
    if "comment_trigger_handle" in changes:
        handle = docx_ai_settings.normalise_handle(changes["comment_trigger_handle"])
        if handle is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "The mention handle must start with a letter and use only "
                    "letters, digits, dots, dashes or underscores."
                ),
            )
        changes["comment_trigger_handle"] = handle

    if "ai_author_label" in changes:
        label = docx_ai_settings.normalise_author_label(changes["ai_author_label"])
        if label is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The AI needs a name to sign its changes with.",
            )
        changes["ai_author_label"] = label

    if "max_ops" in changes:
        max_ops = changes["max_ops"]
        if (
            not isinstance(max_ops, int)
            or not docx_ai_settings.MIN_MAX_OPS <= max_ops <= docx_ai_settings.MAX_MAX_OPS
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"The change limit must be between "
                    f"{docx_ai_settings.MIN_MAX_OPS} and "
                    f"{docx_ai_settings.MAX_MAX_OPS}."
                ),
            )

    updated = docx_ai_settings.DocxAiSettings(**{**current.to_dict(), **changes})
    # Reassigned rather than mutated: SQLAlchemy does not see an in-place edit
    # of a JSONB column, and the save would silently do nothing.
    workspace.settings = docx_ai_settings.merge_settings(workspace.settings, updated)
    await db.flush()

    return await _response(updated, workspace_id=workspace_id, can_manage=True)
