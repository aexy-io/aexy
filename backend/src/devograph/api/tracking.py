"""Tracking API endpoints for standups, work logs, time entries, and blockers."""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.api.developers import get_current_developer
from devograph.core.database import get_db
from devograph.models.developer import Developer
from devograph.models.sprint import Sprint, SprintTask
from devograph.models.team import Team, TeamMember
from devograph.models.tracking import (
    Blocker,
    BlockerStatus,
    DeveloperActivityPattern,
    DeveloperStandup,
    SlackChannelConfig,
    StandupSummary,
    TimeEntry,
    TrackingSource,
    WorkLog,
)
from devograph.schemas.tracking import (
    BlockerCreate,
    BlockerEscalation,
    BlockerListResponse,
    BlockerResolution,
    BlockerResponse,
    DeveloperActivityPatternResponse,
    DeveloperTimeReport,
    IndividualDashboard,
    SlackChannelConfigCreate,
    SlackChannelConfigResponse,
    SlackChannelConfigUpdate,
    SprintStandupSummary,
    SprintTimeReport,
    StandupCreate,
    StandupListResponse,
    StandupResponse,
    StandupSummaryResponse,
    StandupUpdate,
    TaskTimeReport,
    TeamActivityPatterns,
    TeamDashboard,
    TeamMemberStandupStatus,
    TimeEntryCreate,
    TimeEntryListResponse,
    TimeEntryResponse,
    TimeEntryUpdate,
    TodayStandupStatus,
    ActiveTaskSummary,
    WeeklySummary,
    WorkLogCreate,
    WorkLogListResponse,
    WorkLogResponse,
    WorkLogUpdate,
)

router = APIRouter(prefix="/tracking", tags=["tracking"])


# ==================== Helper Functions ====================


async def get_developer_team(
    developer_id: str, db: AsyncSession
) -> tuple[Team | None, str | None]:
    """Get the primary team and workspace for a developer."""
    result = await db.execute(
        select(TeamMember).where(TeamMember.developer_id == developer_id).limit(1)
    )
    member = result.scalar_one_or_none()
    if not member:
        return None, None

    team_result = await db.execute(select(Team).where(Team.id == member.team_id))
    team = team_result.scalar_one_or_none()
    return team, team.workspace_id if team else None


async def get_active_sprint(team_id: str, db: AsyncSession) -> Sprint | None:
    """Get the active sprint for a team."""
    result = await db.execute(
        select(Sprint).where(Sprint.team_id == team_id, Sprint.status == "active")
    )
    return result.scalar_one_or_none()


def standup_to_response(standup: DeveloperStandup) -> StandupResponse:
    """Convert DeveloperStandup model to response schema."""
    return StandupResponse(
        id=str(standup.id),
        developer_id=str(standup.developer_id),
        team_id=str(standup.team_id),
        sprint_id=str(standup.sprint_id) if standup.sprint_id else None,
        workspace_id=str(standup.workspace_id),
        standup_date=standup.standup_date,
        yesterday_summary=standup.yesterday_summary,
        today_plan=standup.today_plan,
        blockers_summary=standup.blockers_summary,
        source=standup.source,
        slack_message_ts=standup.slack_message_ts,
        slack_channel_id=standup.slack_channel_id,
        parsed_tasks=standup.parsed_tasks,
        parsed_blockers=standup.parsed_blockers,
        sentiment_score=standup.sentiment_score,
        productivity_signals=standup.productivity_signals,
        submitted_at=standup.submitted_at,
        created_at=standup.created_at,
        updated_at=standup.updated_at,
        developer_name=standup.developer.name if standup.developer else None,
        developer_avatar=standup.developer.avatar_url if standup.developer else None,
    )


def work_log_to_response(log: WorkLog) -> WorkLogResponse:
    """Convert WorkLog model to response schema."""
    return WorkLogResponse(
        id=str(log.id),
        developer_id=str(log.developer_id),
        task_id=str(log.task_id) if log.task_id else None,
        sprint_id=str(log.sprint_id) if log.sprint_id else None,
        workspace_id=str(log.workspace_id),
        notes=log.notes,
        log_type=log.log_type,
        source=log.source,
        slack_message_ts=log.slack_message_ts,
        slack_channel_id=log.slack_channel_id,
        external_task_ref=log.external_task_ref,
        logged_at=log.logged_at,
        created_at=log.created_at,
        developer_name=log.developer.name if log.developer else None,
        task_title=log.task.title if log.task else None,
    )


def time_entry_to_response(entry: TimeEntry) -> TimeEntryResponse:
    """Convert TimeEntry model to response schema."""
    return TimeEntryResponse(
        id=str(entry.id),
        developer_id=str(entry.developer_id),
        task_id=str(entry.task_id) if entry.task_id else None,
        sprint_id=str(entry.sprint_id) if entry.sprint_id else None,
        workspace_id=str(entry.workspace_id),
        duration_minutes=entry.duration_minutes,
        description=entry.description,
        entry_date=entry.entry_date,
        started_at=entry.started_at,
        ended_at=entry.ended_at,
        source=entry.source,
        slack_message_ts=entry.slack_message_ts,
        is_inferred=entry.is_inferred,
        confidence_score=entry.confidence_score,
        inference_metadata=entry.inference_metadata,
        external_task_ref=entry.external_task_ref,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        developer_name=entry.developer.name if entry.developer else None,
        task_title=entry.task.title if entry.task else None,
    )


def blocker_to_response(blocker: Blocker) -> BlockerResponse:
    """Convert Blocker model to response schema."""
    return BlockerResponse(
        id=str(blocker.id),
        developer_id=str(blocker.developer_id),
        task_id=str(blocker.task_id) if blocker.task_id else None,
        sprint_id=str(blocker.sprint_id) if blocker.sprint_id else None,
        team_id=str(blocker.team_id),
        workspace_id=str(blocker.workspace_id),
        description=blocker.description,
        severity=blocker.severity,
        category=blocker.category,
        status=blocker.status,
        resolved_at=blocker.resolved_at,
        resolution_notes=blocker.resolution_notes,
        resolved_by_id=str(blocker.resolved_by_id) if blocker.resolved_by_id else None,
        source=blocker.source,
        slack_message_ts=blocker.slack_message_ts,
        slack_channel_id=blocker.slack_channel_id,
        standup_id=str(blocker.standup_id) if blocker.standup_id else None,
        escalated_to_id=str(blocker.escalated_to_id) if blocker.escalated_to_id else None,
        escalated_at=blocker.escalated_at,
        escalation_notes=blocker.escalation_notes,
        external_task_ref=blocker.external_task_ref,
        reported_at=blocker.reported_at,
        created_at=blocker.created_at,
        updated_at=blocker.updated_at,
        developer_name=blocker.developer.name if blocker.developer else None,
        resolved_by_name=blocker.resolved_by.name if blocker.resolved_by else None,
        escalated_to_name=blocker.escalated_to.name if blocker.escalated_to else None,
        task_title=blocker.task.title if blocker.task else None,
    )


# ==================== Standup Endpoints ====================


@router.get("/standups/me", response_model=StandupListResponse)
async def get_my_standups(
    limit: int = Query(default=30, le=100),
    sprint_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get current developer's standup history."""
    query = select(DeveloperStandup).where(
        DeveloperStandup.developer_id == current_developer.id
    )
    if sprint_id:
        query = query.where(DeveloperStandup.sprint_id == sprint_id)

    query = query.order_by(DeveloperStandup.standup_date.desc()).limit(limit)
    result = await db.execute(query)
    standups = result.scalars().all()

    # Get total count
    count_query = select(func.count(DeveloperStandup.id)).where(
        DeveloperStandup.developer_id == current_developer.id
    )
    if sprint_id:
        count_query = count_query.where(DeveloperStandup.sprint_id == sprint_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    return StandupListResponse(
        standups=[standup_to_response(s) for s in standups],
        total=total,
        page=1,
        page_size=limit,
    )


@router.get("/standups/team/{team_id}", response_model=list[StandupResponse])
async def get_team_standups(
    team_id: str,
    standup_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get team standups for a date."""
    target_date = standup_date or date.today()

    result = await db.execute(
        select(DeveloperStandup)
        .where(
            DeveloperStandup.team_id == team_id,
            DeveloperStandup.standup_date == target_date,
        )
        .order_by(DeveloperStandup.submitted_at)
    )
    standups = result.scalars().all()
    return [standup_to_response(s) for s in standups]


@router.post("/standups", response_model=StandupResponse, status_code=status.HTTP_201_CREATED)
async def submit_standup(
    standup: StandupCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Submit a standup via API."""
    team, workspace_id = await get_developer_team(current_developer.id, db)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Developer is not assigned to any team",
        )

    target_date = standup.standup_date or date.today()

    # Check for existing standup
    existing = await db.execute(
        select(DeveloperStandup).where(
            DeveloperStandup.developer_id == current_developer.id,
            DeveloperStandup.standup_date == target_date,
        )
    )
    existing_standup = existing.scalar_one_or_none()

    if existing_standup:
        # Update existing
        existing_standup.yesterday_summary = standup.yesterday_summary
        existing_standup.today_plan = standup.today_plan
        existing_standup.blockers_summary = standup.blockers_summary
        existing_standup.source = standup.source.value
        await db.commit()
        await db.refresh(existing_standup)
        return standup_to_response(existing_standup)

    # Get active sprint
    sprint = await get_active_sprint(team.id, db)

    new_standup = DeveloperStandup(
        developer_id=current_developer.id,
        team_id=standup.team_id or team.id,
        sprint_id=standup.sprint_id or (sprint.id if sprint else None),
        workspace_id=workspace_id,
        standup_date=target_date,
        yesterday_summary=standup.yesterday_summary,
        today_plan=standup.today_plan,
        blockers_summary=standup.blockers_summary,
        source=standup.source.value,
    )
    db.add(new_standup)
    await db.commit()
    await db.refresh(new_standup)
    return standup_to_response(new_standup)


@router.get("/standups/summary/{sprint_id}", response_model=SprintStandupSummary)
async def get_sprint_standup_summary(
    sprint_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get aggregated standup summary for sprint."""
    # Get sprint
    sprint_result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = sprint_result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Get all summaries for this sprint
    summaries_result = await db.execute(
        select(StandupSummary)
        .where(StandupSummary.sprint_id == sprint_id)
        .order_by(StandupSummary.summary_date.desc())
    )
    summaries = summaries_result.scalars().all()

    # Count total standups
    total_result = await db.execute(
        select(func.count(DeveloperStandup.id)).where(
            DeveloperStandup.sprint_id == sprint_id
        )
    )
    total_standups = total_result.scalar() or 0

    # Calculate average participation
    if summaries:
        avg_participation = sum(s.participation_rate for s in summaries) / len(summaries)
    else:
        avg_participation = 0

    # Count blockers
    blockers_result = await db.execute(
        select(func.count(Blocker.id)).where(Blocker.sprint_id == sprint_id)
    )
    total_blockers = blockers_result.scalar() or 0

    resolved_result = await db.execute(
        select(func.count(Blocker.id)).where(
            Blocker.sprint_id == sprint_id,
            Blocker.status == BlockerStatus.RESOLVED.value,
        )
    )
    resolved_blockers = resolved_result.scalar() or 0

    return SprintStandupSummary(
        sprint_id=sprint_id,
        sprint_name=sprint.name,
        total_standups=total_standups,
        avg_participation_rate=avg_participation,
        daily_summaries=[
            StandupSummaryResponse.model_validate(s) for s in summaries[:30]
        ],
        total_blockers_reported=total_blockers,
        total_blockers_resolved=resolved_blockers,
    )


# ==================== Work Log Endpoints ====================


@router.get("/logs/me", response_model=WorkLogListResponse)
async def get_my_logs(
    limit: int = Query(default=50, le=100),
    task_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get current developer's work logs."""
    query = select(WorkLog).where(WorkLog.developer_id == current_developer.id)
    if task_id:
        query = query.where(WorkLog.task_id == task_id)

    query = query.order_by(WorkLog.logged_at.desc()).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    count_result = await db.execute(
        select(func.count(WorkLog.id)).where(
            WorkLog.developer_id == current_developer.id
        )
    )
    total = count_result.scalar() or 0

    return WorkLogListResponse(
        logs=[work_log_to_response(l) for l in logs],
        total=total,
        page=1,
        page_size=limit,
    )


@router.get("/logs/task/{task_id}", response_model=list[WorkLogResponse])
async def get_task_logs(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get work logs for a task."""
    result = await db.execute(
        select(WorkLog)
        .where(WorkLog.task_id == task_id)
        .order_by(WorkLog.logged_at.desc())
    )
    logs = result.scalars().all()
    return [work_log_to_response(l) for l in logs]


@router.post("/logs", response_model=WorkLogResponse, status_code=status.HTTP_201_CREATED)
async def create_work_log(
    log: WorkLogCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a work log."""
    team, workspace_id = await get_developer_team(current_developer.id, db)

    new_log = WorkLog(
        developer_id=current_developer.id,
        task_id=log.task_id,
        sprint_id=log.sprint_id,
        workspace_id=workspace_id or "",
        notes=log.notes,
        log_type=log.log_type.value,
        source=log.source.value,
        external_task_ref=log.external_task_ref,
    )
    db.add(new_log)
    await db.commit()
    await db.refresh(new_log)
    return work_log_to_response(new_log)


# ==================== Time Entry Endpoints ====================


@router.get("/time/me", response_model=TimeEntryListResponse)
async def get_my_time_entries(
    start_date: date | None = None,
    end_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get current developer's time entries."""
    query = select(TimeEntry).where(TimeEntry.developer_id == current_developer.id)

    if start_date:
        query = query.where(TimeEntry.entry_date >= start_date)
    if end_date:
        query = query.where(TimeEntry.entry_date <= end_date)

    query = query.order_by(TimeEntry.entry_date.desc())
    result = await db.execute(query)
    entries = result.scalars().all()

    total_minutes = sum(e.duration_minutes for e in entries)

    count_result = await db.execute(
        select(func.count(TimeEntry.id)).where(
            TimeEntry.developer_id == current_developer.id
        )
    )
    total = count_result.scalar() or 0

    return TimeEntryListResponse(
        entries=[time_entry_to_response(e) for e in entries],
        total=total,
        total_minutes=total_minutes,
        page=1,
        page_size=len(entries),
    )


@router.post("/time", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def log_time(
    entry: TimeEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Log time against a task."""
    team, workspace_id = await get_developer_team(current_developer.id, db)

    new_entry = TimeEntry(
        developer_id=current_developer.id,
        task_id=entry.task_id,
        sprint_id=entry.sprint_id,
        workspace_id=workspace_id or "",
        duration_minutes=entry.duration_minutes,
        description=entry.description,
        entry_date=entry.entry_date or date.today(),
        started_at=entry.started_at,
        ended_at=entry.ended_at,
        source=entry.source.value,
        external_task_ref=entry.external_task_ref,
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return time_entry_to_response(new_entry)


@router.get("/time/task/{task_id}", response_model=TaskTimeReport)
async def get_task_time(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get time logged for a task."""
    # Get task
    task_result = await db.execute(select(SprintTask).where(SprintTask.id == task_id))
    task = task_result.scalar_one_or_none()

    # Get entries
    result = await db.execute(
        select(TimeEntry)
        .where(TimeEntry.task_id == task_id)
        .order_by(TimeEntry.entry_date.desc())
    )
    entries = result.scalars().all()

    # Aggregate by developer
    by_developer: dict[str, dict] = {}
    for entry in entries:
        dev_id = str(entry.developer_id)
        if dev_id not in by_developer:
            by_developer[dev_id] = {
                "developer_id": dev_id,
                "developer_name": entry.developer.name if entry.developer else None,
                "minutes": 0,
            }
        by_developer[dev_id]["minutes"] += entry.duration_minutes

    return TaskTimeReport(
        task_id=task_id,
        task_title=task.title if task else None,
        total_minutes=sum(e.duration_minutes for e in entries),
        entry_count=len(entries),
        developers=list(by_developer.values()),
        entries=[time_entry_to_response(e) for e in entries],
    )


# ==================== Blocker Endpoints ====================


@router.get("/blockers/active", response_model=BlockerListResponse)
async def get_active_blockers(
    team_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get active blockers, optionally filtered by team."""
    query = select(Blocker).where(Blocker.status == BlockerStatus.ACTIVE.value)
    if team_id:
        query = query.where(Blocker.team_id == team_id)

    query = query.order_by(Blocker.reported_at.desc())
    result = await db.execute(query)
    blockers = result.scalars().all()

    # Count by status
    active = len([b for b in blockers if b.status == BlockerStatus.ACTIVE.value])
    resolved = 0  # We're filtering to active only
    escalated = len([b for b in blockers if b.status == BlockerStatus.ESCALATED.value])

    return BlockerListResponse(
        blockers=[blocker_to_response(b) for b in blockers],
        total=len(blockers),
        active_count=active,
        resolved_count=resolved,
        escalated_count=escalated,
        page=1,
        page_size=len(blockers),
    )


@router.post("/blockers", response_model=BlockerResponse, status_code=status.HTTP_201_CREATED)
async def report_blocker(
    blocker: BlockerCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Report a new blocker."""
    team, workspace_id = await get_developer_team(current_developer.id, db)

    new_blocker = Blocker(
        developer_id=current_developer.id,
        task_id=blocker.task_id,
        sprint_id=blocker.sprint_id,
        team_id=blocker.team_id or (team.id if team else ""),
        workspace_id=workspace_id or "",
        description=blocker.description,
        severity=blocker.severity.value,
        category=blocker.category.value,
        status=BlockerStatus.ACTIVE.value,
        source=blocker.source.value,
        external_task_ref=blocker.external_task_ref,
    )
    db.add(new_blocker)
    await db.commit()
    await db.refresh(new_blocker)
    return blocker_to_response(new_blocker)


@router.patch("/blockers/{blocker_id}/resolve", response_model=BlockerResponse)
async def resolve_blocker(
    blocker_id: str,
    resolution: BlockerResolution,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Mark blocker as resolved."""
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    blocker = result.scalar_one_or_none()
    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    from datetime import datetime

    blocker.status = BlockerStatus.RESOLVED.value
    blocker.resolved_at = datetime.utcnow()
    blocker.resolved_by_id = current_developer.id
    blocker.resolution_notes = resolution.resolution_notes

    await db.commit()
    await db.refresh(blocker)
    return blocker_to_response(blocker)


@router.patch("/blockers/{blocker_id}/escalate", response_model=BlockerResponse)
async def escalate_blocker(
    blocker_id: str,
    escalation: BlockerEscalation,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Escalate blocker to manager/team lead."""
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    blocker = result.scalar_one_or_none()
    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    from datetime import datetime

    blocker.status = BlockerStatus.ESCALATED.value
    blocker.escalated_at = datetime.utcnow()
    blocker.escalated_to_id = escalation.escalate_to_id
    blocker.escalation_notes = escalation.escalation_notes

    await db.commit()
    await db.refresh(blocker)
    return blocker_to_response(blocker)


# ==================== Dashboard Endpoints ====================


@router.get("/dashboard/me", response_model=IndividualDashboard)
async def get_my_tracking_dashboard(
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get individual tracking dashboard."""
    from datetime import datetime, timedelta

    today = date.today()
    week_start = today - timedelta(days=7)

    # Get today's standup
    standup_result = await db.execute(
        select(DeveloperStandup).where(
            DeveloperStandup.developer_id == current_developer.id,
            DeveloperStandup.standup_date == today,
        )
    )
    today_standup = standup_result.scalar_one_or_none()

    standup_status = TodayStandupStatus(
        submitted=today_standup is not None,
        standup_id=str(today_standup.id) if today_standup else None,
        submitted_at=today_standup.submitted_at if today_standup else None,
    )

    # Get team and sprint
    team, workspace_id = await get_developer_team(current_developer.id, db)
    sprint = await get_active_sprint(team.id, db) if team else None

    # Get active tasks
    active_tasks: list[ActiveTaskSummary] = []
    if sprint:
        tasks_result = await db.execute(
            select(SprintTask).where(
                SprintTask.sprint_id == sprint.id,
                SprintTask.assignee_id == current_developer.id,
                SprintTask.status.in_(["in_progress", "review"]),
            )
        )
        tasks = tasks_result.scalars().all()
        for task in tasks:
            # Get time logged for this task today
            time_today_result = await db.execute(
                select(func.sum(TimeEntry.duration_minutes)).where(
                    TimeEntry.task_id == task.id,
                    TimeEntry.entry_date == today,
                )
            )
            time_today = time_today_result.scalar() or 0

            # Get total time logged
            total_time_result = await db.execute(
                select(func.sum(TimeEntry.duration_minutes)).where(
                    TimeEntry.task_id == task.id
                )
            )
            total_time = total_time_result.scalar() or 0

            active_tasks.append(
                ActiveTaskSummary(
                    task_id=str(task.id),
                    task_title=task.title,
                    status=task.status,
                    time_logged_today=time_today,
                    total_time_logged=total_time,
                    last_activity=None,
                )
            )

    # Get active blockers
    blockers_result = await db.execute(
        select(Blocker).where(
            Blocker.developer_id == current_developer.id,
            Blocker.status == BlockerStatus.ACTIVE.value,
        )
    )
    active_blockers = [blocker_to_response(b) for b in blockers_result.scalars().all()]

    # Get time logged today
    time_today_result = await db.execute(
        select(func.sum(TimeEntry.duration_minutes)).where(
            TimeEntry.developer_id == current_developer.id,
            TimeEntry.entry_date == today,
        )
    )
    time_logged_today = time_today_result.scalar() or 0

    # Weekly summary
    standups_result = await db.execute(
        select(func.count(DeveloperStandup.id)).where(
            DeveloperStandup.developer_id == current_developer.id,
            DeveloperStandup.standup_date >= week_start,
        )
    )
    standups_submitted = standups_result.scalar() or 0

    weekly_time_result = await db.execute(
        select(func.sum(TimeEntry.duration_minutes)).where(
            TimeEntry.developer_id == current_developer.id,
            TimeEntry.entry_date >= week_start,
        )
    )
    weekly_time = weekly_time_result.scalar() or 0

    logs_result = await db.execute(
        select(func.count(WorkLog.id)).where(
            WorkLog.developer_id == current_developer.id,
            func.date(WorkLog.logged_at) >= week_start,
        )
    )
    logs_count = logs_result.scalar() or 0

    blockers_reported_result = await db.execute(
        select(func.count(Blocker.id)).where(
            Blocker.developer_id == current_developer.id,
            func.date(Blocker.reported_at) >= week_start,
        )
    )
    blockers_reported = blockers_reported_result.scalar() or 0

    blockers_resolved_result = await db.execute(
        select(func.count(Blocker.id)).where(
            Blocker.developer_id == current_developer.id,
            func.date(Blocker.resolved_at) >= week_start,
        )
    )
    blockers_resolved = blockers_resolved_result.scalar() or 0

    weekly_summary = WeeklySummary(
        standups_submitted=standups_submitted,
        standups_expected=5,  # Business days
        total_time_logged=weekly_time,
        work_logs_count=logs_count,
        blockers_reported=blockers_reported,
        blockers_resolved=blockers_resolved,
    )

    return IndividualDashboard(
        developer_id=str(current_developer.id),
        developer_name=current_developer.name,
        today_standup=standup_status,
        active_tasks=active_tasks,
        active_blockers=active_blockers,
        time_logged_today=time_logged_today,
        weekly_summary=weekly_summary,
        activity_pattern=None,
    )


@router.get("/dashboard/team/{team_id}", response_model=TeamDashboard)
async def get_team_tracking_dashboard(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get team tracking dashboard."""
    today = date.today()

    # Get team
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Get team members
    members_result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    )
    members = members_result.scalars().all()

    # Get today's standups
    standups_result = await db.execute(
        select(DeveloperStandup).where(
            DeveloperStandup.team_id == team_id,
            DeveloperStandup.standup_date == today,
        )
    )
    today_standups = {str(s.developer_id): s for s in standups_result.scalars().all()}

    # Build standup completion list
    standup_completion: list[TeamMemberStandupStatus] = []
    for member in members:
        dev_result = await db.execute(
            select(Developer).where(Developer.id == member.developer_id)
        )
        dev = dev_result.scalar_one_or_none()
        standup = today_standups.get(str(member.developer_id))

        standup_completion.append(
            TeamMemberStandupStatus(
                developer_id=str(member.developer_id),
                developer_name=dev.name if dev else "Unknown",
                developer_avatar=dev.avatar_url if dev else None,
                submitted=standup is not None,
                submitted_at=standup.submitted_at if standup else None,
            )
        )

    participation_rate = len(today_standups) / len(members) if members else 0

    # Get active blockers
    blockers_result = await db.execute(
        select(Blocker).where(
            Blocker.team_id == team_id,
            Blocker.status.in_([BlockerStatus.ACTIVE.value, BlockerStatus.ESCALATED.value]),
        )
    )
    active_blockers = [blocker_to_response(b) for b in blockers_result.scalars().all()]

    # Count by severity
    blockers_by_severity = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for blocker in active_blockers:
        blockers_by_severity[blocker.severity] = blockers_by_severity.get(blocker.severity, 0) + 1

    # Get time logged today
    time_result = await db.execute(
        select(func.sum(TimeEntry.duration_minutes))
        .join(TeamMember, TimeEntry.developer_id == TeamMember.developer_id)
        .where(
            TeamMember.team_id == team_id,
            TimeEntry.entry_date == today,
        )
    )
    total_time = time_result.scalar() or 0

    # Get recent work logs
    logs_result = await db.execute(
        select(WorkLog)
        .join(TeamMember, WorkLog.developer_id == TeamMember.developer_id)
        .where(
            TeamMember.team_id == team_id,
            func.date(WorkLog.logged_at) == today,
        )
        .order_by(WorkLog.logged_at.desc())
        .limit(10)
    )
    recent_logs = [work_log_to_response(l) for l in logs_result.scalars().all()]

    return TeamDashboard(
        team_id=team_id,
        team_name=team.name,
        today_date=today,
        standup_completion=standup_completion,
        participation_rate=participation_rate,
        active_blockers=active_blockers,
        blockers_by_severity=blockers_by_severity,
        sprint_progress=None,
        total_time_logged_today=total_time,
        recent_work_logs=recent_logs,
    )


# ==================== Channel Config Endpoints ====================


@router.get("/channels", response_model=list[SlackChannelConfigResponse])
async def get_channel_configs(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get all Slack channel configurations for a workspace."""
    result = await db.execute(
        select(SlackChannelConfig).where(
            SlackChannelConfig.workspace_id == workspace_id
        )
    )
    configs = result.scalars().all()
    return [SlackChannelConfigResponse.model_validate(c) for c in configs]


@router.post(
    "/channels", response_model=SlackChannelConfigResponse, status_code=status.HTTP_201_CREATED
)
async def create_channel_config(
    config: SlackChannelConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a new Slack channel configuration."""
    # Get workspace from team
    team_result = await db.execute(select(Team).where(Team.id == config.team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    new_config = SlackChannelConfig(
        integration_id=config.integration_id,
        team_id=config.team_id,
        workspace_id=team.workspace_id,
        channel_id=config.channel_id,
        channel_name=config.channel_name,
        channel_type=config.channel_type.value,
        auto_parse_standups=config.auto_parse_standups,
        auto_parse_task_refs=config.auto_parse_task_refs,
        auto_parse_blockers=config.auto_parse_blockers,
        standup_prompt_time=config.standup_prompt_time,
        standup_format_hint=config.standup_format_hint,
    )
    db.add(new_config)
    await db.commit()
    await db.refresh(new_config)
    return SlackChannelConfigResponse.model_validate(new_config)


@router.patch("/channels/{config_id}", response_model=SlackChannelConfigResponse)
async def update_channel_config(
    config_id: str,
    update: SlackChannelConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a Slack channel configuration."""
    result = await db.execute(
        select(SlackChannelConfig).where(SlackChannelConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Channel config not found")

    if update.channel_name is not None:
        config.channel_name = update.channel_name
    if update.channel_type is not None:
        config.channel_type = update.channel_type.value
    if update.auto_parse_standups is not None:
        config.auto_parse_standups = update.auto_parse_standups
    if update.auto_parse_task_refs is not None:
        config.auto_parse_task_refs = update.auto_parse_task_refs
    if update.auto_parse_blockers is not None:
        config.auto_parse_blockers = update.auto_parse_blockers
    if update.standup_prompt_time is not None:
        config.standup_prompt_time = update.standup_prompt_time
    if update.standup_format_hint is not None:
        config.standup_format_hint = update.standup_format_hint
    if update.is_active is not None:
        config.is_active = update.is_active

    await db.commit()
    await db.refresh(config)
    return SlackChannelConfigResponse.model_validate(config)


@router.delete("/channels/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a Slack channel configuration."""
    result = await db.execute(
        select(SlackChannelConfig).where(SlackChannelConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Channel config not found")

    await db.delete(config)
    await db.commit()
