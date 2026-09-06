# MCP (Model Context Protocol)

Aexy ships an MCP server, so AI assistants can work inside your workspace
directly — reading sprints, updating tickets, querying analytics, running
agents — instead of you copying context between a browser tab and a chat window.

There is one server: the backend's `POST /api/v1/mcp`, speaking JSON-RPC over
streamable HTTP. Clients that can reach a URL connect to it directly and sign in
through OAuth. Clients that can only launch a local process run `aexy-mcp`
([`aexy-io/mcp-server`](https://github.com/aexy-io/mcp-server)), a stdio bridge
that forwards every message to that same endpoint with an API token and holds
no tools of its own. The in-app reference is at **/mcp**.

---

## Quick start

**Remote (recommended).** Give your client the URL `<api-url>/mcp`. It registers
itself, sends you to Aexy to sign in, and you choose which workspace it may use.
Nothing to install, no token to paste.

**Local (stdio bridge).** For clients that can only launch a process:

1. **Create an API token** — Settings → API Tokens. It authenticates as you and
   carries only your permissions.
2. **Add the configuration for your client** — see below. Every client runs the
   bridge through `uvx`, which fetches and runs it on demand. There is no repo to
   clone and nothing to keep updated.
3. **Restart the client.** Most only read their MCP config at startup.

You do not need to install Python, `uv` or the bridge by hand; `uvx` handles
it. If your machine has no `uv`, install it with
`curl -LsSf https://astral.sh/uv/install.sh | sh`.

**Unattended agents.** A scheduled or event-driven agent should not run as a
person. An admin creates an **agent principal** under Settings → Agent
Principals, scopes it to the capabilities it needs, and issues it a token. The
principal acts as itself: its own name in the audit ledger, its own rows in the
review queue, and a token that dies with it. See
[Agent principals](#agent-principals).

### Environment variables

The bridge reads three, plus an optional `AEXY_TIMEOUT_SECONDS`:

| Variable | Meaning |
| --- | --- |
| `AEXY_API_URL` | Backend API base URL, e.g. `https://api.aexy.io/api/v1` |
| `AEXY_API_TOKEN` | Your token from Settings → API Tokens, or a principal's token |
| `AEXY_WORKSPACE_ID` | Which workspace to act in. Needed only when the token's owner belongs to more than one; a principal is already bound to one |

> Older setup notes mentioned `AEXY_ENABLE_TEMPORAL`, `TEMPORAL_ADDRESS` and
> `TEMPORAL_NAMESPACE`. They no longer exist — see
> [Temporal tools](#temporal-tools) below.

---

## Client setup

Replace `<your-api-token>` with your token and `<api-url>` with your backend URL
(`http://localhost:8000/api/v1` for a local stack). The `AEXY_WORKSPACE_ID`
line matters only if you belong to more than one workspace; otherwise leave
the placeholder or delete the line — the bridge ignores an unreplaced one.

### Claude Code

Remote, one line — it authenticates through the browser:

```bash
claude mcp add --transport http aexy <api-url>/mcp
```

Or run the stdio bridge with a token:

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

Generated from the backend's own OpenAPI schema — this table is not
hand-maintained, so it cannot drift from what the server actually exposes. See
`backend/scripts/dump_mcp_catalog.py` and `frontend/scripts/generate-mcp-doc.mjs`.

A caller is offered two generic tools that reach everything they may reach, the
named routines whose operations they hold, and one tool per **capability** they
hold. A capability is an app grant: holding the `sprints` app is what grants
`mcp.sprints`. Each per-capability tool takes an `action` selecting the
operation, so a typical caller sees a dozen or two tools covering ~1,900
operations rather than a tool per endpoint.

<!-- BEGIN GENERATED TOOLS -->

<!-- Generated by frontend/scripts/generate-mcp-doc.mjs from the backend catalogue (version 1). Do not edit by hand. -->

### Always offered

| Tool | Description |
| --- | --- |
| `aexy_discover` | Search the operations you can reach by free text. Returns each match's action name, method, path and summary. |
| `aexy_call` | Call any operation you can reach by its action name, with path_params, query and body. Access is enforced server-side. |

### Named routines

Offered when the caller holds the capability named. Each binds one operation and takes flat arguments.

| Tool | Capability | Description |
| --- | --- | --- |
| `aexy_docs_needing_update` | `mcp.docs` | List documents whose linked source code has changed since they were written. Start here: each item names the repository path to read and whether an update is already queued. Detecting this costs nothing, so poll it freely. |
| `aexy_docs_merged_changes` | `mcp.docs` | List recently merged pull requests in this workspace's repositories, as candidates for documentation that does not exist yet. The other half of the work list: `aexy_docs_needing_update` only finds pages that already exist and have fallen behind. Says nothing about whether a change is already documented — check the repository's documents before writing. |
| `aexy_docs_propose` | `mcp.docs` | Propose a rewrite of a document, in Markdown. Nothing is applied — it waits in the workspace review queue with a diff against the current text. This is the way to write a document: sending editor JSON is refused, because one invalid node renders the page blank. |
| `aexy_docs_create_from_code` | `mcp.docs` | Write a document for a repository path and link it to that path, so it can be told later when the code changes. Use link_type 'file' for one file or 'directory' for a module. |
| `aexy_sd_open_tickets` | `mcp.service_desk` | Service desk work list. Lists tickets with their request type, who they are pending with, owner and age. Start a triage or TAT pass here: filter needs_triage=true for tickets the classifier was unsure about, or pending_with=<stakeholder> to see one queue. Pass `fields` to keep the answer short. Each row carries `ticket_id`: that is the id every other ticket routine and action takes (`id` is the desk row, and will 404). |
| `aexy_sd_triage_ticket` | `mcp.service_desk` | Classify or correct a service desk ticket: set its request type, the product, account or vendor it concerns, its owner, and clear needs_triage once you are sure. Read the ticket first (aexy_service_desk action get_ticket) and only set fields you have evidence for. Reassigning a ticket to a different owner is a change a person may want to approve; if the call is held, say so and stop. |
| `aexy_sd_park_ticket` | `mcp.service_desk` | Move a service desk ticket to a different stakeholder's queue (pending_with) with a note saying why. This is how the TAT clock is handed over; the ledger records the segment. Use a stakeholder slug the workspace defines — the ticket detail lists them. |
| `aexy_sd_tat_report` | `mcp.service_desk` | Turnaround-time report for service desk tickets: time spent with each stakeholder against target, per ticket. Use it for a TAT sweep — find breaches and near-breaches, then nudge the owner (aexy_sd_email_stakeholder) or park the ticket onward (aexy_sd_park_ticket). Filter to one stakeholder or request type to keep it readable. |
| `aexy_sd_email_stakeholder` | `mcp.service_desk` | Email a stakeholder about a service desk ticket, from the desk's mailbox, threaded on the ticket. To park the ticket with them as well, call aexy_sd_park_ticket with that stakeholder. Sending mail is outward-facing: workspace policy normally holds it for a person to approve. Draft it well and expect to wait. |
| `aexy_sprint_standup` | `mcp.tracking` | Everyone's standup for a sprint in one call: what they did, what is next, what is blocking. The daily standup routine: fetch this, fetch aexy_active_blockers, and write the summary a person would — who is blocked and on what, what is at risk, who has not reported. Find the sprint id with aexy_sprints action get_active_sprint. |
| `aexy_active_blockers` | `mcp.tracking` | Open blockers, optionally for one team, with how long each has been open. Anything older than a day belongs in the standup summary by name. |
| `aexy_sprint_tasks` | `mcp.sprints` | Tasks in a sprint, filterable by status or assignee. Sprint hygiene: look for unassigned tasks, tasks with no estimate, and in-progress tasks that have not moved. Comment or ask rather than reassign — changing status or owner is a decision the team makes, and policy may hold it. |
| `aexy_leave_pending_approvals` | `mcp.leave` | Leave requests waiting on the caller's approval. The leave routine: for each, check the requester's balance (aexy_leave action get_developer_balance) and the team calendar for clashes, then recommend. Approving or rejecting is a person's decision; approve_leave_request and reject_leave_request exist, but say what you would do and why rather than doing it unless you were asked to. |
| `aexy_compliance_overdue` | `mcp.compliance` | Training and certification assignments that are overdue, by person. The compliance sweep: pair this with aexy_compliance_expiring, then notify owners. Waiving a requirement is held for approval. |
| `aexy_compliance_expiring` | `mcp.compliance` | Certifications expiring within a window (default 30 days), by person, so renewals can be chased before they lapse. |
| `aexy_campaign_preflight` | `mcp.email_marketing` | How many recipients a campaign will go to right now. Preflight before any send: a count of zero or an unexpectedly large one is a reason to stop and ask. Sending itself (send_campaign) is held for approval by default. |
| `aexy_open_incidents` | `mcp.uptime` | Uptime incidents, filterable by monitor and status. Incident first response: acknowledge new ones (aexy_incident_acknowledge), open a ticket if the monitor is customer-facing, and escalate through the matrix only if nobody has responded — escalation is held for approval. |
| `aexy_incident_acknowledge` | `mcp.uptime` | Acknowledge an uptime incident so the on-call knows someone is looking. Safe to do unattended; it changes nothing about the service. |
| `aexy_crm_records` | `mcp.crm` | Records of one CRM object (people, companies, deals), with filters and sorts as JSON strings. CRM follow-up routine: list deals sorted by last activity, find the stale ones, and draft the follow-up — sending is held for approval. Find object ids with aexy_crm action list_objects. |

### One tool per capability

Each takes an `action` (the enum below is the coverage guarantee), plus `path_params`, `query` and `body`.

| Tool | Capability | Operations | Writes | Granted by |
| --- | --- | --- | --- | --- |
| `aexy_admin` | `mcp.admin` | 60 | 23 | the `admin` module on the MCP app (privileged) |
| `aexy_agents` | `mcp.agents` | 61 | 34 | the `agents` app |
| `aexy_automations` | `mcp.automations` | 57 | 28 | the `automations` app |
| `aexy_booking` | `mcp.booking` | 46 | 25 | the `booking` app |
| `aexy_chat` | `mcp.chat` | 51 | 32 | the `chat` app |
| `aexy_compliance` | `mcp.compliance` | 81 | 50 | the `compliance` app |
| `aexy_crm` | `mcp.crm` | 99 | 65 | the `crm` app |
| `aexy_docs` | `mcp.docs` | 106 | 59 | the `docs` app |
| `aexy_drive` | `mcp.drive` | 18 | 11 | the `drive` app |
| `aexy_email_marketing` | `mcp.email_marketing` | 108 | 67 | the `email_marketing` app |
| `aexy_forms` | `mcp.forms` | 26 | 17 | the `forms` app |
| `aexy_gtm` | `mcp.gtm` | 160 | 86 | the `gtm` app |
| `aexy_hiring` | `mcp.hiring` | 89 | 60 | the `hiring` app |
| `aexy_insights` | `mcp.insights` | 127 | 47 | the `insights` app |
| `aexy_integrations` | `mcp.integrations` | 81 | 47 | the `integrations` module on the MCP app |
| `aexy_learning` | `mcp.learning` | 93 | 49 | the `learning` app |
| `aexy_leave` | `mcp.leave` | 23 | 14 | the `leave` app |
| `aexy_oncall` | `mcp.oncall` | 15 | 11 | the `oncall` app |
| `aexy_organization` | `mcp.organization` | 22 | 10 | the `organization` app |
| `aexy_platform` | `mcp.platform` | 143 | 73 | the `platform` module on the MCP app |
| `aexy_reports` | `mcp.reports` | 29 | 15 | the `reports` app |
| `aexy_reviews` | `mcp.reviews` | 42 | 21 | the `reviews` app |
| `aexy_service_desk` | `mcp.service_desk` | 75 | 42 | the `service_desk` app |
| `aexy_sprints` | `mcp.sprints` | 240 | 153 | the `sprints` app |
| `aexy_tables` | `mcp.tables` | 31 | 21 | the `tables` app |
| `aexy_tickets` | `mcp.tickets` | 30 | 19 | the `tickets` app |
| `aexy_tracking` | `mcp.tracking` | 38 | 18 | the `tracking` app |
| `aexy_uptime` | `mcp.uptime` | 16 | 9 | the `uptime` app |

1967 operations across 28 capabilities, generated from the backend's OpenAPI schema.

<!-- END GENERATED TOOLS -->

### Discovering the rest

`aexy_discover` searches every operation you can reach by free text and returns
action names, methods, paths, **and what to send**: the path and query
parameters, and the request body's fields with types, required flags and enums.
`aexy_call` invokes any of them by action name; pass `capability` when the same
name exists in two (`list_records` is both CRM and Tables). Nothing is stranded
behind a tool nobody wrote.

### Keeping answers short

Every tool takes an optional `fields` list: the keys to keep in the response,
applied to each item of a list. Responses are capped at 32 KB; a truncated
response says so, says how much was cut, and names the query parameters the
operation accepts so the next call can narrow.

### Named routines

Beside the per-capability tools, a caller is offered a short list of named
routines for day-to-day operations — `aexy_sd_open_tickets`,
`aexy_sd_triage_ticket`, `aexy_sd_tat_report`, `aexy_sprint_standup`,
`aexy_leave_pending_approvals`, `aexy_compliance_overdue`, `aexy_open_incidents`
and the rest of the table above. Each binds one operation, takes flat arguments,
and says in its description what to do around it and what is left to a person.
A routine is offered only when its capability is granted.

### Prompts and resources

The server also speaks `prompts/list`, `prompts/get`, `resources/list` and
`resources/read`. Prompts are the routines as a client can run them in one
step — `sprint_standup`, `sprint_hygiene`, `service_desk_triage`, `tat_review`,
`weekly_report`, `crm_pipeline_review`, `leave_approvals`, `compliance_sweep`,
`incident_first_response` — filtered to the capabilities you hold. Resources are
`aexy://capabilities` (what this grant reaches) and `aexy://catalog/<capability>`
(that capability's operations with their parameters).

### Running routines on a clock

An agent with a principal can be scheduled under **Settings → Agent
Schedules**: a routine instruction, an interval, and the agent. Each run is an
ordinary agent execution, acting as the principal, with its writes governed and
in the ledger like any other. See [AI Agents](./ai-agents.md#agent-schedules).

---

## Access and permissions

Whichever way you connect, every call is answered by the same application, on
a short-lived token marked as an **agent** acting for you. Three things follow:

- **Permissions are the endpoint's.** A tool cannot do anything your account
  could not do through the web app, and the tool list is filtered to the apps
  you hold in the workspace — a tool you cannot use is absent, not disabled.
- **Workspace policies apply.** Every mutating call is checked against the
  workspace's agent policies before it runs. A held call waits in `/review`
  for an admin; the agent is told so, and can poll its own requests. Every
  workspace starts with a default pack that holds deletions, outward-facing
  actions and administrative writes. See
  [Agent policies](./workflows-and-automations.md#agent-policies).
- **Every write is in the ledger.** `/review` shows what agents did, not only
  what they were stopped from doing.

An OAuth grant is bound to one developer in one workspace, chosen at consent.
Grants are visible and revocable at **Settings → Connected Apps**; revoked
grants stay listed, because someone auditing what reached their workspace needs
to see that a connector existed and when it last ran.

A personal API token is not bound to a workspace. The bridge names one with
`AEXY_WORKSPACE_ID` (sent as the `X-Aexy-Workspace-Id` header); a person in a
single workspace may omit it. Treat a token like a password: one per machine,
revoked in Settings → API Tokens when the machine goes away.

### Agent principals

A principal is an identity an agent runs as, owned by the workspace rather than
by a person:

- **Scoped.** An admin picks its capabilities from what the workspace grants;
  it can never hold more — the server refuses a capability the workspace does
  not hold (`422`). The scope is enforced at the MCP transport *and* mirrored
  into the principal's own app access, so a principal token that calls the
  REST API directly reaches only the same apps. A removed principal cannot be
  reactivated; make a new one.
- **Always an agent.** Every request on a principal token carries the agent
  actor claim, so governance, the review gate and the ledger apply everywhere.
- **One live token.** Issuing a token revokes the previous one. Deactivating
  the principal revokes its token in the same transaction.
- **Named in the audit trail.** Its writes, held actions and approvals show
  under its own name, not under whoever created it.

Managed at **Settings → Agent Principals** (admins only). Principal management
is deliberately not reachable over MCP, and neither are personal API tokens:
an agent that could mint itself a token — a principal's, or a plain personal
one carrying no principal — would be writing its own grant. The REST token
endpoint refuses agent callers for the same reason.

Two things a principal does **not** get by being created: membership of a
service-desk team, and workspace roles. A service-desk principal that should
log or edit tickets needs the desk's write authority like any member would —
the desk-manager permission, or assignment — otherwise it can read the desk
and nothing more.

### Temporal tools

Earlier versions of the stdio server shipped eight `temporal_*` tools that
connected straight to the Temporal frontend from your machine, bypassing Aexy
entirely. They are gone. The bridge has no tools of its own, and Temporal is not
reachable over MCP. If you have `TEMPORAL_ADDRESS` or `AEXY_ENABLE_TEMPORAL` in
an existing config, remove them.

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

**"This token belongs to a person in N workspaces."** The bridge needs to know
which one. Set `AEXY_WORKSPACE_ID`, or use a principal, which is bound to one.

**A write comes back "needs approval … nothing has changed yet".** A workspace
policy held it. An admin decides in `/review`; the agent can check
`agent-actions/mine` and continue once it is approved.

---

## For maintainers

The tool catalogue on the /mcp page and the table in this document both come
from the backend's own catalogue.

```bash
cd backend
python scripts/dump_mcp_catalog.py          # regenerate tests/fixtures/mcp-catalog.generated.json
python scripts/dump_mcp_catalog.py --check  # CI: fail if stale or a router tag is unmapped

cd ../frontend
npm run mcp:manifest          # render the fixture into src/config/mcpTools.generated.json
npm run mcp:manifest:check    # CI: fail if the manifest is stale
npm run mcp:doc               # regenerate the table above
```

`services/mcp_catalog.py` maps every router tag to a capability; a new router
whose tag is unmapped fails `--check`, so nothing lands outside the access
model unnoticed. `frontend/src/test/mcpManifestParity.test.ts` asserts the
rendered manifest is well-formed and that every capability it declares has
somewhere to be granted.
