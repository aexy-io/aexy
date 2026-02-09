"""Questionnaire import API endpoints."""

from collections import Counter

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.questionnaire import (
    QuestionnaireAnalyzeResult,
    QuestionnaireImportResult,
    QuestionnaireListResponse,
    QuestionnaireQuestionOut,
    QuestionnaireResponseOut,
    SkipSummary,
    SkippedQuestionOut,
)
from aexy.services.questionnaire_service import (
    QuestionnaireService,
    QuestionnaireServiceError,
)
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/questionnaires",
    tags=["Questionnaires"],
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {".xlsx", ".xls"}


async def _verify_workspace_access(
    workspace_id: str,
    developer: Developer,
    db: AsyncSession,
) -> None:
    """Verify the developer has access to the workspace."""
    ws_service = WorkspaceService(db)
    member = await ws_service.get_member(workspace_id, developer.id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )


@router.post("/upload", response_model=QuestionnaireImportResult)
async def upload_questionnaire(
    workspace_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Upload and parse an Excel questionnaire file."""
    await _verify_workspace_access(workspace_id, current_developer, db)

    # Validate file extension
    filename = file.filename or "unknown.xlsx"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read file bytes
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty",
        )

    service = QuestionnaireService(db)
    try:
        questionnaire, questions = await service.import_questionnaire(
            workspace_id=workspace_id,
            filename=filename,
            file_bytes=file_bytes,
            uploaded_by_id=current_developer.id,
        )
    except QuestionnaireServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    await db.commit()

    # Build domain stats
    domains = [q.domain for q in questions if q.domain and not q.is_section_header]
    domain_counts = dict(Counter(domains))
    unique_domains = sorted(set(domains))

    return QuestionnaireImportResult(
        questionnaire=QuestionnaireResponseOut.model_validate(questionnaire),
        questions_count=len(questions),
        domains=unique_domains,
        domain_counts=domain_counts,
    )


@router.post("/{questionnaire_id}/analyze", response_model=QuestionnaireAnalyzeResult)
async def analyze_questionnaire(
    workspace_id: str,
    questionnaire_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Generate reminder suggestions from a parsed questionnaire."""
    await _verify_workspace_access(workspace_id, current_developer, db)

    service = QuestionnaireService(db)
    try:
        suggestions_count, skipped_count, domains, skipped_details = await service.generate_suggestions(
            questionnaire_id=questionnaire_id,
            workspace_id=workspace_id,
        )
    except QuestionnaireServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    await db.commit()

    # Build skip summary from reason counts
    reason_counts = Counter(s.reason for s in skipped_details)
    skip_summary = SkipSummary(
        duplicates=reason_counts.get("duplicate", 0),
        negatives=reason_counts.get("negative", 0),
        blanks=reason_counts.get("blank", 0),
        headers=reason_counts.get("header", 0),
        other=reason_counts.get("no_suggestion", 0),
    )

    # Only return duplicates with their link info
    skipped_duplicates = [
        SkippedQuestionOut(
            question_text=s.question_text,
            domain=s.domain,
            reason=s.reason,
            duplicate_of_id=s.duplicate_of_id,
            duplicate_of_type=s.duplicate_of_type,
            duplicate_of_title=s.duplicate_of_title,
        )
        for s in skipped_details
        if s.reason == "duplicate"
    ]

    return QuestionnaireAnalyzeResult(
        questionnaire_id=questionnaire_id,
        suggestions_generated=suggestions_count,
        skipped_questions=skipped_count,
        domains_covered=domains,
        skip_summary=skip_summary,
        skipped_duplicates=skipped_duplicates,
    )


@router.get("/", response_model=QuestionnaireListResponse)
async def list_questionnaires(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List all imported questionnaires for a workspace."""
    await _verify_workspace_access(workspace_id, current_developer, db)

    service = QuestionnaireService(db)
    questionnaires = await service.list_questionnaires(workspace_id)

    return QuestionnaireListResponse(
        questionnaires=[QuestionnaireResponseOut.model_validate(q) for q in questionnaires],
        total=len(questionnaires),
    )


@router.get("/{questionnaire_id}", response_model=QuestionnaireResponseOut)
async def get_questionnaire(
    workspace_id: str,
    questionnaire_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a single questionnaire by ID."""
    await _verify_workspace_access(workspace_id, current_developer, db)

    service = QuestionnaireService(db)
    questionnaire = await service.get_questionnaire(questionnaire_id, workspace_id)

    if not questionnaire:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Questionnaire not found",
        )

    return QuestionnaireResponseOut.model_validate(questionnaire)


@router.get("/{questionnaire_id}/questions", response_model=list[QuestionnaireQuestionOut])
async def get_questionnaire_questions(
    workspace_id: str,
    questionnaire_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get all parsed questions for a questionnaire."""
    await _verify_workspace_access(workspace_id, current_developer, db)

    # Verify questionnaire exists in this workspace
    service = QuestionnaireService(db)
    questionnaire = await service.get_questionnaire(questionnaire_id, workspace_id)
    if not questionnaire:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Questionnaire not found",
        )

    questions = await service.get_questions(questionnaire_id)
    return [QuestionnaireQuestionOut.model_validate(q) for q in questions]


@router.delete("/{questionnaire_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_questionnaire(
    workspace_id: str,
    questionnaire_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a questionnaire and all its questions."""
    await _verify_workspace_access(workspace_id, current_developer, db)

    service = QuestionnaireService(db)
    deleted = await service.delete_questionnaire(questionnaire_id, workspace_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Questionnaire not found",
        )

    await db.commit()
