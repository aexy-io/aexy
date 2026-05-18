# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.77] - 2026-05-18

This release improves performance review workflows with peer-review
detail pages, manager assignment tools, phase controls, and automated
deadline reminders.

### Added

- Added peer-review request detail pages where reviewers can accept,
  decline, and submit focused feedback from a notification link.
- Added manager peer-reviewer assignment UI on individual review pages.
- Added review-cycle activation and deadline-reminder notification types
  with templates and delivery helpers.
- Added a daily Temporal deadline sweep for T-7, T-3, and T-1 review
  reminders, plus a migration to track sent reminders per cycle.

### Changed

- Review cycle list and detail pages now expose activate and advance-phase
  actions with refreshed table/menu behavior.
- Review cycle activation now notifies enrolled participants when the
  cycle opens.

## [0.7.76] - 2026-05-18

This release makes AI token usage visible and billable at the workspace
level, and adds raw commit detail behind developer insights.

### Added

- Added workspace-level month-to-date LLM counters, provider breakdowns,
  overage cost tracking, and an idempotent migration for the new workspace
  usage columns.
- Added `GET /workspaces/{workspace_id}/llm-usage` so any workspace
  member can inspect current AI token consumption and reset timing.
- Added workspace AI usage cards to billing and insights settings.
- Added a developer commits endpoint and table so developer insights can
  show the underlying synced commits behind aggregate metrics.

### Changed

- AI analysis activities now roll commit, PR, and review token usage into
  every workspace that has adopted the analyzed repository.
- Billing usage now reads workspace token counters when the caller belongs
  to a workspace, while preserving legacy developer counters as fallback.

## [0.7.75] - 2026-05-17

This release tightens the AI insights experience after the initial
code-insights rollout, with better contributor-claim flows, more resilient
LLM execution, and clearer loading states.

### Added

- Added an auto-detecting claim banner on insights pages so developers can
  reclaim orphaned GitHub commit, PR, and review activity without leaving
  the context where missing activity is visible.
- Added shared code-insight card skeletons to keep digest and repository
  health panels stable while AI snapshots load.
- Added identity-page success messaging and richer claim metrics for
  commits, PRs, and reviews.

### Changed

- Expanded ghost contributor matching to include GitHub no-reply email
  attribution, not only email-null contributor rows.
- Wrapped commit, PR, and review AI analysis calls with inline
  rate-limit waits so Temporal activities are less likely to burn retries
  during LLM concurrency spikes.
- Increased DeepSeek read timeouts for long-tail completions while keeping
  connection failures fast.
- Refined AI digest cards and insights pages with improved empty/loading
  states and contributor-claim entry points.

## [0.7.74] - 2026-05-17

AI code insights now run across GitHub commits, pull requests, reviews,
and sprint task links, with workspace controls for enabling analysis and
new UI surfaces for reading the results.

### Added

#### AI code insights
- Added code-insight API endpoints for commit, pull request, review,
  similar-PR, reviewer-suggestion, task-PR alignment, and snapshot
  retrieval workflows.
- Added Temporal activities and schedules for artifact analysis, weekly
  developer digests, repository health summaries, active PR refreshes,
  task-to-PR alignment, and performance-review summaries.
- Added LLM analysis cache, deterministic security scanning, PR
  embeddings, AI settings, and migration scripts for the new storage
  columns and snapshot tables.

#### Product surfaces
- Added frontend code-insight hooks, API client helpers, localized
  messages, and cards/panels for AI summaries in developer, repository,
  review, sprint board, and settings pages.
- Added identity settings messaging and navigation surfaces for the
  organization/settings area.

### Changed

- GitHub sync now enriches commits and PRs with deterministic metadata,
  supports branch-aware commit collection, and fans out AI analysis after
  repository sync.
- Developer identity handling can claim and merge ghost contributor
  activity into the authenticated GitHub developer profile.
- Coverage artifacts are ignored so regenerated test output stays out of
  normal commits.

## [0.7.73] - 2026-05-12

Tasks now have a copyable per-workspace identifier and a short
shareable link. Format is `[{workspace_slug}:{task_key}]` (e.g.
`[aexy:42]`); the bracketed form doubles as an auto-link token in
GitHub PR/issue titles. The kanban task card surfaces two icon-only
copy actions on hover — full link / full identifier shown on hover,
copied on click.

### Added

#### Shareable task identifiers
A new monotonic per-workspace counter assigns a `task_key` to every
new task. Combined with `workspace.slug` it forms the displayed
identifier `[slug:N]`, rendered as a subtle monospace prefix on the
kanban card title and used as the body of two new copy actions in
the card's hover quick-actions bar. Existing tasks are backfilled
in `created_at` order per workspace.

- New columns: `sprint_tasks.task_key` (int, unique per workspace)
  and `workspaces.next_task_key` (counter). Migration
  `migrate_task_keys.sql` adds them, backfills existing tasks, and
  seeds each workspace counter to `MAX(task_key) + 1`.
- Atomic assignment via a SQLAlchemy `before_insert` event on
  `SprintTask` — one `UPDATE ... RETURNING` consumes the next key
  and serializes concurrent inserts. Covers all task-creation paths
  (manual, GitHub import, Jira, Linear, workflows, templates,
  planning poker) without touching their call sites.
- `SprintTaskResponse` exposes `task_key`, `workspace_slug`,
  `identifier`, and `public_url` so the frontend can render and
  copy without recomposing the string.

#### Public short-link route
A short URL at `/t/{workspace_slug}/{task_key}` resolves to the
sprint kanban for the task, with the task drawer auto-opened.

- New backend endpoint `GET /api/v1/tasks/by-key/{slug}/{key}`
  returns the task UUID plus the sprint and project IDs needed to
  build the redirect. Auth-gated on workspace membership.
- New frontend route `frontend/src/app/(app)/t/[workspaceSlug]/[taskKey]/page.tsx`
  calls the resolver and `router.replace`s to
  `/sprints/{project_id}/{sprint_id}?task={uuid}` (or the project
  backlog when the task has no sprint).
- The sprint kanban page reads `?task=<uuid>` on mount, opens the
  task drawer for that task, and strips the param so refresh
  doesn't re-open it.

#### GitHub PR/issue title auto-linking
The task reference parser learns a new pattern for the native
`[workspace-slug:N]` form. When a PR or issue is ingested with that
bracket in its title, `GitHubTaskSyncService` resolves the matching
task by `(workspace.slug, task_key)` and creates a `TaskGitHubLink`
with `is_auto_linked=True`.

- New `AEXY_BRACKETED_PATTERN` regex
  `\[([a-z0-9][a-z0-9-]*):(\d+)\]` in `task_reference_parser.py`,
  exposed as `TaskReferenceSource.AEXY`. Distinct from the existing
  `[PROJ-123]` Jira/Linear pattern (the colon separator avoids the
  collision).
- Already wired into the runtime webhook path
  (`/webhooks/github`) for both PRs and commits — no behavior change
  for past PRs that didn't use this format, future ones link
  automatically.

#### Card UI
- Two icon-only buttons in `TaskCardPremium`'s hover quick-actions
  bar: `Link2` copies the public URL, `Hash` copies the identifier.
  Full string in the `title=` tooltip; Sonner toast on click.
- Persistent monospace `[slug:N]` prefix on the card title so the
  identifier is visible at a glance without hovering.

## [0.7.72] - 2026-05-07

Project-level (sprint-less) tasks reach feature parity with sprint
tasks. Backlog tasks can now carry attachments, attach GitHub PRs and
issues, accept comments, and surface a full activity history; several
silently-dropped fields on create/update across both routes are
plugged; the History tab now logs every meaningful task mutation
including archives, sprint moves, and planning-poker estimates; and
repository connection moves from per-developer to workspace-scoped.

### Added

#### Workspace + project repository connection
Repositories are connected at the **workspace** level now, with
projects picking subsets. New tables `workspace_repositories` (the
workspace's adopted catalog) and `team_repositories` (the project's
selection) replace `DeveloperRepository.is_enabled` as the source of
truth for "which repos are tracked here." Migration
`migrate_workspace_team_repositories.sql` backfills both from
existing per-developer enables so nothing in scope today disappears.

- New endpoints: `GET/POST/DELETE /workspaces/{id}/repositories`
  (admin), `GET/POST/DELETE /teams/{id}/repositories`, plus
  `POST /workspaces/{id}/repositories/{wr_id}/reclaim` for the
  former-member adoption flow.
- `WorkspaceRepositoryService` exposes the adopt / unadopt /
  reclaim / link-team / unlink-team / pick_installation_developer
  surface; the canonical sync state (sync_status, last_sync_at,
  webhook bookkeeping, incremental cursors) lives on
  `workspace_repositories` since sync is workspace-owned now.
- Free-plan repo cap is now per-workspace.
  `LimitsService.can_adopt_repository(workspace_id)` counts active
  rows against the workspace's effective plan and gates the adopt
  endpoint. Removes the per-developer counter from the gating path
  (still used as a display-only roll-up on the limits widget).
- Consumers swapped: PR search (sprint + project), GitHub issue
  search/import, the auto-sync Temporal scheduler, developer
  insights, sync-status. Per-developer enable/disable endpoints
  are removed; the column `DeveloperRepository.is_enabled` stays
  as a discovery cache and gets cleaned up in a follow-up.
- New project settings tab at
  `/settings/projects/{projectId}/repositories` for picking which
  workspace repos a project tracks.
- Former-member adoption UX: a "Reclaim" banner on
  `/settings/repositories` lists `workspace_repositories` whose
  adopter is no longer an active workspace member, with a one-click
  "Reclaim" action that re-binds the row to the active member who
  clicked it (or any active member with reach as a fallback).
  `WorkspaceRepository.sync_status='no_credentials'` is set
  automatically when the auto-sync scheduler can't get a token,
  surfacing the same banner.
- Frontend rewires `handleRepoToggle` on `/settings/repositories`
  to call `workspaceRepositoriesApi.adopt` / `unadopt` instead of
  the removed per-developer endpoints; existing UI keeps working,
  the toggle now adopts into the current workspace.



#### Backlog tasks can carry attachments
Sprint-less project tasks had attachment upload gated behind a "Move
this task into a sprint to upload attachments" banner because the
only attachment routes lived under `/sprints/{sprint_id}/tasks/...`.
Added parallel endpoints under `/teams/{team_id}/tasks/{task_id}/attachments`
(POST / GET / DELETE) authorised via team membership. Both routers now
share the same upload, list, and delete logic via a new
`backend/src/aexy/services/task_attachment_service.py` (S3 put,
storage-quota assertion, AI metadata pipeline dispatch, S3 delete,
quota-cache invalidation — all in one place). The frontend picks the
right endpoint based on `task.sprint_id`; the gate banner is gone.

#### Backlog tasks can attach pull requests and GitHub issues
The PR linking section in the task modal now works for project-level
tasks — new endpoints `GET /teams/{team_id}/tasks/github/pull-requests`
and `POST /teams/{team_id}/tasks/{task_id}/github-links/pull-requests`
mirror the sprint-scoped equivalents (workspace-membership check on
the PR author preserved). The list endpoint at
`/teams/{team_id}/tasks/{task_id}/github-links` now returns both issue
and PR links (previously filtered to `github_issue` only). The
`EditTaskModal` dispatches search and link mutations to either endpoint
based on whether the task has a `sprint_id`.

#### Project-level GitHub issue import
New `POST /teams/{team_id}/tasks/import` (with
`projectTasksApi.importTasks` on the frontend) imports GitHub issues
into the team's backlog without requiring a sprint, populating the
"Select issue" dropdown across every task in the team. New service
helpers `add_project_task` and `_import_project_task_items` keep the
import dedup keyed on `(team_id, source_type, source_id)`.

#### Backlog tasks show activity history and accept comments
The History tab previously rendered "Move this task into a sprint to
view its full activity history" for sprint-less tasks because the only
activities + comments routes were sprint-scoped. Added the matching
team-scoped routes (`GET /teams/{team_id}/tasks/{task_id}/activities`
and `POST /teams/{team_id}/tasks/{task_id}/comments`) and updated
`AssignmentHistoryPanel` to dispatch by `task.sprint_id` vs
`task.team_id`. Activity rows are keyed on `task_id` only on the model
side, so existing per-task creation / status / assignment / field-change
events surface for backlog tasks without any data backfill.

#### History tab now logs every meaningful task mutation
Audit pass on every place that mutates a `SprintTask`. Previously
silent paths now write per-task `TaskActivity` rows:

- **Project-task PATCH** delegates to `SprintTaskService.update_task`
  instead of duplicating field assignments, so backlog edits get the
  same per-field timeline (`title_changed`, `priority_changed`, etc.)
  that sprint tasks have.
- **Project-task status PATCH** writes a per-task `status_changed` row
  in addition to the workspace `EntityActivity` it already emitted.
- **Attachment upload + delete** write `attachment_added` /
  `attachment_removed` rows attributed to the actor; affects sprint
  AND project tasks (this was missing for both).
- **Archive / unarchive / remove** write `archived` / `unarchived`
  rows; `actor_id` threaded through `archive_task`, `unarchive_task`,
  and `remove_task` on the service.
- **Sprint moves** (project PATCH inline `sprint_id`, the dedicated
  `move-to-sprint` endpoint, and `bulk_move_to_sprint`) write
  `sprint_changed` with prior and new sprint IDs.
- **Planning-poker finalize** writes a `points_changed` row when the
  estimate it stamps onto each task differs from the prior value.
- **Project-task creation** writes a `created` row so backlog
  timelines start with "X created this task" instead of empty.

`TaskActivityAction` extended with `attachment_added`,
`attachment_removed`, `archived`, `unarchived`, and `sprint_changed`,
with renderer cases in both task modals.

### Fixed

#### Project-task creation silently dropped dates and estimated hours
`POST /teams/{team_id}/tasks` accepted `start_date`, `end_date`, and
`estimated_hours` in `ProjectTaskCreate` but the handler instantiated
`SprintTask(...)` without passing them through, so a fresh task always
saved with NULL dates and NULL hours regardless of the form. The
frontend create path mirrored the drop —
`useProjectBoard.addTaskMutation` explicitly listed each forwarded
field and the dates/hours weren't in the list. Wired all three fields
through every layer (SprintTask kwargs in the backend, mutationFn type
and forwarding, and the `create` and `addTask` API client signatures).

#### Project-task PATCH silently dropped four fields
The same route accepted `start_date`, `end_date`, `estimated_hours`,
and `contributes_to_goal` in `SprintTaskUpdate` but the inline
update in `project_tasks.py:update_task` only handled
title/description/story_points/priority/status/labels/epic_id/sprint_id/
assignee_id/mentions. Editing dates or hours on a backlog task looked
successful but nothing persisted. Added the four missing assignments
with `model_fields_set` semantics on the date and hours fields so
callers can clear them by sending explicit null; `contributes_to_goal`
is non-nullable on the model and stays "set when explicitly provided."

#### Project-task responses omitted attachments and seven other fields
`task_to_response` was duplicated across `sprint_tasks.py` and
`project_tasks.py` and the project-tasks copy was missing
`attachments`, `work_started_at`, `cycle_time_hours`,
`lead_time_hours`, `contributes_to_goal`, `start_date`, `end_date`,
and `estimated_hours`. Result: uploading an attachment to a backlog
task succeeded server-side, but when the UI re-fetched the task via
the project-task list/get/update endpoints, the response serialized
`attachments: []` and stale nulls for dates/hours. Extracted the
canonical builder into a new
`backend/src/aexy/services/sprint_task_response.py` and pointed both
routers at it, so the response shape stays in lockstep going forward.

#### Sprint-task PATCH silently dropped `description_json`
The mirror bug on the sprint-scoped route: `data.description_json`
came in via Pydantic but `task_service.update_task` had no parameter
for it, so the rich-text representation never updated even when the
plain `description` did. Added a sentinel-typed `description_json`
parameter to `SprintTaskService.update_task` (with no activity-log
entry — `description_changed` already covers that), and pass it
through from the sprint-tasks PATCH handler.

#### Aligned frontend update types with the backend schema
`sprintApi.updateTask`, `projectTasksApi.update`, and
`useProjectBoard.updateTaskMutation` had TypeScript signatures that
omitted `start_date`, `end_date`, `estimated_hours`, and
`contributes_to_goal`. The runtime axios call still sent them
(JavaScript is permissive), but the types misled callers. Added the
missing fields so the contract matches the backend.

## [0.7.71] - 2026-05-07

Patch release on top of 0.7.7. Fixes a production-only file-upload
outage, light-mode contrast on the task-create form, and brings the
deployment docs in line with the real stack.

### Fixed

#### Object storage missing from production compose
`docker-compose.prod.yml` had no rustfs (or any S3-compatible) service
and no `S3_ENDPOINT_URL` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
env vars on `backend` or `temporal-worker`, even though the dev compose
ships rustfs and points the backend at it. Result: in production
`StorageService.is_configured()` returned False and every file upload —
task attachments, recording uploads, compliance docs — returned `503
File storage is not configured on this deployment`. Added a `rustfs`
service to the prod compose (internal-network only, with healthcheck),
wired the S3 env vars on backend and temporal-worker, added
`rustfs_data` and `rustfs_logs` volumes, added an `/storage/` proxy
location to `nginx/nginx.conf` so uploaded URLs are reachable from the
browser, and seeded `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD` /
`S3_PUBLIC_ENDPOINT_URL` in `.env.prod.example`. Existing operators
need to set those three values in `.env.prod` and re-run
`docker compose -f docker-compose.prod.yml up -d`.

#### Light-mode contrast on task-create attachment & GitHub-issue buttons
The native `<input type="file">` "Choose files" button on the new-task
form and the secondary "Link issue" button on the GitHub Issues panel
both used `bg-primary-*/10` + `text-primary-200/300` — both very light
blue, which collapses to barely-visible against the form background in
light mode. Reskinned all three controls (two file inputs + the link
button) to the solid `bg-primary-600` + `text-white` style already used
by the primary "+ Link" button, so they pass contrast in both light
and dark mode.

### Documentation

#### New Database Operations guide and stale-reference cleanup
A new `docs/guides/database-operations.md` is now the canonical
reference for everything that touches PostgreSQL: the custom SQL
migration system at `backend/scripts/migrate_*.sql`, manual and
automated backups (the production `aexy-backup` sidecar at 02:00 UTC),
restore from sql dump, restore from volume snapshot, the safe
postgres image-rebuild flow (data on the `postgres_data` named
volume is independent of the image — `down -v` is what kills it),
the major-version upgrade dump-and-reload procedure, and pgvector
specifics. Linked from `docs/README.md`, `DEPLOY.md`, and the
deployment guide.

`DEPLOY.md` and `docs/guides/deployment.md` were brought in line with
the actual stack: the `alembic upgrade head` references became
`python scripts/run_migrations.py`, the Celery / Celery beat /
Flower references became Temporal worker / Temporal UI / Temporal
schedules, the postgres prerequisite is now PG 18 with pgvector
(the bundled `aexy-postgres:18-alpine-pgvector` image) instead of
PG 14/16, and the deployment example compose now includes the
`temporal`, `temporal-ui`, and `temporal-worker` services. The
backup/restore quick-references in both docs now point at the new
Database Operations guide for full procedures.

## [0.7.7] - 2026-05-07

### Added

#### Admin billing breakdown — line-item view of charges, usage, and rates
Workspace owners/admins now have a dedicated breakdown page at
`/settings/billing/breakdown` answering "what am I being charged this
period and why." Platform admins get the same view across every
workspace at `/admin/billing` with a margin column and a click-to-drill
drawer. Both reuse a single `BillingBreakdownView` component so the
shape and behavior stay consistent.

- New `BillingBreakdownService` (`backend/src/aexy/services/billing_breakdown_service.py`)
  composes `LimitsService`, `UsageService`, `PostpaidBillingService`,
  and `StorageQuotaService` into one typed `BillingBreakdown`. Line
  items: base subscription fee, active seats (with included vs
  billable split), LLM usage per provider (tokens, request count,
  rate display), storage usage (informational), plus info counters
  for plan-included free tokens and postpaid accruals. The service
  reads period bounds from `WorkspaceSubscription.current_period_*`
  and falls back to the current calendar month.
- Workspace endpoints `GET /api/v1/billing/breakdown?workspace_id=…&period=current|previous|YYYY-MM`
  and `GET /api/v1/billing/breakdown/history?workspace_id=…&months=6`,
  gated by `verify_workspace_admin`. Margin information is never
  exposed via these routes.
- Platform-admin endpoints under `/api/v1/platform-admin/billing/*`:
  `breakdown`, `breakdown/history`, `summary` (paginated, filterable
  workspace table), and `totals` (revenue, margin, top workspaces,
  plan-tier and billing-model splits). Margin (`base_cost_cents`
  vs `charged_cents` from the snapshotted `UsageRecord` rows) is
  exposed only here.
- `BillingBreakdownView` renders the period header, total/delta cards,
  a category-grouped line-item table with per-item drilldown (provider,
  request counts, base cost when admin), info counters, invoices for
  the period, and a 6-period sparkline. The `delta_cents` /
  `delta_pct` are computed against the prior month's
  `usage_aggregates` row, falling back to live SQL over
  `usage_records` when the aggregate is missing.
- Sidebar entries: `Billing Breakdown` (adminOnly) under Account in
  `settingsNavigation.ts`, and `Billing` in the platform-admin sidebar
  in `(admin)/layout.tsx`.

#### Daily Temporal job to populate billing aggregates
New `aggregate_billing_usage` activity (analysis.py) wired into
`worker.py` and scheduled in `schedules.py` to run every 24h. It
calls `UsageService.update_usage_aggregate` for every active
customer subscription's current period, plus the current and prior
calendar month for every workspace that has any usage. Without this
job the historical breakdown view stays empty in production —
nothing else writes to `usage_aggregates`.

#### Internationalization for the breakdown views
Added `settings.billing.breakdownPage` and `settings.platformBilling`
translation namespaces in `messages/en/settings.json` and
`messages/hi/settings.json`. Every user-facing string in the new
pages and the shared `BillingBreakdownView` component goes through
`useTranslations()`. Plan tier and billing-model labels stay in
English in the Hindi translations per project convention.

### Fixed

#### Plan-included free tokens no longer reduce the breakdown total
The breakdown previously emitted a synthetic `free_credit` line item
with a negative subtotal, dropping `total_cents` by an estimated
allowance. The Stripe billing pipeline
(`UsageService.report_workspace_usage_to_stripe`) reports the raw
sum of `UsageRecord.total_cost_cents` with no such deduction —
per-member free quotas live on `Developer.llm_overage_cost_cents`
and never reduce the workspace invoice. The result was that the UI
showed a lower bill than what Stripe charged. The synthetic credit
is now surfaced as `free_tokens_per_member_per_month` and
`llm_tokens_used` info counters plus a computation note explaining
the per-developer scope, so `total_cents` always equals what the
billing pipeline reports.

#### Platform billing summary filters now apply before pagination
`GET /platform-admin/billing/summary` was paginating on the workspace
query first, then dropping rows whose computed `plan_tier` or
`billing_model` didn't match. A filtered request could return an
empty first page even when matches existed on later pages, and the
`total` count reflected only the search filter. The filters are now
pushed into SQL: `plan_tier` joins `Workspace.plan_id → Plan.tier`,
`billing_model` joins `WorkspaceSubscription.workspace_id →
WorkspaceSubscription.billing_model`. `total` reflects the filtered
set, and pagination operates on the filtered query. Workspaces with
no active subscription row are excluded when `billing_model` is set
(they have no canonical workspace-level billing model to filter on);
plan-tier filtering uses the source plan tier and does not consider
workspace plan overrides.

## [0.7.6] - 2026-05-07

### Added

#### Full task activity history
The History tab on the task modal now shows every change to a task —
not just assignment and status — and every change is attributed to the
user who made it. A reviewer can see who created the task, who renamed
it, who shifted the dates, who edited the description, who reassigned
it, and who dragged it across the board, top-to-bottom in the order
events actually happened.

- `SprintTaskService.update_task` now snapshots each field before
  mutation and writes a per-task `TaskActivity` row (`title_changed`,
  `description_changed`, `points_changed`, `priority_changed`,
  `status_changed`, `labels_changed`, `epic_changed`,
  `start_date_changed`, `end_date_changed`,
  `estimated_hours_changed`) for every value that actually changed.
  Description bodies are not stringified into `old_value`/`new_value`
  — only the fact that the description changed is recorded — to keep
  the activity row small for rich-text edits.
- `update_task_status` and `bulk_update_status` now accept an
  `actor_id` and write a per-task activity row attributing the status
  change to the user who dragged the card or clicked the pill.
  Previously the workspace-wide `EntityActivity` feed had this but
  the modal's History tab did not.
- `create_task` records the creator on the `created` activity row, so
  the History tab opens with a "X created this task" line instead of
  silently starting at the first edit.
- `TaskActivityAction` union extended in `frontend/src/lib/api.ts`
  with the six new field-change actions, and the renderer in
  `AssignmentHistoryPanel` (board page) and `ActivityItem` (single
  sprint page) now switches on every action with human-readable
  copy: "renamed to X", "set due date to Y", "cleared estimate", etc.
- The History panel no longer filters out non-assignment events —
  it shows everything, with the actor name on every line.

### Changed

#### Optimistic drag-and-drop on the kanban board
Dropping a task into a new column updates the cache before the
network round-trip, so the card stays where the user dropped it
instead of snapping back to its original column for ~100 ms before
re-rendering. Both `useSprintTasks` (sprint board) and
`useProjectBoard` (workspace tasks) gained `onMutate` /
`onError` / `onSettled` handlers that snapshot the prior cache,
apply the new status optimistically, roll back on failure, and
invalidate on settle. The "snap back, then move" flicker that
made dnd-kit feel laggy is gone.

#### Editable links in task descriptions
TipTap's `Link` extension was switched to `openOnClick: false` in
edit mode (when `readOnly` is false), so single-clicking a link
inside the editor now lands the cursor on it for editing instead
of opening it in a new tab. Cmd/Ctrl+click still opens the link.
In read-only renders (description preview, comment view) plain
clicks open the link as before.

### Fixed

#### Storage object orphaned on task attachment delete
`DELETE /sprints/{sprint_id}/tasks/{task_id}/attachments/{id}` was
removing the `task_attachments` row but leaving the underlying S3
object in RustFS forever, so deleted files kept counting against
the workspace's storage quota. The endpoint now derives the storage
key from the attachment URL via the new
`StorageService.key_from_url` (handles both path-style and the R2
virtual-hosted style), calls `delete_object`, and invalidates the
workspace usage cache via `StorageQuotaService` so the quota meter
catches up immediately.

#### `task.assigned` automation didn't fire on PATCH-based reassignment
Reassigning a task by sending `PATCH /sprint-tasks/{id}` with a new
`assignee_id` updated the row and wrote the assignment activity, but
never dispatched the `task.assigned` automation trigger — only the
dedicated `/assign` endpoint did. So workspace automations subscribed
to `task.assigned` (Slack DMs, Linear sync, etc.) silently missed
every reassignment performed through the task modal's edit flow.
`update_task` now mirrors `assign_task`'s `dispatch_automation_event`
call when the assignee changes.

### Internal

- New helper `_stringify_field` in `sprint_task_service` renders
  TaskActivity field values consistently — `None` stays `None` (so
  the History tab can render "—"), datetimes go through `.isoformat()`,
  and lists join with `, `. Avoids the `"None"` string showing up
  in old/new value cells.
- Removed a vestigial `hasattr(task, "attachments")` guard in
  `task_to_response` — the `attachments` relationship is always
  present on `SprintTask` since the v0.7.4 schema migration.

## [0.7.5] - 2026-05-07

### Added

#### Drive — collaborative file storage with AI tagging
A workspace-wide Drive backed by S3-compatible storage (RustFS in dev),
enriched by an AI metadata pipeline that captions images, tags documents,
and annotates videos with timecoded events from a vision-language model.

- New `drive_files` table with folder hierarchy, soft delete, and per-kind
  rendering hints (file / folder / image / video / audio / pdf / doc).
  Smart Views are filter overlays — they don't move files, they translate
  a JSONB filter to a `file_metadata` join. Migration
  `migrate_drive_v1.sql` is idempotent and adds covering partial indexes.
- New `/workspaces/{ws}/drive/files`, `/folders`, `/files`, `/files/{id}`,
  `/smart-views`, `/files/{id}/annotations`, `/files/{id}/reannotate`,
  and `/usage` endpoints. Multipart upload caps at 500 MB per file and
  2 GB per batch before the plan-level quota check, protecting worker
  memory.
- Drive UI under `/docs/drive`: file grid, smart-view sidebar, hybrid
  search bar, multi-file dropzone, quota banner, and a video player that
  overlays Qwen-VL annotations on the timeline.
- Storage quotas: per-plan `max_storage_gb` (with `-1` for unlimited),
  workspace-level overrides, and a Redis-cached usage rollup spanning
  drive_files, task_attachments, and compliance_documents. Concurrent
  uploads are serialised per-workspace via a Postgres advisory lock so
  two simultaneous uploads can't overshoot the cap.

#### Polymorphic file AI metadata
A single `file_metadata` row per file regardless of where the file lives.
`(source_type, source_id)` is unique across `drive_file`,
`task_attachment`, and `compliance_document`. `file_embeddings` and
`video_annotations` foreign-key to `file_metadata.id`, so a non-Drive
video (e.g. a task attachment) can carry annotations through the same
machinery. Adding a fourth source type is one resolver registration —
no schema change.

- Migration `migrate_file_metadata_v1.sql` creates the schema in a single
  transaction with a GIN index on `ai_tags`/`ai_categories` and an
  ivfflat cosine index on the 1024-dim `embedding` column.
- New `/workspaces/{ws}/files/{source_type}/{source_id}/metadata` and
  `.../reannotate` endpoints — the frontend's universal "Reannotate"
  button posts here regardless of source.
- New `/workspaces/{ws}/search/files?q=…&kinds=…` workspace-wide hybrid
  search: pgvector cosine over `file_embeddings` plus an ILIKE pass over
  `ai_summary` and per-source file names. Cmd+K palette
  (`WorkspaceSearchPalette`) is the user-facing surface.
- New `/workspaces/{ws}/source-files?source_type=…` browse endpoint
  returns a unified file row for any source. The Drive sidebar uses it
  to render virtual cross-source views ("Task attachments",
  "Compliance documents") in the same grid as drive files.

#### Qwen vision + embeddings via the LLM gateway
The gateway grows lazy `vision` and `embeddings` properties selected via
`settings.llm.vision_provider` / `embeddings_provider`. Provider keys
are tracked separately from chat-LLM usage so vision + embedding spend
shows up distinctly in the rate limiter.

- Vision providers: OpenRouter (`qwen/qwen2.5-vl-72b-instruct` by default)
  and local Ollama (any Qwen-VL tag). Both implement `analyze_image` and
  `analyze_video_frames`.
- Embedding providers: OpenRouter (`text-embedding-3-large@1024`) and
  Ollama (`bge-m3`). Both produce pgvector-compatible 1024-dim vectors
  so the two backends are interchangeable.
- New `gateway.embed_batch_limited`, `vision_image_limited`, and
  `vision_video_frames_limited` helpers gate every call through the
  Redis rate limiter. Provider keys: `qwen-openrouter`, `qwen-ollama`,
  `embeddings-openrouter`, `embeddings-ollama`.
- ffmpeg frame sampling for video annotation runs in
  `asyncio.to_thread`, so a multi-minute video doesn't block the worker
  event loop.

#### Admin Plans & Overrides editor
A super-admin UI under `/admin/plans` to inspect plans, edit
per-workspace overrides, and kick off the AI metadata backfill for
existing rows.

- Backfill endpoint enqueues a Temporal workflow per workspace that
  scans uncovered drive_files, task_attachments, and compliance_docs
  and dispatches the AI pipeline at the configured rate. The button
  is idempotent — re-clicking finds the running workflow rather than
  starting a parallel one.

### Changed

#### LLM gateway settings moved under `settings.llm.*`
`vision_provider`, `vision_model`, `embeddings_provider`,
`embeddings_model`, and `embeddings_dim` now live under the `LLMSettings`
group instead of the root `Settings`. Existing `VISION_PROVIDER` /
`EMBEDDINGS_*` env vars continue to work.

#### Drive registered in the app catalogue
Added to both `frontend/src/config/appDefinitions.ts` and
`backend/src/aexy/models/app_definitions.py` so it shows up in app-bundle
permission templates and the sidebar layout filter.

#### `DriveFile` is no longer the home of AI metadata
`ai_status`, `ai_summary`, `ai_tags`, `ai_categories`, and
`ai_processed_at` were removed from `drive_files` and the `DriveFile`
TypeScript interface. AI metadata is now read from `file_metadata` via
the polymorphic endpoint or the `useFileMetadata` hook. `FileCard` fetches
its own AI metadata per row, which means task_attachment and
compliance_document files render with the same AI badges in the Drive
grid.

#### Drive-specific search dropped
`GET /workspaces/{ws}/drive/search` and `driveApi.search` are gone.
Callers use the workspace-wide `/search/files?kinds=drive_file` endpoint
(via `useDriveSearch`, which adapts the response to the legacy hit
shape so the UI didn't have to change).

### Fixed

- **Server boot crash from stale module references.** Several legacy
  imports survived the polymorphic-metadata refactor — `DriveFileEmbedding`
  in `drive_search_service`, `VideoAnnotation.file_id` in `drive_service`,
  and a `max_storage_gb` default placed before required dataclass fields
  in `EffectivePlan`. Each one raised at module-import time, taking down
  the entire FastAPI app on startup. All cleaned up; `drive_search_service`
  was removed entirely (replaced by the cross-source `file_search_service`).
- **Gateway vision/embedding settings raised AttributeError.** The
  gateway was reading `settings.vision_provider` etc. off the root
  `Settings`, but those fields had been moved to `LLMSettings`. First
  call to `gateway.vision` or `gateway.embeddings` crashed.
- **Workspace-wide file_name search produced wrong rows.** The `_scan`
  helper's `select(FileMetadata).join(FileMetadata, …)` re-joined
  `FileMetadata` onto itself; the source table was never in the FROM
  clause. Now starts from the source table and joins `file_metadata`
  correctly.
- **Folder cycle detection only caught direct self-parenting.** Moving
  folder A under one of its own descendants (A → … → D → A) silently
  succeeded and corrupted the tree. Now walks the parent ancestry and
  rejects on collision.
- **None-gateway 500.** When `get_llm_gateway()` returned `None`
  (misconfigured or no API keys), `FileSearchService` and the Drive
  search route called `gateway.embeddings` and crashed. Both now accept
  `Optional[LLMGateway]` and degrade to keyword-only search.
- **Mutable default `BackfillStartRequest()`** in the admin backfill
  route replaced with `Body(default_factory=BackfillStartRequest)`.

### Security

- **SSRF guard on the file AI pipeline's `_download_bytes`.** URLs must
  match an allowlisted host suffix (`.amazonaws.com`, `.cloudfront.net`,
  `.r2.cloudflarestorage.com`, `.aexy.io`) or the configured
  `s3_endpoint_url`. After DNS resolution, every returned IP is checked
  against private / loopback / link-local / multicast / reserved /
  unspecified ranges, defending against DNS rebinding attacks where a
  "public" hostname resolves to `169.254.169.254` or RFC1918. Storage
  endpoints matched verbatim skip the IP check by design (ops controls
  those names; they often resolve privately). `follow_redirects=False`
  prevents 30x bypass.
- **IDOR fix on cross-source reannotate.** The
  `/workspaces/{ws}/files/{source_type}/{source_id}/reannotate` endpoint
  used to dispatch the LLM pipeline without verifying that `source_id`
  belonged to `workspace_id`. Any workspace member could trigger
  reprocessing of any file in any workspace by guessing a UUID, charging
  the LLM bill to the wrong tenant. Now resolves the source row and
  rejects with 404 when the workspace doesn't match.
- **Storage quota TOCTOU race.** Two concurrent uploads from the same
  workspace could both pass the cached usage check and overshoot the
  cap by ~2× the incoming bytes. `assert_storage_available` now wraps
  the check in `pg_advisory_xact_lock(hashtextextended(workspace_id, 0))`
  and reads the used-bytes total fresh from the DB inside the lock.

### Performance

- **Source-files browse covering indexes** (migration
  `migrate_source_files_idx_v1.sql`):
  - `idx_drive_files_workspace_uploaded` on
    `(workspace_id, uploaded_at DESC)` partial
    `WHERE deleted_at IS NULL AND kind <> 'folder'` — covers the exact
    scan the endpoint runs and skips the sort step.
  - `idx_task_attachments_task_uploaded` on `(task_id, uploaded_at DESC)`
    — speeds the join-then-sort pattern when listing all task
    attachments in a workspace.
  - `compliance_documents` already had `(workspace_id, created_at DESC)`
    from `migrate_compliance_documents.sql` — no new index needed.

### i18n

- New `messages/en/drive.json` and `messages/hi/drive.json` cover the
  Drive UI: ~65 keys across `drive.page`, `drive.fileCard`,
  `drive.upload`, `drive.quota`, `drive.smartView`, `drive.video`,
  `drive.aiBadges`, `drive.metadataPopover`, `drive.metadataSidecar`,
  and `drive.search`. ICU placeholders ({count}, {percent}, {used},
  {limit}, {incoming}) match across both locales.

### Tests

- New Playwright e2e specs: `drive-quota.spec.ts`,
  `drive-smart-views.spec.ts`, `drive-upload.spec.ts`,
  `compliance-doc-ai-sidecar.spec.ts`, `task-attachment-ai-tags.spec.ts`,
  `workspace-search-palette.spec.ts`, `admin-backfill.spec.ts`,
  `admin-plans-edit.spec.ts`. Shared `e2e/fixtures/drive-mock-data.ts`
  fixture seeds files, smart views, AI metadata, and quota state.

### Internal

- `.gitignore` extended for `frontend/playwright-report/`,
  `frontend/test-results/`, `frontend/e2e/debug-screenshot*.png`, and
  `REVIEW_*.md`. The previously-tracked `playwright-report/index.html`
  was removed from the index.

## [0.7.4] - 2026-05-06

### Added

#### Task attachments, schedule, and over-estimate detection
Sprint tasks now carry a scheduled timeline and uploaded files, and the
board surfaces when work has slipped.

- Added `start_date`, `end_date`, and `estimated_hours` columns to
  `sprint_tasks`, plus a new `task_attachments` table with cascade delete.
  Migration `migrate_sprint_tasks_v3.sql` is idempotent and indexes
  `end_date` and `task_id`.
- Added `POST/GET/DELETE /sprints/{sprint_id}/tasks/{task_id}/attachments`
  endpoints. Multipart uploads stream through the existing S3-compatible
  storage service (RustFS).
- AddTaskModal gains datetime-local inputs for start/end, an estimated
  hours field, and a multi-file uploader. Files are uploaded after the
  task is created so cascade delete cleans up cancelled flows.
- EditTaskModal mirrors the new fields and renders an attachment list
  with download links and delete actions.
- Kanban cards render an `Overdue` badge when `end_date` has passed and
  the task is not done, and an `Over estimate` badge when actual cycle
  time exceeds `estimated_hours`. Both are pure-frontend computations.

#### Assignment history visible in the task modal
The EditTaskModal grows a History tab showing the full reassignment
chain so reviewers can see who originally assigned a task and every
hand-off in between.

- `assign_task`, `unassign_task`, and the assignee branch of
  `update_task` now write both old and new assignee IDs into the
  per-task `TaskActivity` stream and the workspace-wide
  `EntityActivity` feed.
- The History panel filters activities to assignment and status events,
  resolves participant names from workspace members, and renders them
  oldest-first so the chain reads in the order it actually happened.

### Changed

#### Whole task card is draggable on the kanban board
Drag-and-drop listeners moved from the small `GripVertical` handle onto
the `TaskCardPremium` root, so the entire card body initiates a drag.
The grip icon remains as a visual affordance. Interactive children
(menu, checkbox, quick-status, archive, quick-edit) stop pointer-down
propagation so clicks on them no longer initiate a drag.

### Fixed

#### Links in task descriptions are clickable after saving
The TipTap `Link` extension now uses `openOnClick: true` with
`target="_blank"` and `rel="noopener noreferrer nofollow"`, so URLs
typed into a task description open in a new tab on click instead of
being inert.

### Tests

- Added six Playwright e2e specs covering: attachment upload during
  task creation with start/end dates and estimated hours; the Overdue
  badge; the Over estimate badge; the assignment history chain; the
  whole-card drag affordance; and clickable links in saved
  descriptions. A shared `task-test-helpers.ts` fixture sets up the
  board mocks for all of them.

## [0.7.3] - 2026-04-27

### Added

#### Task modal GitHub PR linking
Task modals now link to real synced GitHub pull requests instead of the
old placeholder `pr_references` field.

- Added sprint task API endpoints to search workspace pull requests, list
  task GitHub links, manually link a PR, and unlink an existing PR.
- The task modal now shows linked PRs with repository, number, title,
  state, and outbound GitHub links.
- Added a searchable PR picker with explicit link/unlink actions and
  loading/error feedback through React Query mutations.
- Added Playwright coverage for opening a task modal from a board deep
  link, displaying existing PR links, linking a synced PR, and unlinking
  an existing PR.

#### Task modal GitHub issue linking
Tasks can now connect to GitHub issues from the project board.

- Added GitHub issue link metadata to `task_github_links` with repository,
  issue number, title, state, and URL.
- Added issue search/link/unlink APIs for both sprint tasks and project
  backlog tasks.
- Added GitHub issue repository context APIs so task modals can explain
  which repo will be used for bare `#123` references.
- Added task title/description auto-linking for explicit `owner/repo#123`
  references and GitHub issue URLs. Bare `#123` links only when the
  project has a single imported GitHub issue repository.
- The task modal now shows linked GitHub issues separately from PRs and
  supports manual issue linking from imported GitHub issues.
- The task modal now supports manual repo override for cross-repo issue
  links using `owner/repo`, `#123`, `owner/repo#123`, or full GitHub
  issue URLs.
- Extended Playwright coverage to verify auto-linked issues, manual issue
  linking, cross-repo issue override, and issue unlinking.

### Fixed

#### Task modal close behaviour on deep links
Closing a task modal opened from `/sprints/{projectId}/board?task=...`
now removes only the `task` query parameter and prevents the modal from
immediately reopening while the route updates. The same modal path is
used from the board and deep-link entry points.

### Changed

#### Task modal polish
Refined the task modal into a wider, more deliberate editing surface:
status changes are saved explicitly, unsaved edits prompt before closing,
dialog accessibility metadata was added, and the GitHub PR section now
lives in the main task content area.

---

## [0.7.2] - 2026-04-14

### Added

#### Microsoft (Entra ID) login — parallel to Google sign-in
Added direct Microsoft 365 / Entra ID sign-in alongside the existing
Google flow. Tenant defaults to `common` so both personal (`@outlook.com`,
`@hotmail.com`) and work/school accounts can sign in.

- Three endpoints: `GET /api/v1/auth/microsoft/login` (basic profile + email),
  `/auth/microsoft/connect-crm` (adds Mail + Calendar via Graph), and
  `/auth/microsoft/callback`. Two-scope split mirrors Google.
- New `MicrosoftConnection` SQLAlchemy model and migration
  (`migrate_2026_04_14_microsoft_connections.sql`), parallel to
  `GoogleConnection`.
- `DeveloperService.get_or_create_by_microsoft` with scope-merge rule:
  a subsequent basic login never clobbers tokens that already hold
  `Mail.Read` / `Calendars.ReadWrite`.
- Graph `/me` user info uses `mail` with `userPrincipalName` fallback
  (personal accounts return `mail: null`).
- Profile fields (email / display name / avatar) resync every time the
  user signs in, so Azure AD changes propagate.
- Frontend: "Continue with Microsoft" button + MS lockup icon in the
  two CTA blocks on the landing page.
- 16 integration tests covering service scope-merge, redirect URL shape,
  state validation, happy-path callback with mocked Graph responses,
  and the personal-account `userPrincipalName` fallback.

#### Refresh-token rotation for Google + Microsoft OAuth
New `aexy.services.oauth_token_service` centralises refresh-token
behaviour for every OAuth-holding row type (developer connections,
workspace Google integrations, booking calendar connections). Three
ad-hoc copies of the refresh flow (`gmail_sync_service`,
`calendar_sync_service`, `booking/calendar_sync_service`, and
`api/chat.py`) have been retired — they each had the same two bugs:
rotated refresh tokens were silently dropped, and every non-200
response was treated as "please reconnect" without distinguishing
`invalid_grant` from a transient 5xx.

- `ensure_valid_google_token(db, GoogleConnection)`,
  `ensure_valid_microsoft_token(db, MicrosoftConnection)`,
  `ensure_valid_google_integration_token(db, GoogleIntegration)`, and
  `ensure_valid_calendar_connection_token(db, CalendarConnection)` all
  share two primitives (`_refresh_google`, `_refresh_microsoft`).
- Revocation signalling per model:
  - Nullable `refresh_token` columns are cleared (raises
    `RefreshTokenRevokedError`).
  - `GoogleIntegration.refresh_token` is NOT NULL, so it's marked
    `is_active=False` + `last_error="refresh_token_revoked"`.
  - Booking `CalendarConnection` additionally flips `sync_enabled=False`.
- Microsoft refresh re-requests stored scopes for developer connections
  and the narrow `Calendars.ReadWrite offline_access` pair for booking
  calendars.
- 16 new tests cover rotation, no-op-when-fresh, `invalid_grant`
  clearing, transient 5xx preserving state, scope propagation, and
  the CalendarConnection dispatch-by-provider behaviour.

#### Surface workspace-view picker on the Appearance settings page
The persona/preset selector that filters sidebar sections and chooses
dashboard widgets was previously reachable only via the Dashboard
"Customize" modal. It now also lives at `/settings/appearance`, wired
to the same `useDashboardPreferences` hook so Dashboard and Settings
stay in sync.

#### Create projects inline from /sprints
The `/sprints` empty-state and top action bar now open an inline
project creation modal instead of redirecting to
`/settings/projects`. On create, the user lands directly on
`/sprints/{newProjectId}/board`. The shared
`CreateProjectModal` component is used by both pages.

### Fixed

#### Next.js 16 async dynamic route params
Next 16 made `params` in `[projectId]/board/page.tsx` (and siblings) an
async Promise. Fixed across 12 dynamic routes under `/sprints` and
`/crm/agents`: client components use `React.use(params)`, server
components `await params`.

#### Onboarding: workspace switcher post-onboarding
"Create workspace" link in the sidebar (`WorkspaceSwitcher`) routed to
`/onboarding/workspace`, which the `OnboardingGuard` redirected back to
`/dashboard` for already-onboarded users — making workspace creation
impossible. The guard now lets `/onboarding/workspace` through, stale
`localStorage` state is cleared on visit, and the newly created
workspace is auto-selected via `switchWorkspace()` so the sidebar
updates immediately.

#### Hydration mismatch from the Redeviation browser extension
Added `suppressHydrationWarning` on `<html>` in the root layout — the
Redeviation DevTools extension injects `data-redeviation-bs-uid` onto
the tag before React hydrates.

#### `create project` / `New project` flow no longer bounces through
`/settings/projects`; it creates the project in-place and jumps to
the new board.

### Changed

#### docker-compose no longer hardcodes LLM env vars
`docker-compose.yml` and `docker-compose.dev.yml` no longer set
`LLM_PROVIDER`, `LLM_MODEL`, or any `*_API_KEY` — pydantic reads them
from `backend/.env` by itself. Previously compose set empty strings
that silently shadowed `.env`, so switching providers required editing
compose instead of `.env`. Production compose keeps the injected-via-
shell pattern it was designed for.

#### npm audit vulnerabilities (15 → 0)
`npm audit fix` cleared the 8 non-breaking advisories (critical axios,
high next/rollup/picomatch, moderate brace-expansion/follow-redirects/
markdown-it/next-intl open-redirect). Upgraded vitest 1.2.1 → 4.1.4
to clear the remaining vite path-traversal + esbuild dev-server
issues; tightened `vitest.config.ts` include/exclude so vitest 4's
stricter scanner doesn't pull in Playwright e2e specs from
`.next/standalone/`. Pinned `node-fetch ^2.7.0` via `overrides`
rather than downgrading face-api.js (which `npm audit fix --force`
wanted to do to no actual security benefit).

---

## [0.7.1] - 2026-04-14

### Added

#### DeepSeek as a first-class LLM provider
Added direct DeepSeek API support alongside Claude, Gemini, Ollama, and OpenRouter. DeepSeek uses an OpenAI-compatible endpoint (`https://api.deepseek.com/chat/completions`) with models `deepseek-chat` (non-thinking DeepSeek-V3.2) and `deepseek-reasoner` (thinking DeepSeek-V3.2).

- New `DeepSeekProvider` with model fallback, 429 `retry-after` handling, usage extraction
- Wired into `LLMGateway` factory + `get_llm_gateway()` bootstrap
- Added `DEEPSEEK_API_KEY` and `DEEPSEEK_FALLBACK_MODELS` env vars (defaults to `deepseek-reasoner`)
- Rate-limit knobs: `DEEPSEEK_REQUESTS_PER_MINUTE`, `DEEPSEEK_REQUESTS_PER_DAY`, `DEEPSEEK_TOKENS_PER_MINUTE`
- Billing: 28¢/M input, 42¢/M output (cache-miss rate; same for both models)
- Plan tiers updated to include `deepseek` in `llm_provider_access`
- Unit tests: `tests/unit/test_deepseek_provider.py` (12 tests, mocked HTTP)
- Live compatibility harness: `scripts/check_llm_provider.py` — provider-agnostic; runs `health_check` → `call_llm` → `analyze(CODE)` → `extract_task_signals` and reports pass/fail. Use any time a provider or model is swapped.

#### Onboarding: create additional workspaces after initial setup
The sidebar "Create workspace" link routes to `/onboarding/workspace`, but the `OnboardingGuard` was redirecting already-onboarded users back to `/dashboard` — making workspace creation impossible post-onboarding.

- `OnboardingGuard` now allows `/onboarding/workspace` (and `/onboarding/complete`) through for existing users
- Workspace step clears stale localStorage-cached workspace state for already-onboarded users, so they see the "Create / Join" choice instead of "Workspace Ready"
- After create / accept-invite, existing users route to `/dashboard` (instead of `/onboarding/connect`) and the new workspace is auto-selected via `useWorkspace.switchWorkspace()` so the sidebar updates immediately

### Fixed

- Hydration mismatch on `<html>` caused by the Redeviation browser extension injecting `data-redeviation-bs-uid` — added `suppressHydrationWarning` to the root layout

### Changed

- `docker-compose.yml` and `docker-compose.dev.yml` no longer hardcode `LLM_PROVIDER`, `LLM_MODEL`, or any `*_API_KEY`. LLM config is read from `backend/.env` by pydantic settings — single source of truth. Previously empty-string values in compose silently shadowed `.env`, breaking provider selection. Prod compose (`docker-compose.prod.yml`) continues to inject secrets from the host shell env as designed.

---

### Added

#### Reviews UX/UI Audit & Fixes (20 issues fixed, 30 Playwright E2E tests)
Comprehensive UX/UI audit of the Performance Reviews feature with screenshot-driven TDD fixes.

- **P0 Fixes**: "Active Unknown" bug, date validation on cycle creation, disabled button tooltips, AI preview empty states, success toasts on create/delete
- **P1 Fixes**: Styled delete confirmation modal (replaces browser `confirm()`), ARIA tab attributes (`role=tablist/tab/tabpanel`), breadcrumb navigation consistency, mobile card view for cycles DataTable, user-facing error toasts on API failures
- **P2 Fixes**: Filter count badges on goals tabs, form label accessibility (`htmlFor`/`id`), live goal card preview on create form, `aria-label` on icon-only buttons, cycle timeline preview with phase markers, `aria-live` regions for screen readers, unified loading spinners to `primary-500`
- **Contributions & Feedback tabs**: Wired up with real data (metrics grid, skills, AI summary, self-review responses, full COIN peer feedback)
- **Onboarding**: Fixed checklist href, added "Create a SMART goal" item to developer/manager presets
- **Audit doc**: `review-screenshots/REVIEW_AI_UX_AUDIT.md` with before/after screenshots

#### Next.js 16 + React 19 Upgrade
- Upgraded `next` from 14.1.0 to 16.2.1, `react`/`react-dom` to 19.x
- Fixed JSX parse error in `CustomFieldTypeManager.tsx` (stricter parser)
- Installed missing `@tiptap/suggestion` dependency
- Defensive null check in `useAppAccess.ts`

#### Internationalization (i18n) with next-intl
Full i18n infrastructure with English + Hindi support across all modules.

- **next-intl**: Cookie-based locale system with middleware, Zustand locale store, and language selector in sidebar
- **20 module message files** per locale (EN + Hindi): common, reviews, sidebar, dashboard, tracking, settings, sprints, insights, crm, hiring, agents, booking, email-marketing, learning, uptime, compliance, admin, marketing, products, pages
- **Per-module JSON files** merged at build time via `npm run i18n:merge` (auto-runs on `prebuild`)
- **~1800+ translation keys** per locale covering all feature modules + homepage + product pages + pricing
- **7 review pages** fully converted to `useTranslations()` — remaining pages can adopt incrementally
- **CLAUDE.md** updated with i18n architecture docs, conventions, and how-to guides

### Changed
- `docker-compose.dev.yml` added with non-conflicting ports for parallel development
- CORS origin added for dev port 3003
- JSONB `server_default` syntax fix in dashboard and CRM models

## [0.7.0] - 2026-03-25

### Added

#### OpenRouter AI Provider
OpenRouter is now available as a first-class LLM provider, giving access to 100+ models (Claude, GPT-4o, Llama, Gemini, DeepSeek, etc.) through a single API key.

- **OpenRouterProvider**: Full `LLMProvider` implementation using the OpenAI-compatible chat completions API (`POST /chat/completions`) with Bearer auth, rate limit handling (429 with `retry-after`), and health checks via `/models`
- **Automatic model fallback**: When the primary model is rate-limited or unavailable (429/503), automatically tries the next model in a configurable fallback list — set `OPENROUTER_FALLBACK_MODELS` (comma-separated) to customize the fallback order
- **Configuration**: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default: `anthropic/claude-sonnet-4`), `OPENROUTER_FALLBACK_MODELS` (default: `google/gemini-2.0-flash,openai/gpt-4o,deepseek/deepseek-chat-v3,meta-llama/llama-3.1-70b-instruct`) env vars
- **Rate limiting**: Per-provider Redis-backed rate limits (`OPENROUTER_REQUESTS_PER_MINUTE`, `OPENROUTER_REQUESTS_PER_DAY`, `OPENROUTER_TOKENS_PER_MINUTE`)
- **Usage billing**: Configurable token pricing (`OPENROUTER_INPUT_PRICE_PER_MILLION`, `OPENROUTER_OUTPUT_PRICE_PER_MILLION`)
- **Frontend**: OpenRouter added to provider selector with Globe icon, indigo theme, and 5 default models; usage page shows OpenRouter breakdown
- **Docker**: `OPENROUTER_API_KEY` passed through in both `docker-compose.yml` and `docker-compose.prod.yml`

#### Platform Organization
Auto-CRM contact creation and onboarding drip email sequences triggered on user signup.

- **PlatformService**: Creates CRM contacts and enrolls new signups into onboarding drip email workflows when `PLATFORM_ORG_ID` is configured
- **Temporal activity**: `platform_on_signup` activity dispatched from the signup flow for async processing
- **Configuration**: `PLATFORM_ORG_ID` env var — set to a workspace UUID to enable

## [0.6.8] - 2026-03-21

### Added

#### Postmark Email Provider
Postmark is now available as an email provider across all three sending paths — notification emails, campaign/workflow emails, and mailagent domain-aware sending.

- **Backend EmailService**: Added `_send_via_postmark()` method, `is_postmark_configured` property, and Postmark routing in `_send_email()` — set `EMAIL_PROVIDER=postmark` to use for all notification emails
- **Mailagent PostmarkProvider**: Full `EmailProvider` implementation with `send()`, `verify_credentials()`, and native `send_batch()` (up to 500 per call via `/email/batch`)
- **PostmarkAccountService**: Account API client for managing sender signatures (`create`, `delete`, `list`) and domains (`verify`, `get`) using the Account API token
- **Agent email integration**: Automatic Postmark sender signature creation when allocating agent email addresses, and cleanup on disable
- **Message streams**: Separate transactional (`POSTMARK_TRANSACTIONAL_STREAM`, default `outbound`) and broadcast (`POSTMARK_BROADCAST_STREAM`, default `broadcast`) stream support — notification emails use transactional, campaigns use broadcast
- **Configuration**: `POSTMARK_SERVER_TOKEN`, `POSTMARK_ACCOUNT_TOKEN`, `POSTMARK_SENDER_EMAIL`, `POSTMARK_SENDER_NAME`, `POSTMARK_TRANSACTIONAL_STREAM`, `POSTMARK_BROADCAST_STREAM` env vars in backend; `POSTMARK_SERVER_TOKEN` in mailagent

## [0.6.7] - 2026-03-01

### Added

#### Team Chat System
Zulip-inspired real-time team chat with channels, topics, and threaded messages, accessible from a dedicated `/chat` page and a floating widget on every page.

- **Channels and topics**: Create and browse channels with topic-based threading; topic list with unread counts, last message preview, and participant count
- **Real-time messaging**: WebSocket-powered message delivery with typing indicators, presence status, and per-channel relay filtering
- **Floating chat widget**: FAB-accessible widget with Threads, Notifications, and Activity tabs; shared WebSocket connection via `ChatWebSocketProvider` (no duplicate connections)
- **Unified inbox**: Aggregated unread threads across all channels with click-through navigation
- **Google Meet integration**: Create Meet links directly from the message composer via Google Calendar API
- **Thread persistence**: Both widget and full page remember last opened channel/topic across sessions via Zustand store
- **Message composer**: Emoji picker, file attachments (drag-and-drop upload to RustFS), typing indicators, and responsive toolbar layout
- **Sprint task import**: Import tasks from external sources into sprint boards

#### Ask AI — Agentic Chat
Integrated AI chat assistant with multi-provider LLM support, server-side tool execution, and streaming responses.

- **Ask AI in chat page**: AI tab in the channel sidebar with conversation list (own + shared), date-grouped history, search, and inline delete
- **Agentic tool loop**: Server-side tool calling with workspace-scoped tools (sprints, tasks, tickets); tool calls streamed to client with status indicators
- **Multi-provider streaming**: SSE streaming via Anthropic, OpenAI, and Gemini providers through the unified LLM gateway
- **Ask AI in floating widget**: Compact AI chat view in the floating widget with conversation history browsing, share button, and participant avatar stack
- **Conversation sharing**: Share AI conversations with workspace members via direct add (with permission levels: read/write/owner) or share links (token-based, optional password, expiry, max uses)
- **Real-time collaboration**: Redis pub/sub for participant presence, AI lock to prevent concurrent responses, message queue for collaborative conversations
- **Share notifications**: In-app notifications when added as participant or when someone joins via share link, with click-through navigation to the conversation
- **Notification settings**: Chat category added to notification preferences page with `chat_mention` and `ai_conversation_shared` event types

#### AI Feedback & Benchmarking
- **Feedback collection**: Thumbs up/down on AI outputs across Ask AI, Agents, and Automations
- **Latency tracking**: Per-response latency measurement across all three LLM streaming providers
- **Admin benchmarking dashboard**: Volume trends, token usage breakdown, tool success rates, and negative feedback review queue

#### API Token Auth & MCP Integration
- **API token system**: `ApiToken` model with `aexy_` prefixed tokens, CRUD endpoints, create/validate/revoke service methods
- **Dual auth support**: API tokens accepted alongside JWT in auth middleware for external integrations
- **MCP setup page**: Frontend configuration page for Model Context Protocol integration with connection instructions
- **API tokens settings page**: Token management UI with copy-to-clipboard, delete confirmation, and last-used tracking (debounced to 5-min intervals)

### Fixed

#### Chat Security & Performance
- **Workspace authorization on all chat endpoints**: Added `_check_workspace` membership guard to every chat API endpoint (channels, topics, messages, presence, file upload)
- **Private channel access control**: Added `_check_channel_access` helper enforcing membership checks on topic listing, creation, message listing, and message sending for private channels
- **WebSocket workspace validation**: Reject WebSocket connections from non-workspace-members with close code 4003
- **WebSocket channel isolation**: Relay messages only to subscribers of the target channel
- **Input validation**: `max_length` constraints on all chat message and channel inputs
- **File upload content-type bypass**: Validate actual file content type, not just the declared MIME type
- **File upload extension validation**: Whitelist allowed file extensions; reject SVG uploads to prevent stored XSS
- **Channel update authorization**: Enforce ownership/admin checks on channel mutations
- **Presence status validation**: Reject invalid presence status values (only `online`, `away`, `offline` allowed)
- **Topic listing limit**: Added `LIMIT 200` to prevent unbounded topic queries
- **Service/API commit boundary**: Replaced all `db.commit()` in `ChatService` with `db.flush()`; explicit `await db.commit()` in all mutating API endpoints
- **N+1 query elimination**: Batch methods for inbox and topic queries; atomic `message_count` updates; correlated subqueries for `list_conversations` in Ask AI
- **TOCTOU race conditions**: `IntegrityError` handling for concurrent topic/message creation
- **Auto-scroll fix**: Only auto-scroll when user is already at the bottom of the message list
- **Memory leak fixes**: Clean up Object URLs, typing timeout intervals, and flash-success timeouts on component unmount
- **Stale WebSocket reconnect**: Fix reconnection using fresh token after re-auth
- **React performance**: `React.memo` on `MessageItem`, memoized WebSocket context value, deduplicated `markTopicRead` calls

#### Auth & API Security
- **Dual-session bug**: `get_current_developer_id` now uses the injected DB session instead of creating a separate one via `get_async_session()`
- **Seed migration removed**: Removed insecure seed migration containing hardcoded token hash
- **Hardcoded URLs removed**: MCP page uses `NEXT_PUBLIC_API_URL` env var instead of hardcoded localhost
- **Sanitized platform admin errors**: Internal exception details no longer exposed in error responses

#### AI Chat Security
- **Conversation ownership enforcement**: Cross-user conversation access blocked at service layer
- **Delete authorization**: Ownership check enforced before conversation deletion
- **Share link revocation authorization**: Ownership verification before revoking share links
- **bcrypt password hashing**: Share link passwords hashed with bcrypt instead of SHA-256
- **Cross-workspace data isolation**: Tools scoped to the requesting user's workspace
- **Sanitized error messages**: Internal error details stripped from SSE error events
- **API key protection**: LLM provider keys never exposed in client-facing responses
- **Pydantic literal validation**: `permission` fields in share schemas use `Literal["read", "write"]` instead of `str`

#### Frontend Security & Stability
- **Duplicate WebSocket eliminated**: `AskAIChatPanel` now uses `useChatWebSocketContext()` instead of creating a second `useChatWebSocket()` connection
- **Open redirect prevention**: Notification click-through validates `action_url` is a relative path (starts with `/`, not `//`)
- **XSS prevention in chat messages**: URL scheme validation (`http:`/`https:` only) before rendering user-provided URLs as `<img>` or `<a>` elements
- **Race condition fix**: `useStreamMessage` accepts override `conversationId` parameter, eliminating unreliable `setTimeout` in widget first-message flow
- **Store subscription optimization**: `useStreamMessage` uses `useAskStore.getState()` for mutations during streaming, preventing cascading re-renders
- **Memoized participant IDs**: `AskShareDialog` wraps `participantIds` Set in `useMemo` for stable dependency tracking
- **Stable effect dependencies**: `MessageThread` queue-flush effect uses ref for `sendMessage` to prevent infinite re-render loops
- **Floating widget hook optimization**: Split into wrapper + inner component so hooks don't run on `/chat` pages
- **Clipboard error handling**: Share link copy wrapped in try/catch with user-facing error toast
- **Delete confirmation**: AI conversation delete requires `window.confirm()` before proceeding

### Changed
- **MCP sidebar placement**: Moved under AI Agents as a sub-item instead of standalone sidebar entry
- **CopyButton extraction**: Duplicated copy-to-clipboard logic extracted to shared `components/ui/copy-button`
- **Delete confirmation UX**: API token delete uses inline Delete/Cancel step instead of browser `confirm()`

### Database Migrations
- `migrate_ask_collaborative.sql` — `ask_conversation_participants` and `ask_share_links` tables for collaborative AI conversations

---

## [0.6.6] - 2026-02-28

### Added

#### Notification System
Full multi-channel notification infrastructure with 4 delivery channels (in-app, email, Slack, web push) and workspace-wide event coverage.

- **22 new notification event types** covering leave, uptime, learning, forms, campaigns, automations, hiring, GTM, and documents modules
- **Email and Slack delivery**: Replace stubbed dispatch with actual Temporal activity-based delivery via EmailService (SES/SMTP) and Slack DMs; add `slack_sent`/`slack_sent_at` tracking columns
- **Web push notifications**: VAPID key configuration, service worker registration, push subscription management, and `send_notification_web_push` Temporal activity
- **Mention notifications**: Parse TipTap `mention:user:{uuid}` links from ticket comments, CRM notes, and sprint task comments; deliver in-app notifications respecting preferences (self-mentions skipped)
- **Category-based preferences**: 10 notification categories (sprints, reviews, agents, uptime, etc.) with per-channel toggles in frontend settings page
- **Notification sidebar**: Notification bell with unread count and dropdown panel in the main navigation
- **Graceful VAPID handling**: Web push hook skips silently when VAPID key is not configured

#### Agent Policy Engine (APE)
Governance layer that evaluates agent tool calls before execution, with audit trail and billing integration.

- **5 policy types**: `tool_block`, `tool_require_approval`, `field_restriction`, `rate_limit`, `token_budget` — workspace-scoped, priority-ordered, per-agent or global
- **Policy evaluation in LangGraph**: Per-tool-call gating in `BaseAgent._process_tools` — blocked calls return `[BLOCKED] reason` as `ToolMessage` so the LLM can adjust
- **Decision audit log**: Every tool call evaluation (allow, block, require_approval, rate_limited) recorded in `agent_policy_decisions` table with confidence context
- **Config change audit**: Append-only `agent_config_audits` table tracks agent create/update/delete/toggle with old/new field diffs
- **Token usage billing**: Agent execution token counts flow through `UsageService.record_usage()` with `analysis_type="agent_execution"`
- **Policy notifications**: Blocked and approval-required events notify workspace admins/owners via all 4 notification channels
- **CRUD API**: Full REST endpoints at `/workspaces/{ws}/crm/agent-policies` with admin-only mutations and workspace permission checks
- **Backward compatible**: No policy engine = no behavior change; fail-open on evaluation errors

#### Unified Activity Feed
Cross-module activity logging surfaced in a dedicated `/activity` page with filtering and infinite scroll.

- **Activity logger**: `log_activity()` helper using `begin_nested()` savepoints so logging failures never roll back parent transactions
- **22 entity types tracked**: Tasks, sprints, bugs, tickets, CRM records, documents, epics, releases, reviews, assessments, compliance, forms, goals, leave, agents, email campaigns, roles, stories, and workflows
- **UnifiedActivityFeed component**: Date-grouped timeline with entity type filter chips, entity-specific icons/colors, and click-through navigation to source entities
- **Infinite scroll**: `useActivityFeed` hook with `useInfiniteQuery` and `IntersectionObserver`-based pagination
- **Backend URL mapping**: `ActivityFeedService.get_entity_url()` resolves entity-specific deep links
- **Sidebar integration**: Activity feed added to main navigation

#### Sprint Module Upgrade
- **Planning poker**: Real-time estimation sessions with WebSocket-based voting, card flip animations, keyboard shortcuts (1-7 vote, R reveal, Enter accept), consensus celebration, and online participant indicators
- **Planning poker chat**: Real-time team chat within poker sessions via WebSocket broadcast
- **Sprint analytics**: Velocity tracking, burndown data, and sprint comparison endpoints
- **Task archival**: Soft delete (`is_archived`) replaces hard delete for sprint tasks
- **App access requests**: Request/approve/reject workflow for module access with notification integration
- **Improved task view**: Enhanced task detail display with richer metadata
- **Onboarding redesign**: Upgraded onboarding flow with improved UX across connect, repos, invite, and completion pages

### Fixed

#### Planning Poker Security & Reliability
- **WebSocket JWT authentication**: Replace unauthenticated `user_id`/`user_name` query params with JWT token verification
- **Thread-safe connections**: `asyncio.Lock` for WebSocket connect/disconnect to prevent race conditions
- **Chat rate limiting**: 5 messages per 10-second window per user
- **Exponential backoff reconnect**: 1s–30s delays with max 10 attempts
- **SQLAlchemy boolean comparison**: `is_(False)` instead of `== False`
- **Frontend modals**: Replace browser `confirm()`/`alert()` with proper modal dialogs and toast notifications
- **Schema cleanup**: Remove unused Pydantic schemas (`PlanningPokerVote`, `PlanningPokerState`, etc.)

#### Unified Activity Feed Quality
- **`assessment.workspace_id` AttributeError**: Fixed to use `organization_id` (Assessment model doesn't have `workspace_id`)
- **Duplicate ticket comment logging**: Removed copy-pasted `log_activity` block that created 2 entries per comment
- **Internal ticket comment leak**: Skip activity logging for internal notes to prevent existence leak in feed
- **Double-logging in sprints**: Removed API-layer `log_activity` calls where service layer already logs the same operations
- **Missing actor_id in reviews**: Added `current_user` dependency and `actor_id` to `submit_self_review`, `submit_manager_review`, `finalize_review`
- **Extra DB queries in reviews**: Replaced 2-query workspace_id lookups with single JOIN query

#### Notification System Fixes
- **3 broken integrations fixed**: Insights, tracking tasks, and agent mentions now route through `NotificationService` instead of bypassing it
- **Leave type resolution**: Resolve leave type names from DB instead of passing raw UUIDs in notification bodies
- **Template variable formatting**: Format notification titles with template variables (not just body text)

### Changed
- **Notification preferences seeded**: Migration seeds default preferences for all existing users
- **Sprint goals migration**: Added `sprint_goals` table for sprint goal tracking

### Database Migrations
- `migrate_notification_slack_sent.sql` — slack_sent tracking columns on notifications
- `migrate_notification_events.sql` — 22 new event types and category preferences
- `migrate_notification_providers.sql` — web push subscription storage and VAPID config
- `migrate_agent_policies.sql` — agent_policies, agent_policy_decisions, agent_config_audits tables with `updated_at` trigger
- `migrate_app_access_requests.sql` — app access request/approval workflow
- `migrate_sprint_goals.sql` — sprint goals table

---

## [0.6.5] - 2026-02-27

### Added

#### GTM (Go-To-Market) Module — Phase 2A–2D
Full AI-powered go-to-market automation system for outreach, lead scoring, visitor tracking, competitor intelligence, and account-based marketing.

**Phase 2A — Scoring Feedback Loop & Foundation**
- **Scoring feedback loop**: Email open/click events from campaign recipients auto-dispatch Temporal `score_lead` activities, linking engagement to CRM records
- **Provider slots UI**: Frontend fetches registered provider slots from `/providers/available`, displays configured providers with "Coming Soon" for unimplemented ones
- **Reply signal correction**: Properly emit `reply_received` when routing replies to sales; Temporal workflows finalize with `exit_reason="replied"`

**Phase 2B — Outreach Excellence & Warmup**
- **Timezone-aware send windows**: Skip weekends, enforce per-recipient timezone from CRM records
- **A/B variant selection**: Weighted random assignment with `variant_index` tracking on step executions
- **Reply threading**: `thread_id` forwarding for conversation continuity across outreach steps
- **Warmup bug fixes**: Fixed `increment_send_count` naming, `can_send()` missing workspace_id, warming metrics field mismatch

**Phase 2C — Intelligence Layer & LLM Integration**
- **Competitor intelligence**: Smart content extraction (strips nav/footer/scripts), LLM-powered change classification (pricing, feature, positioning, hiring, cosmetic), auto-skip cosmetic changes
- **Battle card generation**: LLM produces structured battle cards with strengths, weaknesses, advantages, objection handling, and talk tracks
- **Competitor changes UI**: Full change history tab with severity badges
- **Intent signals**: Job posting scraping from /careers pages with keyword matching and confidence scores; tech change detection from homepage scanning
- **ABM account scoring**: Real engagement calculation wired to outreach executions, campaign opens/clicks, visitor sessions, and intent signals with weighted scoring

**Phase 2D — Scale & Ops**
- **Outbound webhooks**: HMAC-SHA256 signed deliveries, secret rotation, delivery logging, test endpoint, and alert hub integration with automatic fan-out
- **Provider health tracking**: Hourly-bucketed API metrics (request counts, latency percentiles, error tracking) via GTMProviderHealthService
- **Pipeline dashboard**: Aggregated scoring, visitor, outreach, provider health, and webhook stats
- **Performance indexes**: Added indexes on behavioral_events, outreach executions, and visitor sessions
- **Connection pool tuning**: Optimized pool_size=10, max_overflow=20, recycle=1800s

#### Progressive Sidebar
- **Persona-based sidebar filtering**: Sidebar sections/items filtered by active persona (Developer, Manager, HR, Sales, etc.) via `useSidebarPersona` hook with server-persisted preferences
- **Favorites section**: Pinned items + auto-detected frequently visited pages shown at top of sidebar
- **Categorized Discover section**: Hidden modules grouped by category (Engineering, People, Business, Productivity) with reason tags — "Available in [persona] view" for persona-hidden items, "Not enabled" for access-gated items
- **Direct navigation for persona-hidden items**: Arrow button navigates directly to pages the user has access to but aren't shown in current persona
- **Admin quick-enable toggle**: Admins can enable disabled apps directly from Discover section via `+` button
- **Page visit tracker**: `usePageVisitTracker` hook records page visits for smart favorites
- **Label constants**: Added `CATEGORY_LABELS` and `PERSONA_LABELS` to `appDefinitions.ts`

#### Dashboard Enhancements
- **Persona-specific getting started checklist**: Onboarding checklist tailored to active persona with server-side persistence
- **Engineering Manager preset**: Added growth trajectory and soft skill tabs

### Fixed

#### GTM Security (44+ issues across all phases)
- **SSRF protection**: Blocks private IPs, cloud metadata, non-HTTP schemes in SEO audit crawler, competitor page checker, webhooks, email tracking, and intent collection
- **Prompt injection mitigation**: `sanitize_for_llm()` strips injection patterns from external content before LLM prompts
- **Rate limiting**: Redis-backed sliding-window rate limiter on public event ingestion (60 req/min per IP, 300 req/min per workspace)
- **Consent-gated tracking**: Rewrote `aexy-track.js` with data-consent attribute, GPC signal support, and blocked `identify()` without consent
- **Workspace authorization**: Added workspace_id filter to step execution, status update, and sequence stats endpoints
- **Mass assignment prevention**: Replaced unconstrained `setattr` with explicit allowlists in update_provider, update_template, update_competitor
- **GDPR erasure**: Extended to find record_ids from CRM records and outreach enrollments; anonymize CRM records
- **Format string injection**: Replaced `str.format(**event_data)` with `string.Template.safe_substitute()` in alert templating
- **CSV payload limits**: 1.5MB size check on async import endpoint
- **Suppression list dedup**: UniqueConstraint on (workspace_id, email), idempotent add
- **Required admin role**: Added `required_role="admin"` to 44 write/delete GTM endpoints

#### GTM Code Quality
- **API monolith split**: Split `api/gtm.py` (2844 lines) into 20 focused sub-modules under `api/gtm/` package
- **Activity monolith split**: Split `temporal/activities/gtm.py` (1616 lines) into 9 domain modules under `activities/gtm/`
- **Data retention**: Added `purge_behavioral_events` activity with 365-day configurable retention
- **Referential integrity**: Added ForeignKey to record_id on 8 GTM models with CASCADE/SET NULL
- **TypeScript types**: Added 30+ interfaces and typed 64 GTM API function return types
- **Frontend field mismatches**: Fixed INET serialization, Docker env passthrough, 6 missing GTM sidebar nav pages

#### Dashboard & Sidebar
- **Widget layout spacing**: Fixed dashboard widget spacing, icon sizes, and card header consistency
- **Layout spacing**: Fixed layout spacing issues across dashboard cards

### Changed
- **No-downtime deployments**: Updated ready endpoint to support rolling deployments
- **Sidebar rendering**: Main nav now renders from persona-filtered layout; Discover section uses full unfiltered layout
- **Auth hydration**: Resolved race condition in app layout that caused unwanted redirects during initial render

### Database Migrations
- GTM Phase 2B — outreach_step_executions and outreach_enrollments columns
- GTM Phase 2D — webhooks, provider health, behavioral event indexes, triggers
- `migrate_sidebar_preferences.sql` — sidebar_pinned_items and sidebar_page_visits preferences

---

## [0.6.4] - 2026-02-25

### Added

#### Standalone Data Tables
- **Data Tables module**: New first-class `/tables` route for creating and managing standalone data tables, independent of CRM objects
- **Table detail page**: Full table view with search, filtering, column visibility, view switching (table/kanban), and breadcrumb navigation
- **DataTableService**: New service layer (~1000 lines) abstracting table operations away from the CRM service
- **Tables API**: Complete REST API (`/api/v1/workspaces/{id}/tables`) with listing, detail, field CRUD, record CRUD, and bulk operations
- **React hooks**: `useTables`, `useTableFields`, `useTableRecords`, `useTableAccess` hooks for frontend data fetching

#### Field Type System
- **Pluggable field type registry**: Extensible registry pattern for registering and rendering field types
- **14 built-in field renderers**: Text, Number, Date, Email, Phone, URL, Currency, Rating, Checkbox, Select, Multi-Select, Textarea, Computed, Reference
- **FieldRenderer component**: Unified component that resolves and renders fields by type from the registry
- **InlineCell component**: Click-to-edit cells with Tab/Enter/Escape keyboard navigation
- **Column add/edit UI**: Dedicated panel for adding new columns with type picker and configuring existing columns

#### Document Integration
- **InlineDatabase TipTap extension**: Embed live, interactive data tables inside documents with full CRUD support

#### Sharing & Access Control
- **Public share links**: Generate shareable table links with token-based auth, configurable hidden columns, and row filters
- **Public tables API**: Dedicated `/api/v1/public/tables` endpoints for unauthenticated shared access
- **7-layer authorization**: JWT, workspace, app, RBAC, table, row, and column-level access checks
- **`owner_only` row access mode**: Restrict row visibility to the creating user, with admin bypass
- **TableCollaborator visibility**: Private tables now visible to explicitly added collaborators

#### Audit & Observability
- **Table audit trail**: `table_audit_log` table and `TableAuditService` for tracking all table mutations
- **Multi-entity shared views**: Extended `crm_lists` with `entity_type` for shared views across entity types

### Fixed

#### Security
- Escape LIKE wildcards (`%`, `_`) in filter inputs to prevent filter injection
- Switch share link passwords from SHA-256 to bcrypt
- Validate record-to-table ownership before update/delete operations
- Move share link password from query parameter to `X-Share-Password` header

#### Performance
- Replace N+1 bulk delete queries with batch validation and 100-record limit
- Deduplicate 3 redundant `WorkspaceMember` queries into 1 in `resolve_access`

#### Bug Fixes
- Fix `__import__` hack, return type annotations, and `ip_address` type mismatches in backend
- Allow clearing nullable table fields via update
- Remove no-op `_strip_hidden_columns` method
- Remove noisy chat toast notification
- Fix `useMemo` unstable dependency array in frontend components
- TypeScript type fixes across table components

### Changed
- Added Pydantic request models for `update_table` and `create_share_link` endpoints
- Refactored CRM service to delegate table operations to new `DataTableService`

### Database Migrations
- `migrate_data_tables.sql` — Core tables for data table support
- `migrate_data_tables_phase3_7.sql` — Audit log and share link tables

---

## [0.6.3] - 2026-02-25

### Added

#### Platform Features
- **Exports page**: Full data export UI with format selection (PDF, CSV, JSON, XLSX), live status polling, and download management
- **Webhooks settings page**: Webhook endpoint management with secret rotation, event selection, test delivery, and HMAC signature documentation
- **SSO settings page**: SAML/OIDC configuration with provider setup, connection testing, and activation controls
- **Usage dashboard**: Workspace-level usage stats, provider breakdown, plan limits overview, and usage alerts
- **Notification center**: Unified notification page with date grouping, read/unread filtering, and load-more pagination
- **Notification settings**: Per-channel preferences (email, in-app, Slack) for all event types
- **Templates gallery**: Browsable catalog of 21 pre-built automation, form, and assessment templates with category filtering

#### Shared UI Components
- **DataTable**: Generic sortable data table with pagination, skeleton loading, empty states, and accessible keyboard navigation
- **SearchInput**: Reusable search input with clear button, replacing 33 inline implementations
- **Breadcrumb**: Navigation breadcrumb component with `aria-current="page"` support
- **EmptyState**: Shared empty state component with icons, steps, and action buttons, deployed across 15 module pages
- **ErrorBoundary**: Class-based error boundary with retry and error details toggle
- **ModuleError**: Per-module Next.js error.tsx boundary component
- **UpgradeBanner**: Contextual upgrade prompts at key monetization touchpoints with persistent dismissal
- **WorkspaceChecklist**: Getting-started checklist with progress ring for new workspaces
- **DashboardWelcome**: First-visit persona picker for personalized dashboard widget layout

#### Keyboard Shortcuts & Command Palette
- **Global shortcuts**: `g then X` navigation pattern (like GitHub/Linear) for 19 modules
- **Keyboard shortcuts help overlay**: `?` key opens categorized shortcut reference
- **Command palette enhancements**: Added navigation entries for exports, webhooks, templates, and all new pages

#### Automation Triggers
- **Ticket triggers**: `ticket.reopened`, `ticket.priority_changed`, `ticket.escalated`, `response.sent`, `response.received`, `sla.breached`
- **Hiring triggers**: `candidate.rejected`, `candidate.hired`, `assessment.score_above`, `assessment.score_below`
- **Sprint triggers**: `sprint.velocity_calculated`, `sprint.burndown_off_track`
- **Uptime triggers**: `monitor.ssl_expiring`, `monitor.repeated_failures`
- **Campaign trigger**: `campaign.sent`
- **Module automation panels**: Inline automation management UI embeddable in any module page

#### UX Improvements
- **Skeleton loading migration**: Replaced spinner loading states with skeleton placeholders across 20+ pages in 5 batches
- **DataTable migration**: Migrated 17 pages from custom table markup to shared DataTable component in 3 batches
- **Status color tokens**: Centralized status color definitions in `statusColors.ts`, migrated 34 files
- **Toast notifications**: Added success/error toasts to all mutation hooks across 14 hook files
- **Mobile responsiveness**: Improved layout and tracking page responsiveness
- **Contextual upgrade banners**: Added to 7 major modules for free-tier users

### Fixed

#### Critical Bugs
- **Assessment score triggers used wrong ID**: `assessment.workspace_id` did not exist on the Assessment model — changed to `assessment.organization_id` so `score_above`/`score_below` triggers actually fire
- **Ticket reopen detection crashed**: `TicketStatus.OPEN` did not exist in the enum — changed to `TicketStatus.ACKNOWLEDGED`
- **Command palette duplicate ID**: Two entries shared `id: "nav-templates"` causing React key collision — renamed second to `nav-automation-templates`

#### Medium Bugs
- **Burndown off-track trigger skipped on existing metrics**: Early return on updated rows bypassed the deviation check — restructured to always evaluate
- **Uptime triggers fired on every check**: SSL expiring and repeated failures had no debounce — SSL now fires at day thresholds (30/14/7/3/1), repeated failures fires at exactly 3 consecutive
- **Webhook test toast misleading**: `onSuccess` always showed success even when `WebhookTestResult.success` was false — now checks the result
- **useAutomations registry hooks caused re-renders**: Normalization created new object references on every render — wrapped in `useMemo`
- **SSO page silent errors**: `loadConfig`, `handleToggle`, `handleDelete` used `try/finally` with no catch — added error handling with toast notifications
- **SSO page stale closure**: `useEffect` missing `loadConfig` in dependency array — wrapped in `useCallback`
- **SSO API swallowed all errors**: `getConfiguration` caught everything and returned null — now only catches 404
- **Exports page bypassed type safety**: `createExport(data as any)` — replaced with proper type assertion
- **Webhooks page null workspace**: `currentWorkspaceId!` non-null assertion could produce `/workspaces/null/` API calls — added guard

#### Code Quality
- **Hiring dispatch error handling**: Wrapped `candidate.rejected`/`candidate.hired` dispatch calls in try/except for consistency
- **CRM `between` operator**: Added ValueError/TypeError handling for non-numeric values
- **GlobalShortcuts cleanup**: Dynamic event listener and timeout now properly cleaned up on unmount
- **UpgradeBanner dismiss persistence**: Dismiss state now saved to localStorage, survives navigation
- **WorkspaceChecklist JSON.parse safety**: Wrapped in try/catch to handle corrupted localStorage
- **ModuleAutomationsPanel confirm dialog**: Replaced native `confirm()` with styled confirmation modal
- **Dead code removal**: Removed unused `workspaceId` prop from CommandPalette, unused `useAuth` import from SSO page

#### Accessibility
- **CommandPalette**: Added `role="dialog"`, `aria-modal`, `role="combobox"` on search input, `role="listbox"` on results
- **DataTable**: Added `aria-sort` on sortable headers, `tabIndex` and keyboard handlers (Enter/Space) for sortable headers and clickable rows
- **KeyboardShortcutsHelp**: Added `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-label="Close"` on close button
- **DashboardWelcome**: Added `role="dialog"`, `aria-modal`, `aria-label`
- **ErrorBoundary & ModuleError**: Added `role="alert"` on error container
- **SearchInput**: Added `aria-label="Clear search"` on clear button
- **Breadcrumb**: Added `aria-current="page"` on last breadcrumb item
- **UpgradeBanner**: Added `aria-label="Dismiss banner"` on dismiss buttons

---

## [0.6.2] - 2026-02-24

### Added

#### Automation Module Enterprise Improvements
Comprehensive improvements to the automation workflow builder across all 10 modules.

- **Trigger & action descriptions**: All 105 triggers and 66 actions now have human-readable descriptions displayed in the node palette and config panel
- **Backend registry upgrade**: `TRIGGER_REGISTRY` and `ACTION_REGISTRY` now return `{id, description}` objects instead of plain strings, with backward-compatible helper functions (`get_trigger_ids`, `get_action_ids`)
- **Module-aware trigger icons**: TriggerNode now displays context-specific icons for all 10 modules (tracking: ClipboardCheck/Timer/ShieldAlert, compliance: GraduationCap/BookOpen/Award, tickets: Ticket, hiring: UserPlus, etc.) instead of generic Zap
- **Tracking & compliance objects in config panel**: Added object type selectors for tracking (Standup, Time Entry, Blocker, Work Log) and compliance (Training, Assignment, Certification, Audit Log) modules
- **Trigger description in config panel**: Clicking a trigger node now shows the full description in italic below the label field
- **Complete trigger/action label coverage**: Added labels for all missing triggers (`standup.streak`, `time_entry.anomaly`, `blocker.pattern_detected`, `training.bulk_overdue`, `certification.prerequisite_unmet`, etc.) and actions across all modules
- **Pydantic `RegistryEntry` model**: New schema for typed API responses with `id` and `description` fields

### Fixed
- **Missing condition operators**: Implemented `starts_with`, `ends_with`, `not_contains`, and `between` operators in `CRMAutomationService._check_condition()` which previously fell through to `return True`
- **Logging**: Replaced all `print()` calls in `AutomationService.process_module_trigger()` with proper `logger.info/debug/error` calls

---

## [0.6.1] - 2026-02-24

### Added

#### 29 Dashboard Widgets Implemented
Replaced all "Coming Soon" placeholder widgets with full implementations using live data from existing hooks.

- **Goals & Growth** (5): `MyGoalsWidget`, `GrowthTrajectoryWidget`, `PeerBenchmarkWidget`, `LearningPathWidget`, `SkillGapsWidget`
- **Tracking** (3): `StandupStatusWidget`, `TimeTrackingWidget`, `UpcomingDeadlinesWidget`
- **Tickets & Forms** (5): `SLAOverviewWidget`, `RecentTicketsWidget`, `TicketsByPriorityWidget`, `FormSubmissionsWidget`, `RecentFormsWidget`
- **Docs** (2): `RecentDocsWidget`, `DocActivityWidget`
- **Reviews** (3): `PerformanceReviewsWidget`, `PendingReviewsWidget`, `ReviewCycleWidget`
- **Hiring** (4): `HiringPipelineWidget`, `CandidateStatsWidget`, `OpenPositionsWidget`, `InterviewScheduleWidget`
- **CRM** (3): `DealStatsWidget`, `RecentDealsWidget`, `CRMQuickViewWidget`
- **Team & Admin** (4): `TeamOverviewWidget`, `TeamActivityWidget`, `OrgMetricsWidget`, `SystemHealthWidget`

### Fixed
- Fixed `TeamStatsSummaryWidget` to use correct nested `aggregate` property paths
- Fixed `TicketChartWidget` to use theme-aware colors instead of hardcoded dark-mode hex values
- Fixed `TicketPipelineWidget` to remove unnecessary `as any` cast
- Fixed `PeerBenchmarkWidget` ordinal suffixes (1st, 2nd, 3rd instead of always "th")
- Removed dead code from `TicketsByPriorityWidget` (unreachable priority breakdown branch)
- Fixed `UpcomingDeadlinesWidget` to use sprint end date and incomplete tasks instead of nonexistent `due_date` field

---

## [0.6.0] - 2026-02-24

### Added

#### Leave Management Module
Full leave management system with request/approval workflows, balance tracking, and holiday calendar management.
- Backend API with five service layers: `LeaveTypeService`, `LeavePolicyService`, `LeaveRequestService`, `LeaveBalanceService`, `HolidayService`
- Frontend with `LeaveRequestForm`, `LeaveRequestCard`, `LeaveApprovalCard`, `LeaveBalanceCard`, `LeavePolicySettings`, `LeaveTypeSettings`, `HolidaySettings`, `TeamLeaveTable`
- Database migration for leave tables and relationships
- Playwright E2E test suite (749-line spec with fixtures)

#### Team Calendar
Unified calendar view showing leave, holidays, and team availability.
- Backend API and service with Pydantic schemas
- Frontend components: `TeamCalendar`, `CalendarFilters`, `EventDetailModal`, `WhoIsOutPanel`

#### Compliance & Tracking Automation
Temporal-powered automation for compliance monitoring and developer activity tracking.
- Compliance automation activities (396 lines): standup compliance checks, time entry audits, auto-escalation
- Tracking automation activities (492 lines): standup streak tracking, time entry anomaly detection, blocker pattern analysis
- Compliance service (260 lines) with status change detection
- Tracking events helper (163 lines), tracking compliance config, CRM automation service, Slack tracking service
- New automation trigger types: `standup.streak`, `time_entry.anomaly`, `blocker.pattern_detected`, `training.bulk_overdue`, `certification.prerequisite_unmet`
- Periodic Temporal schedules for compliance and tracking jobs

#### 13 New Dashboard Widgets
- Engineering manager widgets: `BacklogOverviewWidget`, `BlockersOverviewWidget`, `SprintBurndownWidget`, `TasksCompletedChartWidget`, `TeamStatsSummaryWidget`, `TicketChartWidget`, `TicketPipelineWidget`, `VelocityTrendWidget`, `WorkloadDistributionWidget`
- Leave-integrated widgets: `LeaveBalanceWidget`, `PendingLeaveApprovalsWidget`, `TeamAvailabilityWidget`, `TeamCalendarWidget`
- Widget registry expanded from 23 to 36+ widget IDs

#### Email Tracking API
Campaign open/click tracking endpoints for email marketing analytics.

#### Reminders Module Expansion
- Dedicated "All Reminders" and "My Reminders" pages
- Compliance sub-routes for reminders and training

#### App Definitions System
Dynamic app/module registration via `AppDefinitions` model and frontend config.

#### AI Insights Automation
Temporal activity for periodic AI-powered insights generation with scheduled execution.

### Improved

#### GitHub Sync Reliability
- Auto-refresh expired GitHub App tokens (`ghu_`) using stored refresh tokens — tokens no longer silently expire after 8 hours
- Proper 404 handling: detects GitHub App installation permission issues vs genuinely missing repos, with actionable error messages including direct settings links
- `GitHubNotFoundError` exception with non-retryable Temporal retry policy
- Auto-sync skips developers with broken auth (`auth_status="error"`) instead of flooding Temporal with failing workflows
- Sync logs now include `@github_username` and repo full name instead of opaque UUIDs

#### Settings Module Revamp
- Complete redesign with `SettingsShell`, `SettingsSidebar`, and `SettingsSearch` components
- Searchable navigation config (214 lines) with fuzzy-matching
- GitHub sync job interval configurable from repository settings

#### Full Light Mode Support
- Theme-aware styling across 380+ frontend components
- Badge readability improvements across 138 components
- Fixed docs sidebar, theme toggle, and app access for light mode

#### Stripe Billing & Subscriptions
- Revamped plan upgrade/downgrade flow with proper subscription state handling
- Enhanced Stripe setup with expanded plan configuration
- Plan-based feature gating via limits service
- `fix_subscription_plans.py` script for correcting plan data

#### Hiring & Assessment Module
- Assessment evaluation and question generation service improvements
- Candidate detail page redesign with richer reporting
- Assessment wizard topic distribution UI improvements

#### Onboarding Flow
- Improved onboarding for already-invited users with workspace join flow
- Invitation-aware workspace creation page

#### Gmail & Temporal Sync
- Gmail sync activity with better error handling
- Temporal dispatch improvements with new workflow patterns

#### Automation UI
- Workflow builder `NodePalette` expanded with compliance and tracking trigger/action nodes
- Automation pages updated for new trigger types

### Fixed
- Assessment async context manager misuse causing evaluation failures
- Backend startup import/initialization error
- GitHub sync race conditions and error handling in Temporal activities
- Email marketing campaign visibility toggle not persisting
- Hiring module: missing API fields, candidate page errors, evaluation scoring
- Dashboard and stats count mismatches across assessment and tracking modules
- Compliance and tracking page rendering, reminder instance cards, compliance sub-routes
- Automation trigger registration and booking activity errors
- Deduplicated logic in sync service, optimized developer insights queries
- Widget rendering order, sidebar page links, compliance page layout
- Stale data in `useNotifications` and `useReminders` hooks

### Infrastructure
- Updated `docker-compose.prod.yml` with additional service configuration
- Playwright E2E infrastructure: config, mock data fixtures, `test:e2e` / `test:e2e:ui` npm scripts
- 4 new database migrations: `migrate_leave_management.sql`, `migrate_github_auth_status.sql`, `migrate_developer_email_nullable.sql`, `migrate_repo_sync_settings.sql`
- Temporal worker: registered compliance, tracking, insights, and booking activities; expanded periodic schedules

---

## [0.5.6] - 2026-02-14

### Added

#### Dynamic Dashboard Widget System

Replaced the hardcoded dashboard layout with a fully dynamic, preference-driven widget rendering system. Widgets now render from `widget_order` and `visible_widgets` stored in user preferences, with drag-and-drop reordering support.

**Widget Extraction (9 new components):**
- `WelcomeWidget` — greeting, GitHub connection status, quick action links
- `QuickStatsWidget` — language count, framework count, avg PR size, work style
- `LanguageProficiencyWidget` — language bars with proficiency scores, commit counts, trends
- `WorkPatternsWidget` — complexity preference, peak hours, review turnaround
- `DomainExpertiseWidget` — domain tags with confidence scores
- `FrameworksToolsWidget` — framework/tool tags with proficiency scores
- `AIInsightsWidget` — composite widget wrapping InsightsCard, SoftSkillsCard, GrowthTrajectory, PeerBenchmark
- `SoftSkillsWidget` — Reviews & Goals section with My Goals and Performance Reviews
- `ComingSoonWidget` — placeholder for unimplemented widget IDs

**Widget Registry (`widgetRegistry.tsx`):**
- Maps 23 widget IDs to React components (developer, engineering manager, and product manager widgets)
- `getWidgetComponent()` helper with ComingSoonWidget fallback
- `isWidgetImplemented()` check for registry membership

**Dashboard Page Rewrite (`page.tsx`):**
- Dynamic rendering from `orderedVisibleWidgets` computed via `widget_order` intersected with `visible_widgets`
- `getWidgetProps()` switch maps widget IDs to their specific data props
- `getWidgetGridClass()` maps widget sizes to CSS grid column spans
- `renderWidget()` skips composite children and renders from registry or ComingSoonWidget
- Edit Layout toggle button (Pencil/Check icons) for entering/exiting drag mode

**SortableWidgetGrid Updates:**
- Changed layout from `space-y-6` vertical stack to CSS grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Added `renderableWidgets` filter to skip null renders from composite children
- Drag handle repositioned to `top-2 right-2`

**Customize Modal — Reorder Tab:**
- Added third tab "Reorder" to `DashboardCustomizeModal`
- New `WidgetReorderList` component — dnd-kit vertical list showing widget icon, name, size badge, and drag handle
- Tabs now rendered from data array; description updated

**Enriched Non-Developer Presets:**
- Manager: added `aiAgents`, `upcomingDeadlines`, `recentDocs`
- Product: added `aiInsights`, `aiAgents`
- HR: added `quickStats`, `aiAgents`, `upcomingDeadlines`, `myGoals`
- Support: added `quickStats`, `aiAgents`, `teamOverview`, `myGoals`
- Sales: added `quickStats`, `aiAgents`, `teamOverview`, `upcomingDeadlines`
- Admin: added `quickStats`, `aiAgents`, `myGoals`, `upcomingDeadlines`, `recentDocs`

#### Playwright E2E Test Suite

Added end-to-end testing infrastructure for the dashboard.

- `playwright.config.ts` — Chromium project, baseURL localhost:3000, auto-start dev server
- `e2e/fixtures/mock-data.ts` — mock user, preferences, insights, soft skills fixtures
- `e2e/dashboard.spec.ts` — 18 tests across 6 describe blocks:
  - Widget Rendering (7 tests): welcome, quickStats, languageProficiency, workPatterns, domainExpertise, frameworksTools, ComingSoon
  - Widget Ordering (2 tests): order from preferences, only visible widgets rendered
  - Edit Layout Toggle (2 tests): button toggle, drag handles in edit mode
  - Customize Modal (4 tests): three tabs, tab switching, reorder tab content, close
  - Manager Preset (1 test): cross-cutting widgets present
  - Grid Layout (2 tests): CSS grid container, full-span widgets

### Changed

- Bumped frontend version from `0.5.5` to `0.5.6`
- Added `@playwright/test` dev dependency
- Added `test:e2e` and `test:e2e:ui` npm scripts

## [0.5.5] - 2026-02-13

### Added

#### All-Contributors Sync

Extended GitHub sync to capture all contributors' commits, PRs, and reviews — not just the connecting user. External contributors are auto-created as "ghost" Developer records.

**Backend:**
- New model fields: `author_github_login` and `author_email` on `Commit` for preserving original author identity
- New helpers: `_resolve_developer_for_commit()` and `_resolve_developer_for_pr()` in `SyncService` to match or auto-create Developer records by GitHub ID or email
- In-memory developer lookup cache within each sync session to avoid N+1 queries
- Removed `author=github_username` filter from `_sync_commits_with_session()` — now fetches all commits
- Removed `login != github_username` filter from `_sync_pull_requests_with_session()` and `_sync_reviews_with_session()`
- Migration: `migrate_commit_author_fields.sql` — adds `author_github_login`, `author_email` columns with indexes

**Ghost Developer Support Across Insights:**
- New helper: `_get_all_contributor_ids()` in `developer_insights.py` — discovers external contributors by querying commits/PRs/reviews in workspace repos
- Leaderboard, team insights, executive summary, and all 6 AI insight endpoints (team narrative, sprint retro, trajectory, root cause, composition, hiring forecast) now include ghost developers
- Ghost developers appear in all rankings, comparisons, and AI-generated narratives alongside workspace members

#### Metric Explanation Tooltips

Added hover tooltips with explanations across all insights pages.

**Compare Page (`/insights/compare`):**
- Info icon + CSS hover popover on each row in the Side-by-Side Metrics table (commits, PRs merged, merge rate, cycle time, lines added, review rate, health score, focus time)
- Radar chart axis labels show native browser tooltips via SVG `<title>` element
- Extended `RadarDataPoint` interface with optional `desc` field
- New `CustomAngleTick` component in `MetricsRadar.tsx` for tooltip-enabled axis labels
- `RADAR_METRICS` config includes `desc` for each metric

**Executive Dashboard (`/insights/executive`):**
- Org Health metrics: Gini Coefficient, Workload Balance, Avg Commits/Dev, Avg PRs/Dev
- Burnout Risks: WE (weekend commit %) and LN (late night commit %) with explanations
- Bottlenecks: explanation of the 2x average threshold

### Fixed

#### Developer Names Instead of UUID Hashes

Multiple insights pages displayed truncated UUIDs (e.g., `8f983e00-386...`) instead of developer names.

- **Compare page** — dropdown items, selected pills, radar chart legends, heatmap labels, and table headers now show developer names via `devNameMap` lookup
- **Executive dashboard** — top contributors table, burnout risks, and bottlenecks now show `developer_name` from API
- **Sprint capacity** — per-developer breakdown table now shows `developer_name` from API
- Added `developer_name` field to backend responses: `compute_executive_summary()`, `estimate_sprint_capacity()`
- Updated TypeScript interfaces: `ExecutiveSummaryResponse`, `SprintCapacityDeveloper`

#### Developer Detail Page Crash

Fixed `/insights/developers/[id]` crashing on gaming flags section due to API schema mismatch.

- Backend returns `{type, severity, description, evidence(object)}` but frontend expected `{pattern, severity: "low"|"medium"|"high", evidence: string}`
- Fixed with `Record<string, unknown>` type and proper field fallbacks (`flag.type || flag.pattern`, severity includes "warning")
- Added optional chaining for `flag.pattern?.replace()` to prevent `TypeError`

#### Analytics Dashboard Broken Joins

Fixed `analytics_dashboard.py` using stale `CodeReview.pull_request_id` column (renamed to `pull_request_github_id`).

- Updated two join clauses to use `CodeReview.pull_request_github_id == PullRequest.github_id`
- Fixed `conftest.py` test fixture using the same stale field name

#### Ghost Developer Creation for PRs/Reviews

`_resolve_developer_for_pr()` now auto-creates ghost Developer records (by GitHub login) when no existing developer matches, consistent with `_resolve_developer_for_commit()` behavior.

### Changed

- Bumped frontend version from `0.5.4` to `0.5.5`
- Moved inline `from sqlalchemy import or_` to top-level import in `developer_insights.py`

---

## [0.5.4] - 2026-02-09

### Added

#### Developer Insights (Enterprise Analytics)

Comprehensive developer productivity analytics platform with AI-powered insights, alerting, and forecasting.

**Backend:**
- New models: `DeveloperMetricsSnapshot`, `TeamMetricsSnapshot`, `InsightSettings`, `DeveloperWorkingSchedule`, `InsightAlertRule`, `InsightAlertHistory`, `InsightReportSchedule`, `SavedInsightDashboard`
- New API: `api/developer_insights.py` - 25+ endpoints for individual developer metrics, team insights, leaderboard, executive summary, sprint capacity, bus factor, rotation impact, project insights, alert rules, and AI narratives
- New service: `services/developer_insights_service.py` - Metric computation across 6 dimensions (velocity, efficiency, quality, sustainability, collaboration, sprint productivity), forecasting, gaming detection, health scoring, percentile rankings, role benchmarking, and executive summaries
- New service: `services/insights_ai_service.py` - LLM-powered narrative generation for team/developer performance, anomaly detection, root cause analysis, 1:1 prep notes, sprint retro insights, trajectory forecasting, team composition recommendations, and hiring timeline estimation
- New cache: `cache/insights_cache.py` - Redis caching with 5-min TTL, deterministic key generation, and pattern-based invalidation
- New schemas: `schemas/developer_insights.py` - Complete Pydantic schemas for all metrics, responses, settings, and alerts
- Migrations: `migrate_developer_insights.sql`, `migrate_developer_insights_v2.sql`, `migrate_developer_insights_v3.sql`
- Integration tests: `tests/integration/test_developer_insights_api.py`
- Unit tests: `tests/unit/test_developer_insights_service.py`

**Metrics Computed:**
- Velocity: commits, PRs merged, lines added/removed, commit frequency, PR throughput, average commit size
- Efficiency: PR cycle time, time to first review, PR merge rate, rework ratio
- Quality: review participation rate, review depth, review turnaround, self-merge rate
- Sustainability: weekend/late-night commit ratios, work streaks, active hours, focus score
- Collaboration: unique collaborators, cross-team PR ratio, knowledge sharing score
- Sprint: task completion rate, story points, cycle/lead time, carry-over tasks

**Advanced Features:**
- Velocity forecasting via weighted moving average
- Metric gaming detection (suspicious patterns)
- Code churn/rework analysis
- PR size distribution analysis
- Composite health scores with configurable weights
- Percentile rankings within peer group
- Role-based benchmarking (by engineering level)
- Gini coefficient for workload distribution analysis
- Bus factor per repository
- Rotation impact simulation (velocity loss prediction)
- Sprint capacity estimation
- GDPR-compliant data export

**Alert System:**
- Configurable alert rules with conditions (gt, lt, gte, lte, eq, change_pct)
- Scope: workspace, team, or individual developer
- Severity levels: info, warning, critical
- Multi-channel notifications (in-app, email, Slack)
- Alert history with acknowledge/resolve workflow
- Seed templates for common alerts
- New notification event types: `INSIGHT_ALERT_WARNING`, `INSIGHT_ALERT_CRITICAL`

**Frontend:**
- New routes:
  - `/insights` - Team overview with stat cards and workload distribution chart
  - `/insights/leaderboard` - Ranked developer metrics
  - `/insights/developers/[developerId]` - Individual developer drill-down
  - `/insights/compare` - Side-by-side developer comparison
  - `/insights/allocations` - Resource allocation view
  - `/insights/alerts` - Alert management
  - `/insights/executive` - Executive dashboard
  - `/insights/sprint-capacity` - Sprint planning with capacity estimation
  - `/insights/ai` - AI-powered insights (narratives, anomalies, recommendations)
  - `/insights/me` - Personal insights
  - `/settings/insights` - Insights configuration (working hours, metric weights, snapshot frequency)
- `useInsights` hook - React Query integration with 10+ hooks for metrics, trends, leaderboard, alerts, and AI narratives
- Components: `ActivityHeatmap`, `MetricsRadar`

#### Permissions & Navigation

- New permission category: `INSIGHTS` with `can_view_insights` and `can_manage_insights`
- New app definition: `insights` in app catalog with `team_overview`, `leaderboard`, and `developer_drilldown` modules
- Insights enabled in `full_access` bundle
- Insights section added to sidebar in both grouped and flat layouts
- New widget permissions: `teamInsights`, `developerInsights`, `insightsLeaderboard`, `workloadDistribution`

### Changed

- Deprecated Celery app configuration (`celery_app.py`) - all background processing now uses Temporal; `celery_app` set to `None` with deprecation warning
- Updated admin API references from Celery to Temporal (renamed `get_celery_stats` to `get_temporal_stats`)
- Updated repository sync API parameter from `use_celery` to `use_background`
- Renamed `developer` to `user` in auth hook (`useAuth`) - updated `AppAccessGuard` and `Sidebar`
- Changed `GoogleIcon` export from named to local function in landing page (moved to dedicated `components/icons/GoogleIcon.tsx`)
- Added `formatRelativeTime` utility function to `lib/utils.ts`
- Bumped frontend version from `0.5.3` to `0.5.4`

### Fixed

- Fixed mock implementations and minor bugs across test suite

---

## [0.5.3] - 2026-02-09

### Added

#### Compliance Center

New top-level Compliance module for managing regulatory compliance, documents, reminders, training, and certifications.

**New Routes:**
- `/compliance` - Compliance dashboard with overview stats, upcoming reminders, and category breakdown
- `/compliance/reminders` - Recurring compliance reminder management with list and calendar views
- `/compliance/reminders/new` - Multi-step reminder creation wizard (basic info, schedule, assignment, review)
- `/compliance/reminders/[reminderId]` - Reminder detail and instance history
- `/compliance/reminders/calendar` - Calendar view of upcoming reminder instances
- `/compliance/reminders/compliance` - Questionnaire import and analysis
- `/compliance/documents` - Document Center with folder tree, search, filtering, and upload
- `/compliance/documents/[documentId]` - Document detail with metadata, tags, and entity linking
- `/compliance/training` - Mandatory training management with assignment tracking
- `/compliance/certifications` - Certification tracking with developer enrollment and progress
- `/compliance/calendar` - Unified compliance calendar

---

#### Recurring Reminders System

Full-featured recurring reminder engine for compliance tasks with escalation, assignment, and scheduling.

**Backend:**
- New models: `Reminder`, `ReminderInstance`, `ReminderEscalation`, `ControlOwner`, `DomainTeamMapping`, `AssignmentRule`, `ReminderSuggestion`
- New API: `api/reminders.py` - 30+ endpoints for reminders, instances, control owners, assignment rules, domain mappings, suggestions, dashboard stats, calendar, and bulk operations
- New service: `services/reminder_service.py` - Reminder CRUD, instance generation, acknowledgment, completion, skip, reassignment, escalation, and dashboard statistics
- New schemas: `schemas/reminder.py` - Complete Pydantic schemas for all reminder operations
- Migration: `migrate_reminders.sql` - 7 tables with proper indexes, triggers, and constraints

**Temporal Activities** (`temporal/activities/reminders.py`):
- `generate_reminder_instances` - Daily task to generate upcoming instances from recurrence rules
- `check_overdue_reminders` - Hourly check for overdue instances with automatic escalation
- `send_reminder_notifications` - Sends due/upcoming reminder notifications
- `send_weekly_slack_summary` - Weekly compliance status summary (logging only for now)
- `check_evidence_freshness` - Daily check for stale evidence on completed instances

**Features:**
- Recurrence: daily, weekly, biweekly, monthly, quarterly, semi-annual, annual frequencies
- Priority levels: low, medium, high, critical
- Categories: regulatory, security, financial, hr, operational, it, legal, environmental, quality, data_privacy, health_safety, custom
- Auto-assignment via control owners, domain-team mappings, and configurable assignment rules
- 3-level escalation: manager, director, VP with configurable timeframes
- Evidence collection with link attachments on instance completion
- Bulk operations: assign and complete multiple instances at once

**Frontend:**
- `useReminders` hook - React Query integration with 10+ hooks for all reminder operations
- Shared components: `ReminderCard`, `ReminderInstanceCard`, `ReminderStatusBadge`, `ReminderPriorityBadge`, `ReminderCategoryBadge`, `InstanceStatusBadge`, `RecurrenceDisplay`
- `ReminderCreationWizard` - 4-step wizard with validation and team/owner assignment

---

#### Questionnaire Import & Analysis

Import compliance questionnaires from Excel/CSV with AI-powered column detection and automatic reminder generation.

**Backend:**
- New models: `QuestionnaireResponse`, `QuestionnaireQuestion` with status tracking
- New API: `api/questionnaires.py` - Upload, analyze, accept/reject suggestions, list responses
- New service: `services/questionnaire_service.py` - 3-tier column detection (exact alias match, fuzzy substring, LLM fallback), cross-questionnaire deduplication, and automatic reminder suggestion generation
- Migration: `migrate_questionnaire.sql` - Questionnaire tables with proper indexing

**Frontend:**
- `useQuestionnaires` hook - Upload, analysis, and suggestion management
- Compliance questionnaire import page with file upload and analysis results

---

#### Compliance Document Center

Upload, organize, and manage compliance documents with folder hierarchy, tagging, and entity linking.

**Backend:**
- New models: `ComplianceFolder`, `ComplianceDocument`, `ComplianceDocumentTag`, `ComplianceDocumentLink`
- New API: `api/compliance_documents.py` - Document CRUD, folder management, tag operations, entity linking, search with filtering
- New service: `services/compliance_document_service.py` - Document upload, folder tree management, tag operations, entity linking
- Migration: `migrate_compliance_documents.sql` - Document and folder tables with S3 key storage

**Frontend:**
- `useComplianceDocuments` hook - React Query integration for documents, folders, tags, and entity links
- Components: `DocumentCard`, `FolderTree`, `CreateFolderModal`, `UploadModal`, `DocumentFilters`, `DocumentLinkPanel`
- File type detection with appropriate icons (PDF, spreadsheet, image, generic)
- Folder nesting up to 3 levels deep

---

#### S3-Compatible Storage Service

Replaced R2-specific storage with a generic S3-compatible `StorageService` supporting RustFS (dev) and any S3-compatible provider (production).

**Backend:**
- New service: `services/storage_service.py` - Generic S3 client with presigned URL generation, direct upload, multipart upload, and download
- Backward-compatible shim: `r2_upload_service.py` re-exports `StorageService` as `R2UploadService`
- New config fields: `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`, `S3_PUBLIC_ENDPOINT_URL`, `S3_RECORDINGS_PREFIX`, `S3_COMPLIANCE_PREFIX`, `COMPLIANCE_MAX_FILE_SIZE_MB`
- Deprecated R2-specific config fields (still functional for backward compatibility)

**Docker:**
- Added RustFS service (S3-compatible object storage) for local development
- Auto-creates `aexy-storage` bucket on startup via `rustfs-init` helper container
- Environment variables wired for backend container

---

#### Permissions & Navigation

- New permission category: `COMPLIANCE` with `can_view_compliance` and `can_manage_compliance`
- New app definition: `compliance` in app catalog with `reminders`, `document_center`, `training`, and `certifications` modules
- Updated system app bundles: compliance enabled in `people` and `full_access` bundles, disabled in `engineering` and `sales_marketing`
- New notification event types: `REMINDER_DUE`, `REMINDER_ACKNOWLEDGED`, `REMINDER_COMPLETED`, `REMINDER_ESCALATED`, `REMINDER_OVERDUE`, `REMINDER_ASSIGNED`
- Compliance section added to sidebar in both grouped and flat layouts
- Compliance widget permissions: `complianceOverview`, `complianceDocuments`

### Changed

- Refactored `R2UploadService` into generic `StorageService` with S3-compatible backend support
- Storage configuration moved from R2-specific to S3-generic fields with backward compatibility

### Fixed

- Fixed reminder creation bug (commit `f4e79d9`)
- Fixed miscellaneous TypeScript errors across frontend (commit `73e7641`)

### Dependencies

- Added `croniter>=2.0.0` for cron expression parsing
- Added RustFS Docker service for local S3-compatible storage

---

## [0.5.2] - 2026-02-09

### Fixed

- Set default `github_app_install_url` to production GitHub App URL in `config.py` instead of empty string
- Added `GITHUB_APP_INSTALL_URL` environment variable to `docker-compose.prod.yml` backend service

---

## [0.5.1] - 2026-02-08

### Changed

#### Temporal Workflow Engine (Celery Replacement)

Replaced Celery 5.3+ task queue with Temporal Python SDK for all background processing, workflow orchestration, and scheduled tasks.

**Infrastructure:**
- Temporal server (auto-setup) with PostgreSQL persistence on port 7233
- Temporal Web UI for workflow monitoring on port 8080
- Dedicated Temporal worker service with 6 task queues
- Removed Celery worker, Celery Beat, and Flower monitoring services

**Activities & Workflows:**
- 13 activity modules with 77+ Temporal activities
- 7 workflow modules including CRMAutomationWorkflow (replaced 652-line SyncWorkflowExecutor)
- 25 Temporal schedules replacing 28 Celery Beat entries (3 polling tasks eliminated)
- `dispatch()` function replacing Celery `.delay()` for fire-and-forget execution
- `SingleActivityWorkflow` wrapper for dispatching individual activities
- CRM automation events use Temporal signals for instant resume (replaced 60s polling)

**Task Queues:**
- `analysis` - Developer profiling, code analysis, LLM tasks
- `sync` - GitHub sync, Google sync, external data
- `workflows` - CRM automations, workflow execution
- `email` - Campaigns, onboarding, transactional email
- `integrations` - Webhooks, Slack, external services
- `operations` - Stats aggregation, cleanup, maintenance

**Retry Policies:**
- `STANDARD_RETRY` - General tasks with exponential backoff
- `LLM_RETRY` - AI/LLM calls with longer timeouts
- `WEBHOOK_RETRY` - External webhook delivery

### Added

- `EmailCampaignService` - 9 async methods for email campaign management, extracted from Celery tasks
- `OnboardingService.check_due_steps()` - Checks and dispatches due onboarding step processing

### Fixed

- Onboarding activity input dataclasses now match `OnboardingService` API signatures
- Warming metrics dispatch uses proper `UpdateWarmingMetricsInput` dataclass instead of raw dict
- Workflow action callers updated to pass correct field names to Temporal activities

---

## [0.5.0] - 2026-02-02

### Added

#### Platform-Wide Automations

Migrated automations from CRM-specific to a platform-wide automation framework accessible from `/automations`.

**New Routes:**
- `/automations` - List all automations with module filtering (CRM, Tickets, Hiring, Email, etc.)
- `/automations/new` - Create new automation with module selector
- `/automations/[automationId]` - Edit automation with workflow builder

**Module Support:**
- CRM: `record.created`, `record.updated`, `field.changed`, `stage.changed`
- Tickets: `ticket.created`, `ticket.status_changed`, `sla.breached`, `ticket.assigned`
- Hiring: `candidate.created`, `candidate.stage_changed`, `interview.scheduled`
- Email Marketing: `campaign.sent`, `email.opened`, `email.bounced`
- Uptime: `monitor.down`, `incident.created`
- Sprints: `task.status_changed`, `sprint.completed`
- Forms: `form.submitted`
- Booking: `booking.confirmed`, `booking.cancelled`

**Backend:**
- New API router: `api/automations.py` at `/workspaces/{id}/automations/*`
- New schemas: `schemas/automation.py` with `AutomationModule` enum
- New service: `services/automation_service.py` for generic automation handling
- Trigger/Action registry pattern for extensible module support
- Migration: `migrate_platform_automations.sql` adds `module` column to automations

**CRM Routes Redirected:**
- `/crm/automations` → `/automations?module=crm`
- `/crm/automations/new` → `/automations/new?module=crm`
- `/crm/automations/[id]` → `/automations/[id]`

---

#### Agent Email Integration

Agents can now have dedicated email addresses and manage their own inboxes.

**Email Address Allocation:**
- Agents can be assigned email addresses like `support@workspace.aexy.email`
- Email address allocation via mailagent microservice integration
- Enable/disable email per agent
- Auto-reply configuration with confidence threshold

**Agent Inbox:** `frontend/src/app/(app)/agents/[agentId]/inbox/page.tsx`
- View incoming emails assigned to the agent
- Email status tracking: `pending`, `processing`, `responded`, `escalated`, `archived`
- AI classification results with confidence scores
- Suggested responses from agent processing
- Manual reply and escalation actions

**Backend:**
- New model: `models/agent_inbox.py` - `AgentInboxMessage` for storing received emails
- New service: `services/agent_email_service.py` - Email allocation, routing, and processing
- New API: `api/email_webhooks.py` - Inbound email webhook handlers
- Migration: `migrate_agent_email.sql` - Agent email fields and inbox table

**Agent Model Extensions:**
- `email_address` - Unique email address for the agent
- `email_enabled` - Toggle email processing
- `auto_reply_enabled` - Enable automatic responses
- `email_signature` - Custom signature for outgoing emails

---

#### Agent Chat Interface

New conversational interface for interacting with AI agents.

**New Routes:**
- `/agents/[agentId]/chat` - Start new conversation with agent
- `/agents/[agentId]/chat/[conversationId]` - Continue existing conversation

**Features:**
- Real-time chat interface with message streaming
- Conversation history and context preservation
- Agent tool execution display (CRM lookups, email sends, etc.)
- Confidence indicators for agent responses
- Conversation list with search and filtering

**Backend:**
- Migration: `migrate_agent_conversations.sql` - Conversation and message tables
- Extended `api/agents.py` with conversation endpoints
- Message types: `user`, `assistant`, `system`, `tool_call`, `tool_result`

---

#### Automation Agents Integration

Connect AI agents to workflow automations for intelligent task handling.

**New Model:** `models/automation_agent.py`
- `AutomationAgent` - Links agents to automation workflows
- `AutomationAgentExecution` - Tracks agent executions within workflows
- `AutomationAgentConfig` - Stores agent-specific workflow configuration

**New API:** `api/automation_agents.py`
- `POST /automations/{id}/agents` - Add agent to automation
- `DELETE /automations/{id}/agents/{agent_id}` - Remove agent
- `GET /automations/{id}/agents` - List agents in automation
- `POST /automations/{id}/agents/{agent_id}/execute` - Manually trigger agent

**Workflow Actions:** `services/workflow_actions.py`
- `run_agent` action type for workflow nodes
- Agent execution with context from trigger data
- Result handling and error propagation

**Migration:** `migrate_automation_agents.sql`

---

#### Mailagent Integration Client

Client for communicating with the mailagent microservice.

**New Integration:** `integrations/mailagent_client.py`
- Async HTTP client for mailagent API
- Domain management (create, verify, list)
- Agent email provisioning
- Inbound email processing delegation
- Email sending via mailagent infrastructure

**Configuration:**
- `MAILAGENT_URL` environment variable (default: `http://mailagent:8001`)
- Automatic retry with exponential backoff
- Health check integration

---

#### Agent Management Improvements

**Agent Detail Page:** `/agents/[agentId]`
- Comprehensive agent overview with metrics
- Execution history with status and duration
- Performance charts (success rate, response time)
- Quick actions (test, enable/disable, edit)

**Agent Edit Page:** `/agents/[agentId]/edit`
- Tabbed configuration editor
- Email configuration section
- Tool selection with categories
- Behavior settings (confidence, approval thresholds)
- Working hours configuration

**Agents List Page:** `/agents`
- Grid view with agent cards
- Status badges (active, inactive, error)
- Filtering by type and status
- Search functionality
- Quick stats (total agents, active, executions)

### Changed

- CRM Agents routes now redirect to platform-wide `/agents` routes
- CRM Automations routes now redirect to platform-wide `/automations` routes
- Sidebar navigation updated with Automations in dedicated section
- Agent tools now include email tools: `send_email`, `create_draft`, `get_email_history`, `get_writing_style`

### Fixed

- Domain creation now returns HTTP 409 Conflict for duplicates instead of 500 with SQL error
- `SendingDomainResponse.provider_id` is now optional (nullable)
- SQLAlchemy reserved word error in mailagent (`metadata` → `decision_metadata`)
- Missing `LLMConfig` export in mailagent LLM module
- Email marketing domain creation toast notifications for success/error feedback

### Removed

- Alembic migration files (using raw SQL migrations via `run_migrations.py`)
- `roadmap_voting` model and related code
- `public_projects` API (consolidated into projects API)
- Some Google sync tasks (moved to separate service)

#### Mailagent Microservice

A new standalone microservice for email administration, AI agent processing, and domain management.

**Core Service:** `mailagent/`
- FastAPI service running on port 8001
- SQLAlchemy async models with PostgreSQL
- Redis for caching and rate limiting
- Docker Compose integration

**Email Provider Support:** `mailagent/src/mailagent/providers/`
- AWS SES integration with IAM credentials
- SendGrid API integration
- Mailgun (planned)
- Postmark (planned)
- Custom SMTP support

**Domain Management:** `mailagent/src/mailagent/api/domains.py`
- Domain registration and health scoring
- DNS verification (SPF, DKIM, DMARC)
- Automated DNS record generation
- Domain warming schedules (conservative, moderate, aggressive)

**Agent System:** `mailagent/src/mailagent/agents/`
- Base agent class with confidence-based decisions
- Agent types: `support`, `sales`, `scheduling`, `onboarding`, `recruiting`, `newsletter`, `custom`
- Agent actions: `reply`, `forward`, `escalate`, `schedule`, `create_task`, `update_crm`, `wait`, `request_approval`
- Specialized agents with pre-configured behaviors

**LLM Integration:** `mailagent/src/mailagent/llm/`
- Claude (Anthropic) provider
- Gemini (Google) provider
- Factory pattern for provider selection
- Configurable temperature and max tokens

**API Endpoints:**
- `/api/v1/admin/*` - Provider CRUD and dashboard
- `/api/v1/domains/*` - Domain management and verification
- `/api/v1/onboarding/*` - Inbox creation and verification
- `/api/v1/agents/*` - Agent CRUD and configuration
- `/api/v1/agents/{id}/process` - Process email with agent
- `/api/v1/invocations/*` - Execution history and metrics
- `/api/v1/webhooks/*` - Inbound email processing
- `/api/v1/send/*` - Outbound email sending

**Email Processing Pipeline:**
- Inbound webhook handlers for SES/SendGrid
- Thread detection and conversation context
- Knowledge base search integration
- Contact enrichment from CRM
- Response generation with approval workflow

---

#### AI Agents Management UI

A comprehensive interface for creating and managing custom AI agents with configurable tool access and behavior settings.

**New Routes:**
- `/agents` - Agent list page with grid view, stats, filtering, and search
- `/agents/new` - Multi-step agent creation wizard
- `/agents/[agentId]` - Agent detail page with execution history and metrics
- `/agents/[agentId]/edit` - Tabbed configuration editor

**Frontend Components:** `frontend/src/components/agents/`
- `AgentCreationWizard` - 7-step wizard (type, basic info, LLM, tools, behavior, prompts, review)
- `AgentTypeBadge` - Type indicator with icon and color
- `AgentStatusBadge` - Active/inactive status
- `ToolSelector` - Multi-select tool picker with categories
- `LLMProviderSelector` - Provider and model selection (Claude, Gemini, Ollama)
- `ConfidenceSlider` - 0-1 range slider for thresholds
- `WorkingHoursConfigPanel` - Hours, timezone, and days configuration
- `PromptEditor` - System prompt editor with variable hints

**Dashboard Widget:**
- `AIAgentsWidget` - Shows active agents, total runs, success rate
- Added to dashboard widget registry and default visible widgets

**Sidebar Navigation:**
- AI Agents added as top-level navigation item with own "AI" section
- Sub-items: All Agents, Create Agent

**Product Page:**
- `/products/ai-agents` - Marketing page for AI Agents feature

**Backend API Extensions:**
- `GET /agents/check-handle` - Verify mention handle availability
- `GET /agents/{id}/metrics` - Agent performance metrics (runs, success rate, avg duration)

**Database Migration:** `backend/scripts/migrate_agent_extended_config.sql`
- Extended CRMAgent model with: `mention_handle`, `llm_provider`, `temperature`, `max_tokens`, `confidence_threshold`, `require_approval_below`, `max_daily_responses`, `response_delay_minutes`, `working_hours`, `custom_instructions`, `escalation_email`, `escalation_slack_channel`

**Documentation:**
- `/docs/ai-agents.md` - Comprehensive guide covering agent types, configuration, tools, and API
- Updated `/docs/README.md` with AI Agents in guides and products
- Updated `/CLAUDE.md` with AI Agents key files and API testing commands

### Changed

- AI Agents now appears in dedicated "AI" section in grouped sidebar layout

---

## [0.4.6] - 2026-01-30

### Added

#### Auto-Sync for Gmail and Calendar
- Configurable auto-sync intervals for Gmail and Calendar integrations
- New periodic Celery task (`check_auto_sync_integrations`) runs every minute to check which integrations need syncing
- Preset interval buttons (Off, 5m, 15m, 30m, 1h, 24h) and custom input in settings UI
- Minimum interval enforced at 5 minutes to prevent aggressive API usage
- Tracks `gmail_last_sync_at` and `calendar_last_sync_at` for accurate scheduling
- Duplicate job detection prevents overlapping sync operations

**Database Migrations:**
- `migrate_auto_sync_interval.sql` - Adds `auto_sync_interval_minutes` column
- `migrate_auto_sync_calendar_interval.sql` - Adds `auto_sync_calendar_interval_minutes` column

#### Markdown Editor Mode
- Toggle between Rich Text and Markdown editing modes in document editor
- `tiptap-markdown` integration for seamless markdown parsing/serialization
- Markdown content persists when switching between modes
- Error handling prevents data loss if markdown parsing fails

#### Document Editor UI Improvements
- Redesigned toolbar with grouped buttons and keyboard shortcut tooltips
- Unified header layout with breadcrumb integration
- Enhanced visual styling with backdrop blur, shadows, and animations
- Re-enabled home navigation link in document breadcrumb

#### CRM Inbox Enhancements
- Email HTML content rendered in isolated iframe to prevent style leakage
- Lazy loading of full email body (fetches on selection, not on list load)
- Loading state indicator while email content is being fetched

### Fixed

- **Workspace Selection Race Condition**: Fixed issue where auto-selection could override user's stored workspace preference by adding `isInitialized` state guard in `useWorkspace` hook
- **Auto-sync Task Counter**: Fixed incorrect `dir()` check that always returned 0 for total integrations checked
- **Email Display**: Fixed `to_emails` field to properly extract email addresses from recipient objects
- **Markdown Mode Stability**: Added try-catch error handling to prevent crashes when parsing malformed markdown

### Changed

- Production Dockerfile now uses `--legacy-peer-deps` for dependency compatibility
- AppShell main content wrapper no longer uses `container` class for full-width layouts

### Dependencies

- Added `tiptap-markdown@^0.8.10`
- Added `y-prosemirror@^1.3.7`

## [0.4.5] - 2026-01-30

#### Public Project Pages
- **Project visibility toggle** - Projects can now be made public or private via settings
- **Public project URLs** - Each public project gets a unique public slug (e.g., `/p/my-project-k3f9x2`)
- **Customizable public tabs** - Admins can configure which tabs are visible on the public page:
  - Overview, Backlog, Board, Stories, Bugs, Goals, Releases, Timeline, Roadmap, Sprints

#### Roadmap Voting System
- **Feature request submissions** - Authenticated users can submit feature requests with title, description, and category
- **Voting** - Users can upvote/downvote feature requests (toggle vote)
- **Comments** - Threaded comments on feature requests with admin badge support
- **Request categories** - Feature, Improvement, Integration, Bug Fix, Other
- **Status tracking** - Under Review, Planned, In Progress, Completed, Declined
- **Admin responses** - Project admins can respond to requests and update status
- **Pagination** - Paginated list of roadmap requests with filtering and sorting

#### New UI Components
- `Pagination` component with ellipsis support and accessibility labels
- Public project page tab components (Overview, Backlog, Board, Stories, Bugs, Goals, Releases, Sprints, Timeline, Roadmap)

#### New Backend Services
- **Models**: `RoadmapRequest`, `RoadmapVote`, `RoadmapComment` for voting system
- **API Router**: `/api/v1/public/projects/{public_slug}/...` for unauthenticated access
- **Sanitization**: Input sanitization module for user-generated content (`backend/src/aexy/core/sanitize.py`)

#### New API Endpoints
- `POST /workspaces/{id}/projects/{id}/toggle-visibility` - Toggle project public/private
- `GET/PUT /workspaces/{id}/projects/{id}/public-tabs` - Configure visible tabs
- `GET /public/projects/{slug}` - Get public project info
- `GET /public/projects/{slug}/backlog|board|stories|bugs|goals|releases|roadmap|sprints|timeline` - Public data endpoints
- `GET/POST /public/projects/{slug}/roadmap-requests` - List/create feature requests
- `POST /public/projects/{slug}/roadmap-requests/{id}/vote` - Vote on requests
- `GET/POST /public/projects/{slug}/roadmap-requests/{id}/comments` - Comments

### Changed
- `Project` model includes `is_public` (boolean) and `public_slug` (unique string) fields
- Sprint/roadmap/timeline endpoints use optimized SQL aggregation queries (N+1 fix)
- Vote counting uses atomic SQL UPDATE to prevent race conditions
- Project list and detail responses include visibility fields

### Security
- HTML tag stripping and entity escaping for user-submitted content
- Input length validation: title (150 chars), description (1000 chars), comments (2000 chars)
- Tab access control - public endpoints verify tab is enabled before returning data
- Permission checks on admin endpoints require workspace owner/admin role

### Database Migrations
- `alembic/versions/61fd11a7e0ea_add_public_project_visibility.py` - Adds visibility columns
- `scripts/migrate_roadmap_voting.sql` - Creates roadmap voting tables with indexes

### Files Changed Summary
```
47 files changed, ~5,900 insertions(+), ~500 deletions(-)
```

**Backend:**
- `api/public_projects.py` (new - 903 lines)
- `api/projects.py` (+186 lines)
- `models/roadmap_voting.py` (new - 205 lines)
- `models/project.py` (+37 lines)
- `schemas/project.py` (+265 lines)
- `core/sanitize.py` (new - 107 lines)

**Frontend:**
- `app/p/[publicSlug]/page.tsx` (new - 265 lines)
- `components/public-project-page/*` (new - 12 components)
- `components/ui/pagination.tsx` (new - 136 lines)
- `app/(app)/settings/projects/[projectId]/page.tsx` (+254 lines)
- `lib/api.ts` (+351 lines)

---

## [0.4.4] - 2026-01-29

### Added

#### GitHub Intelligence System

A comprehensive intelligence analysis system that extracts insights from GitHub activity to provide developer profiling, burnout detection, expertise tracking, and team collaboration analysis.

**Semantic Commit Analysis:**
- Conventional commit parsing (feat, fix, refactor, chore, docs, test, style, perf, build, ci)
- Scope and component extraction from commit messages
- Breaking change detection from `!` suffix and `BREAKING CHANGE:` footer
- Commit message quality scoring (0-100)
- Semantic tag extraction for categorization
- Optional LLM-enhanced analysis for complex messages

**New Service:** `backend/src/aexy/services/commit_analyzer.py`
- API: `POST /api/v1/intelligence/commits/analyze`
- API: `GET /api/v1/intelligence/commits/distribution`

**PR Review Quality Analysis:**
- Review depth scoring (1-5 scale based on comment length and complexity)
- Thoroughness classification: cursory, standard, detailed, exhaustive
- Mentoring behavior detection (explains_why, provides_examples, suggests_alternatives, asks_questions, shares_resources)
- Review response time calculation
- Mentoring score aggregation

**New Service:** `backend/src/aexy/services/review_quality_analyzer.py`
- API: `GET /api/v1/intelligence/reviews/quality`
- API: `POST /api/v1/intelligence/reviews/analyze`
- API: `GET /api/v1/intelligence/reviews/response-time`

**Expertise Confidence Intervals:**
- Logarithmic proficiency scoring based on commit count and lines of code
- Confidence intervals (0-1) based on data quantity and repo diversity
- Recency factor with exponential decay (180-day half-life)
- Depth levels: novice, intermediate, advanced, expert
- Context classification: production, personal, learning, unknown
- Repository diversity scoring

**New Service:** `backend/src/aexy/services/expertise_confidence.py`
- API: `GET /api/v1/intelligence/expertise`
- API: `POST /api/v1/intelligence/expertise/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/expertise/{skill_name}`

**Burnout Risk Indicators:**
- After-hours commit percentage tracking (before 9am / after 6pm)
- Weekend work frequency analysis
- Consecutive high-activity days detection
- Days since last break calculation
- Review quality trend analysis
- Risk levels: low, moderate, high, critical
- Risk score (0-1) with weighted indicators
- Trend detection (improving, stable, worsening)
- Configurable thresholds

**New Service:** `backend/src/aexy/services/burnout_detector.py`
- API: `GET /api/v1/intelligence/burnout`
- API: `POST /api/v1/intelligence/burnout/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/burnout`

**Collaboration Network Analysis:**
- Graph-based collaboration mapping from PR reviews
- Collaboration strength scoring (frequency + recency weighted)
- Knowledge silo detection for isolated developers
- Team cohesion scoring with graph density metrics
- Central connector identification
- Collaboration diversity scoring

**New Service:** `backend/src/aexy/services/collaboration_network.py`
- API: `GET /api/v1/intelligence/collaborators`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration/graph`

**Project Complexity Classification:**
- PR complexity levels: trivial, simple, moderate, complex, critical
- Complexity scoring (0-100) based on files, layers, and components
- Change categories: feature, bugfix, refactor, documentation, infrastructure, configuration, dependency, test, security, performance
- Architectural layer detection (api, service, model, repository, ui, infrastructure, config, test)
- Component extraction from file paths
- Cross-cutting change detection
- Infrastructure and migration flagging
- Security-sensitive file identification
- Review effort estimation (low, medium, high, very_high)
- Risk indicator generation

**New Service:** `backend/src/aexy/services/complexity_classifier.py`
- API: `GET /api/v1/intelligence/complexity`
- API: `POST /api/v1/intelligence/complexity/analyze`
- API: `POST /api/v1/intelligence/complexity/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/complexity`

**Technology Evolution Tracking:**
- Framework/library version detection from dependency files
- Version status classification: current, recent, outdated, deprecated
- Technology adoption score (0-1)
- Automated upgrade suggestions with priority
- Support for 30+ popular technologies (React, Vue, Angular, FastAPI, Django, etc.)
- Team-wide technology health scoring
- Critical upgrade identification

**New Service:** `backend/src/aexy/services/technology_tracker.py`
- API: `GET /api/v1/intelligence/technology`
- API: `POST /api/v1/intelligence/technology/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/technology`

**Full Analysis Endpoint:**
- API: `POST /api/v1/intelligence/analyze-all` - Runs all analysis types in one call

**Database Migration:**
- New migration: `backend/scripts/migrate_github_intelligence.sql`
- Added `semantic_analysis` JSONB column to commits table
- Added `quality_metrics` JSONB column to code_reviews table
- Added `expertise_confidence` JSONB column to developers table
- Added `burnout_indicators` JSONB column to developers table
- Added `last_intelligence_analysis_at` timestamp to developers table
- Added `complexity_analysis` JSONB column to pull_requests table
- Created `developer_collaborations` table for collaboration graph storage

**New API Router:**
- `backend/src/aexy/api/intelligence.py` with 22 endpoints

## [0.4.4] - 2026-01-29

### Fixed

#### Slack Notification Bug for Uptime Monitors

Fixed an issue where Slack notifications were not being sent for uptime monitor incidents when the monitor didn't have a specific `slack_channel_id` configured.

**Root Cause:**
- Notifications required `monitor.slack_channel_id` to be set, but most monitors relied on the workspace's default Slack channel configuration
- The code didn't fall back to looking up the workspace's configured Slack channel from `slack_channel_configs`

**Changes:**
- Added fallback logic to look up workspace notification channel when monitor-specific channel is not set
- Auto-add `slack` to `notification_channels` when creating new monitors if Slack is configured for the workspace
- Auto-add `slack` to existing monitors when a Slack channel is first configured for a workspace

### Improved

#### Code Quality & Maintainability

**Centralized Slack Integration Helpers:**
- Created new `backend/src/aexy/services/slack_helpers.py` module with shared functions:
  - `get_slack_integration_for_workspace()` - finds integration by workspace/org ID
  - `get_slack_channel_config()` - gets channel config for an integration
  - `get_workspace_notification_channel()` - combines both to get channel ID
  - `check_slack_channel_configured()` - boolean check for Slack setup
- Removed duplicated Slack lookup logic from `uptime_service.py` and `uptime_tasks.py`

**Added Constants for Notification Channels:**
- `NOTIFICATION_CHANNEL_SLACK = "slack"`
- `NOTIFICATION_CHANNEL_WEBHOOK = "webhook"`
- `NOTIFICATION_CHANNEL_TICKET = "ticket"`
- Replaced magic strings throughout the codebase

**Improved Type Safety:**
- Added proper type hints (`db: AsyncSession`) to notification helper functions
- Added return type annotations to `_send_slack_notification()`

**Better Exception Handling:**
- Changed broad `Exception` catches to specific `SQLAlchemyError` for database operations
- Added specific `HTTPError` handling for Slack API calls
- Added explicit timeout (30s) to HTTP client for Slack notifications

**Graceful Error Handling:**
- Wrapped `add_slack_to_monitors()` call in try/except to prevent channel configuration failures if monitor update fails
- Logs warning but doesn't fail the primary operation

**Files Changed:**
- `backend/src/aexy/services/slack_helpers.py` (new)
- `backend/src/aexy/services/uptime_service.py`
- `backend/src/aexy/processing/uptime_tasks.py`
- `backend/src/aexy/api/slack.py`

---

## [0.4.2] - 2026-01-25

### Added

#### Email Provider Configuration UI

**Provider Edit Modal:**
- Added comprehensive provider configuration modal with provider-specific credential fields
- SES credentials: Access Key ID, Secret Access Key, Region, Configuration Set
- SendGrid credentials: API Key
- Mailgun credentials: API Key, Domain, Region (US/EU selector)
- Postmark credentials: Server Token
- SMTP credentials: Host, Port, Username, Password, TLS toggle

**Provider Card Improvements:**
- Added "Configure" button to edit provider settings and credentials
- Added "Setup Required" badge for providers without credentials configured
- Test connection button now disabled until credentials are configured
- Display provider description when available

**Provider Test Feedback:**
- Added toast notifications for provider connection test results
- Success toast shows "Connection successful" with provider message
- Error toast shows "Connection failed" with detailed error message (e.g., invalid credentials)
- Added Toaster component to root layout for app-wide notifications

**Credential Encryption (Security):**
- Added Fernet-based encryption for provider credentials at rest
- Credentials are encrypted before storing in database using AES-128-CBC
- Encryption key derived from application `secret_key` via SHA256
- Backward compatible with existing unencrypted credentials (auto-detected)
- New encryption utility module at `core/encryption.py`

### Changed

- Updated `EmailProvider` TypeScript interface with `credentials`, `description`, `settings`, and status fields
- Updated provider update API to accept `credentials` and `description` parameters
- Added `has_credentials` boolean field to provider API responses for secure credential status indication
- Credentials are no longer returned in API responses (security improvement) - only `has_credentials` flag indicates if configured

### Fixed

- Fixed migration runner `--force` flag not re-running changed migrations
- Fixed TypeScript type errors in provider credential handling
- Fixed provider test not showing results to user (toast notifications now display success/error)
- Fixed "Setup Required" badge not updating after credentials are saved (now uses `has_credentials` from API)

---

## [0.4.1] - 2026-01-25

### Added

#### Email Marketing Infrastructure Improvements

**DNS Records UI:**
- Enhanced DNS records display with collapsible section in domain cards
- Copy-to-clipboard functionality for DNS record names and values
- Visual indicators for verified/pending DNS records
- "Action Required" badge for unverified domains
- Documentation link to GitHub for DNS setup guidance
- Support for Verification, SPF, DKIM, and DMARC record types

**Provider Management:**
- Providers can now be created without credentials (configurable later)
- Credentials field now accepts empty dict as default

### Fixed

#### Provider Connection Testing
- Fixed provider test connection hanging when credentials are not configured
- Added credential validation before attempting API connections for all providers:
  - SES: checks for `access_key_id` and `secret_access_key`
  - SendGrid: checks for `api_key`
  - Mailgun: checks for `api_key` and `domain`
  - Postmark: checks for `server_token`
  - SMTP: checks for `host`
- Returns helpful error message indicating which credentials are missing

#### Sending Domain Model
- Made `provider_id` nullable in SendingDomain model
- Added `SET NULL` on delete for provider foreign key relationship
- Added `dns_records`, `verification_token`, and `verified_at` fields to SendingDomainListResponse schema

---

## [0.4.0] - 2026-01-25

### Added

#### Assessment Proctoring System

A comprehensive real-time proctoring system for assessment integrity with AI-powered face detection, violation tracking, and chunked video recording with cloud storage.

**Face Detection & Monitoring:**
- Real-time face detection using face-api.js with TinyFaceDetector
- No face detected alerts with configurable cooldown (10 seconds)
- Multiple faces detection with count reporting
- Face landmark and recognition model support
- Live webcam preview during assessment

**Violation Tracking:**
- Configurable maximum violation count before auto-submission
- Violation types: no face, multiple faces, tab switch, window blur, fullscreen exit, copy/paste attempt
- Real-time violation counter with visual warnings
- Warning modal with violation details and remaining attempts
- Automatic assessment submission on max violations exceeded

**Screen & Webcam Recording:**
- Chunked recording with configurable duration (10 second chunks)
- Cloudflare R2 upload integration for video storage
- Separate webcam and screen recording streams
- Progress tracking for uploads
- Graceful recording stop and finalization on submission

**Proctoring Settings:**
- Enable/disable proctoring per assessment
- Webcam requirement toggle
- Screen recording toggle
- Fullscreen enforcement toggle
- Face detection toggle
- Tab/window tracking toggle
- Copy/paste prevention toggle

**Security Features:**
- Fullscreen mode enforcement with exit detection
- Tab switch detection via visibility API
- Window blur detection
- Copy/cut/paste prevention with event blocking
- Right-click context menu prevention
- Re-enable prompts for fullscreen and screen sharing after violations

**Backend Proctoring Service:**
- `ProctoringService` for event logging and analysis
- Proctoring event types with severity levels (info, warning, critical)
- Event summary generation for attempt review
- Trust score calculation based on violations
- Integration with assessment attempt model

**R2 Upload Service:**
- Chunked upload support for large video files
- Multipart upload with progress tracking
- Signed URL generation for secure uploads
- Recording type tagging (webcam/screen)

**Assessment Settings UI (Step 3):**
- Proctoring settings section with toggles
- `enable_webcam`, `enable_screen_recording`, `enable_fullscreen_enforcement`
- `enable_face_detection`, `enable_tab_tracking`, `enable_copy_paste_detection`
- Additional options: `allow_calculator`, `allow_ide`

**Assessment Review UI (Step 5):**
- Proctoring status display in review summary
- Settings verification before publish

**New Files:**
- `frontend/src/hooks/useChunkedRecording.ts` - Chunked recording hook
- `frontend/src/services/recordingUploadService.ts` - R2 upload service
- `frontend/src/constants/index.ts` - MAX_VIOLATION_COUNT constant
- `frontend/public/models/` - Face-api.js model files
- `backend/src/aexy/services/proctoring_service.py` - Proctoring event service
- `backend/src/aexy/services/r2_upload_service.py` - Cloudflare R2 integration

**Dependencies Added:**
- `face-api.js` - Browser-based face detection

---

## [0.3.1] - 2026-01-24

### Fixed

#### Uptime Module - Nullability & Visibility Fixes

**Monitor Visibility Bug:**
- Fixed monitors not appearing in the UI after creation
- Backend returns array directly for `/monitors` endpoint, but frontend expected `{ monitors: [], total }` format
- Updated API client to normalize response formats across all uptime endpoints

**API Response Format Alignment:**
- `monitors.list()` - Now correctly handles array response from backend
- `incidents.list()` - Now correctly handles `{ items: [] }` response format
- `monitors.getChecks()` - Now correctly handles `{ items: [] }` response format

**Unknown Status Handling:**
- Added `unknown` status support for newly created monitors (before first check runs)
- Added `unknown` to `STATUS_COLORS` in all uptime pages to prevent render crashes
- Added `DEFAULT_STATUS_STYLE` fallback for unrecognized status values

**Null-Safe Data Handling:**
- Added optional chaining (`?.`) when accessing API response properties
- Added fallback to empty arrays (`|| []`) for all list data
- Added error state resets in catch blocks to prevent stale data display
- Fixed `TypeError: Cannot read properties of undefined (reading 'length')` errors

**Files Updated:**
- `frontend/src/lib/uptime-api.ts` - API response normalization
- `frontend/src/app/(app)/uptime/page.tsx` - Dashboard null safety
- `frontend/src/app/(app)/uptime/monitors/page.tsx` - Monitors list null safety
- `frontend/src/app/(app)/uptime/monitors/[monitorId]/page.tsx` - Monitor detail null safety
- `frontend/src/app/(app)/uptime/incidents/page.tsx` - Incidents list null safety
- `frontend/src/app/(app)/uptime/incidents/[incidentId]/page.tsx` - Incident detail null safety
- `frontend/src/app/(app)/uptime/history/page.tsx` - Check history null safety

---

## [0.3.0] - 2026-01-24

### Added

#### Uptime Monitoring Module

A comprehensive uptime monitoring system for tracking HTTP endpoints, TCP ports, and WebSocket connections with automatic incident management and ticket creation.

**Core Features:**
- **Multi-Protocol Monitoring**: Support for HTTP, TCP, and WebSocket endpoint checks
- **Configurable Check Intervals**: 1 minute, 5 minutes, 15 minutes, 30 minutes, or 1 hour
- **SSL Certificate Monitoring**: Track SSL expiry days and alert on upcoming expirations
- **Consecutive Failure Thresholds**: Configure how many failures before alerting (default: 3)
- **Auto-Ticketing**: Automatically create support tickets when services go down
- **Auto-Close on Recovery**: Tickets are automatically closed when services recover with full timeline

**Incident Management:**
- Incident status tracking: `ongoing`, `acknowledged`, `resolved`
- Incident timeline with start, acknowledgment, and resolution timestamps
- Failed checks count and total checks during incident
- Root cause and resolution notes for post-mortems
- Automatic linking to support tickets

**HTTP Check Features:**
- Configurable HTTP methods (GET, POST, HEAD, PUT, PATCH)
- Expected status codes validation (e.g., [200, 201, 204])
- Custom request headers
- Request body support
- SSL verification toggle
- Follow redirects option
- Response time tracking

**TCP Check Features:**
- Host and port configuration
- Connection timeout handling
- Response time measurement

**WebSocket Check Features:**
- WebSocket URL monitoring
- Optional message sending on connect
- Expected response pattern validation
- Connection health verification

**Notification Channels:**
- Slack notifications via channel ID
- Custom webhook delivery
- Email alerts (via existing infrastructure)
- Recovery notifications (configurable)

**Database Tables:**
- `uptime_monitors` - Monitor configurations
- `uptime_checks` - Individual check results (time-series)
- `uptime_incidents` - Incident tracking with ticket integration

**API Endpoints:**
- `GET /workspaces/{id}/uptime/monitors` - List monitors
- `POST /workspaces/{id}/uptime/monitors` - Create monitor
- `GET /workspaces/{id}/uptime/monitors/{id}` - Get monitor details
- `PATCH /workspaces/{id}/uptime/monitors/{id}` - Update monitor
- `DELETE /workspaces/{id}/uptime/monitors/{id}` - Delete monitor
- `POST /workspaces/{id}/uptime/monitors/{id}/pause` - Pause monitoring
- `POST /workspaces/{id}/uptime/monitors/{id}/resume` - Resume monitoring
- `POST /workspaces/{id}/uptime/monitors/{id}/test` - Run immediate test
- `GET /workspaces/{id}/uptime/monitors/{id}/checks` - Check history
- `GET /workspaces/{id}/uptime/monitors/{id}/stats` - Monitor statistics
- `GET /workspaces/{id}/uptime/incidents` - List incidents
- `GET /workspaces/{id}/uptime/incidents/{id}` - Get incident details
- `PATCH /workspaces/{id}/uptime/incidents/{id}` - Update incident notes
- `POST /workspaces/{id}/uptime/incidents/{id}/resolve` - Manually resolve
- `POST /workspaces/{id}/uptime/incidents/{id}/acknowledge` - Acknowledge incident
- `GET /workspaces/{id}/uptime/stats` - Workspace-level statistics

**Frontend Pages:**
- `/uptime` - Uptime dashboard with stats and overview
- `/uptime/monitors` - Monitors list with create modal
- `/uptime/monitors/[id]` - Monitor detail with stats, checks, and configuration
- `/uptime/incidents` - Incidents list with filtering
- `/uptime/incidents/[id]` - Incident detail with timeline and post-mortem notes
- `/uptime/history` - Check history viewer

**Product Page:**
- `/products/uptime` - Marketing landing page for uptime monitoring

**Celery Background Tasks:**
- `process_due_checks` - Runs every minute, dispatches checks for due monitors
- `execute_check` - Performs individual HTTP/TCP/WebSocket checks
- `send_uptime_notification` - Sends Slack and webhook notifications
- `cleanup_old_checks` - Daily cleanup of check history (keeps 30 days)

**Access Control Integration:**
- Added to sidebar under "Engineering" section
- Sub-navigation: Monitors, Incidents, History
- App bundle configuration:
  - Engineering bundle: Uptime enabled
  - People bundle: Uptime disabled
  - Business bundle: Uptime disabled
  - Full Access bundle: Uptime enabled
- Permission: `can_view_uptime`

**Statistics & Metrics:**
- Uptime percentage (24h, 7d, 30d)
- Average response time
- Total and failed checks
- Incident counts
- Current and longest streak up

---

## [0.2.1] - 2026-01-23

### Added

#### Team Booking Features

Extended the booking module with team scheduling capabilities.

**All Hands Mode:**
- New `ALL_HANDS` assignment type for team event types
- Book meetings where all team members attend (not just rotating hosts)
- All members added as attendees with individual RSVP tracking

**RSVP System:**
- Team attendees receive unique `response_token` for accepting/declining
- Public RSVP page at `/rsvp/{token}` for viewing booking details and responding
- Attendee status tracking: `pending`, `confirmed`, `declined`
- Email notifications for RSVP invitations

**Team Calendar View:**
- New page at `/booking/team-calendar`
- Visual overview of team availability across the week
- Overlapping available slots highlighted
- Filter by team event type or workspace team
- Copy booking link functionality

**Custom Booking Links:**
- Workspace landing page: `/book/{workspace}` - Lists all public event types
- Team-specific booking: `/book/{workspace}/{event}/team/{team}`
- Custom member selection via query params: `?members=id1,id2,id3`
- Clean URL structure with workspace and event slugs

**New Database Table:**
- `booking_attendees` - Stores team meeting attendees with RSVP status and response tokens

**New API Endpoints:**
- `GET /booking/rsvp/{token}` - Get booking details for RSVP
- `POST /booking/rsvp/{token}/respond` - Submit RSVP response (accept/decline)
- `GET /public/book/{workspace}/teams` - List workspace teams for booking
- `GET /public/book/{workspace}/team/{team_id}` - Get team info for booking page
- `GET /booking/calendars/callback/{provider}` - OAuth callback endpoint

**New Frontend Pages:**
- `/booking/team-calendar` - Team availability calendar view
- `/book/{workspace}` - Public workspace landing page
- `/book/{workspace}/{event}/team/{team}` - Team-specific booking page
- `/rsvp/{token}` - Public RSVP response page

#### Documentation & Website

- Added comprehensive booking module documentation at `/docs/booking.md`
- Added booking product page at `/products/booking`
- Updated `/docs/README.md` to include booking in documentation index
- Updated `/docs/google.md` with booking calendar callback URLs

### Fixed

**Calendar OAuth Flow:**
- Fixed "Method Not Allowed" error when connecting Google/Microsoft calendars
- Refactored to use standard OAuth callback pattern (backend receives redirect)
- OAuth state now signed with HMAC for security
- Proper error handling with user-friendly redirect messages

**Callback URL Change:**
- Old: Frontend received OAuth redirect, then POST to backend
- New: Backend receives OAuth redirect directly at `/api/v1/booking/calendars/callback/{provider}`
- Backend exchanges code for tokens and redirects user to frontend with success/error params

### Changed

- Calendar OAuth redirect URIs now point to backend callback endpoints
- Frontend calendars page handles `?success=true` and `?error=...` query params

---

## [0.2.0] - 2026-01-22

### Added

#### Knowledge Graph for Docs (Enterprise)

An intelligent knowledge graph feature that automatically extracts entities from documentation and visualizes relationships in an interactive force-directed graph.

**Core Features:**
- **LLM-powered Entity Extraction**: Automatically identifies people, concepts, technologies, projects, organizations, and code references from markdown documents
- **Interactive Graph Visualization**: Force-directed layout using @xyflow/react and d3-force with zoom, pan, and drag capabilities
- **Relationship Mapping**: Tracks connections between entities and documents with strength-based edge visualization
- **Discovery Tools**: Entity search, path finding between nodes, and neighborhood exploration

**Entity Types:**
- Person (team members, authors, stakeholders)
- Concept (technical/business concepts)
- Technology (languages, frameworks, tools)
- Project (product/project names)
- Organization (teams, companies)
- Code (functions, classes, APIs)
- External (URLs, external references)

**Relationship Types:**
- `mentions`, `related_to`, `depends_on`, `authored_by`, `implements`, `references`, `links_to`, `shares_entity`

**Backend Components:**
- Database tables: `knowledge_entities`, `knowledge_entity_mentions`, `knowledge_relationships`, `knowledge_document_relationships`, `knowledge_extraction_jobs`
- SQLAlchemy models with full type annotations
- RESTful API endpoints under `/workspaces/{id}/knowledge-graph/`
- Services: `KnowledgeExtractionService`, `KnowledgeGraphService`
- Celery tasks for async extraction processing

**API Endpoints:**
- `GET /graph` - Full graph data with filters
- `GET /graph/document/{id}` - Document-centric view
- `GET /graph/entity/{id}` - Entity neighborhood
- `GET /entities` - List/search entities
- `GET /path` - Find path between nodes
- `GET /statistics` - Graph statistics
- `GET /temporal` - Timeline data
- `POST /extract` - Trigger extraction
- `GET /jobs` - Extraction job status

**Frontend Components:**
- Knowledge Graph page at `/docs/knowledge-graph`
- Interactive canvas with custom document and entity nodes
- Toolbar with search, filters, and view controls
- Sidebar panel for node details
- Timeline slider for temporal filtering
- Enterprise gate with upgrade prompt for non-Enterprise users

**Temporal Features:**
- Timeline filtering by date range
- Activity tracking with node color intensity
- First seen / last seen timestamps for entities

**Quality Metrics:**
- Confidence scoring for extracted entities
- Occurrence counting across documents
- Relationship strength calculation

#### Calendar Booking Module

A comprehensive calendar booking system similar to Calendly, fully integrated into the Aexy ecosystem.

**Core Features:**
- **Event Types**: Create and manage bookable event types with customizable durations (15, 30, 45, 60+ minutes)
- **Public Booking Pages**: Shareable booking links for external users to schedule meetings
- **Availability Management**: Set weekly availability schedules with timezone support
- **Date Overrides**: Configure vacation days, holidays, and special hours
- **Calendar Integrations**: Connect Google Calendar and Microsoft Outlook for conflict detection

**Backend Components:**
- Database models: `EventType`, `Booking`, `UserAvailability`, `AvailabilityOverride`, `CalendarConnection`, `TeamEventMember`, `BookingWebhook`
- RESTful API endpoints for event types, bookings, availability, and calendar management
- Services: `BookingService`, `AvailabilityService`, `CalendarSyncService`, `BookingPaymentService`, `BookingNotificationService`
- Celery background tasks for reminders, calendar sync, and cleanup

**Frontend Pages:**
- `/booking` - Booking dashboard with stats, event types overview, and upcoming bookings
- `/booking/event-types` - List and manage event types
- `/booking/event-types/new` - Create new event type
- `/booking/event-types/[id]` - Edit existing event type
- `/booking/availability` - Weekly availability schedule editor
- `/booking/calendars` - Calendar connections management

**Public Booking Pages:**
- `/public/book/[workspace]/[event]` - Public event booking page with calendar picker
- `/public/book/confirmation/[bookingId]` - Booking confirmation page
- `/public/book/cancel/[bookingId]` - Booking cancellation page
- `/public/book/reschedule/[bookingId]` - Booking reschedule page

**Event Type Configuration:**
- Custom name, slug, and description
- Duration options (15-120 minutes)
- Location types: Zoom, Google Meet, Phone, In-Person, Custom
- Buffer times before and after meetings
- Minimum notice and maximum future booking windows
- Custom intake questions for invitees
- Color coding for visual organization

**Availability Features:**
- Weekly recurring availability slots
- Multiple time slots per day
- Timezone-aware scheduling (UTC, ET, CT, MT, PT, GMT, CET, JST)
- Date-specific overrides for vacations and holidays

**Calendar Integration:**
- Google Calendar OAuth connection
- Microsoft Outlook OAuth connection
- Automatic conflict detection from connected calendars
- Event creation in primary calendar on booking
- Manual and automatic sync (every 5 minutes)
- Primary calendar designation

**Booking Management:**
- Booking status tracking (pending, confirmed, cancelled, completed, no-show)
- Cancellation with reason tracking
- Reschedule functionality
- Booking statistics and metrics

**Access Control Integration:**
- Added to sidebar under "Business" section
- Sub-navigation: Event Types, Availability, Calendars
- App bundle configuration:
  - Engineering bundle: Booking disabled
  - People bundle: Booking disabled
  - Business bundle: Booking enabled with all modules
  - Full Access bundle: Booking enabled with all modules
- Permission: `can_view_booking`

**Background Tasks (Celery):**
- `send_booking_reminders` - Send reminder emails 24h and 1h before meetings
- `sync_all_calendars` - Periodic calendar synchronization
- `process_booking_webhooks` - Dispatch webhooks to registered endpoints
- `cleanup_expired_pending_bookings` - Cancel stale pending bookings
- `mark_completed_bookings` - Auto-mark past bookings as completed
- `generate_booking_analytics` - Generate booking statistics

**Enterprise Features (Planned):**
- Payment collection via Stripe
- Custom branding
- Webhooks for external integrations
- Advanced analytics

#### Developer Tools

**Migration Runner Script:**
- New `backend/scripts/run_migrations.py` for running SQL migrations
- Tracks applied migrations in `schema_migrations` table with checksums
- Supports `--list`, `--dry-run`, `--file`, `--force`, `--database-url` options
- Detects changed migrations via MD5 checksum comparison
- Works both locally and on production servers

**Test Token Generator:**
- New `backend/scripts/generate_test_token.py` for API testing
- Lists available developers and generates JWT tokens
- Configurable token expiration

### Changed

- Updated sidebar layouts to include Booking module
- Extended app definitions catalog with booking app and modules

### Fixed

- Calendar list API response handling in frontend

---

## [0.1.1] - Initial Release

The foundational release of Aexy - a comprehensive Engineering OS platform for team management, performance tracking, hiring, and business operations.

### Added

#### Dashboard & Analytics

**Customizable Dashboards:**
- Role-based preset layouts (developer, manager, product, HR, support, sales, admin)
- Widget management with visibility toggles and size customization
- Grid-based layout configuration with drag-and-drop
- Dashboard preferences persistence per user

#### Tracking Module

**Daily Standups:**
- Standup records with yesterday summary, today plans, and blockers
- Slack integration for submission via commands and channels
- LLM-powered parsing for task references and blocker extraction
- Sentiment scoring and productivity signal detection
- Team mood analysis and participation metrics

**Work Logs:**
- Multiple entry types (progress, note, question, decision, update)
- Manual and inferred time tracking with confidence scoring
- External task reference support
- Slack and web submission sources

**Time Tracking:**
- Duration-based time entries with optional start/end timestamps
- Inferred time from activity patterns
- Confidence scoring for automated entries

**Blockers:**
- Severity levels (low, medium, high, critical)
- Categories (technical, dependency, resource, external, process)
- Status workflow (active, resolved, escalated)
- Resolution tracking with time metrics

**Activity Patterns:**
- Per-developer activity aggregation
- Standup consistency scoring and streaks
- Work log frequency analysis
- Active hours and days detection
- Slack activity signals and response times

#### Sprint Planning & Task Management

**Sprint Management:**
- Sprint lifecycle (planning, active, review, retrospective, completed)
- Capacity and velocity tracking
- Sprint goals with JSONB configuration
- Planning sessions with participant and decision logging

**Task Management:**
- Task hierarchies with parent/child relationships
- External sources (GitHub, Jira, Linear, manual)
- Rich descriptions with TipTap editor
- Story point estimation and priority levels
- Custom workspace statuses with colors and icons
- Cycle time and lead time metrics
- AI-based assignment suggestions
- Carry-over tracking across sprints

**Task Types:**
- Task, bug, subtask, spike, chore, feature
- Custom fields (text, number, select, multiselect, date, URL)
- Field validation and ordering

**Sprint Metrics:**
- Daily snapshots with burndown tracking
- Task completion metrics
- Team velocity with focus factor
- Completion rates and carry-over analysis

**Retrospectives:**
- Went-well, to-improve, action items structure
- Team mood scoring (1-5 scale)
- Voting on retrospective items
- Action item assignment and tracking

**Task Templates:**
- Reusable templates with variables
- Default priority, story points, and labels
- Subtask and checklist templates
- Usage tracking

**GitHub Integration:**
- Task links to commits and pull requests
- Auto-link detection via patterns (Fixes, Closes, Refs)
- Reference metadata tracking

#### Performance Reviews & Goals

**Review Cycles:**
- Configurable periods (annual, semi-annual, quarterly, custom)
- Phase workflow (self-review, peer-review, manager-review, completed)
- Anonymous peer review support
- Customizable questions and rating scales
- GitHub metrics integration

**Individual Reviews:**
- Manager assignment with source tracking
- Contribution summary caching
- Overall ratings with criteria breakdown
- AI-generated review summaries

**Review Submissions:**
- COIN framework (Context, Observation, Impact, Next Steps)
- Self, peer, and manager submission types
- Anonymous tokens for peer reviews
- Linked goals and contributions as evidence

**Peer Review Requests:**
- Employee-initiated and manager-assigned modes
- Request status tracking
- Deadline management

**Work Goals (SMART Framework):**
- Goal types (performance, skill, project, leadership, team contribution)
- Key results with target tracking (OKR-style)
- Progress percentage and status tracking
- Auto-linked GitHub activity
- Learning path integration
- Review cycle association

**Contribution Summaries:**
- GitHub metrics (commits, PRs, code reviews)
- Skills demonstrated tracking
- Repository breakdown
- Notable PR identification
- AI-generated insights

#### Hiring & Assessments

**Assessment Platform:**
- Multi-step wizard for creation
- Job designation and experience targeting
- Skill-based assessments with weighting
- Status lifecycle (draft, active, completed, archived)

**Question Types:**
- Code questions with test cases and starter code
- Multiple choice (single/multiple correct)
- Subjective questions with sample answers
- Pseudo-code questions
- Audio questions (repeat, transcribe, spoken answer, read-speak)

**Question Configuration:**
- Topic and subtopic organization
- Difficulty levels (easy, medium, hard)
- Time estimates and max marks
- Constraints and hints
- AI generation with metadata
- Reusable question bank

**Assessment Settings:**
- Schedule and timezone support
- Access window configuration
- Custom candidate fields
- Email template customization
- Proctoring (webcam, screen recording, face detection, tab tracking)
- Security (shuffle, copy-paste prevention)

**Candidates:**
- Profiles with resume, LinkedIn, GitHub, portfolio
- Custom fields and source tracking
- Invitation management with tokens
- Email open and click tracking
- Deadline management

**Attempts & Proctoring:**
- Multiple attempts with limiting
- Trust score calculation
- Proctoring event tracking with severity
- Video recording (webcam and screen)
- IP address and device tracking

**Evaluation:**
- AI-powered scoring with percentages
- Test case results for code
- Code quality analysis (complexity, readability, security)
- Rubric-based scoring
- Strong/weak areas identification
- Recommendations (strong_yes, yes, maybe, no)

**Question Analytics:**
- Score distribution and percentiles
- Time-to-completion metrics
- Difficulty calibration
- Skip and completion rates

#### CRM Module

**Objects & Attributes:**
- Standard objects (Company, Person, Deal, Project)
- Custom object support
- 20+ field types (text, currency, date, select, record references)
- AI-computed fields for enrichment

**Records:**
- Flexible JSONB storage
- Ownership and creator tracking
- Soft delete with archive
- Source tracking (manual, email sync, API, import)
- Record relationships (one-to-many, many-to-many)

**Record Lists:**
- View types (table, kanban, calendar, timeline, gallery)
- Advanced filtering and sorting
- Kanban with group-by and WIP limits
- Calendar view with date attributes
- Manual ordering

**Activities:**
- 25+ activity types
- Communication tracking (email, call, meeting)
- Record change history
- Note and task management
- External engagement tracking

**Automations:**
- Triggers (record created/updated/deleted, field changed, scheduled, webhook, form)
- Condition-based filtering
- Multi-action sequences
- Error handling modes
- Rate limiting and execution tracking

**Sequences & Campaigns:**
- Multi-step sequences
- Step types (email, task, wait, condition, action)
- Configurable delays
- Exit conditions (reply, meeting booked, deal created)
- Send window configuration
- Enrollment tracking

**Webhooks:**
- Outgoing subscriptions
- Event filtering
- HMAC signature verification
- Custom headers
- Retry with backoff

#### Email Marketing

**Templates:**
- Code-based with Jinja2
- Visual builder with drag-drop
- Categories (marketing, onboarding, release, transactional, newsletter)
- Variable support with types
- Template versioning

**Campaigns:**
- Types (one-time, recurring, triggered)
- Audience targeting via CRM lists
- Status lifecycle (draft, scheduled, sending, sent, paused, cancelled)
- Optimal send window scheduling
- Multi-domain sending infrastructure
- Template context overrides
- Statistics (sent, delivered, opened, clicked, bounced, unsubscribed)

**Recipient Tracking:**
- Individual status tracking
- Engagement metrics (opens, clicks)
- Bounce classification (hard, soft)
- Multi-domain sending tracking
- Personalization context

**Email Tracking:**
- Open tracking via pixel
- Device and client detection
- Link click tracking
- User agent and IP logging

**Analytics:**
- Time-series (daily, hourly)
- Rate calculations (open, click, click-to-open)
- Workspace aggregates (daily, weekly, monthly)
- Health metrics (bounce rate, complaint rate)

**Subscriber Management:**
- Global status (active, unsubscribed, bounced, complained)
- Verification tracking
- Subscription categories with frequency
- Unsubscribe event logging

#### Documentation Module

**Document Management:**
- Notion-like spaces with team organization
- Templates with AI generation
- Rich content editing with code blocks
- Version history and change tracking
- Collaborative editing with mentions

**Sharing & Permissions:**
- Granular permissions (view, comment, edit, admin)
- Privacy levels (private, workspace, public)
- Code file linking for references

**Collaboration:**
- Comments and discussions
- Notifications (comment, mention, share, edit)
- Search and filtering

#### Forms Module

**Form Builder:**
- Standalone forms with multi-destination routing
- Templates (bug report, feature request, support, contact, lead capture, feedback)
- Field types (text, textarea, email, phone, number, URL, select, checkbox, radio, file, date, hidden)

**Form Features:**
- Public sharing (anonymous/verified modes)
- Multi-destination support (CRM, ticketing, email)
- Ticket creation from submissions
- CRM record creation/linking
- Email notification routing
- Conditional logic and field dependencies

**Analytics:**
- Submission tracking
- Status tracking (pending, processing, completed, failed)

#### Learning Management

**Learning Goals:**
- Manager-set goals for team members
- Types (course, hours, skill, certification, path, custom)
- Status tracking (pending, in progress, completed, cancelled, overdue)
- Due date and progress tracking

**Approvals:**
- Request system for courses, certifications, conferences
- Multi-level workflows
- Budget impact assessment

**Budget Management:**
- Team and individual budgets
- Transaction tracking (allocation, adjustment, expense, refund)
- Utilization metrics
- Department-level management

#### Ticketing System

**Ticket Management:**
- Ticket creation from forms and manual entry
- Status and priority tracking
- Assignment workflows
- SLA management

#### Core Platform

**Multi-Workspace:**
- Workspace isolation
- Team management
- Organization structure
- Role-based access control
- App-wise member access

**Integrations:**
- **Slack**: Standups, work logs, blockers via commands and channels
- **GitHub**: Repository sync, commits, PRs, contribution metrics
- **LLM Providers**: Claude, Gemini, Ollama with rate limiting
- **Email**: Multi-domain sending, SES, SendGrid, SMTP

**Security & Compliance:**
- Soft delete for data recovery
- Audit trails
- User permissions
- Activity logging
