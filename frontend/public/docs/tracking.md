# Activity Tracking

The data-input side of Aexy's analytics — standups, work logs, time entries, and blockers, plus entity-level audit timelines.

## Tracking router

`api/tracking.py:77` — workspace-scoped endpoints for standups, work logs, time entries, and blockers.

### Standups

**`DeveloperStandup`** (`models/tracking.py:92`):

| Field | Note |
|---|---|
| `developer_id`, `workspace_id` | Subject |
| `standup_date` | One per developer per day |
| `yesterday_summary`, `today_plan`, `blockers_summary` | Free text |
| `parsed_tasks` (JSONB) | LLM-extracted structured tasks linked to GitHub issues / sprint tasks |
| `parsed_blockers` (JSONB) | LLM-extracted |
| `sentiment_score` | -1 to 1 from LLM analysis (feeds attrition prediction) |
| `source` | `slack_command` / `slack_channel` / `web` / `api` / `inferred` |

The `inferred` source means no human submitted a standup — Aexy generated one from GitHub activity (commits + PRs + reviews from the prior day). Useful for trend continuity when humans miss days.

### Work logs

`WorkLog` — appended timestamped notes attached to tasks or projects. Lightweight free-form journal of "what did I touch today."

### Time entries

`TimeEntry` — billable/non-billable hours logged against tasks. Powers the time analytics in `analytics.py` and reports.

### Blockers

**`Blocker`** (`tracking.py:65`):

| Field | Note |
|---|---|
| `developer_id`, `workspace_id`, `task_id` | What's blocked |
| `severity` | `low` / `medium` / `high` / `critical` |
| `category` | `technical` / `dependency` / `resource` / `external` / `process` |
| `description` | |
| `escalated_at`, `resolved_at` | Lifecycle |

Blockers feed escalations — if a `critical` blocker sits unresolved beyond a threshold, the escalation engine routes notifications to manager → director → VP.

## Privacy

Tracking data is workspace-scoped — visible to admins and the developer themselves; teammates see aggregates, not raw entries. The Slack integration prompts for explicit consent before posting standup data into Aexy, and a developer can disable Slack-sourced tracking in their integration settings without losing prior data.

## Entity activity (audit timeline)

`api/entity_activity.py:30` is the universal who-did-what-when feed.

**`EntityActivity`**:

| Field | Note |
|---|---|
| `entity_type`, `entity_id` | What was touched — `task`, `document`, `crm_record`, `deal`, etc. |
| `activity_type` | `created` / `updated` / `comment` / `status_changed` / `assigned` / `progress_updated` / `…` |
| `actor_id` | Who |
| `title`, `content` | Display |
| `changes` (JSONB) | Old/new diff |
| `activity_metadata` (JSONB) | Type-specific |

The timeline endpoint returns events for an entity with actor name/email/avatar resolved and a display URL, ready for the right-panel "Activity" view in any record/task/document detail page.

## Temporal activities

| Activity | Schedule | What |
|---|---|---|
| `aggregate_standups_into_sprint_summary` | n/a (sprint-completion dispatch) | Roll standups into a sprint-level summary |
| `aggregate_time_entries_for_sprint` | n/a | Time totals per sprint |
| `generate_sprint_progress_report` | daily | Sprint progress digest |
| `process_visitor_events` | GTM-side, see `gtm.md` | Web visitor tracking (separate from developer tracking) |

## Frontend

`/frontend/src/app/(app)/tracking/` — standup composer, work log feed, time entry table, blocker dashboard.

Entity activity is rendered inline in the right-side panel of CRM records, tasks, documents, and deals — it's a component, not a standalone page.

## Common pitfalls

- **Standup uniqueness**: one per (developer, date). Submitting twice updates the existing row. If the user wants two distinct entries for a single day (rare), the second has to encode that in `yesterday_summary` text — don't add a second row.
- **Sentiment score can be missing.** If the LLM call failed (rate-limit, parse error), `sentiment_score` is null. Attrition predictions handle nulls gracefully but don't rely on `sentiment_score IS NOT NULL` in dashboards without a default.
- **Inferred standups are not facts.** They're generated from GitHub activity. Don't surface them with the same weight as human-submitted entries — annotate `source = "inferred"` in the UI.
- **Time entries don't bind to a project.** They bind to a task. To roll up "hours per project," join through `SprintTask.team_id` or whatever the project relationship is — there's no direct `project_id` on `TimeEntry`.
- **EntityActivity is event-sourced.** It's append-only. Don't delete rows to "fix" the timeline — write a compensating event.
