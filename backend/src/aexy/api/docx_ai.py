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
from aexy.schemas.docx_ai import (
    DocxAiEditRequest,
    DocxAiEditResponse,
    DocxAiSettingsResponse,
    DocxAiSettingsUpdate,
    IntakeCandidate,
    IntakeCreatedIssue,
    IntakeCreateRequest,
    IntakeCreateResponse,
    IntakePreviewRequest,
    IntakePreviewResponse,
)
from aexy.services import docx_ai_settings
from aexy.services.docx_ai_edit_service import (
    DocxAiDisabledError,
    DocxAiEditError,
    DocxAiEditService,
    DraftRequest,
)
from aexy.services.docx_intake_service import Candidate as IntakeService_Candidate
from aexy.services.docx_intake_service import (
    CreateOptions,
    DocxIntakeError,
    DocxIntakeService,
)
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


@router.post(
    "/documents/{document_id}/edit",
    response_model=DocxAiEditResponse,
    status_code=status.HTTP_201_CREATED,
)
async def request_docx_edit(
    workspace_id: str,
    document_id: str,
    data: DocxAiEditRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> DocxAiEditResponse:
    """Ask the AI to edit a Word document. The first of the three doors.

    Nothing is applied. The draft becomes a pending proposal in the same review
    queue a human edit goes through, which is the whole design: an AI edit to a
    document somebody signs off on should not be able to reach the file without a
    person seeing the redline first.

    ``member`` rather than ``admin``, and no notification on the synchronous
    path: whoever asked is looking at the answer. The background path is where
    the notification earns its place, because by then they have gone.
    """
    await _require(workspace_id, current_user, db, "member")

    request = DraftRequest(
        document_id=document_id,
        requested_by_id=str(current_user.id),
        instruction=data.instruction,
        selection_text=data.selection_text,
        scope=data.scope,  # type: ignore[arg-type]
        address_comments=data.address_comments or bool(data.comment_ids),
        comment_ids=tuple(data.comment_ids),
        # Recorded on the proposal so the review queue can say what caused it.
        # A reviewer looking at a redline needs to know whether a person typed
        # this instruction or a comment triggered it.
        trigger={
            "door": "request",
            "requested_by_id": str(current_user.id),
            "instruction": data.instruction,
        },
    )

    if data.background:
        # Long documents outlive an HTTP request, and a person who chose to wait
        # elsewhere gets told when it lands.
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue

        await dispatch(
            "draft_docx_ai_edit",
            {
                "document_id": document_id,
                "workspace_id": workspace_id,
                "requested_by_id": str(current_user.id),
                "instruction": data.instruction,
                "selection_text": data.selection_text,
                "scope": data.scope,
                "address_comments": request.address_comments,
                "comment_ids": list(data.comment_ids),
            },
            task_queue=TaskQueue.ANALYSIS,
            # One draft per person per document at a time. Two clicks on a slow
            # request should not produce two redlines of the same instruction.
            workflow_id=f"docx-ai-edit-{document_id}-{current_user.id}",
        )
        return DocxAiEditResponse(queued=True, review_url=f"/docs/{document_id}")

    try:
        proposal = await DocxAiEditService(db).draft_edit(request)
    except DocxAiDisabledError as exc:
        # A deliberate configuration, not a fault: 409 rather than 500, with the
        # workspace's own reason.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except DocxAiEditError as exc:
        # Every message on this path is written for a person to read — the
        # service says so — so it goes through verbatim.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    diff = proposal.diff_summary or {}
    return DocxAiEditResponse(
        proposal_id=str(proposal.id),
        summary=diff.get("summary"),
        change_count=diff.get("op_count"),
        review_url=f"/docs/{document_id}",
    )


@router.post(
    "/documents/{document_id}/intake/preview",
    response_model=IntakePreviewResponse,
)
async def preview_docx_intake(
    workspace_id: str,
    document_id: str,
    data: IntakePreviewRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> IntakePreviewResponse:
    """Propose issues from a Word document. Writes nothing.

    Step one of two, and the split is the point: these rows become work a team
    is measured against, so a model that mistook a heading for a deliverable must
    not be able to put a phantom task in somebody's sprint without a person
    seeing the list first.
    """
    await _require(workspace_id, current_user, db, "member")

    try:
        candidates = await DocxIntakeService(db).preview(
            document_id,
            tuple(data.sources),  # type: ignore[arg-type]
            requested_by_id=str(current_user.id),
        )
    except DocxIntakeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return IntakePreviewResponse(
        candidates=[IntakeCandidate(**vars(c)) for c in candidates]
    )


@router.post(
    "/documents/{document_id}/intake",
    response_model=IntakeCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_docx_intake(
    workspace_id: str,
    document_id: str,
    data: IntakeCreateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> IntakeCreateResponse:
    """Create the issues a person kept. Step two.

    The candidates come back from the client rather than being re-derived, so a
    second model run cannot quietly produce a different list than the one that
    was approved.
    """
    await _require(workspace_id, current_user, db, "member")

    try:
        created = await DocxIntakeService(db).create(
            document_id,
            data.target,  # type: ignore[arg-type]
            [
                IntakeService_Candidate(
                    title=c.title,
                    detail=c.detail,
                    source=c.source,  # type: ignore[arg-type]
                    kind=c.kind,
                    origin=c.origin,
                    comment_id=c.comment_id,
                    paragraph_index=c.paragraph_index,
                    as_a=c.as_a,
                    i_want=c.i_want,
                    so_that=c.so_that,
                )
                for c in data.candidates
            ],
            CreateOptions(
                sprint_id=data.sprint_id,
                form_id=data.form_id,
                default_persona=data.default_persona,
                labels=data.labels,
                assignee_id=data.assignee_id,
            ),
            created_by_id=str(current_user.id),
        )
    except DocxIntakeError as exc:
        # Every message here is written for a person: "Choose a sprint for these
        # tasks to go into" is the whole point of refusing rather than guessing.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    return IntakeCreateResponse(
        created=[IntakeCreatedIssue(**row) for row in created],
        target=data.target,
    )
