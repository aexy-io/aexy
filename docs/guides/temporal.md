# Temporal Guide

Temporal is Aexy's workflow engine for everything that isn't a synchronous request. It replaced Celery + Celery Beat + APScheduler. This guide is for backend contributors adding new background work.

## Mental model

- **Activity** — a single async function that does the work (sync a repo, send an email, run an LLM call). Lives under `backend/src/aexy/temporal/activities/`.
- **Workflow** — orchestrates one or more activities with retries, timeouts, and persistence. Most one-shot activities use the generic `SingleActivityWorkflow`. Complex multi-step flows live in `backend/src/aexy/temporal/workflows/`.
- **Schedule** — a periodic registration that fires a workflow on an interval (the replacement for Celery Beat). All schedules are declared in `backend/src/aexy/temporal/schedules.py`.
- **Task queue** — a logical lane. Workers pick up workflows tagged with their queues. Constants in `backend/src/aexy/temporal/task_queues.py`.

The Temporal **server** stores history; the Temporal **worker** (`python -m aexy.temporal.worker`) executes workflows and activities. UI at http://localhost:8080.

## Task queues

Aexy uses six queues (consolidated from twelve Celery queues):

| Queue | Used for |
|---|---|
| `analysis` | LLM analysis — commits, PRs, profile rebuilds, knowledge extraction, file metadata |
| `sync` | External-API sync — GitHub, Gmail/Calendar, Microsoft Graph, repos |
| `workflows` | CRM automations and other user-defined workflow actions |
| `email` | Campaigns, warming, reputation, transactional sends |
| `integrations` | Slack, SMS, web push, outbound webhooks, tracking pixels |
| `operations` | Booking, uptime, on-call, reminders, compliance, GTM, generic ops |

`TaskQueue.ALL` is the full list (`task_queues.py:21-22`). The worker subscribes to every queue by default; pass `--queues sync,analysis` to scope a worker for capacity tuning.

## Dispatching work from a service

The replacement for `task.delay()` is `dispatch()`:

```python
from aexy.temporal.dispatch import dispatch
from aexy.temporal.task_queues import TaskQueue
from aexy.temporal.activities.sync import SyncRepositoryInput

# Fire-and-forget
await dispatch(
    "sync_repository",
    SyncRepositoryInput(repository_id=str(repo.id), full=False),
    task_queue=TaskQueue.SYNC,
)

# Idempotent — Temporal rejects duplicate workflow IDs with the same status
await dispatch(
    "sync_repository",
    SyncRepositoryInput(repository_id=str(repo.id)),
    task_queue=TaskQueue.SYNC,
    workflow_id=f"sync-repo-{repo.id}",
)
```

`dispatch()` (`temporal/dispatch.py:174`) starts a `SingleActivityWorkflow` per call. The wrapping workflow gives every activity full observability — retry history, durations, payloads, errors — in the Temporal UI even though the call site looks fire-and-forget.

## Activity config & retries

Every activity name registered in `ACTIVITY_CONFIG` (`dispatch.py:56-220`) gets a retry policy + total timeout + optional heartbeat. Activities not in the map fall back to `DEFAULT_CONFIG` (standard retry, 5-minute timeout).

### Built-in retry policies

| Name | Initial | Backoff | Max attempts | Notes |
|---|---|---|---|---|
| `STANDARD_RETRY` | 60s | ×2 → 10m | 4 | Most activities |
| `LLM_RETRY` | 30s | ×2 → 10m | 6 | Non-retryable on `ValueError`/`KeyError`; rate-limit errors are retried |
| `WEBHOOK_RETRY` | 1m | ×3 → 1h | 6 | Outbound webhook deliveries |
| `github_sync` | 60s | ×2 → 10m | 4 | Non-retryable on `GitHubAuthError`/`GitHubNotFoundError` |
| `google_sync` | 60s | ×2 → 10m | 4 | Non-retryable on `GmailAuthError` |

Defined as constants in `dispatch.py:32-52` and as a string-keyed lookup in `workflows/single_activity.py:_get_retry_policy` (used by the wrapping workflow at runtime).

### Heartbeats

Long-running activities (>5 minutes) should heartbeat so Temporal can detect a stuck worker and re-dispatch:

```python
from temporalio import activity

@activity.defn
async def sync_repository(input: SyncRepositoryInput) -> dict:
    for batch in batches:
        ...
        activity.heartbeat({"processed": processed_count})
```

Heartbeat intervals live alongside `retry` and `timeout` in `ACTIVITY_CONFIG`.

## Adding a new activity

1. **Write the activity** in `backend/src/aexy/temporal/activities/<domain>.py`:
   ```python
   from dataclasses import dataclass
   from temporalio import activity

   @dataclass
   class SendDigestInput:
       workspace_id: str
       digest_date: str

   @activity.defn(name="send_workspace_digest")
   async def send_workspace_digest(input: SendDigestInput) -> dict:
       async with get_async_session() as session:
           ...
       return {"sent": count}
   ```

2. **Register retry/timeout** by adding an entry to `ACTIVITY_CONFIG` in `dispatch.py`:
   ```python
   "send_workspace_digest": {"retry": STANDARD_RETRY, "timeout": timedelta(minutes=5)},
   ```

3. **Register with the worker** — activities must be imported by `aexy/temporal/worker.py` so the worker registers them. Add a module-level import if the file is new.

4. **Dispatch it** from any service:
   ```python
   await dispatch(
       "send_workspace_digest",
       SendDigestInput(workspace_id=str(ws.id), digest_date="2026-05-12"),
       task_queue=TaskQueue.OPERATIONS,
       workflow_id=f"digest-{ws.id}-2026-05-12",  # idempotent per (workspace, day)
   )
   ```

## Multi-step workflows

If a unit of work has multiple activities, branching, or signals, write a real workflow under `backend/src/aexy/temporal/workflows/`. Existing examples:

| Workflow | What it does |
|---|---|
| `single_activity.py:SingleActivityWorkflow` | Wraps any single activity (used by `dispatch()`) |
| `analysis.py` | Multi-step commit/PR analysis |
| `crm_workflow.py` | User-defined CRM automations |
| `email_campaign.py` | Campaign send orchestration |
| `outreach_sequence.py` | GTM outreach sequence steps |
| `onboarding.py` | User/workspace onboarding flows |
| `sync.py` | Repository sync orchestration |
| `maintenance.py` | Cleanup, backfills |

Register workflows in `worker.py` exactly like activities.

## Periodic schedules

Replaces Celery Beat. Schedules live in `backend/src/aexy/temporal/schedules.py` as a list of dicts:

```python
{
    "id": "uptime-process-due-checks",   # unique schedule ID
    "activity": "process_due_checks",    # activity name (must exist in ACTIVITY_CONFIG)
    "input_module": "aexy.temporal.activities.uptime",
    "input_class": "ProcessDueChecksInput",
    "interval": timedelta(seconds=60),
    "queue": TaskQueue.OPERATIONS,
},
```

Schedules are registered with the Temporal server on worker startup. To change cadence, edit the `interval` and restart the worker — Temporal upserts schedule definitions.

Inspect runs, pause, trigger ad-hoc, or rewrite the interval in the Temporal UI at http://localhost:8080 → Schedules.

## Idempotency

Two layers:

1. **Workflow ID** — Temporal rejects duplicate `workflow_id` while the prior run is open. Use this for "send this email once per (user, day)" semantics:
   ```python
   workflow_id=f"daily-digest-{user_id}-{today}"
   ```
2. **Activity body** — the activity itself should still be safe to re-run. Temporal will retry on transient failures, so writes must be upserts or de-duplicated by a natural key.

## Error handling

- Raise normal Python exceptions in activities. Temporal records them in history and retries per policy.
- For permanent failures (don't retry), raise a type listed in `non_retryable_error_types` on the policy (e.g. `ValueError`, `KeyError`, `GitHubAuthError`).
- Activities that exceed their `timeout` are killed and retried (subject to `maximum_attempts`).
- A workflow whose activity exhausts retries fails the workflow. Inspect failures in the Temporal UI.

## Local dev tips

```bash
# Run the worker outside Docker (auto-reloads on file changes when paired with watchman)
cd backend && python -m aexy.temporal.worker

# Scope to specific queues
python -m aexy.temporal.worker --queues sync,analysis

# Open the UI
open http://localhost:8080
```

To trigger a one-off run manually, you can call `dispatch()` from a REPL or use the Temporal UI's "Start Workflow" form with `SingleActivityWorkflow.run` and a `SingleActivityInput` payload.

## Migrating old code

If you see Celery patterns in the repo:

| Celery | Temporal |
|---|---|
| `task.delay(args)` | `await dispatch("task_name", Input(args), task_queue=TaskQueue.X)` |
| `@app.task` | `@activity.defn(name="task_name")` + entry in `ACTIVITY_CONFIG` |
| Celery Beat schedule | Entry in `temporal/schedules.py` |
| `celery -A app worker` | `python -m aexy.temporal.worker` |
| Celery flower | Temporal UI on :8080 |

`backend/src/aexy/processing/celery_app.py` is a deprecated stub that exists only to keep old imports from crashing. Don't add new tasks there.
