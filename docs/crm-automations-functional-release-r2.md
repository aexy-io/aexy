# CRM Automations functional release R2

This handoff describes the local release candidate on
`integration/crm-automations-r2`. It deliberately separates implemented code,
automated evidence, manual handler evidence, and behavior that still lacks a
deployed browser-to-worker proof.

## Scope assumption

The phrase “visibility rules of non” is treated as “non-executable and non-CRM
capabilities.” Non-CRM modules remain unavailable because this release is
CRM-only. Repository evidence did not indicate another product meaning.

## Capability contract

The backend registry is the only source that can make a palette capability
visible. Structural entries travel through the action registry but become
their real canvas node types:

- `condition` becomes a Condition node.
- `wait` becomes a Wait node.
- `run_agent` becomes an AI Agent node.
- `branch` becomes a Branch node.

The visible CRM triggers are:

- `record.created`, `record.updated`, `record.deleted`, and `field.changed`.
- `list_entry.added`, `list_entry.removed`, and `stage.changed`.
- `schedule.daily`, `schedule.weekly`, `date.approaching`, and `date.passed`.
- `form.submitted`, `email.opened`, and `email.clicked`.

The visible ordinary action capabilities are:

- Send Email, Send Slack when connected, Send SMS, and Webhook Call.
- Create Task, Notify User, and Notify Team.
- Create Record, Update Record, Delete Record, Link Records, and Assign Owner.
- Enroll in Sequence and Remove from Sequence.

The visible structural capabilities are Condition, Wait, AI Agent, and Branch.
Wait exposes duration and wait-until-date. Event wait remains hidden. Join and
merge remain hidden.

The explicitly unavailable CRM triggers are:

- `webhook.received`: no inbound endpoint dispatches the trigger.
- `email.replied`: no inbound reply-detection event source exists.
- `status.changed`: CRM status changes use `stage.changed`.

The explicitly unavailable actions are:

- `api_request`, `enrich_record`, `classify_record`, and `generate_summary`
  have no approved published executor.
- `add_to_list` and `remove_from_list` remain outside the approved release
  scope.

Every non-CRM module remains unavailable. Send Slack is additionally hidden for
workspaces without a connected Slack integration.

## Thirty-one-story closure matrix

The source checkout contains twenty Round One CSV entries rather than a
canonical thirty-one-row bible. This matrix reconstructs the complete
thirty-one-item CRM release surface from those entries and the numbered
requirements in the takeover brief. That reconstruction is an explicit
assumption, not a claim that a missing canonical file was inspected.

| # | Story | Status | Evidence or remaining boundary |
|---:|---|---|---|
| 1 | Milestone: publish, trigger, perform work, and show truthful proof | blocked | No isolated browser-to-worker deployment was started; unit and handler evidence cannot prove the complete journey. |
| 2 | US-1.1 stage-changed trigger contract | automatically tested | Existing trigger-contract and registry tests remain green. |
| 3 | US-1.2 registry-only trigger palette | automatically tested | NodePalette component tests prove registry-derived rendering. |
| 4 | US-1.3 invalid publish feedback | implemented | Backend rejects unknown trigger, action, node, missing agent, and invalid configuration values. |
| 5 | US-1.4 template validity | blocked | Gallery templates were not individually published and executed. |
| 6 | US-1.5 builder honesty | automatically tested | Loading and registry-error tests prove cached or fallback capabilities remain absent. |
| 7 | US-2.1 record lifecycle triggers | automatically tested | Existing record trigger suite remains green. |
| 8 | US-2.2 narrowed field, list, and stage triggers | automatically tested | Existing narrowing and condition regressions remain green. |
| 9 | US-2.3 schedule and date configuration | implemented | Existing schedule UI remains; this release adds durable wait-until timezone offsets. |
| 10 | US-2.4 form, list, and tracked-email events | automatically tested | Existing registry contract pins only emitted CRM events. |
| 11 | US-2.5 email engagement scope | hidden/deferred | Open and click remain visible; reply remains hidden without an inbound event source. |
| 12 | US-2.6 manual run control | hidden/deferred | Existing API behavior was not expanded into new UI control. |
| 13 | US-3.1 create, update, delete, link, and assign CRM records | automatically tested | Durable handlers now reuse the same tested CRM implementations as inline runs. |
| 14 | US-3.2 outreach sequence membership actions | automatically tested | Existing enroll and remove validation/executor tests remain green. |
| 15 | US-3.3 email, Slack, and SMS actions | automatically tested | SMS field/literal resolution, provider acceptance, and refusal are covered; live delivery is blocked. |
| 16 | US-3.4 task and webhook actions | manually verified | Local receiver accepted the real webhook handler payload; task persistence and retry deduplication are automated. |
| 17 | US-3.5 CRM activity audit entry | automatically tested | Existing run-truthfulness and activity behavior remains in the focused baseline. |
| 18 | US-4.1 condition operators and true/false routing | automatically tested | All advertised operators and unknown-operator failure remain covered. |
| 19 | US-4.2 durable waits | automatically tested | Seconds, minutes, hours, days, zero, and unit aliases are covered; wait-until is implemented using Temporal sleep. |
| 20 | US-4.3 first-match branch with Else | automatically tested | First rule wins, Else fallback, selected rule/path logging, and unknown operators are covered. |
| 21 | US-5.1 choose an existing active agent | implemented | Builder fetches active prebuilt and custom agents; save and publish verify workspace ownership and active state. |
| 22 | US-5.2 agent inputs, output, and downstream values | automatically tested | Record, trigger, prior output mapping, duration, input summary, and downstream output rendering are covered with the service boundary mocked. |
| 23 | US-5.3 agent failure handling | automatically tested | Missing input, missing agent, generation failure, timeout configuration, bounded retry, and honest dry run are covered. |
| 24 | US-6.1 required action fields | automatically tested | Direct API and canvas validation tests remain green, including new SMS and webhook fields. |
| 25 | US-6.2 literal email validation | automatically tested | Existing literal email tests remain green. |
| 26 | US-6.3 practical dynamic values | manually verified | Local receiver observed record ID, text, email, phone, numeric, boolean, date, timestamp, trigger, variable, and agent output values. |
| 27 | US-6.4 variable validation | automatically tested | Nested unknown namespaces, malformed references, and missing runtime paths fail readably. |
| 28 | US-6.5 retry semantics | automatically tested | Three-attempt bound, attempt history, exhausted failure, success after retry, no replay of an earlier step, task dedupe, and webhook idempotency keys are covered. |
| 29 | US-7.1 honest test mode | automatically tested | Side effects are skipped and AI reports that it was not executed in dry run. |
| 30 | US-7.2 recorded run result | automatically tested | Inline and durable history preserve outcomes, attempts, targets, agent summaries, durations, and failure reasons. |
| 31 | US-7.3 settings and run limits | automatically tested | Stop, continue, retry, monthly cap, and multi-admin reporting regressions remain green. |

## Proposed PR 1: CRM functional foundation

The first proposed PR should contain the already-integrated foundation through
commit `adb2bc9967368f2562f26c037fb308919ae2ae85`:

- Canonical dotted trigger identifiers, legacy repair, and registry-only
  authoring.
- Truthful email/outbox execution, terminal run verdicts, run step logs, and
  the abandoned-run reaper.
- Shared condition operators, required-field validation, dry-run safety, and
  stop/continue/retry settings.
- CRM CRUD, relationship, ownership, sequence, schedule, event, and
  multi-admin behavior already integrated before this release candidate.

This PR should retain the existing Round One evidence files and should not
claim the new AI, Wait, Branch, SMS, task, or webhook release surface.

## Proposed PR 2: CRM automations functional release

The second proposed PR should contain only the commits created after
`adb2bc9967368f2562f26c037fb308919ae2ae85`:

- Registry-gated Condition, Wait, Branch, and AI Agent palette nodes.
- Existing-agent selection, workspace/active validation, real execution,
  input/output mapping, summaries, durations, failures, and bounded retries.
- Durable duration and wait-until timers, plus first-match branches with a
  mandatory final Else path.
- Truthful SMS provider handoff, retry-safe task creation with backlink, and
  aligned webhook URL/method/header/body/timeout behavior.
- Recursive dynamic-value validation, strict missing-path failures, attempt
  history, and no replay of previously successful steps.
- Focused backend and frontend contract tests plus this release handoff.

## Deployment and operations

- No new SQL migration is introduced by this release candidate.
- Before deployment, run the repository migration runner and confirm existing
  agent and workflow migrations are applied, especially
  `migrate_agents.sql`, `migrate_automation_agents.sql`,
  `migrate_workflow_definitions.sql`, and `migrate_workflow_executions.sql`.
- Restart the backend and Temporal worker together after deploying, because
  workflow inputs, activities, and registered execution behavior changed.
- Confirm the worker consumes the `workflows` and `integrations` queues used
  by CRM automation activities.
- AI execution requires a configured provider through the existing LLM
  gateway. LM Studio is preferred for validation when available.
- SMS execution requires Twilio account credentials and a sender number.
  Without them the action fails clearly; this work did not send a live SMS.
- Webhook targets must accept HTTP or HTTPS, and receivers should honor the
  supplied `Idempotency-Key` to deduplicate ambiguous network retries.
- No live stack was restarted or altered while producing this candidate.

## Approval risks

- A full browser-to-API-to-PostgreSQL-to-Temporal-worker journey was not run
  from this isolated checkout, so deployment wiring remains unverified.
- No real LLM generation ran. Agent success and failure were proven at the
  existing service boundary, not against LM Studio or a cloud provider.
- No real SMS was sent. Twilio acceptance/refusal behavior was tested at the
  adapter boundary.
- Exactly-once delivery cannot be guaranteed for an external SMS or webhook
  if the provider performs the side effect but the network response is lost.
  Tasks are locally deduplicated; webhooks receive a stable idempotency key.
- Event waits and Join remain unavailable because their complete product path
  was not proven for this release.
- The repository-wide TypeScript check still has five inherited errors in
  unrelated agent-editor, email-marketing, and document-sidebar code.
- Ruff still reports inherited findings in large pre-existing files; no
  deadline time was spent repairing unrelated lint debt.
