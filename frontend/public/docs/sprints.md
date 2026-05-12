# Sprints & Planning

Aexy's agile module — sprints, epics, stories, planning poker, retrospectives, releases — built around a strict 5-state sprint lifecycle and an extensible task model that syncs with GitHub Issues, Jira, and Linear.

## Mental model

- **Epic** — large work item spanning multiple sprints. Auto-keyed `EPIC-001`.
- **Story** — user-centric requirement under an epic, in the form "As a X I want Y so that Z." Auto-keyed `STORY-001`.
- **Sprint** — time-boxed cycle owned by a team. Transitions through five fixed states.
- **SprintTask** — the actual unit of work. Belongs to a sprint (or backlog) and optionally to a story and epic. Can be sourced from GitHub Issues, Jira, Linear, or created manually.
- **Release** — a curated bundle of sprints/work for a single shipment. Has its own readiness checklist.

This is more opinionated than Linear or Jira: the sprint **must** flow through `planning → active → review → retrospective → completed`, and only one sprint per team can be `active` at a time.

## Sprint lifecycle

`Sprint.status` enum (`models/sprint.py:168`):

```
planning  →  active  →  review  →  retrospective  →  completed
   ↑           (only one per team active at a time)
   only deletable state
```

Transitions are explicit endpoints (`api/sprints.py`):

```
POST /sprints/{id}/start      planning   → active     (line 219 in service)
POST /sprints/{id}/review     active     → review     (line 278)
POST /sprints/{id}/retro      review     → retrospective (line 315)
POST /sprints/{id}/complete   retrospective → completed (line 351)
```

`start_sprint` enforces uniqueness — calling it while another sprint on the same team is `active` raises (service line 239-241). On `start` and `complete`, the service fires automation events `sprint.started` and `sprint.completed` so workflows downstream (e.g. announce in Slack, snapshot metrics) can react.

`POST /sprints/{id}/carry-over/{target_sprint_id}` moves incomplete tasks to the next sprint and stamps `carried_over_from_sprint_id` on each so velocity calculations can attribute correctly.

## Backend routers

| File | Prefix | Scope |
|---|---|---|
| `api/sprints.py:21` | `/workspaces/{ws}/teams/{team}/sprints` | Sprint CRUD + lifecycle + carry-over |
| `api/sprint_tasks.py:41` | `/sprints/{sprint_id}/tasks` | Task CRUD, assignment, bulk ops, attachments |
| `api/sprint_analytics.py:19` | `/sprints/{sprint_id}/...` | Burndown, cycle time, metrics snapshots |
| `api/planning_poker.py:31` | `/sprints/{sprint_id}/planning-poker/...` | Estimation sessions over WebSocket |
| `api/retrospectives.py:20` | `/sprints/{sprint_id}/retrospective` | Retrospective CRUD |
| `api/epics.py:24` | `/workspaces/{ws}/epics` | Epic CRUD, timeline, progress rollups |
| `api/stories.py:35` | `/workspaces/{ws}/stories` | Story CRUD, acceptance criteria, ready/accept/reject |
| `api/releases.py:38` | `/workspaces/{ws}/releases` | Release bundles, code freeze, publish, checklists |

## Models (`models/sprint.py`, `epic.py`, `story.py`)

**`Sprint`** (`sprint.py:139-240`):

| Field | Note |
|---|---|
| `team_id`, `workspace_id` | Scope |
| `name`, `goal` | Display |
| `status` | The 5-state enum above |
| `start_date`, `end_date` | Time-box |
| `capacity_hours` | Total available developer-hours |
| `velocity_commitment` | Points the team committed to |
| `settings` (JSONB) | Per-sprint feature toggles |
| `created_by_id` | The PM/lead who set it up |

Relationships: `tasks`, `metrics` (daily snapshots), `retrospective` (1:1), `planning_sessions` (planning-poker rounds).

**`SprintTask`** (`sprint.py:243-498`) — the load-bearing model.

| Field | Note |
|---|---|
| `sprint_id`, `team_id`, `workspace_id` | `sprint_id` is nullable — null = backlog item |
| `source_type` | `github_issue` / `jira` / `linear` / `manual` |
| `source_id`, `source_url`, `external_updated_at`, `sync_status` | External-system bookkeeping |
| `title`, `description`, `description_json` | Markdown + ProseMirror JSON |
| `story_points`, `estimated_hours`, `priority`, `labels` (JSONB) | Standard |
| `assignee_id`, `assignment_reason`, `assignment_confidence` | If AI-assigned, the why and how confident |
| `status` | `backlog` / `todo` / `in_progress` / `review` / `done` (legacy) or `status_id` → `WorkspaceTaskStatus` (custom) |
| `epic_id`, `story_id` | Hierarchy |
| `parent_task_id` | Sub-tasks |
| `work_started_at` | First transition out of `todo` — used for cycle time |
| `cycle_time_hours`, `lead_time_hours` | Cached metrics |
| `carried_over_from_sprint_id` | If carried, where from |
| `custom_fields` (JSONB) | Per-workspace fields keyed by `WorkspaceCustomField.slug` |
| `mentioned_user_ids`, `mentioned_file_paths` | From description/comments |

**Custom status & fields** (`WorkspaceTaskStatus` `sprint.py:31-80`, `WorkspaceCustomField` `sprint.py:83+`): each workspace can define its own statuses (with categories `todo`/`in_progress`/`done` to keep burndown working) and custom fields. Tasks then store `status_id` and `custom_fields` JSONB. Migration of legacy `status` strings to `status_id` is incremental.

**`SprintMetrics`** (`sprint.py:501-550`) — one row per sprint per day. Stores `total_points`, `completed_points`, `remaining_points`, `total_tasks`, `completed_tasks`, `in_progress_tasks`, `blocked_tasks`, plus `ideal_burndown` and `actual_burndown` arrays. The burndown chart is just a query on this table.

**`TeamVelocity`** (`sprint.py:553-598`) — per-sprint snapshot of `committed_points`, `completed_points`, `carry_over_points`, `completion_rate`, `focus_factor`. The team's velocity over time is `SELECT * FROM team_velocity WHERE team_id = ?`.

**`SprintPlanningSession`** (`sprint.py:601-657`) — the planning-poker session record. `status` is `active`/`paused`/`completed`; `participants` is a JSONB list of `{developer_id, joined_at}`; `decisions_log` JSONB records every reveal/estimate event for replay.

**`SprintRetrospective`** (`sprint.py:660-713`) — `went_well`, `to_improve`, `action_items` as JSONB lists of strings + author IDs; `team_mood_score` is a 1-5 integer.

**`Epic`** (`models/epic.py:19-80`) — `key` (auto `EPIC-001`), `status` (`open`/`in_progress`/`done`/`cancelled`), date fields, plus **denormalized progress rollups** (`total_tasks`, `completed_tasks`, `total_story_points`, `completed_story_points`, `progress_percentage`). The rollups are maintained by `EpicService` on every child task update — saves a join in the list view.

**`UserStory`** (`models/story.py:21-79`) — `key` (auto `STORY-001`), `title`, `as_a`/`i_want`/`so_that` for the user-story sentence, `acceptance_criteria` as JSONB list, `story_points`, `estimated_hours`, status (`draft`/`ready`/`in_progress`/`review`/`accepted`/`rejected`).

## Services

**`SprintService`** (`services/sprint_service.py`) — full sprint lifecycle. Notable methods:

- `create_sprint` (line 30)
- `start_sprint` (line 219) — enforces single-active-per-team, fires `sprint.started` automation event
- `start_review`, `start_retrospective`, `complete_sprint` — state transitions
- `carry_over_tasks` (line 441) — moves incomplete tasks and stamps `carried_over_from_sprint_id`
- `get_sprint_stats` (line 558) — rolls up tasks → points/counts
- `_calculate_velocity` (line 649) — writes a `TeamVelocity` snapshot on complete

**`SprintAnalyticsService`** (`services/sprint_analytics_service.py`):

- `get_burndown_data` (line 21) — reads daily `SprintMetrics`, returns time-series
- `_generate_projected_burndown` (line 76) — fits a line from current progress to predict end-state
- Cycle-time analytics over `SprintTask.work_started_at` and `completed_at`

**`SprintPlanningService`** (`services/sprint_planning_service.py:1-120`) — the AI-assisted planning piece. `HOURS_PER_POINT = 4`, `DEFAULT_DEVELOPER_CAPACITY_HOURS = 60`. Uses `LLMGateway` + `TaskMatcher` to suggest assignments (`suggest_assignments`, line 90). Falls back to round-robin if no LLM is configured (line 103-106). Also runs what-if scenarios (`WhatIfAnalyzer`, line 88) for "if we drop X, what happens to risk?"

## Planning poker

Real-time estimation via WebSocket.

```
POST /sprints/{id}/planning-poker/start                    create session
GET  /sprints/{id}/planning-poker/{session_id}             load state
WS   /sprints/{id}/planning-poker/{session_id}/ws          live updates
GET  /sprints/{id}/planning-poker/{session_id}/available-tasks
POST /sprints/{id}/planning-poker/{session_id}/add-tasks
POST /sprints/{id}/planning-poker/{session_id}/finalize    write estimates back to tasks
```

Per-task round flow (`api/planning_poker.py:153-165`):

```
vote   →  reveal  →  final_estimate  →  next_task
```

Session-level status starts `active`; `finalize` transitions to `completed` and writes the agreed estimate into `SprintTask.story_points` (line 706).

The `SprintPlanningSession` table persists every round event, so if the WebSocket drops, clients can re-sync from the decisions log.

## Frontend

Pages under `frontend/src/app/(app)/sprints/` and `epics/`:

| Route | Purpose |
|---|---|
| `/sprints` | All sprints, all teams |
| `/sprints/[projectId]` | Project's sprint board (latest active sprint) |
| `/sprints/[projectId]/[sprintId]` | Sprint detail |
| `/sprints/[projectId]/[sprintId]/retrospective` | Retro form/board |
| `/sprints/[projectId]/[sprintId]/analytics` | Burndown + cycle time |
| `/sprints/[projectId]/board` | Kanban across all sprints |
| `/sprints/[projectId]/backlog` | Backlog ordering |
| `/sprints/[projectId]/roadmap` | Multi-sprint timeline |
| `/sprints/[projectId]/releases` | Release bundles |
| `/sprints/[projectId]/goals` | Sprint goal definition |
| `/sprints/[projectId]/stories` | User stories list |
| `/sprints/[projectId]/templates` | Task templates |
| `/sprints/[projectId]/timeline` | Gantt-ish |
| `/sprints/[projectId]/bugs` | Bug-tagged tasks |
| `/epics` | All epics |
| `/epics/[epicId]` | Epic detail with child stories/tasks |

## Temporal activities

Sprint-related Temporal activities live in `temporal/activities/tracking.py`:

- `aggregate_standups_into_sprint_summary`
- `aggregate_time_entries_for_sprint` (line 103)
- `generate_sprint_progress_report` (line 130) — daily snapshot rolled into a digest

There is **no auto-close**. Sprint state transitions are all manual via the API. If you want auto-complete on `end_date`, you'd add a Temporal schedule that calls `/complete` — it's not wired today.

## GitHub/Jira/Linear sync

`SprintTask.source_type` is the load-bearing enum. For external tasks:

- `source_id` — external system's task ID
- `source_url` — direct link for "Open in GitHub"
- `external_updated_at` — last time we saw a change upstream
- `sync_status` — `synced` / `pending` / `conflict`

Source plugins live in `services/task_sources/`:

| Plugin | Auth |
|---|---|
| `github_issues.py:GitHubIssuesSource` (line 18-50) | OAuth token, API `2022-11-28` |
| `linear.py:LinearSource` (line 19-301) | GraphQL, team_key + project_key |
| `jira.py:JiraSource` (line 20-215) | REST + Atlassian Document Format text extraction |

All three implement a `TaskSource` interface (`fetch_tasks`, `fetch_task`, `health_check`).

The corresponding sync services — `github_task_sync_service.py`, `linear_integration_service.py`, `jira_integration_service.py` — handle the conversion to `SprintTask` and the reverse (where applicable). Linear and Jira import is mostly one-way today; GitHub Issues is two-way through `github_sync_service.py`.

## Common pitfalls

- **Trying to delete a non-`planning` sprint** — `DELETE /sprints/{id}` only works in `planning`. Move to a different sprint first or roll back lifecycle.
- **Two `active` sprints on one team** — the unique constraint is in the service, not the database. If you write a script that mutates `Sprint.status` directly, you can break the invariant. Always go through `SprintService.start_sprint`.
- **Stale Epic rollups** — `Epic.total_tasks` etc. are denormalized. If you bypass `SprintTaskService` and write to `sprint_tasks` directly (raw SQL, migrations), the rollups will drift. Either go through the service or write a migration that re-computes them.
- **Sprint without any `SprintMetrics`** — the burndown chart will be empty. The metrics writer runs daily; if your sprint is short or you're inspecting before the first run, expect a blank chart.
- **Carry-over double-counting** — `TeamVelocity.carry_over_points` is captured at `complete` time. Don't pull `carried_over_from_sprint_id` aggregates from `SprintTask` for velocity math — use `TeamVelocity` directly.
- **AI assignment without LLM configured** — `SprintPlanningService.suggest_assignments` falls back to round-robin silently. Check `assignment_reason` on the resulting tasks — if it's `round_robin`, no AI ran.
