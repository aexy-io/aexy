# Compliance

The compliance module is the broadest "governance & operational reminders" layer in Aexy. It spans:

- **Mandatory training** (assignments, completion tracking, waivers, certifications)
- **Recurring reminders** (any periodic obligation — SOC 2 controls, security reviews, audit prep)
- **Compliance documents** (versioned files linked to controls)
- **Questionnaires** (parsed from Excel, auto-suggesting reminders)
- **Escalation matrices** (L1 → L4 routing when items breach SLA)
- **Audit logs** (everything who-did-what-when for auditor reads)

The existing [reminders.md](./guides/reminders.md) covers the recurring-reminders sliver. This doc is the umbrella.

## How the pieces fit

```
Questionnaire (Excel)
       │   analyze
       ▼
ReminderSuggestion ──accept──▶ Reminder ──schedule──▶ ReminderInstance ──notify─▶ owners
                                                          │
                                                          └── overdue ──▶ EscalationMatrix (L1→L4)
                                                          │
                                                          └── complete ──▶ evidence links to ComplianceDocument

MandatoryTraining ──assign──▶ TrainingAssignment ──complete──▶ Developer's compliance status
                              (overdue / waived)

Certification ──issue──▶ DeveloperCertification ──renew / expire──▶ status changes fire audit events
```

Everything emits to `AuditLog`. Auditors read that table.

## Mandatory training

### Models (`models/gtm_compliance.py`)

**`MandatoryTraining`**:

| Field | Note |
|---|---|
| `workspace_id`, `name`, `description` | Definition |
| `applies_to_type` | `ALL` / `TEAM` / `ROLE` / `INDIVIDUAL` |
| `applies_to_ids` (JSONB) | IDs scoped by `applies_to_type` |
| `due_days_after_assignment` | Relative due-date computation |
| `recurring_months` | If set, regenerate assignments every N months |
| `fixed_due_date` | Alternative to relative due |
| `learning_path_id` | Optional link to a Learning module path |
| `is_active` | |

**`TrainingAssignment`**:

| Field | Note |
|---|---|
| `mandatory_training_id`, `developer_id` | Who, what |
| `due_date` | Absolute |
| `status` | `PENDING` / `IN_PROGRESS` / `COMPLETED` / `OVERDUE` / `WAIVED` |
| `progress_percentage` | 0-100 |
| `started_at`, `completed_at`, `acknowledged_at` | Lifecycle timestamps |
| `waived_by_id`, `waived_at`, `waiver_reason` | If waived |
| `reminder_sent_at` | Last reminder dispatch |

### Endpoints (`api/compliance.py`)

```
POST   /compliance/mandatory-training         create
GET    /compliance/mandatory-training         list with stats
PATCH  /compliance/mandatory-training/{id}    update
DELETE /compliance/mandatory-training/{id}    deactivate

POST   /compliance/assignments                single assign
POST   /compliance/assignments/bulk           bulk to developer list
GET    /compliance/assignments                filter by status/developer/training
PATCH  /compliance/assignments/{id}           update progress
POST   /compliance/assignments/{id}/acknowledge
POST   /compliance/assignments/{id}/start
POST   /compliance/assignments/{id}/complete
POST   /compliance/assignments/{id}/waive     manager waives with reason
```

GETs on assignment return computed fields `days_until_due` and `is_overdue`.

## Certifications

Distinct from training — a certification is an external credential the developer holds and renews.

### Models

**`Certification`** — definition:

| Field | Note |
|---|---|
| `name`, `issuing_authority`, `description` | |
| `validity_months` | If null, never expires |
| `renewal_required` | |
| `category`, `skill_tags` (JSONB), `prerequisites` (JSONB) | Search/filter |
| `is_required` | If yes, missing this is flagged on the developer |
| `external_url`, `logo_url` | Display |

**`DeveloperCertification`** — instance:

| Field | Note |
|---|---|
| `developer_id`, `certification_id` | Who, what |
| `issued_date`, `expiry_date` | Window |
| `status` | `ACTIVE` / `EXPIRED` / `EXPIRING_SOON` / `REVOKED` |
| `credential_id`, `verification_url`, `certificate_url` | The artifact |
| `verified_at`, `verified_by_id` | Admin signoff |
| `score` | Numeric score if relevant |
| `renewal_reminder_sent_at` | |

### Endpoints

```
POST   /compliance/certifications                          create definition
GET    /compliance/certifications                          list with holder stats
PATCH  /compliance/certifications/{id}                     update

POST   /compliance/developer-certifications                add to developer
GET    /compliance/developer-certifications                filter by cert/developer/status, expiring soon flags
PATCH  /compliance/developer-certifications/{id}           update
POST   /compliance/developer-certifications/{id}/verify    admin verifies
POST   /compliance/developer-certifications/{id}/renew     renewal
POST   /compliance/developer-certifications/{id}/revoke    revoke with reason
```

Returned objects include `days_until_expiry`, `is_expired`, `is_expiring_soon` computed fields.

## Reminders (the broader system)

Distinct from training assignments — reminders cover any periodic operational task, not just training.

### Models (`models/reminder.py`)

**`Reminder`** — the definition:

| Field | Note |
|---|---|
| `title`, `description` | |
| `category` | `COMPLIANCE` / `SECURITY` / `AUDIT` / `OPERATIONAL` / `TRAINING` / `REVIEW` / `CUSTOM` |
| `priority` | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `status` | `ACTIVE` / `PAUSED` / `ARCHIVED` |
| `frequency` | `ONCE` / `DAILY` / `WEEKLY` / `BIWEEKLY` / `MONTHLY` / `QUARTERLY` / `SEMI_ANNUAL` / `YEARLY` / `CUSTOM` |
| `cron_expression` | For `CUSTOM` |
| `timezone`, `start_date`, `end_date`, `next_occurrence` | Schedule |
| `assignment_strategy` | `FIXED` / `ROUND_ROBIN` / `ON_CALL` / `DOMAIN_MAPPING` / `CUSTOM_RULE` |
| `default_owner_id`, `default_team_id` | Defaults if strategy yields none |
| `domain` | Free-text grouping (security, finance, …) |
| `escalation_config` (JSONB) | Level-by-level escalation rules |
| `notification_config` (JSONB) | Channels (email, Slack, web push), intervals |
| `requires_acknowledgment`, `requires_evidence` | Workflow gates |
| `source_type`, `source_id`, `source_question_id` | If generated from a questionnaire |

**`ReminderInstance`** — one materialized occurrence:

| Field | Note |
|---|---|
| `reminder_id`, `due_date` | Bind |
| `status` | `PENDING` / `NOTIFIED` / `ACKNOWLEDGED` / `COMPLETED` / `SKIPPED` / `ESCALATED` / `OVERDUE` |
| `current_escalation_level` | `L1` / `L2` / `L3` / `L4` |
| `assigned_owner_id`, `assigned_team_id` | Resolved by strategy at instance-creation time |
| `notification_count`, `last_notified_at` | |
| `acknowledged_at/by_id/notes` | |
| `completed_at/by_id/notes` | |
| `skipped_at/by_id/skip_reason` | |
| `evidence_links` (JSONB) | Compliance doc references |

### Routing & ownership

The pieces that decide who gets an instance:

- **`ControlOwner`** — `(control_id, domain) → primary_owner_id, backup_owner_id, team_id`. The "for SOC2-CC6.1, the owner is Alice" mapping.
- **`DomainTeamMapping`** — `(domain, team_id, priority)`. Fallback if no `ControlOwner` matches.
- **`AssignmentRule`** — workspace-level rules with `rule_config` JSONB and a priority. The escape hatch for complex assignment logic.

### Endpoints (`api/reminders.py`)

The router is large; key groupings (each prefixed `/workspaces/{ws}/reminders/`):

```
# Dashboard
GET  /dashboard/stats
GET  /my-reminders                  assigned_to_me, my_team, overdue, due_today, due_this_week
GET  /calendar                      time-windowed view

# Configuration
GET/POST/PATCH/DELETE /control-owners
GET/POST/DELETE       /domain-team-mappings
GET/POST/PATCH/DELETE /assignment-rules

# Suggestions
GET  /suggestions                   ReminderSuggestion list
POST /suggestions/{id}/accept       → creates Reminder
POST /suggestions/{id}/reject       with reason

# Bulk ops
POST /bulk/assign                   instance_ids[] → owner / team
POST /bulk/complete                 instance_ids[] + notes

# Instance lifecycle
POST /instances/{id}/acknowledge
POST /instances/{id}/complete
POST /instances/{id}/skip
POST /instances/{id}/reassign

# Core CRUD
GET    /                            multi-filter list
POST   /                            create reminder
GET    /{id}                        with instances
PATCH  /{id}
DELETE /{id}?hard=true              archive or hard delete
GET    /{id}/instances              with status/owner/team/date filters
```

## Questionnaires

Bulk reminder generation from an Excel questionnaire.

### Endpoints (`api/questionnaires.py`)

```
POST   /workspaces/{ws}/questionnaires/upload          .xlsx/.xls, max 10MB
POST   /workspaces/{ws}/questionnaires/{id}/analyze    → ReminderSuggestion records
GET    /workspaces/{ws}/questionnaires/                list
GET    /workspaces/{ws}/questionnaires/{id}            metadata
GET    /workspaces/{ws}/questionnaires/{id}/questions  parsed
DELETE /workspaces/{ws}/questionnaires/{id}
```

`analyze` returns `{suggestions_count, skipped_count, domains, skip_summary: {duplicates, negatives, blanks, headers}}` — the parser drops obvious noise and clusters by domain.

**`ReminderSuggestion`**:

| Field | Note |
|---|---|
| `questionnaire_response_id`, `question_id` | Source |
| `suggested_title`, `suggested_description`, `suggested_category`, `suggested_frequency`, `suggested_domain` | The proposed reminder |
| `confidence_score` | LLM/heuristic confidence |
| `status` | `pending` / `accepted` / `rejected` |
| `created_reminder_id` | Backlink after accept |
| `rejection_reason` | If rejected |

## Compliance documents

Versioned file storage tied to compliance entities.

### Endpoints (`api/compliance_documents.py`)

```
POST   /upload-url                                     presigned S3 PUT
POST   /upload                                         direct multipart upload
POST   /                                               register after upload (tags, folder)
GET    /                                               filter by folder, status, mime_type, tags, search, uploader
GET    /by-entity/{entity_type}/{entity_id}            documents linked to an entity (reminder, certification, etc.)
GET    /tags/all                                       list workspace tags
PATCH  /{doc_id}                                       update metadata
POST   /{doc_id}/move                                  change folder
POST   /{doc_id}/archive
DELETE /{doc_id}                                       soft delete

POST   /{doc_id}/tags
DELETE /{doc_id}/tags/{tag}

POST   /{doc_id}/links                                 link to entity
GET    /{doc_id}/links
DELETE /{doc_id}/links/{link_id}

# Folders
POST/GET/PATCH/DELETE /folders                         tree view
```

Documents flow through the same AI metadata pipeline as Drive files (see [documents-and-drive.md](./documents-and-drive.md)) — same `extract_file_ai_metadata` Temporal activity.

## Escalation

### Models / endpoints

`api/escalation.py`:

```
GET    /workspaces/{ws}/escalation-matrices                       list
POST   /workspaces/{ws}/escalation-matrices                       create
GET    /workspaces/{ws}/escalation-matrices/{id}
PATCH  /workspaces/{ws}/escalation-matrices/{id}
DELETE /workspaces/{ws}/escalation-matrices/{id}

GET    /workspaces/{ws}/tickets/{ticket_id}/escalations           ticket-level
POST   /workspaces/{ws}/tickets/{ticket_id}/escalations/{id}/acknowledge
```

**`EscalationMatrix`** stores `severity_levels[]`, `rules[]`, `form_ids[]`, `team_ids[]`, `priority_order`. Rules typically look like "if status=OPEN for 24h → L1 notify team_lead; if 48h → L2 notify manager; …" up to L4 (VP/exec).

**`ReminderEscalationLevel`** enum on `ReminderInstance.current_escalation_level`: `L1` (team lead) / `L2` (manager) / `L3` (director) / `L4` (VP/exec).

## Audit log

Single table everything writes to. Routes:

```
GET /compliance/audit-logs    filter by action_type, target_type, target_id, actor_id, date range
```

`AuditLog`:

| Field | Note |
|---|---|
| `actor_id` | Who did it |
| `action_type` | `AuditActionTypeEnum` — `TRAINING_CREATED`, `TRAINING_COMPLETED`, `CERTIFICATION_RENEWED`, `APPROVAL_REQUESTED`, etc. (14 enum values) |
| `target_type`, `target_id` | What was acted on |
| `old_value`, `new_value` | Diff |
| `description` | Human-readable |
| `ip_address`, `user_agent` | For sensitive actions |

## Reports

```
GET /compliance/reports/overview                          ComplianceOverview (workspace stats)
GET /compliance/reports/developer/{id}                    DeveloperComplianceStatus
GET /compliance/reports/overdue                           OverdueReport
GET /compliance/reports/expiring-certifications?days_ahead=30
```

These are the views auditors and compliance officers actually look at.

## Temporal schedules

From `temporal/schedules.py` and `temporal/activities/reminders.py` + `compliance_automation.py`:

**Reminders:**

- `generate-reminder-instances` — daily, materializes new instances from definitions
- `process-reminder-escalations` — every 2 hours, walks instance states and fires escalations
- `send-daily-reminder-digest` — daily 08:00 UTC
- `flag-overdue-reminders` — hourly
- `check-evidence-freshness` — daily
- `send-reminder-notification` — per-instance fan-out

**Compliance automation** (`compliance_automation.py`):

- `check-approaching-due-assignments` — daily, fires `assignment.approaching_due` event
- `check-overdue-assignments` — daily, fires `assignment.overdue`
- `check-expiring-certs` — daily
- `check-expired-certs` — daily
- `check-bulk-compliance` — aggregate `workspace.compliance_status_changed`

These events feed the broader Automations engine — workspaces can react with "Slack the manager" or "create a ticket" actions.

## Frontend

`/frontend/src/app/(app)/compliance/` — dashboard, training list, assignment tracking, certification management, document browser, questionnaire importer.

## Common pitfalls

- **Two "reminders" namespaces**: there's the broader [reminders.md](./guides/reminders.md) doc (compliance-specific recurring task scheduler) and the in-product reminders.py router. They're the same system — the doc came first when the scope was narrower.
- **Acceptance ≠ completion**: `acknowledged_at` means the owner saw it; `completed_at` means the work is done. Compliance reports key off `completed_at`. Don't mark items "acknowledged" expecting them to drop out of overdue lists.
- **Evidence freshness**: reminders that `requires_evidence=true` must have at least one `evidence_link` to be considered complete. The freshness check runs daily; old completions without evidence will start re-firing.
- **Waivers don't propagate to certifications**: waiving a training doesn't grant a certification. Different models, different lifecycles.
- **Bulk-assign breaks if even one developer fails**: today it's transactional — partial success rolls back. Pre-validate the developer list (active, in-workspace) before calling bulk-assign on long lists.
- **Audit log is append-only**: never `UPDATE` or `DELETE` rows. Auditors look for gaps and will flag silent edits.
