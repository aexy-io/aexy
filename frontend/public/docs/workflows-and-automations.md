# Workflows & Automations

Aexy has **three overlapping but distinct** ways to "do something when X happens." This doc untangles them.

## The three concepts

| Concept | Where | Granularity | Owner |
|---|---|---|---|
| **Automation** | `api/automations.py`, CRM scope | Trigger → conditions → flat action list | End user (no-code) |
| **Workflow** | `api/workflows.py`, nested inside a CRM Automation | Visual DAG of steps with branches, loops, waits, retries | End user (no-code) |
| **Temporal workflow** | `backend/src/aexy/temporal/workflows/` | Code-defined Python workflows | Backend engineers |

**Rule of thumb:**
- "When a record is created, send a Slack message" → **Automation**
- "When a deal stage changes to negotiation, send email, wait 3 days, if no reply create a task, else end" → **Workflow** (inside an Automation)
- "Sync a GitHub repo: fetch commits, parse, write activity, then re-rank developer skills" → **Temporal workflow**

The first two are user-authored configuration. The third is code. See [temporal.md](./guides/temporal.md) for Temporal workflows.

## Automations

The platform-wide trigger-and-action engine. CRM has the most automations, but the registry is generic — tickets, hiring, email marketing, GTM all expose triggers and actions.

### Endpoints (`api/automations.py`)

```
GET  /workspaces/{ws}/automations/registry/triggers                  what's possible across modules
GET  /workspaces/{ws}/automations/registry/actions
GET  /workspaces/{ws}/automations/registry/modules/{module}/triggers per-module
```

The registry endpoints are used by the no-code builder UI to know what to display. They are not where automations *run* — see `crm_automation.py` for runtime endpoints.

### CRM automations

See [crm.md](./crm.md#automations) for the full doc — triggers, conditions, actions, execution model. Quick reference:

- **Triggers**: record events, scheduled, date-based, external webhooks, communication events (email opened/replied), user events
- **Actions**: record CRUD, send email/Slack/SMS, create task/notification, sequence enrollment, list membership, webhook call, AI enrich/classify/summarize

Automations have `run_limit_per_month`, error-handling policy (`stop` / `continue` / `retry`), and a per-run log (`CRMAutomationRun.steps_executed` JSONB) for observability.

## Workflows (visual DAG inside automations)

When the flat action list of an automation isn't enough — you need branches, loops, conditional waits — promote to a Workflow.

### Endpoints

`api/workflows.py`:

```
GET    /workspaces/{ws}/crm/automations/{automation_id}/workflow
POST   /workspaces/{ws}/crm/automations/{automation_id}/workflow      define
PATCH  /workspaces/{ws}/crm/automations/{automation_id}/workflow      update graph
```

### Models (`models/workflow.py`)

**`WorkflowExecution`** (`workflow.py:55`) — one row per run.

| Field | Note |
|---|---|
| `automation_id`, `workspace_id` | Scope |
| `status` (`WorkflowExecutionStatus`) | `PENDING` / `RUNNING` / `PAUSED` / `COMPLETED` / `FAILED` / `CANCELLED` |
| step-level state | Per-step `WorkflowStepStatus`: `PENDING` / `RUNNING` / `SUCCESS` / `FAILED` / `SKIPPED` / `WAITING` / `RETRYING` |

`PAUSED` is real — workflows can wait on a human action (e.g. "wait for approval") and resume later when the action arrives.

### Execution

Workflows orchestrate via Temporal activities under the hood — `WorkflowService` translates the user-defined graph into activity dispatches on the `workflows` task queue. Steps map to:

- Activity calls (`execute_workflow_action` Temporal activity)
- Branch nodes (server-side condition eval)
- Wait nodes (Temporal timer)
- Loop nodes (re-execute a sub-graph)

`WorkflowExecution.steps_executed` is the authoritative log of what happened — the workflow engine reads/writes this state, and the UI displays it as a visual timeline.

## AI Agent integration with automations

Automations can call AI agents at three points (`api/automation_agents.py:51-94`):

| `trigger_point` | When the agent runs |
|---|---|
| `ON_START` | Before any conditions are evaluated |
| `ON_CONDITION_MATCH` | After conditions pass, before actions |
| `AS_ACTION` | As a step in the action list |

Config:
- `input_mapping` — which automation context to pass to the agent
- `wait_for_completion` — synchronous (the automation pauses until the agent returns) vs fire-and-forget
- `timeout_seconds` — bound the wait

This is how a CRM automation can say "when a lead replies, run the Sales agent to classify the reply, then route based on its output." See [ai-agents.md](./ai-agents.md).

## Agent policies

A separate governance layer for agents — what they can do, who needs to approve.

### Endpoints (`api/agent_policies.py`)

```
GET/POST/PATCH/DELETE /workspaces/{ws}/agent-policies
```

### Models (`models/agent_policy.py:14-80`)

**`AgentPolicy`** with `PolicyType` enum:

| Type | Behavior |
|---|---|
| `TOOL_BLOCK` | Disallow the agent from calling a tool entirely |
| `TOOL_REQUIRE_APPROVAL` | Tool call pauses for human approval |
| `FIELD_RESTRICTION` | Agent can read/write only listed attributes |
| `RATE_LIMIT` | Cap tool calls per period |
| `TOKEN_BUDGET` | Cap LLM token spend per period |

`PolicyDecisionType`: `ALLOW` / `BLOCK` / `REQUIRE_APPROVAL` / `RATE_LIMITED`. Decisions are evaluated at every tool invocation; declined invocations are logged and surfaced in the agent run history.

Policies are workspace-scoped. They apply blanket-style (to every agent) or per-agent.

## Choosing where to put logic

| Need | Use |
|---|---|
| User-defined "X triggers Y" | Automation |
| Multi-step user-defined logic with branches/waits | Workflow (inside Automation) |
| AI-mediated decision in a user-defined flow | Agent embedded via `AutomationAgent` |
| System-internal background work | Temporal workflow + activities |
| Cross-cutting governance over what agents do | Agent policies |

## Frontend

| Route | Purpose |
|---|---|
| `/crm/automations` | Automation list |
| `/crm/automations/new` | Builder |
| `/crm/automations/{id}` | Edit |
| `/crm/automations/{id}/workflow` | Visual workflow builder for that automation |
| `/crm/agent-policies` | Policy administration |

## Common pitfalls

- **Treating an Automation like a Workflow**: as soon as you want a branch or a wait, promote to Workflow. Trying to express branching in a flat action list ends in copy-paste fragility.
- **`PAUSED` workflow stuck.** If a workflow is waiting on a human action that the human never takes, the `WorkflowExecution` sits in `PAUSED` indefinitely. There's no automatic timeout — add an explicit timeout step in the graph.
- **Agent policy evaluation order.** `BLOCK` wins over `REQUIRE_APPROVAL` wins over `RATE_LIMITED` wins over `ALLOW`. If a tool call has multiple matching policies, the most restrictive applies.
- **Run limits silently skip.** `run_limit_per_month` exceeded logs the run as `skipped`, not `failed`. If automations "aren't firing" check skipped runs, not errors.
- **Workflow ↔ Temporal mapping is one-way.** You can author Workflows in the UI and they map to Temporal activities at run time, but you can't go the other way — Temporal workflows in code aren't surfaced in the visual builder.
