# MCP (Model Context Protocol)

Aexy ships an MCP server, so AI assistants can work inside your workspace
directly — reading sprints, updating tickets, querying analytics, running
agents — instead of you copying context between a browser tab and a chat window.

The server is published as `aexy-mcp` and lives in
[`aexy-io/mcp-server`](https://github.com/aexy-io/mcp-server). The in-app
reference is at **/mcp**.

---

## Quick start

1. **Create an API token** — Settings → API Tokens. The token authenticates the
   MCP server as you, so it carries your permissions.
2. **Add the configuration for your client** — see below. Every client runs the
   server through `uvx`, which fetches and runs it on demand. There is no repo to
   clone and nothing to keep updated.
3. **Restart the client.** Most only read their MCP config at startup.

You do not need to install Python, `uv` or the server package by hand; `uvx`
handles it. If your machine has no `uv`, install it with
`curl -LsSf https://astral.sh/uv/install.sh | sh`.

### Environment variables

The server reads exactly two:

| Variable | Meaning |
| --- | --- |
| `AEXY_API_URL` | Backend API base URL, e.g. `https://api.aexy.io/api/v1` |
| `AEXY_API_TOKEN` | Your token from Settings → API Tokens |

> Older setup notes mentioned `AEXY_ENABLE_TEMPORAL`, `TEMPORAL_ADDRESS` and
> `TEMPORAL_NAMESPACE`. Do not set them — see
> [Temporal tools](#temporal-tools-and-why-they-are-changing) below.

---

## Client setup

Replace `<your-api-token>` with your token and `<api-url>` with your backend URL
(`http://localhost:8000/api/v1` for a local stack).

### Claude Code

Either add it with the CLI:

```bash
claude mcp add aexy \
  --env AEXY_API_URL=<api-url> \
  --env AEXY_API_TOKEN=<your-api-token> \
  -- uvx aexy-mcp@latest
```

Or commit `.mcp.json` at the repo root, so everyone working on the project gets
the server:

```json
{
  "mcpServers": {
    "aexy": {
      "command": "uvx",
      "args": ["aexy-mcp@latest"],
      "env": {
        "AEXY_API_URL": "<api-url>",
        "AEXY_API_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

> **Not `settings.local.json`.** That file holds `enabledMcpjsonServers`, a list
> of server *names* to auto-approve. Server definitions go in `.mcp.json`
> (project) or `~/.claude.json` (user scope). Putting an `mcpServers` block in
> `settings.local.json` does nothing and fails silently — which is what earlier
> versions of this page told people to do.

Verify with `claude mcp list`, then `/mcp` inside a session.

### Claude Desktop

Claude Desktop reads one file. Create it if it does not exist:

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "aexy": {
      "command": "uvx",
      "args": ["aexy-mcp@latest"],
      "env": {
        "AEXY_API_URL": "<api-url>",
        "AEXY_API_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

Quit Claude Desktop fully and reopen it — closing the window is not enough. The
tools then appear under the connectors icon in the composer.

### OpenAI Codex

Codex reads MCP servers from `~/.codex/config.toml`:

```toml
[mcp_servers.aexy]
command = "uvx"
args = ["aexy-mcp@latest"]

[mcp_servers.aexy.env]
AEXY_API_URL = "<api-url>"
AEXY_API_TOKEN = "<your-api-token>"
```

### Cursor

`.cursor/mcp.json`, project-local or in `~/.cursor/`:

```json
{
  "mcpServers": {
    "aexy": {
      "command": "uvx",
      "args": ["aexy-mcp@latest"],
      "env": {
        "AEXY_API_URL": "<api-url>",
        "AEXY_API_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

### VS Code

`.vscode/mcp.json` — note the key is `servers`, not `mcpServers`, and each entry
declares its `type`:

```json
{
  "servers": {
    "aexy": {
      "type": "stdio",
      "command": "uvx",
      "args": ["aexy-mcp@latest"],
      "env": {
        "AEXY_API_URL": "<api-url>",
        "AEXY_API_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

### ChatGPT

ChatGPT connects only to *remote* MCP servers reached over HTTP with OAuth; it
cannot launch a local stdio process the way the clients above do. So it takes a
URL rather than a config file, and there is nothing to install:

```
<api-url>/mcp
```

In ChatGPT, open **Settings → Connectors → Create** and paste that URL. ChatGPT
registers itself through Dynamic Client Registration, then sends you to Aexy to
sign in and choose which workspace the connector may use.

There is no API token in this flow. Authorization is an OAuth 2.1 authorization
code grant with PKCE, and the resulting token is scoped to one developer in one
workspace — the connector sees exactly the apps you already have access to
there, and nothing else.

Everything you have authorized is listed under **Settings → Connected Apps**,
with the workspace it reaches and when it was last used. Revoking there kills
every token on the grant at once, including the refresh token, so the client
cannot quietly mint another; it has to walk the consent flow again.

The endpoints backing this are discoverable, so any remote MCP client can use
them, not just ChatGPT:

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource` | Points at the authorization server |
| `/.well-known/oauth-authorization-server` | Metadata: endpoints, PKCE methods |
| `/oauth/register` | Dynamic Client Registration (RFC 7591) |
| `/oauth/authorize` | Redirects to the consent screen |
| `/oauth/token` | Code exchange and refresh, both rotating |
| `/oauth/revoke` | Token revocation (RFC 7009) |

Two behaviours are worth knowing because they look like bugs when you hit them:
redeeming an authorization code twice revokes every token from that grant, and
reusing a retired refresh token does the same. Both are deliberate — a replayed
secret means someone other than the client is holding it.

### Any other client

If your client speaks the stdio transport, it needs the same three facts:
command `uvx`, argument `aexy-mcp@latest`, and the two environment variables.
Translate that into whatever shape the client expects.

---

## Tools

Generated from the server's own tool registry — this table is not
hand-maintained, so it cannot drift from what the server actually exposes. See
`frontend/scripts/generate-mcp-doc.mjs`.

Tools marked **Writes** can change data. Each takes an `action` argument
selecting the operation, so one tool covers a whole domain rather than the
catalogue exploding to one entry per endpoint.

<!-- BEGIN GENERATED TOOLS -->

<!-- Generated by frontend/scripts/generate-mcp-doc.mjs from aexy-mcp 0.1.0. Do not edit by hand. -->

### Sprint Management

Capability: `mcp.sprints`

| Tool | Writes | Description |
| --- | --- | --- |
| `aexy_bugs` | yes | Track and manage bugs. Actions: list, get, create, update, stats, confirm, fix, verify, close, reopen, link_story, link_task, activity, comments. |
| `aexy_epics` | yes | Manage epics. Actions: list, get, create, update, delete, add_tasks, timeline, progress, burndown. |
| `aexy_projects` | yes | Manage projects. Actions: list, get, create, update, delete, members, teams. |
| `aexy_sprint_analytics` | no | Sprint and team analytics. Actions: burndown, cycle_time, metrics, velocity, velocity_predict, carry_over, carry_over_chronic, health. |
| `aexy_sprint_tasks` | yes | Manage sprint tasks. Actions: list, get, create, update, delete, assign, unassign, update_status, bulk_status, bulk_assign, suggest_assignments, subtasks, activities, comments, capacity, completion_prediction. |
| `aexy_sprints` | yes | Manage sprints in Aexy. Actions: list, get, get_active, create, update, delete, start, complete, review, retro, stats, carry_over. |

### CRM

Capability: `mcp.crm`

| Tool | Writes | Description |
| --- | --- | --- |
| `aexy_crm_automations` | yes | Manage CRM automations and sequences. Actions: list, get, create, update, delete, toggle, trigger, runs, list_sequences, get_sequence, create_sequence, toggle_sequence, enroll_sequence, sequence_enrollments. |
| `aexy_crm_objects` | yes | Manage CRM object types and their attributes. Actions: list, get, create, update, delete, list_attributes, create_attribute. |
| `aexy_crm_records` | yes | Manage CRM records (contacts, companies, deals, etc.). Actions: list, get, create, update, delete, bulk_create, search, notes, activities. |

### AI Agents

Capability: `mcp.agents`

| Tool | Writes | Description |
| --- | --- | --- |
| `aexy_agent_policies` | yes | Manage agent policies and audit logs. Actions: list, get, create, update, delete, policy_decisions, config_audit. |
| `aexy_agents` | yes | Manage AI agents. Actions: list, get, create, update, delete, execute, list_conversations, get_conversation, get_metrics, list_executions. |
| `aexy_workflows` | yes | Manage CRM automation workflows (visual workflow builder). Actions: get, update, validate, publish, list_executions, get_execution. |

### Email & GTM

Capability: `mcp.email_gtm`

| Tool | Writes | Description |
| --- | --- | --- |
| `aexy_email_campaigns` | yes | Manage email marketing campaigns. Actions: list, get, create, update, delete, duplicate, schedule, send, pause, resume, cancel, test, audience_count, recipients, analytics, analytics_timeline, analytics_links, analytics_overview, analytics_trends. |
| `aexy_email_infrastructure` | yes | Manage email infrastructure — domains, providers, warming, health. Actions: list_domains, get_domain, verify_domain, domain_health, warming_status, warming_start, warming_pause, list_providers, get_provider, test_provider. |
| `aexy_gtm_leads` | yes | Manage GTM leads. Use the generic aexy_api tool for full GTM access. Actions: list, get, create, update, score, activities. |
| `aexy_gtm_sequences` | yes | Manage GTM outreach sequences. Actions: list, get, create, enroll, pause, stats. |

### Analytics & Insights

Capability: `mcp.analytics`

| Tool | Writes | Description |
| --- | --- | --- |
| `aexy_analytics` | no | Team and developer analytics. Actions: skills_heatmap, activity_heatmap, productivity, workload, collaboration. |
| `aexy_assessments` | no | Manage assessments. Actions: list, get, create, update, delete, publish, metrics. |
| `aexy_compliance` | no | Compliance management — training, certifications, audit logs. Actions: list_training, get_training, create_training, list_certifications, overview, developer_compliance, expiring, overdue, audit_logs. |
| `aexy_developer_insights` | no | Developer insights and snapshots. Actions: get_snapshot, get_trends, team_insights, leaderboard. |

### Platform

Capability: `mcp.platform`

| Tool | Writes | Description |
| --- | --- | --- |
| `aexy_api` | yes | Call any Aexy API endpoint directly. Use this for endpoints not covered by dedicated tools, or when you need full control over the request. The base URL already points to /api/v1, so paths should be relative (e.g., '/health', '/developers/me', '/workspaces/{id}/teams'). |
| `aexy_documents` | yes | Manage documents. Actions: list, get, create, update, delete, search, versions. |
| `aexy_integrations` | yes | Manage integrations (Jira, Linear). Actions: get_jira, connect_jira, test_jira, sync_jira, disconnect_jira, get_linear, connect_linear, test_linear, sync_linear, disconnect_linear. |
| `aexy_notifications` | yes | Manage notifications. Actions: list, get, count, poll, mark_read, mark_all_read, delete, get_preferences, update_preference. |
| `aexy_tables` | yes | Manage standalone tables (spreadsheet-like data). Actions: list, get, create, delete, list_rows, create_row, update_row, delete_row, query. |
| `aexy_tickets` | yes | Manage support tickets. Actions: list, get, get_by_number, create, update, delete, assign, stats, responses, create_task. |
| `aexy_workspaces` | yes | Manage workspaces. Actions: list, get, get_my, create, update, members, get_member, teams, permissions. |

### Temporal Workflows

Capability: `mcp.temporal`

| Tool | Writes | Description |
| --- | --- | --- |
| `temporal_cancel_workflow` | yes | Cancel or terminate a workflow execution with a reason. |
| `temporal_describe_workflow` | no | Get full description of a workflow execution — status, type, queue, start/close times, history length, pending activities. |
| `temporal_get_workflow_history` | no | Key debugging tool. Parse workflow event history into a readable timeline showing activity starts/completions, failures with details, retry counts, signals, timers, and child workflows. |
| `temporal_list_schedules` | no | List all registered Temporal schedules with intervals, next run times, and paused status. |
| `temporal_list_workflows` | no | List Temporal workflow executions. Supports filtering by status, type, and time range using Temporal visibility queries. |
| `temporal_query_workflow` | no | Query a running workflow's state. For example, query 'get_status' on CRMAutomationWorkflow to see current node, or custom query handlers. |
| `temporal_signal_workflow` | yes | Send a signal to a running workflow. Examples: 'on_event' to CRMAutomationWorkflow, 'pause'/'resume' to OutreachSequenceWorkflow. |
| `temporal_system_status` | no | Aggregate Temporal dashboard: workflow counts by status/type, recent failures, schedule health overview. |

35 tools across 7 categories, from `aexy-mcp` 0.1.0.

<!-- END GENERATED TOOLS -->

### The `aexy_api` escape hatch

The backend exposes far more than the catalogue above covers. `aexy_api` is a
generic gateway: give it a method and a path under `/api/v1` and it calls it with
your token. Reach for it when no dedicated tool fits, rather than waiting for one
to be added.

---

## Access and permissions

Today the API token authenticates as *you*, and every tool call is subject to the
same permission checks as the equivalent action in the web app. A tool cannot do
anything your account could not do through the UI.

Two caveats worth knowing:

These apply to the **stdio** server and its API tokens:

- **Tokens are not scoped.** A token grants everything your account can do, not a
  subset. Treat one like a password: create a separate token per machine, and
  revoke it in Settings → API Tokens when the machine goes away.
- **The tool list is not filtered by permission.** Your client is offered all
  tools; ones you lack permission for fail at call time with a 403 rather than
  being hidden.

The **remote** transport used by [ChatGPT](#chatgpt) does not share either
limitation. An OAuth grant is bound to one developer in one workspace, and
capabilities resolve from the same app-access model that governs the web app —
holding the `sprints` app is what grants `mcp.sprints`. The tool list is built
from those capabilities, so it is filtered before the client ever sees it.

Grants are visible and revocable at **Settings → Connected Apps**. Revoked
grants stay listed rather than disappearing — someone auditing what reached
their workspace needs to see that a connector existed and when it last ran.

### Temporal tools, and why they are changing

The `temporal_*` tools are different from the rest, and the difference matters:

- They connect **directly** to the Temporal frontend from your machine, rather
  than going through the Aexy API. Aexy therefore applies no permission check to
  them and records nothing when they are used.
- Two of them (`temporal_signal_workflow`, `temporal_cancel_workflow`) change
  live workflow executions.
- The `AEXY_ENABLE_TEMPORAL` variable that used to appear in setup instructions
  was never a control — it is set by the caller on their own machine, so it gated
  nothing.

For that reason the setup instructions above no longer configure Temporal access
at all. These tools are being moved behind the Aexy API, where a real
`mcp.temporal` grant and an audit trail can apply. If you have `TEMPORAL_ADDRESS`
or `AEXY_ENABLE_TEMPORAL` in an existing config, remove them.

---

## Troubleshooting

**The client shows no Aexy tools.** Almost always the config file or its
location. Confirm the exact path for your client above — `.mcp.json` and
`settings.local.json` are not interchangeable, and VS Code uses `servers` where
everyone else uses `mcpServers`. Then restart the client fully.

**`uvx: command not found`.** Install `uv`
(`curl -LsSf https://astral.sh/uv/install.sh | sh`) and restart the client so it
picks up the new `PATH`. GUI apps like Claude Desktop do not inherit your shell's
`PATH`; if it still fails, use an absolute path to `uvx` as `command`.

**Every call returns 401.** The token is wrong, revoked, or expired. Check it in
Settings → API Tokens — the list shows each token's prefix and last-used time, so
you can tell whether the server ever authenticated at all.

**A call returns 403.** The token works but your account lacks permission for
that action. The same operation would be refused in the web app.

**Temporal tools time out.** They need network reach to the Temporal frontend,
which usually does not exist from a laptop. Follow the note above and stop
configuring them.

---

## For maintainers

The tool catalogue on the /mcp page and the table in this document both come from
one generated manifest, `frontend/src/config/mcpTools.generated.json`.

```bash
cd frontend
npm run mcp:manifest          # refresh from aexy-io/mcp-server
npm run mcp:manifest:check    # CI: fail if the pin is stale
npm run mcp:doc               # regenerate the table above
```

The manifest is produced upstream by `scripts/dump_tool_manifest.py`, staged in
this repo at `scripts/mcp-server-upstream/` until it is merged there. The pinned
ref lives in `frontend/src/config/mcpTools.pin.json`.

`frontend/src/test/mcpManifestParity.test.ts` asserts the manifest is well-formed
and that every capability it declares has somewhere to be granted. Adding a tool
upstream and forgetting to refresh here no longer silently under-reports the
catalogue — which is exactly what the previous hand-copied list did.
