"""Aexy Tracker — Q&A over a developer's own work history (docs/aexy-tracker.md §5.5).

A synchronous, individual-scoped endpoint: compile the developer's recent
tracker artifacts (daily journals + inferred time entries) into context and let
the LLM answer natural-language questions ("what did I ship last week?",
"draft my standup"). Read-only; never touches another user's data.
"""

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask
from aexy.models.tracking import TimeEntry, TrackingSource, WorkLog
from aexy.schemas.tracker_ingest import (
    TrackerCandidateTask,
    TrackerEntryUpdateRequest,
    TrackerEntryUpdateResponse,
    TrackerQARequest,
    TrackerQAResponse,
    TrackerTimesheetDay,
    TrackerTimesheetEntry,
    TrackerTimesheetResponse,
)
from aexy.temporal.activities.tracker_enrich import _candidate_tasks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tracker", tags=["tracker-qa"])

_JOURNAL_PREFIX = "tracker-journal:"
_MAX_TIME_ENTRIES = 200


def _build_context(journals: list[WorkLog], entries: list[TimeEntry]) -> str:
    parts: list[str] = []
    if journals:
        parts.append("## Daily journals")
        for j in journals:
            day = j.external_task_ref.split(":")[-1] if j.external_task_ref else ""
            parts.append(f"### {day}\n{j.notes}")
    if entries:
        parts.append("\n## Attributed time entries")
        for e in entries:
            task = e.task_id or "unattributed"
            parts.append(
                f"- {e.entry_date} · {e.duration_minutes}m · task={task} · {e.description or ''}"
            )
    return "\n".join(parts) if parts else "(no tracked activity in this window)"


@router.post("/qa", response_model=TrackerQAResponse)
async def tracker_qa(
    data: TrackerQARequest,
    developer: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Answer a natural-language question over the caller's tracker history."""
    from aexy.llm.gateway import get_llm_gateway

    gateway = get_llm_gateway()
    if gateway is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "AI gateway not configured"
        )

    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=data.days)
    cutoff_date = cutoff_dt.date()

    journals = list(
        (
            await db.execute(
                select(WorkLog)
                .where(
                    WorkLog.developer_id == developer.id,
                    WorkLog.external_task_ref.like(f"{_JOURNAL_PREFIX}%"),
                    WorkLog.logged_at >= cutoff_dt,
                )
                .order_by(WorkLog.logged_at)
            )
        )
        .scalars()
        .all()
    )

    entries = list(
        (
            await db.execute(
                select(TimeEntry)
                .where(
                    TimeEntry.developer_id == developer.id,
                    TimeEntry.is_inferred.is_(True),
                    TimeEntry.source == TrackingSource.INFERRED.value,
                    TimeEntry.entry_date >= cutoff_date,
                )
                .order_by(TimeEntry.entry_date)
                .limit(_MAX_TIME_ENTRIES)
            )
        )
        .scalars()
        .all()
    )

    context = _build_context(journals, entries)
    system = (
        "You answer questions about a single engineer's own work, using ONLY the "
        "provided journals and time entries. Be concise and specific; cite dates "
        "and task ids where relevant. If the data doesn't cover the question, say "
        "so plainly rather than guessing. If asked to draft a standup, use "
        "yesterday/today/blockers structure."
    )
    user = (
        f"Question: {data.question}\n\n"
        f"Here is my tracked work over the last {data.days} day(s):\n\n{context}"
    )

    answer, *_ = await gateway.call_llm(
        system_prompt=system,
        user_prompt=user,
        tokens_estimate=3000,
        developer_id=developer.id,
        db=db,
        feature="insights.tracker_qa",
    )

    return TrackerQAResponse(
        answer=(answer or "").strip(),
        days=data.days,
        journals_used=len(journals),
        time_entries_used=len(entries),
    )


def _parse_date(value: str | None, default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid date (use YYYY-MM-DD)") from e


async def build_timesheet(
    db: AsyncSession, developer_id: str, start_date: date, end_date: date
) -> TrackerTimesheetResponse:
    """Build the auto-attributed timesheet (inferred entries + journals, grouped
    by day) for one developer. Shared by the self endpoint and the admin
    record-viewer (api/tracker_admin.py); the caller is responsible for authz."""
    # Inferred time entries (with task title eager-loaded).
    entries = list(
        (
            await db.execute(
                select(TimeEntry)
                .options(selectinload(TimeEntry.task))
                .where(
                    TimeEntry.developer_id == developer_id,
                    TimeEntry.is_inferred.is_(True),
                    TimeEntry.source == TrackingSource.INFERRED.value,
                    TimeEntry.entry_date >= start_date,
                    TimeEntry.entry_date <= end_date,
                    # Dismissed entries are rejected by the user — hide them.
                    or_(
                        TimeEntry.attribution_status.is_(None),
                        TimeEntry.attribution_status != "dismissed",
                    ),
                )
                .order_by(TimeEntry.entry_date, TimeEntry.started_at)
            )
        )
        .scalars()
        .all()
    )

    # Daily journals keyed by date string parsed from the dedupe ref.
    journals = list(
        (
            await db.execute(
                select(WorkLog).where(
                    WorkLog.developer_id == developer_id,
                    WorkLog.external_task_ref.like("tracker-journal:%"),
                    WorkLog.logged_at
                    >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
                    # Upper bound: journals are stamped at end-of-day, so bound by
                    # the day after end_date to keep results inside the window.
                    WorkLog.logged_at
                    < datetime.combine(
                        end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    journal_by_date: dict[str, str] = {}
    for j in journals:
        if j.external_task_ref:
            journal_by_date[j.external_task_ref.split(":")[-1]] = j.notes

    by_day: dict[str, list[TimeEntry]] = defaultdict(list)
    for e in entries:
        by_day[e.entry_date.isoformat()].append(e)

    days: list[TrackerTimesheetDay] = []
    total_minutes = 0
    for day in sorted(by_day.keys() | journal_by_date.keys()):
        day_entries = by_day.get(day, [])
        day_minutes = sum(e.duration_minutes for e in day_entries)
        total_minutes += day_minutes
        days.append(
            TrackerTimesheetDay(
                date=day,
                total_minutes=day_minutes,
                journal=journal_by_date.get(day),
                entries=[
                    TrackerTimesheetEntry(
                        id=e.id,
                        entry_date=e.entry_date.isoformat(),
                        duration_minutes=e.duration_minutes,
                        task_id=e.task_id,
                        task_title=e.task.title if e.task else None,
                        description=e.description,
                        confidence_score=e.confidence_score,
                        attribution_status=e.attribution_status,
                    )
                    for e in day_entries
                ],
            )
        )

    return TrackerTimesheetResponse(
        days=days, total_minutes=total_minutes, days_count=len(days)
    )


@router.get("/timesheet", response_model=TrackerTimesheetResponse)
async def tracker_timesheet(
    start: str | None = Query(default=None, description="YYYY-MM-DD (default: 7 days ago)"),
    end: str | None = Query(default=None, description="YYYY-MM-DD (default: today)"),
    developer: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Auto-attributed timesheet for the calling developer (self-scoped)."""
    today = datetime.now(timezone.utc).date()
    end_date = _parse_date(end, today)
    start_date = _parse_date(start, end_date - timedelta(days=6))
    if start_date > end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "start must be <= end")
    return await build_timesheet(db, developer.id, start_date, end_date)


def _review_outcome(
    action: str, task_id: str | None, valid_task_ids: set[str]
) -> tuple[str | None, str]:
    """Pure decision for a review action → (new_task_id_or_None, attribution_status).

    ``new_task_id`` is None when the action leaves the task unchanged (confirm /
    dismiss). Raises HTTPException(400) for an invalid ``correct``.
    """
    if action == "confirm":
        return None, "confirmed"
    if action == "dismiss":
        return None, "dismissed"
    # correct — reassign to one of the caller's own tasks.
    if not task_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "task_id is required to correct an entry"
        )
    if task_id not in valid_task_ids:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "task_id is not an assignable task"
        )
    return task_id, "corrected"


@router.get("/candidate-tasks", response_model=list[TrackerCandidateTask])
async def tracker_candidate_tasks(
    developer: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """The caller's open assigned tasks — the choices for correcting attribution."""
    tasks = await _candidate_tasks(db, developer.id)
    return [TrackerCandidateTask(**t) for t in tasks]


@router.patch(
    "/timesheet/entries/{entry_id}", response_model=TrackerEntryUpdateResponse
)
async def update_tracker_entry(
    entry_id: str,
    data: TrackerEntryUpdateRequest,
    developer: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Review an AI-inferred entry: confirm / correct (reassign task) / dismiss.

    Individual-scoped — only the caller's own inferred entries are mutable.
    """
    entry = await db.get(TimeEntry, entry_id)
    if entry is None or entry.developer_id != developer.id or not entry.is_inferred:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inferred entry not found")

    # Candidate tasks only needed (and only queried) for a "correct" reassignment.
    valid_ids: set[str] = set()
    if data.action == "correct":
        valid_ids = {t["id"] for t in await _candidate_tasks(db, developer.id)}

    new_task_id, new_status = _review_outcome(data.action, data.task_id, valid_ids)
    if new_task_id is not None:
        entry.task_id = new_task_id
    entry.attribution_status = new_status

    await db.commit()

    # Resolve the (possibly new) task title without relying on lazy loading.
    task_title = None
    if entry.task_id:
        task_title = await db.scalar(
            select(SprintTask.title).where(SprintTask.id == entry.task_id)
        )

    return TrackerEntryUpdateResponse(
        id=entry.id,
        task_id=entry.task_id,
        task_title=task_title,
        attribution_status=entry.attribution_status,
    )
