# MCP for Day-to-Day Operations — Review & Plan

Status: implemented (phases 1–5), 2026-09-06 — see §7 for what shipped and what was deliberately left
Date: 2026-09-06
Goal: run most routine workspace operations through AI agents, with the MCP
layer as the single, governed tool surface they use.

Predecessor: [MCP_COVERAGE_PLAN.md](./MCP_COVERAGE_PLAN.md). Phases 0–2 of that
plan shipped (generated catalogue, capability = app grant, remote transport with
OAuth 2.1, governance at the boundary). This document reviews what exists and
plans the step from "an assistant can call the API" to "agents run operations".

---

## 1. Review — what exists today

There are **two MCP servers** and they have diverged.

| | Remote server (this repo) | stdio server (`mcp-server/`, v0.1.0) |
|---|---|---|
| Code | `api/mcp_transport.py`, `services/mcp_catalog.py`, `mcp_tool_executor.py`, `mcp_governance.py`, `mcp_access_service.py`, `mcp_oauth_service.py` | 27 hand-typed tools, one commit, separate repo |
| Coverage | 1,866 operations, 28 capabilities, generated from OpenAPI; CI fixture check | ~218 operations; 4 tools call paths that do not exist |
| Access | Capability = app grant, resolved server-side per request | Personal API token; every tool offered; `AEXY_ENABLE_TEMPORAL` self-asserted |
| Identity | Re-enters over ASGI with a signed `actor=agent` token | Plain API token → `actor=None` → looks like a person |
| Governance | `AgentPolicy` evaluated on every write; block / require-approval / queue; decision log | None |
| Review gate | Agent writes to documents route into `/review` | Bypassed — writes apply directly |
| Temporal | Not reachable (no `temporal` tag) | Talks to Temporal directly from the laptop |
| Protocol | `tools/list`, `tools/call` only. No prompts, no resources | 6 prompts, 3 resources |
| Tests | Catalogue, surface, scoping, governance (≈45 unit tests); connectors integration | None |

**Verdict.** The remote server is the right foundation: derived coverage,
one access model, permission enforced by the endpoint itself, policy at the
boundary, and an approval queue that replays under the grant the call was made
with. The stdio server is a liability and should be retired or reduced to a thin
proxy over the remote endpoint.

### 1.1 Findings, by severity

**High — decide before automating anything**

1. **The stdio path bypasses every control the remote path has.** An API
   token authenticates as the developer with no `actor` claim, so
   `McpGovernance`, the review gate and the agent ledger are all skipped. Any
   agent configured per the current `/mcp` page and `docs/mcp.md` runs ungoverned.
   Fix: retire the stdio tool set; ship `aexy-mcp` as a stdio→HTTP bridge that
   speaks to `POST /api/v1/mcp` with an API token (`verify_token` already
   resolves `aexy_` tokens — issue them an `actor=agent` context on re-entry).

2. **No headless identity.** An OAuth grant needs a browser consent; an API
   token is a person. There is no principal for a scheduled or event-triggered
   agent, so every unattended run is "Bhanu did this" in the audit trail, and
   revoking the person revokes the automation. Needed: an **agent principal**
   (workspace-owned, capability-scoped, `actor=agent` always, its own tokens,
   its own row in activity logs).

3. **Governance defaults to open.** A workspace with no `AgentPolicy` rows
   allows all ~1,100 mutating operations unattended. Policies must name catalogue
   `action` strings by hand and there is no UI for workspace-wide (`agent_id IS
   NULL`) policies outside the CRM agents screen. Needed: shipped defaults
   (require approval for deletes, sends, payments, membership/role changes,
   integration connects) and a policy editor keyed to the catalogue.

4. **Three of five policy types are inert over MCP.**
   `RATE_LIMIT` counts from an in-memory dict on an engine instance that lives
   for one request (`_count_allow_decisions_sync`), so it never fires.
   `TOKEN_BUDGET` is skipped in sync evaluation. `FIELD_RESTRICTION` checks
   top-level argument keys, but MCP arguments are `{path_params, query, body}`, so
   a blocked field inside `body` never matches. Only `TOOL_BLOCK` and
   `TOOL_REQUIRE_APPROVAL` work.

**Medium — needed for agents to be useful, not just safe**

5. **No ledger of what agents actually did.** Only refusals and evaluation
   failures are recorded. An allowed write leaves no MCP-level trace beyond
   whatever the endpoint logs. "What did the triage agent change yesterday" is
   not a query today.

6. **Held actions are silent and unresumable.** `McpGovernance._queue` notifies
   nobody (the CRM path has `notify_approval_required`; the MCP path does not).
   `review_gate` is excluded from MCP entirely, so an agent cannot even read the
   status of its own pending action and continue after approval.

7. **Three tool registries, not one.** MCP catalogue (1,866 ops), LangGraph
   `TOOL_REGISTRY` (18 tools, CRM/email/docs), Ask `TOOL_DEFINITIONS` (5 reads).
   In-platform agents cannot touch service desk, sprints, leave or anything
   outside CRM. `McpToolExecutor(app, catalog, granted, db)` is already
   in-process callable and is the obvious single substrate.

8. **Event → agent wiring is CRM-only.** Automations expose triggers for 9
   modules (booking, compliance, email_marketing, forms, hiring, sprints,
   tickets, tracking, uptime) and 22 module actions, but the AI-agent step
   (`automation_agents.py`) dispatches a `CRMAgent`. Service desk has no
   automation triggers at all.

9. **Discovery does not give the model request shapes.** The `aexy_discover`
   description promises a "parameter schema" but returns none; per-capability
   tools expose `body: object`. Agents guess payloads and burn a round-trip per
   422. The OpenAPI `requestBody` and parameter schemas are already in hand.

10. **Unbounded responses.** `_render` returns the full JSON of any list
    endpoint into the model's context. Needs a size cap with an explicit
    truncation note, and a `fields` projection.

11. **No prompts/resources on the remote server.** The stdio server's six
    prompts (standup, sprint planning, pipeline review, weekly report, debug
    workflow, system health) are exactly the daily routines, and they are
    unreachable from the governed path. Named workflow tools exist only for docs.

**Low**

12. `/mcp` page and `docs/mcp.md` render the stale stdio manifest (35 tools,
    "aexy-mcp 0.1.0") instead of the live `/workspaces/{id}/mcp/tools` surface.
13. No JSON-RPC-level test (`initialize` → `tools/list` → `tools/call`).
14. No per-grant rate limit on `POST /mcp`; the only limiter is the inert policy.
15. Temporal admin proxy (predecessor plan WS3b) still not built. Acceptable
    for now: Temporal is simply unreachable over MCP, which is the safe state.

---

## 2. Target architecture — one governed tool layer

```
  External clients          In-platform agents           Scheduled / event-driven
  (Claude, ChatGPT,         (LangGraph, Ask, chat        (Temporal schedule,
   Cursor, stdio bridge)     @mention)                    automation trigger)
          │                        │                            │
          ▼                        ▼                            ▼
   POST /api/v1/mcp        McpToolExecutor (in-process)   AgentRunner activity
          └──────────────────────┬─────────────────────────────┘
                                 ▼
                   Catalogue → Governance → Ledger → ASGI re-entry (actor=agent)
                                 ▼
                    The same endpoints, permissions and review gate the web app uses
```

Principles, all already stated in code comments and kept here on purpose:

- **Filtering is ergonomics; the endpoint is the gate.** Nothing in this plan
  adds a second permission model.
- **Reads are never gated.** Governance and the ledger apply to mutating
  operations only.
- **Approval is permission to proceed, not a re-grant.** Replays run under the
  grant frozen at queue time.
- **An agent is a principal, not a person wearing a hat.**

---

## 3. Operations to automate — the map

The day-to-day operations below are the scope. Each names the trigger, the
capability, the routine tool to ship, and the default gate.

| Operation | Trigger | Capability | Routine tool | Default gate |
|---|---|---|---|---|
| Service desk triage: classify, set request type/LOB, assign, set pending-with | ticket created / email intake | `service_desk` | `aexy_sd_triage_ticket` | auto; reassign requires approval |
| TAT watch: flag breaches, nudge pending-with owner, escalate via matrix | schedule (15 min) | `service_desk`, `tickets` | `aexy_sd_tat_sweep` | notify auto; escalate requires approval |
| Ticket reply drafting from KB / prior tickets | ticket updated | `service_desk`, `docs` | `aexy_sd_draft_reply` | draft only; send requires approval |
| Daily standup summary per team | schedule (daily) | `sprints`, `tracking` | `aexy_sprint_standup` | read-only |
| Sprint hygiene: stale tasks, missing estimates, unassigned, carry-over | schedule (daily) | `sprints` | `aexy_sprint_hygiene` | comment auto; status/assign requires approval |
| Weekly engineering report | schedule (weekly) | `sprints`, `insights`, `reports` | `aexy_weekly_report` | creates a document proposal (existing review gate) |
| Leave: validate balance & calendar clash, recommend | leave requested | `leave`, `organization` | `aexy_leave_review` | recommend only; approve requires approval |
| Onboarding step nudges | `check_due_onboarding_steps` | `platform`, `chat` | `aexy_onboarding_nudge` | auto (notify) |
| Compliance: expiring certs, overdue training reminders | schedule (daily) | `compliance` | `aexy_compliance_sweep` | notify auto; waive requires approval |
| CRM follow-ups: stale deals, no-reply sequences | schedule / record event | `crm`, `gtm` | `aexy_crm_followup` | draft auto; send/stage-change requires approval |
| Email campaign QA before send | campaign scheduled | `email_marketing` | `aexy_campaign_preflight` | block send on failed checks |
| Incident first response | uptime alert / oncall page | `uptime`, `oncall`, `tickets` | `aexy_incident_open` | open ticket auto; acknowledge auto; escalate requires approval |
| Docs drift | `aexy_docs_needing_update` (exists) | `docs` | exists | existing review gate |

Two rules for the table:

- A routine tool is a **named workflow tool** in `WORKFLOW_TOOLS` with a real
  input schema and `argument_map`, not a new endpoint. It binds one or more
  catalogue actions and adds a route, exactly as the four docs tools do.
- "Requires approval" is expressed as a **shipped default policy**, so it is
  visible and editable in the policy UI rather than hard-coded.

---

## 4. Workstreams

### WS-A — Agent principals (unblocks unattended runs)

- Model `AgentPrincipal` (`models/agent_principal.py`): `workspace_id`, `name`,
  `capabilities` (jsonb, a subset of the workspace's granted set — never a
  superset), `created_by_id`, `is_active`. Register in `models/__init__.py`.
- Tokens: `ApiToken` gains `principal_id` (nullable) and `scopes` (jsonb). A
  principal token resolves in `verify_token` to `(developer_id=None,
  principal_id, actor="agent")`. Migration `migrate_agent_principals.sql`.
- `McpAccessService.get_granted_capabilities` accepts a principal: the answer is
  `workspace grants ∩ principal.capabilities`.
- Executor re-entry mints `create_access_token(principal.id, actor=AGENT_ACTOR,
  principal=True)`; `get_current_developer` resolves a principal to a synthetic
  `Developer` row per principal (created on first use) so downstream
  `created_by_id` columns stay valid and the audit trail names the agent.
- UI: **Settings → Agents → Principals**: create, scope capabilities, rotate
  token, see last activity. Admin only.

### WS-B — Governance that works over MCP

- Fix `FIELD_RESTRICTION` to match keys anywhere in `body` and `query`
  (flatten with dotted paths).
- Replace in-memory `RATE_LIMIT` with a Redis window keyed
  `(workspace, principal|developer, action)`; reuse `llm_rate_limiter` patterns.
  Add `max_per_hour` / `max_per_day` to the policy config.
- `TOKEN_BUDGET` stays LLM-side; document that it does not apply at the tool
  boundary rather than pretending it does.
- **Default policy pack**, seeded on workspace creation and backfilled:
  require approval for any `DELETE`, any action matching
  `send|publish|invite|remove_member|update_role|connect_|disconnect_|
  charge|refund|terminate`, and every `admin`/`integrations` write.
  Policies carry `source="default"` so the UI can show what shipped vs what an
  admin changed.
- **Policy editor** at `/settings/agent-policies`, workspace-wide only,
  action picker fed from `/mcp/tools` so names cannot be mistyped. Reuse the
  CRM agents policy components.

### WS-C — Ledger, notifications, resumability

- `AgentActionLog` row for **every mutating call** from `_perform`: principal or
  developer, tool, action, method, path, args (redacted by field-restriction
  list), status code, duration, `result_ref`. One insert per write; reads
  untouched. Surface in `/review` as an "Activity" tab and in entity activity
  timelines where an `entity_id` can be inferred from the path.
- On `_queue`, notify: workspace admins in-app (`agent_approval_required` event
  type exists) and the Slack channel if the workspace has one.
- Add `GET /workspaces/{id}/agent-actions/mine` (own rows only, read) and tag it
  `agent_actions_self` → capability `platform`, so an agent can poll its own
  pending action and continue after approval without ever seeing the queue.
- `approve` fires a notification back to the requesting principal's owner with
  the result.

### WS-D — One tool substrate

- `agents/tools/mcp_tool.py`: a LangChain `BaseTool` adapter that wraps
  `McpToolExecutor.call` for a given catalogue action (or the generic
  `aexy_call`). `AgentBuilder` accepts catalogue action names in
  `CRMAgent.tools` alongside legacy names. Existing 18 tools stay until parity,
  then become thin aliases.
- Ask: replace `ask_tools.TOOL_DEFINITIONS` with the caller's `/mcp/tools`
  surface (reads only by default; writes go through the same governance).
- Automations: `automation_agents.py` gains `agent_kind = "principal"` so an
  automation step can run an `AgentPrincipal` with a prompt and the tools it is
  scoped to, for **any** module with triggers, not just CRM.
- Add automation triggers for `service_desk` (`ticket_created`,
  `ticket_updated`, `pending_with_changed`, `tat_breached`) in
  `automation_trigger_schema.py`, and module actions for `set_pending_with`,
  `set_request_type`, `escalate`.

### WS-E — Routine tools, prompts, and the stdio bridge

- Ship the 12 routine tools from §3 in `WORKFLOW_TOOLS`, each with a real input
  schema, the actions it composes, and a description that says the order of
  operations and what is left for a person. Tests mirror
  `test_mcp_workflow_tools.py`.
- Implement `prompts/list` and `prompts/get` on the remote transport and port
  the six stdio prompts; add `resources/list` for the caller's catalogue summary.
  Advertise `capabilities.prompts` and `capabilities.resources` in `initialize`.
- Discovery returns `parameters` and `request_body` schemas from OpenAPI
  (`components` resolved). Per-capability tool `actions` carry the same.
- `_render`: cap at 32 KB with a trailing note naming the count omitted and the
  pagination parameters the operation accepts; support `fields` projection for
  list responses.
- Replace `mcp-server/` contents with a stdio→HTTP bridge: reads
  `AEXY_API_URL`/`AEXY_API_TOKEN`, forwards JSON-RPC to `POST /api/v1/mcp`,
  and nothing else. Temporal code deleted. Publish as `aexy-mcp` 1.0.
- `/mcp` page renders the live surface from `/workspaces/{id}/mcp/tools`;
  `docs/mcp.md` tool table regenerates from `tests/fixtures/mcp-catalog.generated.json`.

### WS-F — Scheduled agent runs

- Temporal activity `run_agent_principal` (queue `WORKFLOWS`, `LLM_RETRY`):
  loads the principal, builds tools via WS-D, runs the routine with a stable
  `workflow_id` per (principal, routine, day).
- `AgentSchedule` model: principal, routine tool, cron/interval, timezone,
  enabled. Registered into `temporal/schedules.py` at startup, editable at
  `/settings/agents/schedules`.
- Every run writes an `AgentRun` summary (started, finished, actions taken,
  actions held, tokens) linked to the ledger rows.

---

## 5. Sequencing

| Phase | Contents | Exit criterion |
|---|---|---|
| **1** | WS-B fixes (field restriction, rate limit), default policy pack, WS-C ledger + notifications + self-status | A fresh workspace refuses unattended deletes; every agent write is a row; a held action pings an admin and the agent can resume |
| **2** | WS-A agent principals; WS-E stdio bridge + `/mcp` page on live surface | A scheduled job can run as an agent, not a person; no ungoverned path remains in docs or code |
| **3** | WS-D single substrate (LangGraph adapter, Ask, automations incl. service desk triggers) | One automation runs a principal against service desk tools end to end |
| **4** | WS-E routine tools + prompts + discovery schemas; WS-F schedules | The §3 table is live; standup and TAT sweep run on schedule for one team |
| **5** | Retire legacy `TOOL_REGISTRY` and `ask_tools`; Temporal admin proxy if still wanted | Three registries become one |

Phase 1 before Phase 2 on purpose: giving agents their own identity while the
gate is open by default would scale the wrong thing.

---

## 6. Risks and rules

- **A skill's or ticket's text is data.** Nothing an agent reads over MCP may
  widen its grant; capability is resolved server-side per call. The ledger will
  make injection attempts visible as unexpected actions.
- **Synthetic developers for principals** touch every `created_by_id`
  assumption. Prefer a nullable `principal_id` beside `developer_id` on the few
  tables that matter (tickets, comments, documents) and fall back to the
  synthetic row elsewhere; audit the fallbacks.
- **Approval fatigue.** Defaults that hold too much get switched off. Measure
  held-vs-approved ratio per policy from the ledger and tune the pack within the
  first month.
- **Context blow-up.** Response capping (WS-E) is a prerequisite for list-heavy
  routines like sprint hygiene, not a nice-to-have.
- **Tool count.** Routine tools sit beside per-capability tools; a caller with
  every app already sees ~30 tools. Keep routines to the §3 list; new ones must
  replace, not add.

---

## 7. What shipped (2026-09-06)

| Phase | Delivered |
|---|---|
| 1 | Field restriction matches nested arguments; rate limits count from the ledger (`max_per_hour` / `max_per_day`); policy selectors (`methods`, `action_patterns`, `capabilities`); default policy pack seeded on creation, lazily at the gate, and by `scripts/backfill_default_agent_policies.py`; `agent_action_logs` ledger for every mutating call; admin notification on hold and requester notification on decision; `GET agent-actions/mine` (reachable over MCP) and `GET agent-actions/activity`; "Agent activity" on `/review` |
| 2 | Agent principals (model, service, admin API, Settings → Agent Principals); principal and personal API tokens accepted by `POST /api/v1/mcp` with `X-Aexy-Workspace-Id`; every principal request carries `actor=agent`; `mcp-server` rewritten as a stdio→HTTP bridge (1.0.0); `/mcp` page and docs generated from the backend catalogue and showing the caller's own surface |
| 3 | `agents/tools/mcp_tools.py` — catalogue actions, per-capability tools and discover/call as LangChain tools; `CRMAgent.principal_id`; Ask offers the caller's read surface; `service_desk` automation triggers and actions |
| 4 | 15 named routine tools; `prompts/*` and `resources/*` on the remote server; discovery returns parameters and body fields; `fields` projection and a 32 KB response cap; agent schedules (model, service, API, Temporal tick, Settings → Agent Schedules) |
| 5 | **Done (2026-09-06, second pass).** The LangGraph `TOOL_REGISTRY` and Ask's four built-in reads are deleted; the catalogue is the only registry. Email, Slack and SMS became `crm/outreach` endpoints so they could join it; the enrichment and web-search placeholders were removed. Prebuilt agents declare `catalog_tool_names`. `scripts/migrate_agent_tools_to_catalogue.sql` rewrites stored agent tool lists. The Temporal admin proxy was not built: Temporal unreachable over MCP is the safe state and nothing in the routines needs it |

Not done, on purpose: a workspace-wide policy editor UI (the default pack is
editable through the existing agent-policies API and CRM policy screens);
per-principal token scopes narrower than the principal's capabilities; a
Redis-backed rate limit (the ledger window is sufficient at current volumes).

### 7.1 Review and end-to-end pass (2026-09-06)

Three independent reviews of the diff and a live end-to-end run (dev Postgres
with the four migrations applied, backend + Temporal worker, 72 scripted
checks over the remote MCP endpoint, the approval queue, principals, personal
tokens, schedules and the stdio bridge) found and fixed:

| Severity | Defect | Fix |
|---|---|---|
| High | A principal holding `mcp.platform` could call `create_api_token` and mint a plain personal token with no principal behind it — escaping the agent marker, capability scope and rotation | `api_tokens` moved to the excluded `credentials` capability; the REST endpoint refuses agent callers and agent accounts |
| High | Approving a held *routine* call (`aexy_sd_park_ticket` and kin) replayed it with empty arguments: the queue stores the spread shape and the replay spread it again | Replays skip `_spread`; regression test |
| High | Ask's read-only gate keyed on `arguments["action"]`, which routine tools do not have — a read-only assistant could park a ticket | Routines resolved to their action and dropped when mutating; the mutating check is scoped to the capability |
| High | In-platform agents could not hold routine tools at all, though every shipped prompt names them | `McpRoutineTool` in `build_tools`, with the routine's flat schema |
| Medium | Service-desk `ticket_updated` fired on no-op updates and adapters re-edited the ticket, so an automation could trigger itself until the monthly quota ran out | Event only when a field actually changed; two-level re-entrancy guard |
| Medium | A rate limit written with `methods`/`capabilities`/`action_patterns` counted per action, not per selector | Counts every ledger row the selector covers (ledger gained a `capability` column) |
| Medium | Replayed writes were ledgered as `mcp` with no principal, and the principal's synthetic developer was "notified" | Identity stored on the queue entry and used for the replay; agents are not notified |
| Medium | Governance decision log stored arguments unredacted | Redacted like the ledger; redaction is now whole-key (`page_token` is not a secret) |
| Medium | Routines demanded a `workspace_id` the model does not know; compliance routines took it as a query parameter the executor never filled | Removed from every routine schema; the executor pins it on path *and* query |
| Medium | Routine tools were offered by action name alone, so `mcp.tickets` saw `aexy_sd_open_tickets` and was always refused | Gated on `(capability, action)` |
| Medium | Principal capabilities were not checked against what the workspace holds; the picker fell open to all 28 while loading | Server refuses unheld capabilities (422); picker is strict and shows a skeleton |
| Medium | `email_stakeholder` was not in the outward-facing defaults although its description promised a hold | `email`/`sms`/`whatsapp` patterns added |
| Low | Schedules kept firing inactive agents; a Temporal blip lost the slot; `run` did not count; `last_execution_id` never written | Inactive agent disables the schedule; failed dispatch gives the slot back; both fixed |
| Low | `FIELD_RESTRICTION` with an empty `tool` silently became global | Global only with `all_tools: true` or `tools: ["*"]` |
| Low | Concurrent first governed calls could seed the pack twice | Advisory lock on Postgres |
| Low | `aexy_sd_email_stakeholder.move_ticket` was dropped by the schema | Removed; description points at `aexy_sd_park_ticket` |
| Low | Bridge wrote non-JSON-RPC HTTP error bodies (a 404 from a wrong URL) to stdout; the placeholder `AEXY_WORKSPACE_ID` in recipes 403'd if left in | Every `>= 400` is a JSON-RPC error per id; placeholders are ignored |
| Low | Frontend: missing `common.saved`/`deleted` keys, ledger not refreshed after approve, nested picker component, stale principal shown as "person", removed principal reactivatable | All fixed |
| Low | `aexy.models` did not import `crm_agents`, so the backfill script failed on FK resolution | Imported in the registry |

Found in the run and left as operating notes rather than code: the list rows
of `aexy_sd_open_tickets` carry both `id` (desk row) and `ticket_id` (what
every other ticket call takes) — the routine now says so; and a principal is a
plain member, so a service-desk principal needs the desk-manager permission
(or assignment) before it can log or edit tickets.

Deliberately unchanged: the default pack's `send` pattern also holds a CRM
agent's legacy `send_email`/`send_sms` tools for approval. That is the pack's
intent — outward-facing sends wait for a person — and it applies to every
existing agent the moment the pack is seeded.

