# CRM Automations — validation evidence

This records what was exercised, how, and what remains unproven. Status
language is deliberate and used consistently throughout:

- **Live verified** — driven in a running browser against a live database, a
  live durable worker and live external providers, with the stated result
  observed.
- **Automated** — named tests were executed and their outcome observed.
- **Implemented** — the code path exists and is reachable, but was not driven
  end to end.
- **Not verified** — the check was not performed.

Environment: a running application with PostgreSQL, a durable workflow worker,
an SMTP provider, an SMS provider and a language-model provider configured and
reachable. Provider selection is deployment configuration and is not part of
this change.

---

## Live verified

| Capability | What was observed |
|---|---|
| An AI agent runs inside a published automation | Real generation, 12.9s and 14.5s across runs, first attempt, with execution id and token counts recorded. The output referenced the triggering record's own field values. |
| Agent output reaches a later step | The agent result rendered into an email body through a workflow variable; the delivered message contained the analysis and no unresolved placeholders. |
| An unknown agent is refused before publish | Save rejected with a message naming the missing agent. |
| A deactivated agent fails the run with its real cause | The run recorded `failed` with `Agent Data Enrichment is not active`, rather than the workflow engine's generic wrapper text. |
| A webhook step performs a real call | A local receiver recorded a genuine POST returning 202, with the body template rendered from live record values. |
| Webhook requests carry idempotency and do not leak secrets | An `Idempotency-Key` header was present. The Authorization header was explicitly checked for and found absent from stored run history. |
| Task creation persists | A row was written with the rendered title, the configured priority and the correct workspace. |
| A branch selects exactly one path | Three deals at differing values routed to three distinct paths, two by explicit rules and one by the Else fallback. Each run recorded its branch identifier, rule index and path label, and produced exactly one message. |
| Waits are durable | A three-minute wait was interrupted by killing the worker at sixty seconds. The automation resumed without intervention and completed at the three-minute mark; the post-wait email was delivered. |
| A retry re-enters only the failed step | The succeeding step's receiver logged exactly one request, not three. The failing step recorded three separate attempts and the run finished `failed`. |
| SMS delivers through the configured provider | Provider status `delivered`, no error code. |
| Malformed SMS input is refused locally | Rejected before the provider was contacted, with a message stating the required international format. |
| Provider refusals surface readably | Invalid-number and region-not-permitted refusals both reached the step result in readable form. |
| Email delivers through the configured provider | The SMTP relay authenticated and accepted the message for delivery to a real mailbox. |
| Dynamic values resolve | Record, trigger and workflow-variable references all rendered correctly in subjects and bodies. |
| Save and publish validation is honest | Five distinct invalid configurations were refused before anything could run: an invalid recipient domain, a branch with no Else path, a wait with no duration, an agent node with no agent selected, and an SMS step with no message. |
| The palette reflects real capability | Structural steps render only when the backend registry reports them available. A frontend test asserts that no client-side fallback list can reintroduce a hidden capability. |
| Run history is truthful at step level | Per-step status, attempt counts and the delivery target are surfaced on the step itself rather than nested inside a result blob. |
| Email open tracking reaches CRM automations | A tracked message was sent, the tracking pixel was requested, the open was recorded, the corresponding trigger fired, and a downstream automation created a task with the record's name resolved into its title. |

## Automated

| Capability | Evidence |
|---|---|
| Bulk stage moves validate once per batch | Destination validation was hoisted out of the per-record loop. Two tests assert validation runs exactly once for a multi-record batch, and that an invalid destination fails before any record is modified. |
| A step reports success only when delivery occurred | Notifying a user previously discarded its own delivery tally and returned success regardless; running an agent previously reported the agent's status without checking it. Five tests cover both gates, including that starting an agent without waiting remains a success. |
| Required fields, literal email validation, dynamic type checks | Covered by the existing save and publish validation suites. |
| Dry run performs no side effects | Covered, including that an AI step reports it was not executed. |

## Implemented, not driven end to end

- Record create, update, delete, link and assign as a connected journey. The
  handlers are shared with the inline path and are covered by tests, but the
  full sequence was not exercised in a browser.
- List add and remove events bridged into CRM trigger matching.
- The scheduled and date-based trigger runner. The durable wait-until-a-date
  step inside a running automation is live verified; the runner that *starts*
  an automation from a schedule is not.
- Form submission creating a CRM record. The trigger is selectable and the
  bridge exists; a real submission was not driven through.

## Known gaps

1. **Open tracking requires a publicly reachable tracking host.** Opens are
   recorded through an invisible image served by the application, so a mail
   client on the public internet cannot reach a private address. The setting
   exists; this is a deployment prerequisite, not a code gap.

2. **A retried send can duplicate an already-accepted message.** If a provider
   accepts a message and the local write immediately afterwards fails, the step
   records a failure and the retry sends again. This is reproducible.

3. **Durable runs do not advance the monthly run counter.** The limit reads a
   counter that only the inline path updates, so the limit can be exceeded and
   activity totals can read zero.

4. **The durable handoff starts before its run row commits.** A workflow that
   completes immediately can fail to observe the run that created it.

5. **Provider health metrics are read but never written.** That panel is
   permanently empty. Observability only; execution records are unaffected.

6. **Two independent SMS configurations exist.** Automation SMS reads global
   environment settings; outreach sequence SMS reads a per-workspace provider
   registry. Configuring one does not configure the other.

7. **Sequence step advancement does not exist.** Enrolling a record works;
   advancing it through sequence steps is a separate engine that has not been
   built.

8. **Not exercised:** individual template-gallery entries, the click half of
   engagement tracking, and permission behaviour across two concurrent sessions
   at different privilege levels.

## What the duplicate-send protection does and does not cover

The email outbox claims each queued send inside the same transaction that
creates the run, and the durable start rejects a duplicate workflow for the
same claim. That prevents the same queued send from being dispatched twice.

It does **not** cover a provider that has already accepted a message when the
following local write fails. That outcome is genuinely ambiguous and the
current behaviour retries. Gap 2 tracks this.

## Deployment requirements

- **Two SQL scripts must be applied manually.** They live in `backend/scripts/`
  and are **not** Alembic revisions, so the migration runner will not apply
  them:
  - `migrate_automation_email_outbox.sql` creates the outbox table. Apply it
    before starting the new backend, or automation email cannot claim a send.
  - `normalize_crm_automation_trigger_types.sql` repairs legacy underscore
    trigger values to their canonical dotted form. An automation holding a
    legacy value will not match its trigger until this runs. The script opens
    with a SELECT to review against the target database first, and maps values
    explicitly, because a blanket replacement would corrupt the two
    list-membership values that legitimately retain an underscore.
- Backend and durable worker must be restarted **together**; their execution
  contract changed.
- **Allow in-flight automations to drain before deploying.** The durable
  workflow carries no version gate, so an automation paused inside a wait when
  the worker restarts replays its recorded history against changed code and
  stalls rather than resuming.
- Containers must be recreated for configuration changes to take effect;
  restarting them alone does not reload settings.
- The worker must consume both the workflow and integration queues.

## Rollback constraint

This release is forward-only.

The previous release routes only a wait step to the durable workflow and
flattens the remaining graph into a plain action list. That flattening keeps
only trigger and action nodes, so condition, branch and agent nodes do not
survive it.

If the release is rolled back after automations containing those steps exist:

- A **condition** disappears and the steps after it run unconditionally, so a
  message intended only for qualifying records reaches every record.
- A **branch** disappears and every path's steps run, so a record receives all
  branch messages instead of one.
- A **wait until a date** completes immediately, so a message scheduled for a
  future date sends at once.

An **agent** step is the safe case: it also disappears, but a later step that
references its output fails loudly on the missing value rather than sending
something incomplete.

None of this is recoverable by rolling forward again, because the messages have
already been sent. Pause automations containing structural steps before any
rollback.
