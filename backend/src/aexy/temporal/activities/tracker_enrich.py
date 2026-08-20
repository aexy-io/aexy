"""Aexy Tracker — enrich & attribute activity (the AI loop, docs/aexy-tracker.md §5).

Reads un-enriched ``TrackerEvent`` rows (driven by the partial index
``ix_tracker_events_pending_enrich``), collapses consecutive samples into
activity *spans*, then runs a single LLM call per developer to:

  * **enrich**   — categorize each span productive / neutral / personal
  * **attribute** — map each span to one of the developer's candidate tasks

Results are written back onto each event (``category``, ``attribution``,
``enriched_at``) and rolled up into inferred ``TimeEntry`` rows so attributed
time shows up in the existing tracking module with no manual tagging.

Triggered two ways:
  * fire-and-forget after an ingest batch (``dispatch`` with a per-project,
    time-bucketed ``workflow_id`` so concurrent batches coalesce), and
  * a periodic safety-net sweep (see ``temporal/schedules.py``).
"""

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import select
from temporalio import activity

from aexy.core.database import async_session_maker
from aexy.models.project import Project
from aexy.models.sprint import SprintTask
from aexy.models.tracker_event import TrackerEvent
from aexy.models.tracking import TimeEntry, TrackingSource

logger = logging.getLogger(__name__)

# How many events to enrich per activity run (bounds LLM cost / runtime).
DEFAULT_BATCH_SIZE = 500
# Statuses considered "closed" — not attribution candidates.
_CLOSED_STATUSES = {"done", "closed", "completed", "cancelled", "archived"}
_DONE_CATEGORIES = {"productive", "neutral", "personal"}


@dataclass
class EnrichTrackerEventsInput:
    # When set, only this project is processed; otherwise sweep all projects
    # that have pending (un-enriched) events.
    project_id: str | None = None
    batch_size: int = DEFAULT_BATCH_SIZE


def _signal_text(evt: TrackerEvent) -> str:
    """Compact human-readable signal line for one sample (for the LLM)."""
    app = (evt.active_app or {}).get("name", "?")
    title = (evt.active_app or {}).get("window_title") or ""
    parts = [f"{app}"]
    if title:
        parts.append(f'"{title}"')
    fc = evt.file_context or {}
    if fc.get("repo") or fc.get("branch"):
        parts.append(f"repo={fc.get('repo')}@{fc.get('branch')}")
    if (evt.browser or {}).get("url"):
        parts.append(f"url={evt.browser['url']}")
    if (evt.dev_context or {}).get("last_command"):
        parts.append(f"$ {evt.dev_context['last_command']}")
    return " ".join(parts)


def _collapse_spans(events: list[TrackerEvent]) -> list[dict]:
    """Collapse consecutive same-signal samples into spans (deterministic).

    Each span carries the event_ids it covers so results can be written back.
    """
    events = sorted(events, key=lambda e: e.ts)
    spans: list[dict] = []
    for evt in events:
        sig = _signal_text(evt)
        if spans and spans[-1]["signal"] == sig:
            spans[-1]["event_ids"].append(evt.id)
            spans[-1]["duration_s"] += evt.interval_s
            spans[-1]["end"] = evt.ts
        else:
            spans.append(
                {
                    "signal": sig,
                    "event_ids": [evt.id],
                    "duration_s": evt.interval_s,
                    "start": evt.ts,
                    "end": evt.ts,
                }
            )
    return spans


def _build_prompt(spans: list[dict], candidate_tasks: list[dict]) -> tuple[str, str]:
    system = (
        "You are a work-attribution engine for an engineering team. "
        "Given a developer's activity spans and their candidate tasks, for each "
        "span return a productivity category and the best-matching task (or null). "
        "Categories: productive | neutral | personal. "
        "Match on repo/branch, file paths, window titles, ticket keys, and URLs. "
        "Only attribute a task when the signal clearly supports it; otherwise null. "
        'Respond ONLY with JSON: {"spans":[{"index":int,"category":str,'
        '"task_id":str|null,"confidence":float}]}.'
    )
    span_lines = "\n".join(
        f"[{i}] ({s['duration_s']}s) {s['signal']}" for i, s in enumerate(spans)
    )
    task_lines = (
        "\n".join(f"- {t['id']}: {t['title']} (status={t['status']})" for t in candidate_tasks)
        or "(none)"
    )
    user = (
        f"Activity spans:\n{span_lines}\n\n"
        f"Candidate tasks:\n{task_lines}\n\n"
        "Return the JSON now."
    )
    return system, user


async def _candidate_tasks(db, developer_id: str) -> list[dict]:
    rows = await db.execute(
        select(SprintTask)
        .where(SprintTask.assignee_id == developer_id)
        .order_by(SprintTask.updated_at.desc())
        .limit(25)
    )
    tasks = []
    for t in rows.scalars().all():
        if (t.status or "").lower() in _CLOSED_STATUSES:
            continue
        tasks.append({"id": t.id, "title": t.title, "status": t.status})
    return tasks


def _parse_llm_json(text: str) -> dict:
    """Extract the JSON object from an LLM response (tolerates code fences)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text.strip("`")
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in LLM response")
    return json.loads(text[start : end + 1])


@activity.defn
async def enrich_attribute_tracker_events(input: EnrichTrackerEventsInput) -> dict:
    """Enrich + attribute a batch of pending tracker events. Idempotent.

    Idempotency: only rows with ``enriched_at IS NULL`` are selected, and each
    is stamped on success — re-running never double-processes or double-creates
    TimeEntry rows (keyed by deterministic ``inference_metadata``).
    """
    from aexy.llm.gateway import get_llm_gateway

    processed = 0
    attributed = 0
    time_entries = 0

    async with async_session_maker() as db:
        # 1. Select pending events (optionally scoped to one project).
        stmt = (
            select(TrackerEvent)
            .where(TrackerEvent.enriched_at.is_(None))
            .order_by(TrackerEvent.project_id, TrackerEvent.developer_id, TrackerEvent.ts)
            .limit(input.batch_size)
            # Lock the selected rows so the per-batch dispatch and the periodic
            # sweep can't process (and double-attribute) the same events. Rows
            # another run already holds are skipped, not blocked on. (No-op on
            # SQLite in tests.)
            .with_for_update(skip_locked=True)
        )
        if input.project_id:
            stmt = stmt.where(TrackerEvent.project_id == input.project_id)
        events = list((await db.execute(stmt)).scalars().all())
        if not events:
            return {"processed": 0, "attributed": 0, "time_entries": 0}

        gateway = get_llm_gateway()
        now = datetime.now(timezone.utc)

        # 2. Group by (project, developer) — one LLM call per group.
        groups: dict[tuple[str, str], list[TrackerEvent]] = {}
        for evt in events:
            groups.setdefault((evt.project_id, evt.developer_id), []).append(evt)

        # Cache project → workspace_id for TimeEntry rows.
        project_ws: dict[str, str] = {}

        for (project_id, developer_id), group in groups.items():
            spans = _collapse_spans(group)
            candidate_tasks = await _candidate_tasks(db, developer_id)

            results_by_index: dict[int, dict] = {}
            if gateway is not None:
                system, user = _build_prompt(spans, candidate_tasks)
                try:
                    text, *_ = await gateway.call_llm(
                        system_prompt=system,
                        user_prompt=user,
                        tokens_estimate=2000,
                        developer_id=developer_id,
                        db=db,
                        feature="insights.tracker_enrich",
                    )
                    parsed = _parse_llm_json(text)
                    for r in parsed.get("spans", []):
                        results_by_index[int(r["index"])] = r
                except Exception as e:  # noqa: BLE001 — degrade gracefully
                    # LLM failure must not strand events; fall through to
                    # neutral/unattributed and stamp them so they don't loop.
                    activity.logger.warning(
                        "Tracker enrich LLM failed for %s/%s: %s",
                        project_id,
                        developer_id,
                        e,
                    )

            valid_task_ids = {t["id"] for t in candidate_tasks}

            for idx, span in enumerate(spans):
                r = results_by_index.get(idx, {})
                category = r.get("category")
                if category not in _DONE_CATEGORIES:
                    category = "neutral"
                task_id = r.get("task_id")
                if task_id not in valid_task_ids:
                    task_id = None
                # LLM output is untrusted — a non-numeric confidence must not
                # crash (and Temporal-retry) the whole activity.
                try:
                    confidence = float(r.get("confidence", 0.0) or 0.0)
                except (TypeError, ValueError):
                    confidence = 0.0

                attribution = {
                    "task_id": task_id,
                    "confidence": confidence,
                    "signal": span["signal"],
                }

                # 3a. Write category + attribution back onto each event.
                for ev_id in span["event_ids"]:
                    ev = next((e for e in group if e.id == ev_id), None)
                    if ev is None:
                        continue
                    ev.category = category
                    ev.attribution = attribution
                    ev.enriched_at = now
                    processed += 1

                # 3b. Roll attributed productive spans into an inferred TimeEntry.
                if task_id and category == "productive":
                    if project_id not in project_ws:
                        proj = await db.get(Project, project_id)
                        project_ws[project_id] = proj.workspace_id if proj else None
                    workspace_id = project_ws[project_id]
                    if workspace_id:
                        # Deterministic key → re-runs update rather than duplicate.
                        dedupe_key = f"tracker:{span['event_ids'][0]}"
                        existing = await db.scalar(
                            select(TimeEntry.id).where(
                                TimeEntry.external_task_ref == dedupe_key
                            )
                        )
                        if existing is None:
                            db.add(
                                TimeEntry(
                                    developer_id=developer_id,
                                    task_id=task_id,
                                    workspace_id=workspace_id,
                                    duration_minutes=max(1, round(span["duration_s"] / 60)),
                                    description=span["signal"][:500],
                                    entry_date=span["start"].astimezone(timezone.utc).date()
                                    if isinstance(span["start"], datetime)
                                    else date.today(),
                                    started_at=span["start"],
                                    ended_at=span["end"],
                                    source=TrackingSource.INFERRED.value,
                                    is_inferred=True,
                                    attribution_status="inferred",
                                    confidence_score=confidence,
                                    inference_metadata={
                                        "origin": "tracker",
                                        "event_ids": span["event_ids"],
                                        "category": category,
                                    },
                                    external_task_ref=dedupe_key,
                                )
                            )
                            time_entries += 1
                        attributed += 1

        await db.commit()

    return {
        "processed": processed,
        "attributed": attributed,
        "time_entries": time_entries,
    }
