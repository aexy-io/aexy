"""Recurring reminders API endpoints."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.reminder import (
    # Reminder schemas
    ReminderCreate,
    ReminderUpdate,
    ReminderResponse,
    ReminderListResponse,
    ReminderFilters,
    ReminderStatusEnum,
    ReminderPriorityEnum,
    ReminderCategoryEnum,
    AssignmentStrategyEnum,
    # Instance schemas
    ReminderInstanceResponse,
    InstanceListResponse,
    InstanceFilters,
    InstanceStatusEnum,
    InstanceAcknowledge,
    InstanceComplete,
    InstanceSkip,
    InstanceReassign,
    # Control owner schemas
    ControlOwnerCreate,
    ControlOwnerUpdate,
    ControlOwnerResponse,
    ControlOwnerListResponse,
    # Domain team mapping schemas
    DomainTeamMappingCreate,
    DomainTeamMappingResponse,
    # Assignment rule schemas
    AssignmentRuleCreate,
    AssignmentRuleUpdate,
    AssignmentRuleResponse,
    # Suggestion schemas
    ReminderSuggestionResponse,
    SuggestionAccept,
    SuggestionReject,
    SuggestionListResponse,
    # Dashboard schemas
    ReminderDashboardStats,
    MyRemindersResponse,
    # Calendar schemas
    ReminderCalendarResponse,
    CalendarEvent,
    # Bulk operation schemas
    BulkAssign,
    BulkComplete,
    BulkOperationResult,
    # Embedded schemas
    DeveloperBrief,
    TeamBrief,
    ReminderBrief,
)
from aexy.services.reminder_service import (
    ReminderService,
    ReminderServiceError,
    ReminderNotFoundError,
    InstanceNotFoundError,
    InvalidStateError,
    InvalidConfigurationError,
)
from aexy.services.workspace_service import WorkspaceService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/reminders",
    tags=["Reminders"],
)


# =============================================================================
# Helper Functions
# =============================================================================

async def verify_workspace_access(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "viewer",
) -> WorkspaceService:
    """Verify the user has access to the workspace."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{required_role.capitalize()} permission required",
        )

    return workspace_service


def developer_to_brief(developer) -> DeveloperBrief | None:
    """Convert Developer to DeveloperBrief."""
    if not developer:
        return None
    return DeveloperBrief(
        id=str(developer.id),
        name=developer.name,
        email=developer.email,
        avatar_url=developer.avatar_url,
    )


def team_to_brief(team) -> TeamBrief | None:
    """Convert Team to TeamBrief."""
    if not team:
        return None
    return TeamBrief(
        id=str(team.id),
        name=team.name,
    )


def reminder_to_response(reminder) -> ReminderResponse:
    """Convert Reminder to response schema."""
    return ReminderResponse(
        id=str(reminder.id),
        workspace_id=str(reminder.workspace_id),
        title=reminder.title,
        description=reminder.description,
        category=reminder.category,
        priority=reminder.priority,
        status=reminder.status,
        frequency=reminder.frequency,
        cron_expression=reminder.cron_expression,
        timezone=reminder.timezone,
        start_date=reminder.start_date,
        end_date=reminder.end_date,
        next_occurrence=reminder.next_occurrence,
        assignment_strategy=reminder.assignment_strategy,
        default_owner_id=str(reminder.default_owner_id) if reminder.default_owner_id else None,
        default_owner=developer_to_brief(reminder.default_owner),
        default_team_id=str(reminder.default_team_id) if reminder.default_team_id else None,
        default_team=team_to_brief(reminder.default_team),
        domain=reminder.domain,
        escalation_config=reminder.escalation_config,
        notification_config=reminder.notification_config,
        requires_acknowledgment=reminder.requires_acknowledgment,
        requires_evidence=reminder.requires_evidence,
        source_type=reminder.source_type,
        source_id=str(reminder.source_id) if reminder.source_id else None,
        source_question_id=str(reminder.source_question_id) if reminder.source_question_id else None,
        extra_data=reminder.extra_data,
        created_by_id=str(reminder.created_by_id) if reminder.created_by_id else None,
        created_at=reminder.created_at,
        updated_at=reminder.updated_at,
    )


def instance_to_response(instance) -> ReminderInstanceResponse:
    """Convert ReminderInstance to response schema."""
    reminder_brief = None
    if instance.reminder:
        reminder_brief = ReminderBrief(
            id=str(instance.reminder.id),
            title=instance.reminder.title,
            category=instance.reminder.category,
            priority=instance.reminder.priority,
        )

    return ReminderInstanceResponse(
        id=str(instance.id),
        reminder_id=str(instance.reminder_id),
        due_date=instance.due_date,
        status=instance.status,
        current_escalation_level=instance.current_escalation_level,
        assigned_owner_id=str(instance.assigned_owner_id) if instance.assigned_owner_id else None,
        assigned_owner=developer_to_brief(instance.assigned_owner),
        assigned_team_id=str(instance.assigned_team_id) if instance.assigned_team_id else None,
        assigned_team=team_to_brief(instance.assigned_team),
        initial_notified_at=instance.initial_notified_at,
        last_notified_at=instance.last_notified_at,
        notification_count=instance.notification_count,
        acknowledged_at=instance.acknowledged_at,
        acknowledged_by_id=str(instance.acknowledged_by_id) if instance.acknowledged_by_id else None,
        acknowledged_by=developer_to_brief(instance.acknowledged_by) if hasattr(instance, 'acknowledged_by') else None,
        acknowledgment_notes=instance.acknowledgment_notes,
        completed_at=instance.completed_at,
        completed_by_id=str(instance.completed_by_id) if instance.completed_by_id else None,
        completed_by=developer_to_brief(instance.completed_by) if hasattr(instance, 'completed_by') else None,
        completion_notes=instance.completion_notes,
        skipped_at=instance.skipped_at,
        skipped_by_id=str(instance.skipped_by_id) if instance.skipped_by_id else None,
        skipped_by=developer_to_brief(instance.skipped_by) if hasattr(instance, 'skipped_by') else None,
        skip_reason=instance.skip_reason,
        evidence_links=instance.evidence_links,
        created_at=instance.created_at,
        updated_at=instance.updated_at,
        reminder=reminder_brief,
    )


def control_owner_to_response(control_owner) -> ControlOwnerResponse:
    """Convert ControlOwner to response schema."""
    return ControlOwnerResponse(
        id=str(control_owner.id),
        workspace_id=str(control_owner.workspace_id),
        control_id=control_owner.control_id,
        control_name=control_owner.control_name,
        domain=control_owner.domain,
        primary_owner_id=str(control_owner.primary_owner_id) if control_owner.primary_owner_id else None,
        primary_owner=developer_to_brief(control_owner.primary_owner),
        backup_owner_id=str(control_owner.backup_owner_id) if control_owner.backup_owner_id else None,
        backup_owner=developer_to_brief(control_owner.backup_owner),
        team_id=str(control_owner.team_id) if control_owner.team_id else None,
        team=team_to_brief(control_owner.team),
        created_at=control_owner.created_at,
        updated_at=control_owner.updated_at,
    )


def suggestion_to_response(suggestion) -> ReminderSuggestionResponse:
    """Convert ReminderSuggestion to response schema."""
    return ReminderSuggestionResponse(
        id=str(suggestion.id),
        workspace_id=str(suggestion.workspace_id),
        questionnaire_response_id=str(suggestion.questionnaire_response_id) if suggestion.questionnaire_response_id else None,
        question_id=str(suggestion.question_id) if suggestion.question_id else None,
        answer_text=suggestion.answer_text,
        suggested_title=suggestion.suggested_title,
        suggested_description=suggestion.suggested_description,
        suggested_category=suggestion.suggested_category,
        suggested_frequency=suggestion.suggested_frequency,
        suggested_domain=suggestion.suggested_domain,
        confidence_score=suggestion.confidence_score,
        status=suggestion.status,
        created_reminder_id=str(suggestion.created_reminder_id) if suggestion.created_reminder_id else None,
        reviewed_at=suggestion.reviewed_at,
        reviewed_by_id=str(suggestion.reviewed_by_id) if suggestion.reviewed_by_id else None,
        reviewed_by=developer_to_brief(suggestion.reviewed_by) if suggestion.reviewed_by else None,
        rejection_reason=suggestion.rejection_reason,
        created_at=suggestion.created_at,
    )


# =============================================================================
# Dashboard Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.get("/dashboard/stats", response_model=ReminderDashboardStats)
async def get_dashboard_stats(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics for reminders."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    stats = await service.get_dashboard_stats(workspace_id)

    return stats


@router.get("/my-reminders", response_model=MyRemindersResponse)
async def get_my_reminders(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get reminders assigned to the current user."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    data = await service.get_my_reminders(workspace_id, str(current_user.id))

    return MyRemindersResponse(
        assigned_to_me=[instance_to_response(i) for i in data["assigned_to_me"]],
        my_team_reminders=[instance_to_response(i) for i in data["my_team_reminders"]],
        overdue=[instance_to_response(i) for i in data["overdue"]],
        due_today=[instance_to_response(i) for i in data["due_today"]],
        due_this_week=[instance_to_response(i) for i in data["due_this_week"]],
    )


@router.get("/calendar", response_model=ReminderCalendarResponse)
async def get_calendar_view(
    workspace_id: str,
    start_date: datetime = Query(default_factory=lambda: datetime.now(timezone.utc).replace(day=1)),
    end_date: datetime = Query(default_factory=lambda: (datetime.now(timezone.utc).replace(day=1) + timedelta(days=32)).replace(day=1)),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get calendar view of reminder instances."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)

    filters = InstanceFilters(
        due_after=start_date,
        due_before=end_date,
    )

    instances, _ = await service.list_instances(
        workspace_id=workspace_id,
        filters=filters,
        page=1,
        page_size=1000,  # Get all for calendar
    )

    events = []
    for instance in instances:
        events.append(CalendarEvent(
            id=str(instance.id),
            reminder_id=str(instance.reminder_id),
            title=instance.reminder.title if instance.reminder else "",
            category=instance.reminder.category if instance.reminder else "",
            priority=instance.reminder.priority if instance.reminder else "",
            due_date=instance.due_date,
            status=instance.status,
            assigned_owner=developer_to_brief(instance.assigned_owner),
            assigned_team=team_to_brief(instance.assigned_team),
        ))

    return ReminderCalendarResponse(
        events=events,
        start_date=start_date,
        end_date=end_date,
    )


# =============================================================================
# Control Owner Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.get("/control-owners", response_model=ControlOwnerListResponse)
async def list_control_owners(
    workspace_id: str,
    domain: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List control owners for a workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    control_owners = await service.list_control_owners(workspace_id, domain)

    return ControlOwnerListResponse(
        control_owners=[control_owner_to_response(co) for co in control_owners],
        total=len(control_owners),
    )


@router.post("/control-owners", response_model=ControlOwnerResponse, status_code=status.HTTP_201_CREATED)
async def create_control_owner(
    workspace_id: str,
    data: ControlOwnerCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a control owner mapping."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)
    control_owner = await service.create_control_owner(workspace_id, data)

    await db.commit()
    return control_owner_to_response(control_owner)


@router.patch("/control-owners/{control_owner_id}", response_model=ControlOwnerResponse)
async def update_control_owner(
    workspace_id: str,
    control_owner_id: str,
    data: ControlOwnerUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a control owner mapping."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)
    control_owner = await service.update_control_owner(control_owner_id, data)

    if not control_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Control owner not found",
        )

    await db.commit()
    return control_owner_to_response(control_owner)


@router.delete("/control-owners/{control_owner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_control_owner(
    workspace_id: str,
    control_owner_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a control owner mapping."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    if not await service.delete_control_owner(control_owner_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Control owner not found",
        )

    await db.commit()


# =============================================================================
# Domain Team Mapping Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.get("/domain-team-mappings", response_model=list[DomainTeamMappingResponse])
async def list_domain_team_mappings(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List domain team mappings for a workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    mappings = await service.list_domain_team_mappings(workspace_id)

    return [
        DomainTeamMappingResponse(
            id=str(m.id),
            workspace_id=str(m.workspace_id),
            domain=m.domain,
            team_id=str(m.team_id),
            team=team_to_brief(m.team),
            priority=m.priority,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in mappings
    ]


@router.post("/domain-team-mappings", response_model=DomainTeamMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_domain_team_mapping(
    workspace_id: str,
    data: DomainTeamMappingCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a domain team mapping."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)
    mapping = await service.create_domain_team_mapping(workspace_id, data)

    await db.commit()

    return DomainTeamMappingResponse(
        id=str(mapping.id),
        workspace_id=str(mapping.workspace_id),
        domain=mapping.domain,
        team_id=str(mapping.team_id),
        team=team_to_brief(mapping.team),
        priority=mapping.priority,
        created_at=mapping.created_at,
        updated_at=mapping.updated_at,
    )


@router.delete("/domain-team-mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain_team_mapping(
    workspace_id: str,
    mapping_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a domain team mapping."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    if not await service.delete_domain_team_mapping(mapping_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain team mapping not found",
        )

    await db.commit()


# =============================================================================
# Assignment Rule Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.get("/assignment-rules", response_model=list[AssignmentRuleResponse])
async def list_assignment_rules(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List assignment rules for a workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    rules = await service.list_assignment_rules(workspace_id)

    return [
        AssignmentRuleResponse(
            id=str(r.id),
            workspace_id=str(r.workspace_id),
            name=r.name,
            description=r.description,
            rule_config=r.rule_config,
            priority=r.priority,
            is_active=r.is_active,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rules
    ]


@router.post("/assignment-rules", response_model=AssignmentRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment_rule(
    workspace_id: str,
    data: AssignmentRuleCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an assignment rule."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)
    rule = await service.create_assignment_rule(workspace_id, data)

    await db.commit()

    return AssignmentRuleResponse(
        id=str(rule.id),
        workspace_id=str(rule.workspace_id),
        name=rule.name,
        description=rule.description,
        rule_config=rule.rule_config,
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.patch("/assignment-rules/{rule_id}", response_model=AssignmentRuleResponse)
async def update_assignment_rule(
    workspace_id: str,
    rule_id: str,
    data: AssignmentRuleUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an assignment rule."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)
    rule = await service.update_assignment_rule(rule_id, data)

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment rule not found",
        )

    await db.commit()

    return AssignmentRuleResponse(
        id=str(rule.id),
        workspace_id=str(rule.workspace_id),
        name=rule.name,
        description=rule.description,
        rule_config=rule.rule_config,
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.delete("/assignment-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment_rule(
    workspace_id: str,
    rule_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an assignment rule."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    if not await service.delete_assignment_rule(rule_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment rule not found",
        )

    await db.commit()


# =============================================================================
# Suggestion Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.get("/suggestions", response_model=SuggestionListResponse)
async def list_suggestions(
    workspace_id: str,
    status: str | None = None,
    questionnaire_response_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List reminder suggestions."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    suggestions = await service.list_suggestions(
        workspace_id=workspace_id,
        status=status,
        questionnaire_response_id=questionnaire_response_id,
    )

    return SuggestionListResponse(
        suggestions=[suggestion_to_response(s) for s in suggestions],
        total=len(suggestions),
    )


@router.post("/suggestions/{suggestion_id}/accept", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def accept_suggestion(
    workspace_id: str,
    suggestion_id: str,
    data: SuggestionAccept,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Accept a reminder suggestion and create a reminder."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        suggestion, reminder = await service.accept_suggestion(
            suggestion_id=suggestion_id,
            data=data,
            accepted_by_id=str(current_user.id),
        )
    except ReminderServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return reminder_to_response(reminder)


@router.post("/suggestions/{suggestion_id}/reject", response_model=ReminderSuggestionResponse)
async def reject_suggestion(
    workspace_id: str,
    suggestion_id: str,
    data: SuggestionReject,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reject a reminder suggestion."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        suggestion = await service.reject_suggestion(
            suggestion_id=suggestion_id,
            data=data,
            rejected_by_id=str(current_user.id),
        )
    except ReminderServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return suggestion_to_response(suggestion)


# =============================================================================
# Bulk Operation Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.post("/bulk/assign", response_model=BulkOperationResult)
async def bulk_assign(
    workspace_id: str,
    data: BulkAssign,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk assign reminder instances."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    success_count = 0
    failed_count = 0
    failed_ids = []
    errors = {}

    for instance_id in data.instance_ids:
        try:
            await service.reassign_instance(
                instance_id=instance_id,
                data=InstanceReassign(
                    new_owner_id=data.owner_id,
                    new_team_id=data.team_id,
                ),
            )
            success_count += 1
        except (InstanceNotFoundError, InvalidStateError) as e:
            failed_count += 1
            failed_ids.append(instance_id)
            errors[instance_id] = str(e)

    await db.commit()

    return BulkOperationResult(
        success_count=success_count,
        failed_count=failed_count,
        failed_ids=failed_ids,
        errors=errors,
    )


@router.post("/bulk/complete", response_model=BulkOperationResult)
async def bulk_complete(
    workspace_id: str,
    data: BulkComplete,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk complete reminder instances."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    success_count = 0
    failed_count = 0
    failed_ids = []
    errors = {}

    for instance_id in data.instance_ids:
        try:
            await service.complete_instance(
                instance_id=instance_id,
                completed_by_id=str(current_user.id),
                data=InstanceComplete(notes=data.notes),
            )
            success_count += 1
        except (InstanceNotFoundError, InvalidStateError) as e:
            failed_count += 1
            failed_ids.append(instance_id)
            errors[instance_id] = str(e)

    await db.commit()

    return BulkOperationResult(
        success_count=success_count,
        failed_count=failed_count,
        failed_ids=failed_ids,
        errors=errors,
    )


# =============================================================================
# Instance Action Endpoints (MUST be defined before /{reminder_id} routes)
# =============================================================================

@router.post("/instances/{instance_id}/acknowledge", response_model=ReminderInstanceResponse)
async def acknowledge_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceAcknowledge,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        instance = await service.acknowledge_instance(
            instance_id=instance_id,
            acknowledged_by_id=str(current_user.id),
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


@router.post("/instances/{instance_id}/complete", response_model=ReminderInstanceResponse)
async def complete_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceComplete,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Complete a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        instance = await service.complete_instance(
            instance_id=instance_id,
            completed_by_id=str(current_user.id),
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


@router.post("/instances/{instance_id}/skip", response_model=ReminderInstanceResponse)
async def skip_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceSkip,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Skip a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        instance = await service.skip_instance(
            instance_id=instance_id,
            skipped_by_id=str(current_user.id),
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


@router.post("/instances/{instance_id}/reassign", response_model=ReminderInstanceResponse)
async def reassign_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceReassign,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reassign a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    try:
        instance = await service.reassign_instance(
            instance_id=instance_id,
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


# =============================================================================
# Reminder CRUD Endpoints
# =============================================================================

@router.get("", response_model=ReminderListResponse)
async def list_reminders(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: list[ReminderStatusEnum] | None = Query(default=None),
    category: list[ReminderCategoryEnum] | None = Query(default=None),
    priority: list[ReminderPriorityEnum] | None = Query(default=None),
    assignment_strategy: list[AssignmentStrategyEnum] | None = Query(default=None),
    domain: str | None = None,
    owner_id: str | None = None,
    team_id: str | None = None,
    search: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List reminders in a workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    filters = ReminderFilters(
        status=status,
        category=category,
        priority=priority,
        assignment_strategy=assignment_strategy,
        domain=domain,
        owner_id=owner_id,
        team_id=team_id,
        search=search,
    )

    service = ReminderService(db)
    reminders, total = await service.list_reminders(
        workspace_id=workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return ReminderListResponse(
        reminders=[reminder_to_response(r) for r in reminders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    workspace_id: str,
    data: ReminderCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new reminder."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        reminder = await service.create_reminder(
            workspace_id=workspace_id,
            data=data,
            created_by_id=str(current_user.id),
        )
    except InvalidConfigurationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return reminder_to_response(reminder)


@router.get("/{reminder_id}", response_model=ReminderResponse)
async def get_reminder(
    workspace_id: str,
    reminder_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a reminder by ID."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)
    reminder = await service.get_reminder(reminder_id)

    if not reminder or str(reminder.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found",
        )

    return reminder_to_response(reminder)


@router.patch("/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(
    workspace_id: str,
    reminder_id: str,
    data: ReminderUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a reminder."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    # Verify reminder belongs to workspace
    existing = await service.get_reminder(reminder_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found",
        )

    try:
        reminder = await service.update_reminder(reminder_id, data)
    except InvalidConfigurationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return reminder_to_response(reminder)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    workspace_id: str,
    reminder_id: str,
    hard: bool = Query(default=False),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete (archive) a reminder."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    # Verify reminder belongs to workspace
    existing = await service.get_reminder(reminder_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found",
        )

    if hard:
        await service.delete_reminder(reminder_id)
    else:
        await service.archive_reminder(reminder_id)

    await db.commit()


# =============================================================================
# Instance Endpoints
# =============================================================================

@router.get("/{reminder_id}/instances", response_model=InstanceListResponse)
async def list_instances(
    workspace_id: str,
    reminder_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: list[InstanceStatusEnum] | None = Query(default=None),
    assigned_owner_id: str | None = None,
    assigned_team_id: str | None = None,
    due_before: datetime | None = None,
    due_after: datetime | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List instances for a reminder."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = ReminderService(db)

    # Verify reminder belongs to workspace
    reminder = await service.get_reminder(reminder_id)
    if not reminder or str(reminder.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found",
        )

    filters = InstanceFilters(
        status=status,
        assigned_owner_id=assigned_owner_id,
        assigned_team_id=assigned_team_id,
        due_before=due_before,
        due_after=due_after,
    )

    instances, total = await service.list_instances(
        reminder_id=reminder_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return InstanceListResponse(
        instances=[instance_to_response(i) for i in instances],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/instances/{instance_id}/acknowledge", response_model=ReminderInstanceResponse)
async def acknowledge_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceAcknowledge,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Acknowledge a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        instance = await service.acknowledge_instance(
            instance_id=instance_id,
            acknowledged_by_id=str(current_user.id),
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


@router.post("/instances/{instance_id}/complete", response_model=ReminderInstanceResponse)
async def complete_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceComplete,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Complete a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        instance = await service.complete_instance(
            instance_id=instance_id,
            completed_by_id=str(current_user.id),
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


@router.post("/instances/{instance_id}/skip", response_model=ReminderInstanceResponse)
async def skip_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceSkip,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Skip a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = ReminderService(db)

    try:
        instance = await service.skip_instance(
            instance_id=instance_id,
            skipped_by_id=str(current_user.id),
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)


@router.post("/instances/{instance_id}/reassign", response_model=ReminderInstanceResponse)
async def reassign_instance(
    workspace_id: str,
    instance_id: str,
    data: InstanceReassign,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reassign a reminder instance."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = ReminderService(db)

    try:
        instance = await service.reassign_instance(
            instance_id=instance_id,
            data=data,
        )
    except InstanceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instance not found",
        )
    except InvalidStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return instance_to_response(instance)

