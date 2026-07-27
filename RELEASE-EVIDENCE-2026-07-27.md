# CRM Automations — Release Evidence (27 July 2026)

Release candidate: `integration/crm-automations-r2` @ **94ea7210**
Live checkout was detached onto that exact commit and driven in a real browser
against real PostgreSQL, a real Temporal worker, a real language model, a real
SMS provider and a real email provider.

Four defect fixes were made on top of that commit and are included here. All
other findings below are configuration or direct observation.

Coverage is the full story set: 30 user stories plus one milestone story.

---

## Verified by direct observation

| # | Capability | Evidence |
|---|---|---|
| 1 | AI agent executes in a published automation | Real DeepSeek generation, 12.9s and 14.5s across runs, attempt 1, execution id and token counts recorded. Output reasoned about the record's actual `title` field. |
| 2 | Agent output consumed downstream | Agent result reached an email body via `{{variables.agent_result.output.content}}`; delivered email contained the analysis with zero unresolved placeholders. |
| 3 | Unknown agent rejected before publish | Save refused with "The selected AI agent no longer exists in this workspace". |
| 4 | Deactivated agent fails the run with a named cause | Run marked `failed` with error `Agent Data Enrichment is not active`, not a generic wrapper message. |
| 5 | Webhook executes for real | Local receiver got a genuine POST, HTTP 202, body template rendered with real record values. |
| 6 | Webhook carries idempotency + hides secrets | `Idempotency-Key` header present. Authorization header **not** present anywhere in stored run history (explicitly checked). |
| 7 | Task creation persists | Real row in `sprint_tasks` with rendered title "Research new company: Northwind Logistics", priority `high`, correct workspace. |
| 8 | Branch picks exactly one path | Deals at 250000 / 45000 / 3000 routed to `enterprise` (rule 0), `midmarket` (rule 1), `other` (Else, no rule). Exactly one email per run. Each run records `branch_id`, `rule_index`, `path_label`. |
| 9 | Waits are durable | 3-minute wait; worker killed 60s in; automation resumed unaided and completed at the 3-minute mark; post-wait email delivered. |
| 10 | Retry retries only the failed step | Step 1 succeeded on attempt 1 — receiver logged **exactly one** request, not three. Step 2 recorded three separate failed attempts. Run marked `failed`. |
| 11 | SMS delivers for real | Twilio status **delivered**, no error code, charged $0.0832, from an owned US number to a verified recipient. |
| 12 | SMS rejects bad input locally | Malformed number rejected before reaching Twilio: "SMS recipient must be an E.164 number such as +14155552671". |
| 13 | SMS surfaces provider refusals | Twilio invalid-number and region-not-permitted refusals both returned readable reasons into the step result. |
| 14 | Email delivers via a real provider | Brevo SMTP authenticated and accepted mail for delivery to a real inbox. |
| 15 | Dynamic values resolve | `record.*`, `trigger.*` and `variables.*` all rendered correctly in subjects and bodies. |
| 16 | Save/publish validation is honest | Five distinct bad configurations refused **before** anything could run: invalid email domain, branch with no Else path, wait with no duration, agent node with no agent selected, SMS with no message. |
| 17 | Palette reflects real capability | Wait, Condition, Branch and AI Agent render only when the backend registry reports them available; a frontend test asserts no client-side fallback list can leak hidden items. |
| 18 | Run history is truthful | Per-step status, attempt counts, and the recipient surfaced at step level rather than buried in a nested blob. |
| 20 | Email open tracking fires a downstream automation | Tracked email sent, pixel requested, open recorded with device detection, `email.opened` trigger fired, task created with the record's name resolved into its title. |
| 21 | Bulk stage moves validate once, not per record | Destination validated a single time for a batch; previously ~402 queries to move 100 records, now ~103. Invalid stage still fails before any record is touched. |
| 19 | LinkedIn sequence steps (GTM, adjacent) | Database records from 24 July show View Profile (5x) and Connection Request (2x) with status `sent`. Failure rows carry specific reasons. |

---

## Known gaps and limitations

1. **Open tracking needs a publicly reachable tracking domain.** Opens are
   recorded by the application server via an invisible image, so a mail client
   on the public internet cannot reach a local address. A setting for the
   tracking domain already exists — a deployment concern, not a code gap.

2. **GTM provider health dashboard reads a table nothing writes.** The panel
   will always show empty. Observability only; execution and step records are
   unaffected.

3. **Two independent SMS paths exist.** CRM automation SMS uses global
   environment credentials. GTM sequence SMS uses a per-workspace provider
   registry. Configuring one does not configure the other.

4. **Not driven live:** the assign, delete and link record actions; LinkedIn
   Send Message; individual template-gallery items.

5. **Provider constraints, not defects:** US-destination SMS requires A2P 10DLC
   registration (days, with fees). Twilio trial accounts can only message
   verified recipients.

---

## Configuration applied (no code)

- DeepSeek key moved into the settings file the backend actually reads; a live
  provider call was confirmed before relying on it.
- All four workspace agents switched from Claude to `deepseek` /
  `deepseek-chat`. A Claude model id sent to DeepSeek is rejected, so both
  fields had to change.
- Twilio live credentials plus an owned US sending number.
- Brevo SMTP. Two values as originally saved would have failed every send:
  TLS was off (port 587 needs STARTTLS) and the sender was an unverifiable
  `.test` address.
- Three automations' email recipients repointed off `sales-team@example.com`,
  a permanently undeliverable reserved domain that would have hard-bounced on
  every run and damaged a brand-new sending reputation.

## Operational notes for deployment

- No database migration is required. The change stores additional shapes inside
  existing JSON columns and adds no model or column.
- Backend and Temporal worker must restart **together**; their execution
  contract changed in this release candidate. Restarting them together is
  necessary but not sufficient — see the in-flight note below.
- **Drain in-flight automation workflows before deploying.** The durable
  workflow's step semantics changed, and the workflow carries no version gate.
  A workflow that is mid-execution when the worker restarts replays its recorded
  history against the new code; where the two disagree the workflow task fails
  and retries rather than progressing, so the run appears stuck. The affected
  population is automations currently sitting inside a wait. Either let those
  drain before deploying or accept that they stall. This applies to every future
  deploy that touches the workflow definition, not only this one.
- `docker restart` does **not** reload the settings file. Containers must be
  recreated for credential changes to take effect.
- The worker must consume both the `workflows` and `integrations` queues. Every
  target the new code dispatches has a registered handler — verified by direct
  observation against the worker's registration list.
- Missing credentials fail loudly rather than silently succeeding: absent SMS
  credentials produce a failed step, and an unreachable language model produces
  a failed run. Neither is recorded as a success.
- **This deploy is forward-only.** See below.

## Rollback constraint

Structural canvas nodes are the reason. The previous release routes only a wait
node to the durable workflow and flattens the graph into a plain action list for
everything else; that flattening keeps only trigger and action nodes. A
condition, branch or agent node therefore does not survive the flattening at all.

If this release is rolled back after users have built automations containing
those nodes, three silent behaviour changes follow:

- A **condition** node disappears and the actions after it run unconditionally,
  so a message intended only for qualifying records goes to every record.
- A **branch** node disappears and the actions on every path run, so a record
  that should receive one branch's message receives all of them.
- A **wait-until-a-date** node completes immediately, so a message scheduled for
  a future date sends the moment the run starts.

An **agent** node is the safe case: it also disappears, but any later step
referring to its output fails loudly on the missing value rather than sending
something incomplete.

None of this is recoverable by restarting forward, because the messages have
already gone out. If a rollback becomes necessary, pause automations containing
structural nodes first, then roll back.

## Suggested PR split

- **PR 1 — CRM functional foundation**, ending at baseline `adb2bc99`:
  trigger contracts, registry honesty, email durability, terminal run verdicts,
  reaper behaviour, conditions, required fields, existing CRM actions.
- **PR 2 — CRM automations functional release**, the three commits up to
  `94ea7210`: structural palette nodes, AI agent execution, durable waits,
  branches, SMS, retry-safe tasks, aligned webhooks, dynamic-value validation,
  retries, tests, and this evidence document.
- **PR 3 — GTM LinkedIn and sequences** (adjacent, separate review): carries
  the LinkedIn provider and sequence actions with the 24 July evidence and the
  health-dashboard gap stated.
