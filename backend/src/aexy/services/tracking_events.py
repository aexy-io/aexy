"""Reusable dispatch helpers for tracking automation events.

Both the REST API (tracking.py) and Slack handlers (slack_tracking_service.py)
call the same dispatch logic here so event payloads stay consistent.

NOTE: dispatch_automation_event is imported lazily to avoid circular imports
(automation_service -> crm_automation_service -> slack_integration -> slack_tracking_service -> here).
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def _dispatch(db, workspace_id, trigger_type, entity_id, trigger_data) -> int:
    from aexy.services.automation_service import dispatch_automation_event
    return await dispatch_automation_event(
        db=db,
        workspace_id=workspace_id,
        module="tracking",
        trigger_type=trigger_type,
        entity_id=entity_id,
        trigger_data=trigger_data,
    )


async def emit_standup_submitted(db: AsyncSession, standup) -> int:
    """Emit standup.submitted automation event."""
    return await _dispatch(
        db=db,
        workspace_id=standup.workspace_id,
        trigger_type="standup.submitted",
        entity_id=standup.id,
        trigger_data={
            "developer_id": standup.developer_id,
            "team_id": standup.team_id,
            "standup_date": str(standup.standup_date),
            "yesterday_summary": standup.yesterday_summary or "",
            "today_plan": standup.today_plan or "",
            "blockers_summary": standup.blockers_summary or "",
        },
    )


async def emit_blocker_created(db: AsyncSession, blocker) -> int:
    """Emit blocker.created automation event."""
    return await _dispatch(
        db=db,
        workspace_id=blocker.workspace_id,
        trigger_type="blocker.created",
        entity_id=blocker.id,
        trigger_data={
            "developer_id": blocker.developer_id,
            "team_id": blocker.team_id,
            "description": blocker.description or "",
            "severity": blocker.severity or "",
            "task_id": blocker.task_id or "",
        },
    )


async def emit_blocker_escalated(db: AsyncSession, blocker) -> int:
    """Emit blocker.escalated automation event."""
    return await _dispatch(
        db=db,
        workspace_id=blocker.workspace_id,
        trigger_type="blocker.escalated",
        entity_id=blocker.id,
        trigger_data={
            "developer_id": blocker.developer_id,
            "escalated_to_id": blocker.escalated_to_id or "",
            "severity": blocker.severity or "",
            "description": blocker.description or "",
        },
    )


async def emit_blocker_resolved(db: AsyncSession, blocker) -> int:
    """Emit blocker.resolved automation event."""
    resolved_hours = None
    if blocker.resolved_at and blocker.created_at:
        delta = blocker.resolved_at - blocker.created_at
        resolved_hours = round(delta.total_seconds() / 3600, 1)

    return await _dispatch(
        db=db,
        workspace_id=blocker.workspace_id,
        trigger_type="blocker.resolved",
        entity_id=blocker.id,
        trigger_data={
            "developer_id": blocker.developer_id,
            "resolved_by_id": blocker.resolved_by_id or "",
            "time_to_resolve_hours": resolved_hours,
        },
    )


async def emit_time_entry_created(db: AsyncSession, entry) -> int:
    """Emit time_entry.created automation event."""
    return await _dispatch(
        db=db,
        workspace_id=entry.workspace_id,
        trigger_type="time_entry.created",
        entity_id=entry.id,
        trigger_data={
            "developer_id": entry.developer_id,
            "task_id": entry.task_id or "",
            "duration_minutes": entry.duration_minutes,
            "entry_date": str(entry.entry_date),
            "source": entry.source or "",
        },
    )


async def emit_work_log_submitted(db: AsyncSession, log) -> int:
    """Emit work_log.submitted automation event."""
    notes = (log.notes or "")[:500]
    return await _dispatch(
        db=db,
        workspace_id=log.workspace_id,
        trigger_type="work_log.submitted",
        entity_id=log.id,
        trigger_data={
            "developer_id": log.developer_id,
            "task_id": log.task_id or "",
            "log_type": log.log_type or "",
            "notes": notes,
        },
    )


async def emit_sentiment_negative(db: AsyncSession, standup, sentiment_score: float, concerns: str = "") -> int:
    """Emit sentiment.negative automation event."""
    return await _dispatch(
        db=db,
        workspace_id=standup.workspace_id,
        trigger_type="sentiment.negative",
        entity_id=standup.id,
        trigger_data={
            "developer_id": standup.developer_id,
            "team_id": standup.team_id,
            "sentiment_score": sentiment_score,
            "concerns": concerns,
        },
    )


async def emit_standup_streak(db: AsyncSession, standup, streak_count: int, milestone: int) -> int:
    """Emit standup.streak automation event."""
    return await _dispatch(
        db=db,
        workspace_id=standup.workspace_id,
        trigger_type="standup.streak",
        entity_id=standup.id,
        trigger_data={
            "developer_id": standup.developer_id,
            "team_id": standup.team_id,
            "streak_count": streak_count,
            "milestone": milestone,
        },
    )
