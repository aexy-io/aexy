"""Aexy Tracker — journal & insight stages (docs/aexy-tracker.md §5.3–5.4).

Runs after enrich/attribute (``tracker_enrich.py``) over already-enriched events.

* **Journal** (``generate_tracker_journal``) — an LLM turns a developer's day of
  attributed spans into a natural-language work narrative, upserted as a daily
  ``WorkLog`` (idempotent via ``external_task_ref``).
* **Insight** (``detect_tracker_insights``) — deterministic signals (context
  switching, meeting load, after-hours, focus fragmentation) computed from the
  same events; threshold crossings surface as in-app notifications to the
  individual (deduped per developer / type / day).

Both are schedule-friendly: with no args they sweep all developers with recent
enriched events. See ``temporal/schedules.py``.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, func, select
from temporalio import activity

from aexy.core.database import async_session_maker
from aexy.models.notification import Notification
from aexy.models.project import Project
from aexy.models.tracker_event import TrackerEvent
from aexy.models.tracking import TrackingSource, WorkLog, WorkLogType
from aexy.services.notification_service import NotificationService
from aexy.temporal.activities.tracker_enrich import _collapse_spans

logger = logging.getLogger(__name__)

# Max span lines fed to the journal LLM (rest summarized as a count).
_MAX_JOURNAL_SPANS = 150

# Insight thresholds (deliberately conservative — nudges, not noise).
_CTX_SWITCH_PER_HOUR = 15  # app switches / active hour
_MEETING_LOAD_RATIO = 0.5  # meeting minutes / active minutes
_MEETING_LOAD_MIN = 180  # ...and at least this many meeting minutes
_AFTER_HOURS_MIN = 90  # productive minutes outside work hours
_WORK_HOURS = (time(8, 0), time(20, 0))  # UTC heuristic (see §11 tz open question)
_FOCUS_MIN_PRODUCTIVE = 120  # only flag fragmentation above this much productive time
_FOCUS_LONGEST_SPAN_MIN = 25  # ...if the longest unbroken productive span is shorter


@dataclass
class GenerateTrackerJournalInput:
    developer_id: str | None = None
    target_date: str | None = None  # ISO date; defaults to today (UTC)


@dataclass
class DetectTrackerInsightsInput:
    developer_id: str | None = None
    lookback_hours: int = 24


def _resolve_date(iso: str | None) -> date:
    if iso:
        return date.fromisoformat(iso)
    return datetime.now(timezone.utc).date()


async def _developers_with_events(db, day_start: datetime, day_end: datetime) -> list[str]:
    rows = await db.execute(
        select(TrackerEvent.developer_id)
        .where(
            TrackerEvent.enriched_at.is_not(None),
            TrackerEvent.ts >= day_start,
            TrackerEvent.ts < day_end,
        )
        .distinct()
    )
    return [r for r in rows.scalars().all()]


# --------------------------------------------------------------------------- #
# Journal stage
# --------------------------------------------------------------------------- #
def _journal_prompt(spans: list[dict]) -> tuple[str, str]:
    system = (
        "You write a concise first-person daily work journal for a software "
        "engineer from their tracked activity. 3-6 sentences, factual, grouped "
        "by theme (what was built, reviewed, investigated, blocked on, meetings). "
        "Mention tasks/repos by name when present. No preamble, no bullet lists "
        "unless natural. Do not invent work not in the spans."
    )
    spans = sorted(spans, key=lambda s: s["duration_s"], reverse=True)
    shown = spans[:_MAX_JOURNAL_SPANS]
    extra = len(spans) - len(shown)
    lines = []
    for s in shown:
        mins = max(1, round(s["duration_s"] / 60))
        task = (s.get("attribution") or {}).get("task_id")
        cat = s.get("category") or "?"
        suffix = f" [task={task}]" if task else ""
        lines.append(f"- {mins}m ({cat}) {s['signal']}{suffix}")
    if extra > 0:
        lines.append(f"- (+{extra} shorter spans omitted)")
    user = "Activity spans for the day:\n" + "\n".join(lines) + "\n\nWrite the journal now."
    return system, user


def _spans_with_meta(events: list[TrackerEvent]) -> list[dict]:
    """Collapse spans and carry category/attribution from the first event."""
    spans = _collapse_spans(events)
    by_id = {e.id: e for e in events}
    for s in spans:
        first = by_id.get(s["event_ids"][0])
        if first is not None:
            s["category"] = first.category
            s["attribution"] = first.attribution
    return spans


@activity.defn
async def generate_tracker_journal(input: GenerateTrackerJournalInput) -> dict:
    """Generate/refresh the daily narrative WorkLog for one or all developers."""
    from aexy.llm.gateway import get_llm_gateway

    target = _resolve_date(input.target_date)
    day_start = datetime.combine(target, time.min, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    generated = 0
    async with async_session_maker() as db:
        gateway = get_llm_gateway()
        if gateway is None:
            return {"generated": 0, "reason": "llm_unavailable"}

        if input.developer_id:
            developer_ids = [input.developer_id]
        else:
            developer_ids = await _developers_with_events(db, day_start, day_end)

        for developer_id in developer_ids:
            events = list(
                (
                    await db.execute(
                        select(TrackerEvent).where(
                            TrackerEvent.developer_id == developer_id,
                            TrackerEvent.enriched_at.is_not(None),
                            TrackerEvent.ts >= day_start,
                            TrackerEvent.ts < day_end,
                        )
                    )
                )
                .scalars()
                .all()
            )
            if not events:
                continue

            # Workspace + primary task come from the events' project.
            project_id = events[0].project_id
            proj = await db.get(Project, project_id)
            if proj is None:
                continue

            spans = _spans_with_meta(events)
            system, user = _journal_prompt(spans)
            try:
                narrative, *_ = await gateway.call_llm(
                    system_prompt=system,
                    user_prompt=user,
                    tokens_estimate=2000,
                    developer_id=developer_id,
                    db=db,
                    feature="insights.tracker_journal",
                )
            except Exception:  # noqa: BLE001 — skip this dev, don't fail the sweep
                activity.logger.warning(
                    "Journal LLM failed for %s on %s", developer_id, target, exc_info=True
                )
                continue
            if not narrative or not narrative.strip():
                continue

            # Idempotent upsert keyed on developer + date.
            dedupe_key = f"tracker-journal:{developer_id}:{target.isoformat()}"
            existing = await db.scalar(
                select(WorkLog).where(WorkLog.external_task_ref == dedupe_key)
            )
            if existing is not None:
                existing.notes = narrative.strip()
                existing.logged_at = datetime.now(timezone.utc)
            else:
                db.add(
                    WorkLog(
                        developer_id=developer_id,
                        workspace_id=proj.workspace_id,
                        notes=narrative.strip(),
                        log_type=WorkLogType.UPDATE.value,
                        source=TrackingSource.INFERRED.value,
                        external_task_ref=dedupe_key,
                        logged_at=day_end - timedelta(seconds=1),
                    )
                )
            generated += 1

        await db.commit()

    return {"generated": generated, "date": target.isoformat()}


# --------------------------------------------------------------------------- #
# Insight stage
# --------------------------------------------------------------------------- #
def _compute_metrics(events: list[TrackerEvent]) -> dict:
    """Deterministic activity metrics over a developer's recent events."""
    events = sorted(events, key=lambda e: e.ts)
    active_minutes = 0.0
    productive_minutes = 0.0
    meeting_minutes = 0.0
    after_hours_productive = 0.0
    switches = 0
    prev_app = None
    spans = _spans_with_meta(events)

    for e in events:
        mins = e.interval_s / 60
        active_minutes += mins
        if e.category == "productive":
            productive_minutes += mins
            local_t = e.ts.astimezone(timezone.utc).time()
            if local_t < _WORK_HOURS[0] or local_t >= _WORK_HOURS[1]:
                after_hours_productive += mins
        if (e.meeting or {}).get("in_call"):
            meeting_minutes += mins
        app = (e.active_app or {}).get("name")
        if prev_app is not None and app != prev_app:
            switches += 1
        prev_app = app

    longest_productive = max(
        (s["duration_s"] / 60 for s in spans if s.get("category") == "productive"),
        default=0.0,
    )
    active_hours = max(active_minutes / 60, 0.5)
    return {
        "active_minutes": active_minutes,
        "productive_minutes": productive_minutes,
        "meeting_minutes": meeting_minutes,
        "after_hours_productive": after_hours_productive,
        "switches_per_hour": switches / active_hours,
        "longest_productive_min": longest_productive,
    }


def _insights_from_metrics(m: dict) -> list[dict]:
    out: list[dict] = []
    if m["switches_per_hour"] >= _CTX_SWITCH_PER_HOUR:
        out.append(
            {
                "type": "context_switching",
                "title": "Frequent context switching",
                "body": (
                    f"You switched apps ~{round(m['switches_per_hour'])}×/hour. "
                    "Consider batching similar work into focus blocks."
                ),
            }
        )
    if (
        m["meeting_minutes"] >= _MEETING_LOAD_MIN
        and m["active_minutes"] > 0
        and m["meeting_minutes"] / m["active_minutes"] >= _MEETING_LOAD_RATIO
    ):
        out.append(
            {
                "type": "meeting_overload",
                "title": "Heavy meeting load",
                "body": (
                    f"{round(m['meeting_minutes'])} min in meetings "
                    f"({round(100 * m['meeting_minutes'] / m['active_minutes'])}% of active time)."
                ),
            }
        )
    if m["after_hours_productive"] >= _AFTER_HOURS_MIN:
        out.append(
            {
                "type": "after_hours",
                "title": "Working after hours",
                "body": f"~{round(m['after_hours_productive'])} min of focused work outside working hours.",
            }
        )
    if (
        m["productive_minutes"] >= _FOCUS_MIN_PRODUCTIVE
        and m["longest_productive_min"] < _FOCUS_LONGEST_SPAN_MIN
    ):
        out.append(
            {
                "type": "fragmented_focus",
                "title": "Fragmented focus",
                "body": (
                    f"Lots of productive time but the longest unbroken stretch was only "
                    f"~{round(m['longest_productive_min'])} min."
                ),
            }
        )
    return out


@activity.defn
async def detect_tracker_insights(input: DetectTrackerInsightsInput) -> dict:
    """Compute proactive insights and surface them as in-app notifications."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=input.lookback_hours)
    today = now.date()
    created = 0

    async with async_session_maker() as db:
        if input.developer_id:
            developer_ids = [input.developer_id]
        else:
            developer_ids = await _developers_with_events(db, window_start, now)

        notif_service = NotificationService(db)

        for developer_id in developer_ids:
            events = list(
                (
                    await db.execute(
                        select(TrackerEvent).where(
                            TrackerEvent.developer_id == developer_id,
                            TrackerEvent.enriched_at.is_not(None),
                            TrackerEvent.ts >= window_start,
                            TrackerEvent.ts < now,
                        )
                    )
                )
                .scalars()
                .all()
            )
            if not events:
                continue

            metrics = _compute_metrics(events)
            for insight in _insights_from_metrics(metrics):
                event_type = f"tracker.insight.{insight['type']}"
                # Dedupe: at most one of each insight type per developer per day.
                day_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
                already = await db.scalar(
                    select(func.count(Notification.id)).where(
                        and_(
                            Notification.recipient_id == developer_id,
                            Notification.event_type == event_type,
                            Notification.created_at >= day_start,
                        )
                    )
                )
                if already:
                    continue
                notif = await notif_service.create_notification(
                    recipient_id=developer_id,
                    event_type=event_type,
                    title=insight["title"],
                    body=insight["body"],
                    context={"source": "tracker", "metrics": metrics},
                    send_email=False,
                )
                # create_notification returns None when the recipient has the
                # in-app channel disabled for this type — don't overcount.
                if notif is not None:
                    created += 1

    return {"insights_created": created}
