# Tickets, Projects & Tasks

Aexy has **four distinct work-item concepts** that look similar but solve different problems. This doc explains which to use when.

## The four concepts

| Concept | Model | Source of truth | Used for |
|---|---|---|---|
| **Ticket** | `Ticket` (`models/ticketing.py:284`) | Public form submissions | Support, feedback, bug intake — anything from outside the team |
| **SprintTask** | `SprintTask` (`models/sprint.py:243`) | Development planning | The unit teams pick up, estimate, sprint, and ship |
| **TaskTemplate** | `TaskTemplate` (`models/sprint.py:918`) | Workspace setup | Reusable scaffolding for repetitive task types |
| **WorkspaceTask** | `SprintTask` (same model, different lens) | Workspace-wide rollups | Read-only aggregation across all teams |

Rule of thumb:

- Came from a form or external user? **Ticket.**
- Going into a sprint and getting estimated? **SprintTask.**
- Same task you create repeatedly with minor variations? **TaskTemplate.**
- You want "all tasks in the workspace" for an exec dashboard? **WorkspaceTask** (just a view).

Tickets can become SprintTasks via `POST /tickets/{id}/create-task` (`api/tickets.py:382`) — the link is recorded on `Ticket.linked_task_id`.

## Tickets

### Lifecycle

`Ticket.status` (`ticketing.py:35-42`):

```
new → acknowledged → in_progress → [waiting_on_submitter] → resolved → closed
```

SLA tracking is built in (`ticketing.py:390-394`):

| Field | Set when |
|---|---|
| `first_response_at` | First comment or status change after `new` |
| `resolved_at` | Status transitions to `resolved` |
| `closed_at` | Status transitions to `closed` |
| `sla_due_at` | Computed from form's SLA config + creation time |
| `sla_breached` | Boolean, flipped by the SLA checker |

### Forms-driven creation

Tickets are almost always created from a `TicketForm` — the public form sitting at `/public/forms/{public_token}`. The form defines the fields, and submission produces a ticket with `field_values` JSONB.

`TicketForm` (`ticketing.py:78-202`):

| Field | Note |
|---|---|
| `workspace_id` | Owner |
| `public_url_token` | Unique slug for the public URL |
| `fields` | List of `TicketFormField` rows |
| `destinations` | External sync targets (GitHub, Jira, Linear) |
| `auto_create_task` | Whether to spin a SprintTask immediately |
| `default_team_id`, `ticket_assignment_mode` | Routing |
| `conditional_rules` (JSONB) | `[{fieldId, condition, value, targetFieldId, action}]` — show/hide/require |

`TicketFormField` (`ticketing.py:205-281`) supports 8 types: `TEXT`, `TEXTAREA`, `EMAIL`, `SELECT`, `MULTISELECT`, `CHECKBOX`, `FILE`, `DATE`. `validation_rules` JSONB stores `minLength`, `maxLength`, `pattern`, `allowedFileTypes`, `maxFileSize`. `external_mappings` JSONB defines how each field maps to a GitHub issue label, Jira summary, etc.

Pre-built templates exist (`ticketing.py:28-31`): `BUG_REPORT`, `FEATURE_REQUEST`, `SUPPORT`. `POST /ticket-forms/from-template` clones one.

### Routers

| Router | Prefix | Tag |
|---|---|---|
| `api/tickets.py` | `/workspaces/{ws}/tickets` | `Tickets` |
| `api/ticket_forms.py` | `/workspaces/{ws}/ticket-forms` | `Ticket Forms` |
| `api/public_forms.py` | `/public/forms` | `Public Forms` |
| `api/visual_builder.py` | n/a | `Visual Builder` |

Key endpoints:

```
GET   /workspaces/{ws}/tickets                       list (line 119)
PATCH /workspaces/{ws}/tickets/{ticket_id}           update status/assignee (220, 248)
DELETE /workspaces/{ws}/tickets/{ticket_id}          (277)
GET   /workspaces/{ws}/tickets/{ticket_id}/comments  (301)
POST  /workspaces/{ws}/tickets/{ticket_id}/responses comment (328)
POST  /workspaces/{ws}/tickets/{ticket_id}/create-task → SprintTask (382)
POST  /workspaces/{ws}/ticket-forms                  create form
POST  /workspaces/{ws}/ticket-forms/from-template    clone template (131)
PATCH /workspaces/{ws}/ticket-forms/{form_id}/fields/{field_id}
POST  /workspaces/{ws}/ticket-forms/{form_id}/fields/reorder  (453)

GET  /public/forms/{public_token}                    fetch form for rendering (61)
POST /public/forms/{public_token}/submit             unauthenticated submission
```

The public submission endpoint is rate-limited and supports two auth modes: `anonymous` and `email_verification` (OTP).

### External sync

When `Ticket.external_issues` (JSONB array) is populated, the ticket has shadow copies in third-party systems:

```json
[{ "platform": "github", "issue_id": "owner/repo#42", "issue_url": "...", "synced_at": "..." }]
```

These are created on submission if the form's `destinations` includes the platform, and kept in sync by `services/github_task_sync_service.py` and friends. Updates flow both ways.

## SprintTasks

The full story is in [sprints.md](./sprints.md). Quick reference:

- `sprint_id` is nullable — null means backlog
- `source_type`: `github_issue` / `jira` / `linear` / `manual` — drives sync behavior
- `status` is either a hardcoded string (`backlog`/`todo`/`in_progress`/`review`/`done`) or a `status_id` pointing at a workspace-defined `WorkspaceTaskStatus` (with `category` for burndown)
- `epic_id`, `story_id` for hierarchy
- `custom_fields` JSONB keyed by `WorkspaceCustomField.slug`

### Routers

| Router | Prefix | Tag |
|---|---|---|
| `api/sprint_tasks.py` | `/sprints/{sprint_id}/tasks` | `Sprint Tasks` |
| `api/project_tasks.py` | `/teams/{team_id}/tasks` | `Project Tasks` |
| `api/workspace_tasks.py` | `/workspaces/{ws}/tasks` | `Workspace Tasks` |
| `api/task_templates.py` | `/workspaces/{ws}/task-templates` | `Task Templates` |
| `api/task_config.py` | `/workspaces/{ws}/{task-statuses,custom-fields}` | `Task Configuration` |

`project_tasks.py` is the workhorse — full CRUD, assignment, status updates, GitHub linking (`GET /github-issues` line 448; `POST /github-links` line 649; `DELETE /github-links/{id}` line 697), and `POST /move-to-sprint` (line 783) to promote a backlog item.

`workspace_tasks.py` is intentionally minimal — `GET /workspaces/{ws}/tasks` (line 18) and `PATCH /.../status` (line 63). It's the read-only lens for "all tasks, all teams, this workspace."

## Task templates

`TaskTemplate` (`sprint.py:918-986`):

| Field | Note |
|---|---|
| `workspace_id`, `created_by_id` | Scope |
| `title_template` | `"Onboard new hire: {{name}}"` with `{{var}}` substitution |
| `default_priority`, `default_story_points` | Sensible defaults |
| `subtasks` (JSONB) | List of pre-defined subtasks to spawn alongside |
| `checklist` (JSONB) | Checklist items pre-populated on the created task |
| `usage_count` | Cached for popularity sort |

POST `/from-template` creates a task from the template, filling `{{var}}`s from the request body.

## Custom statuses & fields

Workspaces can redefine the task lifecycle without changing code.

**`WorkspaceTaskStatus`** (`sprint.py:31-80`):

| Field | Note |
|---|---|
| `workspace_id` | Scope |
| `name`, `slug`, `color`, `position` | Display |
| `category` | `todo` / `in_progress` / `done` — load-bearing for burndown |

Once a workspace defines its own statuses, tasks should reference them via `SprintTask.status_id`. The legacy hardcoded `status` string still works (used by older tasks and external imports that don't know about the custom statuses), but **`category` is what burndown queries against** — so a workspace can have "Awaiting Design", "Code Review", "QA", "Blocked" as their own statuses and burndown will still compute correctly.

**`WorkspaceCustomField`** (`sprint.py:83+`) — per-workspace extra fields. Stored in `SprintTask.custom_fields` JSONB keyed by `slug`.

## Visual builder (forms)

`api/visual_builder.py` exposes a block-based UI for building forms:

| Concept | Note |
|---|---|
| Block | A reusable form widget |
| `block_type` | The block's identifier (e.g. `multi_choice_with_other`) |
| `block_schema` | JSON Schema describing the block's configurable props |
| `default_props` | Default values for those props |
| `html_template` | The rendered form output |

This same machinery is shared with the email-marketing visual builder.

## Projects

`Project` (`models/project.py:39-152`) is the **organizational container** above sprints/tasks. A project belongs to a workspace, has members (`ProjectMember` with per-project role overrides), teams (`ProjectTeam` many-to-many), and an optional `public_slug` for the public read-only roadmap.

Public projects expose a configurable set of tabs (`project.settings.public_tabs.enabled_tabs`):

```
overview, backlog, board, bugs, goals, releases, roadmap, stories, sprints, timeline
```

`api/public_projects.py` returns read-only views of the project at `/public/projects/{slug}` with the enabled tabs only. Optional voting/comments on the public roadmap are gated by project settings (`RoadmapRequest`, `RoadmapVote`, `RoadmapComment`).

## Frontend

Pages:

| Route | Purpose |
|---|---|
| `/tickets` | Ticket list |
| `/tickets/[ticketId]` | Ticket detail with response thread |
| `/sprints/[projectId]/...` | See [sprints.md](./sprints.md) |
| `/public/forms/{token}` | Public ticket submission |
| `/public/projects/{slug}` | Public read-only project roadmap |

## Common pitfalls

- **Choosing the wrong abstraction.** If users submit a form, the canonical artifact is a `Ticket`, not a `SprintTask`. Convert to a task only when the team decides to work on it.
- **Two statuses on the same task.** The legacy `status` string and the new `status_id` can both exist. Reading code should prefer `status_id` if non-null, otherwise fall back to `status`. Writing code on the modern path should *only* set `status_id`.
- **Custom status with wrong `category`.** Burndown queries `category`. A status named "Done" with `category="in_progress"` will look right in the UI and silently break analytics. Always set `category` deliberately.
- **External issue updates lag.** `SprintTask.sync_status="pending"` means a write is in flight to GitHub/Jira/Linear. If the third-party API is down, expect `conflict` until reconciled. Don't bypass `*SyncService` with raw `UPDATE` statements — they own the cursor state.
- **Public form rate-limiting.** The public submission endpoint has aggressive rate limits to deter spam. If a legitimate batch import needs to push many tickets, use the authenticated POST instead.
