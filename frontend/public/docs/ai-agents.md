# AI Agents

Aexy has **two distinct agent systems** that are easy to confuse:

- **CRM Agents** — LangGraph-based agents that live inside the main backend. Configured per workspace, invoked from automations / chat / API. This is what most of this doc is about.
- **MailAgent agents** — a separate microservice (`mailagent/`) that processes incoming mail, classifies it, and decides what to do (reply / forward / escalate / …). Used to triage shared inboxes.

They share a similar mental model (LLM-mediated decisions with confidence scoring) but are different code, different models, and different deployment.

## CRM Agents

### Mental model

Each agent is a LangGraph state machine with:

- A **goal** (high-level objective)
- A **system prompt** (persona, rules, format)
- A **toolset** drawn from a workspace-shared registry
- LLM **provider + model** + sampling parameters
- **Behavior controls** — confidence threshold, approval gate, daily cap, response delay, working hours
- **Policy gates** — per-tool block/approval/rate-limit/budget rules

When invoked, the agent runs until it returns a final output or hits `max_iterations`/`timeout_seconds`. Every tool call is logged and policy-checked.

### Agent types

`AgentType` enum (`models/agent.py:20-26`):

| Value | Purpose |
|---|---|
| `SALES_OUTREACH` | Sales sequence personalization, lead follow-ups |
| `LEAD_SCORING` | Score and qualify leads |
| `EMAIL_DRAFTER` | Draft contextual replies |
| `DATA_ENRICHMENT` | Fill in CRM record fields from web sources |
| `CUSTOM` | Fully user-defined |

Each non-CUSTOM type has a prebuilt implementation in `backend/src/aexy/agents/prebuilt/`. `CUSTOM` agents are assembled by `AgentBuilder` from the system prompt + tool selection.

### CRMAgent model

`models/agent.py:38-152`:

| Field | Note |
|---|---|
| `name`, `description`, `agent_type` | Identity |
| `mention_handle` | `@handle` triggers the agent from chat |
| `is_system` | System-defined agents that the workspace can't delete |
| `goal`, `system_prompt`, `custom_instructions` | Prompting |
| `tools` (JSONB list) | Tool names — e.g. `["search_contacts", "send_email", "enrich_company"]` |
| `llm_provider`, `model`, `temperature`, `max_tokens` | LLM config |
| `max_iterations` (default 10), `timeout_seconds` (default 300) | Execution bounds |
| `confidence_threshold` | Minimum confidence to act without approval |
| `require_approval_below` | Force human approval below this score |
| `max_daily_responses` (nullable) | Daily cap; null = unlimited |
| `response_delay_minutes` | Pause before send (anti-robotic) |
| `working_hours` (JSONB) | `{enabled, timezone, start, end, days}` |
| `escalation_email`, `escalation_slack_channel` | Where to route human escalations |
| `email_address` (unique nullable), `email_enabled`, `auto_reply_enabled`, `email_signature` | Email persona — when set, the agent owns an inbox |
| `is_active`, `created_by_id` | Lifecycle |
| `total_executions`, `successful_executions`, `failed_executions`, `avg_duration_ms` | Cached stats |

### Backend code

`backend/src/aexy/agents/`:

| File | Purpose |
|---|---|
| `base.py` | `BaseAgent` abstract class — wraps LangGraph `StateGraph`, defines `AgentState` TypedDict (`messages`, `record_id`, `record_data`, `context`, `steps`, `final_output`, `error`), tool binding via `llm.bind_tools()`, async `ToolNode` execution with policy gating |
| `builder.py` | `CustomAgent` (line 51-140) + `AgentBuilder` (line 142-266) + `TOOL_REGISTRY` |
| `prebuilt/sales_outreach.py` | Sales outreach agent |
| `prebuilt/lead_scoring.py` | Lead scoring agent |
| `prebuilt/email_drafter.py` | Email draft agent |
| `prebuilt/data_enrichment.py` | Record enrichment agent |
| `tools/crm_tools.py` | CRM record tools |
| `tools/email_tools.py` | Email-related tools |
| `tools/enrichment_tools.py` | Enrichment tools |
| `tools/communication_tools.py` | Slack/SMS tools |

### Tool registry

From `builder.py:29-48`:

**CRM**
- `search_contacts` — semantic + filtered search over CRM records
- `get_record` — fetch one record + linked context
- `update_record` — write back to a record's `values` JSONB
- `create_record` — insert a new record
- `get_activities` — pull a record's CRMActivity timeline

**Email**
- `send_email` — send via the workspace's configured provider
- `create_draft` — write a draft to the user's mailbox (not send)
- `get_email_history` — pull prior thread for context
- `get_writing_style` — analyze the persona's prior emails to match tone

**Enrichment**
- `enrich_company` — fill in firmographics from external sources
- `enrich_person` — fill in personal data (title, LinkedIn, …)
- `web_search` — general web search

**Communication**
- `send_slack` — post to Slack
- `send_sms` — send SMS via Twilio

> **Note**: words like `reply`, `forward`, `escalate`, `schedule`, `create_task` are **not** tools — those are MailAgent-side decision actions (see [MailAgent](#mailagent) below). A CRM agent that needs to escalate calls `send_slack` to its escalation channel, not an "escalate" tool.

### Execution model

When an agent is dispatched:

1. `dispatch("execute_agent", ExecuteAgentInput(...), task_queue=TaskQueue.WORKFLOWS, workflow_id=...)` from a service
2. The wrapping `SingleActivityWorkflow` runs `execute_agent` with `LLM_RETRY` (6 attempts, non-retryable on `ValueError`/`KeyError`) and a 10-minute timeout (`dispatch.py:97`)
3. The activity loads the `CRMAgent`, builds the LangGraph, and runs it
4. Every tool call goes through `AgentPolicy` evaluation before execution (line 180-224 in `base.py`)
5. The full run is persisted to `CRMAgentExecution`

`CRMAgentExecution` (`models/agent.py:154-236`):

| Field | Note |
|---|---|
| `agent_id`, `conversation_id`, `record_id` | Context |
| `triggered_by` | `automation` / `workflow` / `manual` |
| `trigger_id` | The thing that triggered it (automation ID, workflow execution ID, …) |
| `input_context`, `output_result` (JSONB) | I/O |
| `steps` (JSONB list) | Per-step log of LLM call + tool calls |
| `status` (`AgentExecutionStatus`) | `PENDING` / `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED` |
| `error_message`, `started_at`, `completed_at`, `duration_ms` | |
| `input_tokens`, `output_tokens` | Cost tracking |

### Agent policies

A separate governance layer. See [workflows-and-automations.md](./workflows-and-automations.md#agent-policies) for the full doc.

`AgentPolicy` (`models/agent_policy.py:39-85`):

| `policy_type` | Behavior |
|---|---|
| `TOOL_BLOCK` | Disallow a tool entirely |
| `TOOL_REQUIRE_APPROVAL` | Tool call pauses for human approval |
| `FIELD_RESTRICTION` | Agent can read/write only listed attributes |
| `RATE_LIMIT` | Cap tool calls per period |
| `TOKEN_BUDGET` | Cap LLM token spend per period |

`PolicyDecisionType`: `ALLOW` / `BLOCK` / `REQUIRE_APPROVAL` / `RATE_LIMITED`. The most restrictive matching policy wins. Decisions are persisted to `AgentPolicyDecision` as an immutable audit log (`agent_policy.py:87-134`). Approval workflow: `approval_status`, `approved_by_id`, `approved_at` fields capture the human signoff (line 119-128).

`AgentConfigAudit` (`agent_policy.py:136-164`) is an append-only log of every config change — `change_type` (`create`/`update`/`delete`/`toggle`) + `field_changes` JSONB diff.

### API

`api/agents.py` — prefix `/workspaces/{workspace_id}/crm/agents`:

```
GET    /                           list agents
POST   /                           create agent
GET    /{agent_id}                 fetch
PATCH  /{agent_id}                 update
DELETE /{agent_id}                 delete
GET    /{agent_id}/executions      run history
POST   /{agent_id}/run             manual trigger
```

(The previous version of this doc listed a `/check-handle` endpoint — it doesn't exist in the current code. Use `GET /` with a name filter if you need uniqueness checking.)

`api/automation_agents.py` — agent triggers wired into automations. Each trigger config has `trigger_point` (`ON_START`/`ON_CONDITION_MATCH`/`AS_ACTION`), `input_mapping` (which automation context to pass), `wait_for_completion` (sync vs fire-and-forget), `timeout_seconds`. See [workflows-and-automations.md](./workflows-and-automations.md#ai-agent-integration-with-automations).

`api/agent_policies.py` — prefix `/workspaces/{workspace_id}/crm/agent-policies` — policy CRUD + config-audit endpoints.

`api/ai_feedback.py` — thumbs-up/down + comments per execution, fed back into prompt tuning and quality reports.

### Temporal activities

| Activity | Retry | Timeout | Trigger |
|---|---|---|---|
| `execute_agent` | LLM | 10m | Direct dispatch from services |
| `process_agent_chat_mention` | LLM | 10m | Chat `@agent_handle` mention |

Both registered in `dispatch.py:97-98`.

### Frontend

`/frontend/src/app/(app)/crm/agents/` — agent list, configuration UI, execution history, policy administration. Agents also surface in chat (`/chat/`) via `@mention` and in automation builders (`/crm/automations/`).

## MailAgent

A separate FastAPI microservice (`mailagent/`) on `:8001`. Its primary job is **inbox triage** — when mail lands in a managed mailbox, classify it and decide what to do.

### Built-in agents

`mailagent/src/mailagent/agents/`:

| Agent | File | Purpose |
|---|---|---|
| `SupportAgent` | `support.py` | Customer support intake |
| `SalesAgent` | `sales.py` | Inbound sales replies |
| `SchedulingAgent` | `scheduling.py` | Meeting bookings |
| `OnboardingAgent` | `onboarding.py` | New-user welcome flow |
| `RecruitingAgent` | `recruiting.py` | Candidate communication |
| `NewsletterAgent` | `newsletter.py` | Newsletter responses |

These are simpler than CRM agents — straight async functions, not LangGraph state machines.

### Action model

`AgentAction` enum (`mailagent/.../agents/base.py:26-36`):

```
REPLY, FORWARD, ESCALATE, SCHEDULE, CREATE_TASK,
UPDATE_CRM, NO_ACTION, WAIT, REQUEST_APPROVAL
```

`AgentDecision` (`base.py:39-50`):

```python
class AgentDecision(BaseModel):
    action: AgentAction
    confidence: float          # 0.0 - 1.0
    reasoning: str
    draft_response: Optional[str] = None
    metadata: dict = {}
    requires_approval: bool = False

    def should_auto_execute(self, threshold: float = 0.8) -> bool:
        return self.confidence >= threshold and not self.requires_approval
```

`should_auto_execute(threshold=0.8)` is the gate: high-confidence decisions execute immediately; below threshold or `requires_approval=True` routes to a human queue.

### Relationship to CRM agents

MailAgent **delivers** an `AgentDecision`; a CRM agent **executes a goal with tools**. In practice:

- MailAgent watches the shared inbox, classifies a new email, decides "this is a sales inquiry — REPLY with this draft, confidence 0.91"
- If auto-execute clears, MailAgent sends the reply directly
- If not, MailAgent escalates the decision to a CRM agent (or a human) for follow-up

The two systems pass `MessageData`, `ContactData`, and `AgentContext` around as the shared data model.

## Frontend

| Route | Purpose |
|---|---|
| `/crm/agents` | CRM agent list + configuration |
| `/crm/agents/{id}` | Detail + execution history |
| `/crm/agent-policies` | Policy admin |
| `/crm/automations/{id}/agent-triggers` | Wire an agent into an automation |
| Chat panels | `@agent_handle` invokes the agent inline |

## Common pitfalls

- **Looking for "SUPPORT"/"SCHEDULING" agent types**: those exist in **MailAgent** as built-in agent classes, not in CRM agents. CRM `AgentType` values are `SALES_OUTREACH`, `LEAD_SCORING`, `EMAIL_DRAFTER`, `DATA_ENRICHMENT`, `CUSTOM`.
- **Treating MailAgent actions as CRM tools**: `reply`, `forward`, `escalate`, `create_task`, `update_crm` are MailAgent `AgentAction` enum values — they describe **decisions a MailAgent makes**. A CRM agent doesn't have a `reply` tool — it has `send_email` or `create_draft`.
- **Confidence threshold semantics differ**: in CRM agents, `confidence_threshold` and `require_approval_below` are separate fields with different roles (act / require approval). In MailAgent, there's one threshold passed to `should_auto_execute(threshold=0.8)`. Don't mix them.
- **Policy is restrictive-wins**: if two `AgentPolicy` rows match a tool call, the more restrictive decision applies (`BLOCK` > `REQUIRE_APPROVAL` > `RATE_LIMITED` > `ALLOW`). Multiple policies are additive, not last-write.
- **`is_system=True` agents can't be deleted by workspace admins** — they're seeded by platform code. Trying to delete one returns a 4xx.
- **Email-owning agents need an `email_address`**: if `email_enabled=true` but `email_address` is empty, incoming mail can't be routed to the agent. The unique constraint on `email_address` means each address binds to exactly one agent.
- **No `/check-handle` endpoint**: handle uniqueness is enforced at create-time by `mention_handle` collision. To check ahead of time, list agents and filter.
- **`response_delay_minutes` is enforced by the workflow, not by client UI**: even if your UI sends immediately, the agent will pause. Useful for "human-feeling" replies — confusing if you're trying to debug "why didn't my message send."

## Related

- [Workflows & automations](./workflows-and-automations.md) — agent triggers inside automations, agent policy details
- [CRM](./crm.md) — the substrate agents act on
- [Email marketing](./email-marketing.md) — the email infrastructure agents send through
- [MCP](./documents-and-drive.md#mcp-model-context-protocol) — how external LLMs talk to Aexy as tools
