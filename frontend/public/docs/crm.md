# CRM

Aexy's CRM is a **schema-less, custom-object-first** relationship system. Companies, People, and Deals are the seeded objects, but everything down to the table itself is user-configurable. Records are stored as JSONB against per-attribute schemas, which is why adding a new field doesn't require a migration.

## Mental model

- **Object** — a "table type" (Company, Person, Deal, or any custom object the workspace defines). Stored in `crm_objects`.
- **Attribute** — a column on an object. Typed (TEXT, NUMBER, SELECT, RECORD_REFERENCE, AI_COMPUTED, …). Stored in `crm_attributes`.
- **Record** — a row, with `values` as a JSONB object keyed by attribute slug. Stored in `crm_records`.
- **Relation** — a many-to-many edge between two records (Deal ↔ Person, Person ↔ Company). Stored in `crm_record_relations`.
- **List** — a saved view: filters + sorts + visible attributes + view type (table, kanban, calendar, timeline, gallery). Stored in `crm_lists`.
- **Activity** — a timeline event on a record (email opened, stage changed, note added, automation fired).
- **Automation / Sequence / Webhook** — three flavors of "do something when X happens." See below.

This is the same pattern as Airtable / Attio: one universal storage shape, custom typing on top, dynamic UI rendered off the attribute definitions.

## Backend

### Routers

| File | Prefix | Highlights |
|---|---|---|
| `api/crm.py` | `/workspaces/{workspace_id}/crm` | Objects, attributes, records, notes, activities, lists |
| `api/crm_automation.py` | `/workspaces/{workspace_id}/crm` | Automations, sequences, webhooks |

Key endpoints from `crm.py`:

```
GET    /objects                            list objects (line 85)
POST   /objects                            create object (line 144)
PATCH  /objects/{object_id}                update (line 250)
DELETE /objects/{object_id}                delete (line 304)
POST   /objects/{object_id}/attributes     add a column (line 1018)
GET    /objects/{object_id}/records        list records (line 1214)
POST   /objects/{object_id}/records        create record (line 1256)
PATCH  /objects/{object_id}/records/{record_id}    update values (line 1373)
GET    /records/{record_id}/notes          list notes
POST   /records/{record_id}/notes          add note
GET    /activities                         workspace-wide timeline (line 1570)
GET    /lists                              saved views (line 1662)
POST   /lists                              create saved view (line 1708)
```

Key endpoints from `crm_automation.py`:

```
POST   /automations                            create automation
GET    /automations                            list (filterable by object_id, is_active)
PATCH  /automations/{automation_id}            update
POST   /automations/{automation_id}/trigger    manual fire
GET    /automations/{automation_id}/runs       execution history
POST   /sequences                              create email/task sequence
POST   /sequences/{sequence_id}/enroll         enroll a record
POST   /enrollments/{enrollment_id}/pause      pause an in-flight sequence
POST   /webhooks                               register outbound webhook
GET    /webhooks/{webhook_id}/deliveries       delivery log
```

### Models (`backend/src/aexy/models/crm.py`)

**`CRMObject`** (`crm.py:194-321`):

| Field | Note |
|---|---|
| `workspace_id`, `slug` | Unique per workspace |
| `name`, `plural_name`, `icon`, `color` | Display |
| `object_type` | `COMPANY` / `PERSON` / `DEAL` / `PROJECT` / `CUSTOM` |
| `primary_attribute_id` | Which attribute is the "name" / displayed first |
| `settings` (JSONB) | `enableActivities`, `enableNotes`, `enableTasks`, `enableFiles` toggles |
| `scope` | `crm` / `standalone` / `document` / `project` — controls where the object appears in the UI |
| `record_count` | Cached for fast list-page header |

**`CRMAttribute`** (`crm.py:324-405`) — defines a column. The `attribute_type` enum is the load-bearing field; every type has a corresponding shape inside `config` JSONB:

```
TEXT, TEXTAREA, NUMBER, CURRENCY, DATE, CHECKBOX,
SELECT, MULTI_SELECT, STATUS,
EMAIL, PHONE, URL, LOCATION,
PERSON_NAME, RATING,
RECORD_REFERENCE, USER_REFERENCE,
FILE, AI_COMPUTED
```

`RECORD_REFERENCE` is how you say "Deal.company points at a record in the Companies object" — `config = {"target_object_id": "..."}`. Cross-object linking falls out naturally.

`AI_COMPUTED` stores a prompt and a list of input attributes; the value is filled by an LLM background job and refreshed when inputs change.

**`CRMRecord`** (`crm.py:411-507`) — the row.

| Field | Note |
|---|---|
| `workspace_id`, `object_id` | Scope |
| `values` (JSONB) | `{ attribute_slug: typed_value }` |
| `display_name` | Cached from `primary_attribute_id` for search/sort |
| `owner_id` | The salesperson/agent who owns this record |
| `source` | `manual` / `email_sync` / `api` / `import` |
| `is_archived` | Soft-delete |

**`CRMRecordRelation`** (`crm.py:509-551`) — many-to-many between two records. Optional `relation_type` label and `relation_metadata` JSONB. This is how Deal-to-Person ("decision maker", "champion") is encoded.

**`CRMList`** (`crm.py:606-740`) — saved view. Stores `filters` (JSONB array `[{attribute, operator, value, conjunction}]`), `sorts`, `visible_attributes`, `column_config`, per-view-type config (kanban grouping field, calendar date attributes).

**`CRMActivity`** (`crm.py:801-870`) — every meaningful event on a record. `activity_type` enum is the union of `EMAIL_SENT/EMAIL_RECEIVED/EMAIL_OPENED/CALL_MADE/MEETING_SCHEDULED/RECORD_CREATED/RECORD_UPDATED/STAGE_CHANGED/SEQUENCE_ENROLLED/ENRICHMENT_COMPLETED/…`. Powers the timeline panel in the record detail page.

### Services

| Service | Responsibility |
|---|---|
| `CRMObjectService` (`services/crm_service.py:53`) | Object CRUD; enforces unique slug per workspace |
| `CRMAttributeService` (line 428) | Column CRUD; reorders; validates `attribute_type` × `config` shape |
| `CRMRecordService` (line 602) | Row CRUD; auto-populates `display_name`; logs CRMActivity on update |
| `CRMListService` (line 895) | Saved views CRUD; list-entry membership |
| `CRMNoteService` (line 1115) | Notes with @mention parsing for notifications |
| `CRMActivityService` (line 1233) | Activity logging + `auto_enrich_from_email` |
| `CRMAutomationService` (`crm_automation_service.py:36`) | Triggers, conditions, actions, runs |
| `CRMSequenceService` (line 2280) | Multi-step campaigns: enroll, pause, resume, exit |
| `CRMWebhookService` (line 2747) | Outbound deliveries with HMAC signing |

## Automations

A first-class no-code workflow engine living inside CRM. Three pieces: **trigger → conditions → actions**.

### Triggers (`CRMAutomationTriggerType` in `crm.py:103-134`)

Record-level: `RECORD_CREATED`, `RECORD_UPDATED`, `RECORD_DELETED`, `FIELD_CHANGED` (with `trigger_config.field` + optional `fromValue/toValue`), `STATUS_CHANGED`, `STAGE_CHANGED`.

Scheduled: `SCHEDULE_DAILY`, `SCHEDULE_WEEKLY` (with `time`, `timezone`).

Date-based: `DATE_APPROACHING`, `DATE_PASSED`.

External: `WEBHOOK_RECEIVED` (with `endpointId`), `FORM_SUBMITTED`.

Communication: `EMAIL_OPENED`, `EMAIL_CLICKED`, `EMAIL_REPLIED` (sourced from `SyncedEmail` activity).

User/system: `USER_FIRST_LOGIN`, `USER_PROFILE_COMPLETED`, `USER_INTEGRATION_CONNECTED`, `RELEASE_PUBLISHED`.

### Conditions

A JSONB array `[{attribute, operator, value, conjunction}]` evaluated after the trigger matches. AND/OR via `conjunction`. If false, the run is skipped (logged in `CRMAutomationRun.status = "skipped"`).

### Actions (`CRMAutomationActionType` in `crm.py:136-169`)

Record: `CREATE_RECORD`, `UPDATE_RECORD`, `DELETE_RECORD`, `LINK_RECORDS`.

Communication: `SEND_EMAIL` (template-based), `SEND_SLACK`, `SEND_SMS`.

Task/notification: `CREATE_TASK`, `NOTIFY_USER`, `NOTIFY_TEAM`.

Campaign: `ENROLL_IN_SEQUENCE`, `REMOVE_FROM_SEQUENCE`, `ADD_TO_LIST`, `REMOVE_FROM_LIST`.

Integration: `WEBHOOK_CALL`, `API_REQUEST`.

AI: `ENRICH_RECORD` (call enrichment provider), `CLASSIFY_RECORD` (LLM classification), `GENERATE_SUMMARY`.

### Execution

`CRMAutomationService.process_trigger()` (`crm_automation_service.py:172`) fires after every relevant model event:

1. Find active automations matching `workspace_id` × `object_id` × `trigger_type` (line 182-188).
2. For `FIELD_CHANGED`, also check the specific field (line 197-201).
3. For each match, check `run_limit_per_month` (line 243-245) — skip with logged reason if exceeded.
4. Evaluate `conditions` — skip if false.
5. Create a `CRMAutomationRun` record and execute actions in order via `_execute_action()`.
6. `steps_executed` JSONB accumulates `[{actionType, status, result, error, executedAt}]` for observability.
7. On per-action error, honor `error_handling`: `stop` halts the run, `continue` skips just that action, `retry` re-attempts with backoff.

Run history is queryable per automation, so users can see "this automation ran 47 times this month, 3 failed, here's the error."

## Sequences

Sequences are multi-step nurture campaigns ("send Email A, wait 3 days, send Email B if no reply, otherwise create a Task"). Stored as `CRMSequence` + ordered `CRMSequenceStep` + per-record `CRMSequenceEnrollment`.

Step types:
- `EMAIL` — template + delay
- `TASK` — create a follow-up task
- `WAIT` — pure delay
- `CONDITION` — branch on attribute value (e.g., "if Deal.stage = won, exit")
- `ACTION` — escape hatch into the automation action set

Exit conditions live on the sequence as a JSONB array `[{type: reply_received|meeting_booked|deal_created|custom, config}]` — `CRMSequenceService.check_exit_conditions()` evaluates these at every step transition.

`settings` JSONB on the sequence controls `sendWindow`, `sendDays`, `timezone`, `skipHolidays` for human-friendly send timing.

Stats are denormalized onto the sequence row (`total_enrollments`, `active_enrollments`, `completed_enrollments`, `successful_executions`) so the list page doesn't N+1 query.

## Webhooks (outbound)

Subscribe an external URL to record events. `CRMWebhook` stores URL + `events` (JSONB array) + `secret` (for HMAC) + retry config. Every delivery attempt is recorded in `CRMWebhookDelivery` with status, response body, duration, next retry.

Delivery uses the `deliver_webhook` Temporal activity with `WEBHOOK_RETRY` (1m → 1h backoff, 6 attempts). See [webhooks.md](./guides/webhooks.md) for the signing protocol and adding new event types.

## Custom objects

This is the killer feature. To define a new object type from the UI:

1. `POST /objects` with `object_type=CUSTOM`, a slug, plural name, icon, color.
2. `POST /objects/{id}/attributes` for each column — TEXT, SELECT, RECORD_REFERENCE to existing objects, AI_COMPUTED with a prompt, …
3. The frontend re-renders the list and detail pages automatically off the attribute schema — no code change.
4. Set `primary_attribute_id` to define the "name" field shown in references.

Linked records (RECORD_REFERENCE attributes) are bidirectional through the `CRMRecordRelation` table — you can query "all Deals linked to this Company" from either side.

`AI_COMPUTED` deserves its own callout. The attribute stores:
```json
{ "prompt": "Summarize this deal in one sentence.", "inputs": ["name", "stage", "amount"], "model": "claude-haiku" }
```
A Temporal activity (`extract_file_ai_metadata` for files, equivalent for records) fills the value and re-runs when any input attribute changes.

## Email & calendar integration

Email sync flows through Google/Microsoft integrations (see [google.md](./google.md), [microsoft.md](./microsoft.md)). Once tokens are connected:

1. Temporal activity `sync_gmail` (or Microsoft equivalent) pulls new mail.
2. For each `SyncedEmail`, `GmailSyncService.auto_enrich_contact_from_email()` (`services/gmail_sync_service.py:41`) auto-creates a Person record if the sender doesn't already exist (skips personal domains like gmail.com, yahoo.com), creates the Company if a non-personal domain isn't known yet, and writes a `SyncedEmailRecordLink` joining the email to the Person record with `link_type="from"`.
3. The CRM Inbox page (`/crm/inbox`) reads `SyncedEmail` joined to records.

There's no Outlook-specific enrichment yet — `auto_enrich_contact_from_email` is wired only to Gmail. Microsoft mail still imports; it just doesn't trigger auto-record creation. (TODO if you need parity.)

Calendar events flow through the same path into `SyncedCalendarEvent`, displayed on `/crm/calendar`.

## Frontend

Pages under `frontend/src/app/(app)/crm/`:

| Route | Purpose |
|---|---|
| `/crm` | Home — banner, integration prompts, quick links |
| `/crm/[objectSlug]` | Object list view (renders a `CRMList`) |
| `/crm/[objectSlug]/[recordId]` | Record detail — left panel record, right panel activities/notes/tasks |
| `/crm/activities` | Workspace-wide activity feed |
| `/crm/calendar` | Synced calendar |
| `/crm/inbox` | Synced email |
| `/crm/agents` | AI agents wired to CRM tools (see [ai-agents.md](./ai-agents.md)) |
| `/crm/automations` | Automation list + builder (`/automations/[automationId]`, `/automations/new`) |
| `/crm/settings/integrations` | Google/Microsoft toggles |
| `/crm/onboarding/*` | First-run flow |

Hooks (`frontend/src/hooks/useCRM.ts`): `useCRMObjects`, `useCRMAttributes`, `useCRMRecords`, `useCRMNotes`, `useCRMActivities`, `useCRMLists`, `useCRMListEntries`, `useCRMAutomations`, `useCRMSequences`, `useCRMWebhooks` — all wrap React Query around the generated API client.

## Common pitfalls

- **Storing typed values in `CRMRecord.values`**: clients must serialize values consistently. Dates are ISO 8601 strings; multi-selects are arrays; record references are `[record_id]` (always an array, even when single). The frontend has helpers; if you write a server-side automation action, mirror them.
- **`display_name` drift**: when the user changes the primary attribute or edits the primary value, `CRMRecord.display_name` must be re-derived. `CRMRecordService.update_record` does this; if you write a path that bypasses the service, you'll see stale names in lists.
- **AI_COMPUTED freshness**: changing an input attribute should re-dispatch the computation. The trigger lives in the service layer — don't write to `crm_records.values` directly without going through it.
- **Run limits**: automations have a `run_limit_per_month`. Hitting it doesn't error the trigger — the run is recorded as skipped. Watch automation runs lists, not error logs, when "automation isn't firing."
- **Microsoft email auto-enrichment**: only Gmail is wired to `auto_enrich_contact_from_email`. Outlook mail imports but doesn't auto-create records. Coordinate with the user if they're expecting parity.
