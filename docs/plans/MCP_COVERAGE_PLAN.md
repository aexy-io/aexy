# MCP Coverage, Access Control & Skill Marketplace — Plan

Status: proposed
Branch: `feat/mcp-coverage-skills`

---

## 1. Where we actually are

| Thing | Reality |
|---|---|
| MCP server code | External repo `github.com/aexy-io/mcp-server`. Nothing in this monorepo. |
| Transport | stdio only. |
| Tool catalog | 31 tools in 7 categories, **hand-copied** into `frontend/src/app/(app)/mcp/page.tsx:44` + i18n `messages/{en,hi}/mcp.json`. The file's own comment admits it is not generated. |
| Backend API surface | 120 routers under `/api/v1`. |
| Auth | `ApiToken` (`aexy_<32hex>`, SHA-256 hashed) → resolves to a developer in `api/developers.py:42`. No scopes, no expiry enforcement beyond `expires_at`, full developer identity. |
| Temporal tools | 8 tools that connect **directly** to `TEMPORAL_ADDRESS` from the client machine. |
| Access gating | `AEXY_ENABLE_TEMPORAL` — a **client-side env var the user sets themselves**. |
| Docs | No `docs/mcp.md`. Absent from `docs/README.md` and `frontend/public/docs/index.json`. Every other module has a doc. |
| App registry | `mcp` app exists in both `appDefinitions.ts:330` and `app_definitions.py:429`, `required_permission: can_view_agents`, `modules: {}` (none). |

### 1.1 The security finding, stated plainly

`AEXY_ENABLE_TEMPORAL` is not an access control. It is a flag the caller sets on their own
machine. Combined with the temporal tools talking straight to the Temporal frontend rather than
through Aexy, **any holder of any `aexy_` API token can signal, cancel, and terminate live
production workflows**, and Aexy has no record that it happened. `required_permission:
can_view_agents` on the `mcp` app gates the *settings page*, not the tools.

This is the single highest-priority item in the plan and it is fixed in Phase 1, before any of
the feature work.

### 1.2 Setup instructions — every client is wrong or missing

| Client | Page says | Correct |
|---|---|---|
| Claude Code | `mcpServers` block in `.claude/settings.local.json` (`page.tsx:335`) | **Wrong file.** Server definitions go in `.mcp.json` (project root, committed) or `~/.claude.json` (user scope). `settings.local.json` carries `enabledMcpjsonServers`, not definitions. Canonical path is `claude mcp add`. |
| Codex CLI | A bare shell command and a table of env vars (`page.tsx:370`) | Not a config. Codex reads `~/.codex/config.toml` → `[mcp_servers.aexy]` with `command` / `args` / `env`. |
| Claude Desktop | **Missing** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Or Settings → Connectors for remote. |
| ChatGPT | **Missing** | Cannot consume stdio at all. Needs a remote streamable-HTTP server + OAuth, added as a custom connector. Blocked on Phase 2. |
| Cursor | **Missing** | `.cursor/mcp.json`. |
| VS Code / Copilot | **Missing** | `.vscode/mcp.json`. |
| All | `uv run --directory /path/to/aexy/mcp-server aexy-mcp` | Requires every user to clone a repo and keep it current. Publish to PyPI → `uvx aexy-mcp@latest`. |

---

## 2. Decisions taken

1. **mcp-server stays external**, but publishes a generated `tools.json` manifest that this repo
   consumes at build time. No more hand-maintained catalog.
2. **Full remote MCP**: streamable HTTP endpoint + OAuth 2.1 with authorization-server metadata
   and dynamic client registration. This is what ChatGPT connectors and Claude web/desktop
   custom connectors require, and it is where server-side access flags belong.
3. **Skills are curated + admin-approved per workspace.** Crawled skills land `unreviewed`; a
   workspace admin approves before anyone can load one. Loads are audit-logged.

---

## 3. Workstreams

### WS1 — Tool manifest and parity (kills the drift)

Mirrors the pattern this repo already uses for the app catalog
(`backend/scripts/dump_app_catalog.py` + two parity tests).

**In `aexy-io/mcp-server`:**
- `scripts/dump_tool_manifest.py` walks the live tool registry and emits `tools.json`:
  ```jsonc
  { "version": "0.4.0", "generated_at": "...",
    "categories": [{ "key": "sprints", "name": "Sprint Management",
      "tools": [{ "name": "aexy_sprints", "description": "...",
                  "capability": "mcp.sprints", "mutating": true,
                  "input_schema": { ... } }] }] }
  ```
- CI job asserts `tools.json` is current, and publishes it to a release asset + PyPI sdist.

**In this repo:**
- `frontend/scripts/fetch-tool-manifest.js` — pulls the pinned manifest into
  `frontend/src/config/mcpTools.generated.json`, wired into `prebuild` alongside
  `merge-messages.js`. Pinned by version, committed, so builds stay hermetic.
  > **Superseded (0.37.0).** The manifest is no longer fetched from the stdio
  > server. `frontend/scripts/generate-mcp-manifest.mjs` renders it from
  > `backend/tests/fixtures/mcp-catalog.generated.json`, which the backend
  > derives from its own OpenAPI schema and CI checks for staleness. Same file
  > out, one fewer repo in the seam. `fetch-tool-manifest.mjs` is deleted.
- Delete the hand-written `TOOL_CATEGORIES` array (`page.tsx:44`) and read the manifest.
- Tool names/descriptions come from the manifest; i18n keeps only category names and page chrome.
  This ends the "update the array AND the i18n keys" rule in the file's comment.
- `frontend/src/test/mcpManifestParity.test.ts` — every capability string in the manifest exists
  as a module on the `mcp` app in `appDefinitions.ts`. A tool with no grant fails the build.

### WS2 — Remote transport + OAuth 2.1 (unblocks ChatGPT, Claude Desktop, Claude web)

New backend router `backend/src/aexy/api/mcp.py`, mounted in `api/__init__.py`.

- `POST /api/v1/mcp` — streamable HTTP transport (MCP spec 2025-06-18). `initialize`,
  `tools/list`, `tools/call`, `prompts/list`, `prompts/get`, `resources/*`.
- `GET /.well-known/oauth-authorization-server` and
  `GET /.well-known/oauth-protected-resource` — mounted at the **app root**, not under
  `/api/v1`, per RFC 8414 / RFC 9728. Requires a route registration outside the versioned
  prefix in `main.py`.
- `POST /api/v1/mcp/oauth/register` — dynamic client registration (RFC 7591). ChatGPT and
  Claude Desktop both register themselves; without this the connector UIs cannot complete setup.
- Authorization code + PKCE, reusing the existing `api/auth.py` session for the consent screen.
  New consent page `frontend/src/app/auth/mcp-consent/page.tsx` showing exactly which
  capabilities the client is asking for.
- Bearer tokens: reuse `ApiToken` with a new `token_kind` column (`personal` | `oauth`) and a
  `client_id` FK, so one revoke path covers both.

New models: `McpOAuthClient`, `McpAuthorizationCode`. Migration
`backend/scripts/migrate_mcp_oauth.sql`.

The server-side handler shares the tool implementations with the stdio server by importing the
published `aexy-mcp` package — the stdio entrypoint and the HTTP handler are two transports over
one registry, not two codebases.

### WS3 — Access as org access, with a real Temporal flag

This is the item the current design gets wrong, so it is specified in full.

**3a. Capabilities become modules on the `mcp` app.**

Per CLAUDE.md, edit **both** files and regenerate the fixture:

```python
# backend/src/aexy/models/app_definitions.py:429
"mcp": {
    ...
    "modules": {
        "sprints": True, "crm": True, "agents": True, "email_gtm": True,
        "analytics": True, "platform": True,
        "temporal": False,   # off in every bundle — see 3b
    },
},
```

Same shape in `frontend/src/config/appDefinitions.ts:330`, then:

```bash
cd backend && python scripts/dump_app_catalog.py
```

`temporal: False` in all four bundles. It is granted deliberately, never inherited.

**3b. Temporal tools stop talking to Temporal.**

New router `backend/src/aexy/api/temporal_admin.py` exposing the 8 operations
(`list_workflows`, `describe`, `history`, `query`, `signal`, `cancel`, `list_schedules`,
`system_status`) over the existing Temporal client the backend already holds.

- Read operations require module `mcp.temporal`.
- Mutating operations (`signal`, `cancel`) additionally require a new permission
  `can_manage_temporal`, and write an audit row.
- The MCP server calls these endpoints like every other tool.

Effect: `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE` and `AEXY_ENABLE_TEMPORAL` disappear from every
client config. The client can no longer reach Temporal directly, and the flag is no longer
self-asserted. Remove all three from `page.tsx` and the i18n files.

**3c. Capability endpoint.**

`GET /api/v1/mcp/capabilities` → for the authenticated token:

```jsonc
{ "developer_id": "...", "workspace_id": "...",
  "capabilities": ["mcp.sprints", "mcp.crm", "mcp.platform"],
  "denied": [{ "capability": "mcp.temporal", "reason": "not_granted" }] }
```

Resolved by the existing `AppAccessService.get_effective_access` — no parallel authz system.
Both transports call it: stdio on session start, HTTP per session. `tools/list` returns only
permitted tools, so the model never burns turns on calls that will 403.

**Defence in depth:** `tools/call` re-checks server-side. Filtering the list is an ergonomics
optimisation, never the gate — a client that ignores `tools/list` still gets a 403.

**3d. Token scoping.**

Add to `api_tokens` (migration `backend/scripts/migrate_mcp_capabilities.sql`):

| Column | Type | Meaning |
|---|---|---|
| `scopes` | `jsonb` null | Subset of the developer's capabilities. `null` = everything they have. Never a superset. |
| `token_kind` | `varchar(16)` | `personal` \| `oauth` |
| `client_id` | uuid null | FK → `mcp_oauth_clients` |

Token-create UI at `/settings/api-tokens` gains capability checkboxes, so a read-only CI token
is possible.

**3e. Seeding.**

- `mcp.temporal` seeded `true` for workspace owners and admins only.
- Backfill `backend/scripts/backfill_mcp_capabilities.py`: for every existing member, derive
  non-temporal MCP modules from the apps they already have; leave `temporal` off.
- Admin UI: existing app-access matrix picks up the new modules for free — one row per
  capability, `temporal` visually flagged as privileged.

### WS4 — Client setup, correct and complete

Rewrite the `clientSetup` section of `page.tsx` as six tabs, each with **both** a local (stdio)
and a remote (HTTP) variant once WS2 lands:

`Claude Code` · `Claude Desktop` · `ChatGPT` · `Codex` · `Cursor / VS Code` · `Other`

Concrete corrections (see §1.2). Recommended snippets after WS2:

```bash
# Claude Code — remote, one line
claude mcp add --transport http aexy https://api.aexy.io/mcp
```

```jsonc
// Claude Code / Cursor — local stdio, .mcp.json at project root
{ "mcpServers": { "aexy": {
    "command": "uvx", "args": ["aexy-mcp@latest"],
    "env": { "AEXY_API_URL": "https://api.aexy.io/api/v1",
             "AEXY_API_TOKEN": "${AEXY_API_TOKEN}" } } } }
```

```toml
# Codex — ~/.codex/config.toml
[mcp_servers.aexy]
command = "uvx"
args = ["aexy-mcp@latest"]
env = { AEXY_API_URL = "https://api.aexy.io/api/v1", AEXY_API_TOKEN = "..." }
```

ChatGPT: Settings → Connectors → Create, URL `https://api.aexy.io/mcp`, OAuth completes in
browser. No token pasting.

Also on the page: render the caller's **actual** capabilities from `/mcp/capabilities`, so a
developer sees which tools they will get before they wire anything up, and why `temporal` is
missing.

### WS5 — Documentation

- `docs/mcp.md` — new, following the shape of `docs/crm.md` / `docs/ai-agents.md`: what MCP is,
  the six client setups, the tool catalog **generated from the manifest**, the capability model,
  the temporal grant, troubleshooting.
- `docs/guides/mcp-access-control.md` — admin-facing: granting capabilities, scoped tokens,
  reading the audit log.
- `docs/guides/skills.md` — `/aexy_skill`, publishing, the approval workflow.
- Register all three in `docs/README.md` and `frontend/public/docs/index.json`, and mirror into
  `frontend/public/docs/` (the existing duplication convention).
- `frontend/scripts/generate-mcp-doc.js` regenerates the tool-catalog section of `docs/mcp.md`
  from the manifest, in `prebuild`. The prose is hand-written; the table is not.

### WS6 — Tool coverage

31 tools against 120 routers, but **one tool per router is the wrong target** — a 120-tool
surface degrades model selection badly. Keep the existing resource-oriented shape (one tool per
domain, `action` parameter) and close the domain gaps:

| New tool | Covers |
|---|---|
| `aexy_people` | developers, org chart, departments, directory |
| `aexy_reviews` | performance reviews, feedback, goals |
| `aexy_leave` | leave requests, balances, calendar |
| `aexy_tracking` | standups, blockers, time tracking |
| `aexy_oncall` | rotations, escalations, incidents |
| `aexy_uptime` | monitors, checks, status pages |
| `aexy_forms` | forms, submissions |
| `aexy_booking` | booking pages, appointments |
| `aexy_learning` | courses, paths, progress |
| `aexy_chat` | channels, messages, topics |
| `aexy_search` | cross-module search |
| `aexy_skill` | §WS7 |

Takes the surface to ~43 tools — near the practical ceiling, which is why the long tail should
be reached through the **existing `aexy_api` escape hatch** instead of new tools. Upgrade it
with an `aexy_api_discover` companion that queries the backend OpenAPI schema, so an agent can
find and call any of the 120 routers without us minting a tool for each.

Every new tool declares its `capability` in the manifest; WS1's parity test refuses any tool
whose capability has no matching module.

### WS7 — `/aexy_skill load` and `/aexy_skill search`

**How the slash command actually appears.** MCP prompts surface in Claude Code as
`/mcp__<server>__<prompt>`. To get literally `/aexy_skill`, ship both:

1. An MCP **prompt** named `aexy_skill` taking one string argument, parsing `load <name>` /
   `search <term>` / `list` / `publish <path>`. Works in any prompt-aware client.
2. A Claude Code slash-command file `.claude/commands/aexy_skill.md` in the onboarding
   scaffold, so the bare `/aexy_skill` form works too.

Both delegate to MCP **tools**, so non-interactive agents get the same functionality:

| Tool | Behaviour |
|---|---|
| `aexy_skill_search(query, limit=10, source?)` | Ranked hits over approved skills — name, description, source, version, install count. |
| `aexy_skill_load(name_or_id, version?)` | Returns `SKILL.md` as MCP resource content; bundled scripts/assets as resource links. Records a load event. |
| `aexy_skill_list(scope)` | `workspace` \| `approved` \| `pending` |
| `aexy_skill_publish(path, visibility)` | Publishes a local skill into the workspace catalog. |

**Backend.** New models — `Skill`, `SkillVersion` (content-hash keyed, immutable),
`SkillSource`, `WorkspaceSkillApproval`, `SkillLoadEvent`. Router `api/skills.py`, service
`services/skill_service.py`, migration `migrate_skills.sql`. Register models in
`models/__init__.py` (they are not auto-discovered).

**Search.** Postgres `tsvector` over name + description + frontmatter keywords to start; add a
pgvector embedding column in a follow-up once there is a corpus worth embedding. PG18 is already
the target so both are available.

**Capability.** `mcp.skills` module; publishing additionally requires `can_manage_workspace`.

### WS8 — Marketplace curation from the internet

**Ingestion.** `SkillSource` rows are an allowlist of GitHub repos/orgs. Seed:
`anthropics/skills`. A Temporal schedule `skill_catalog_sync` (queue `SYNC`) runs activity
`sync_skill_sources` — crawl, parse `SKILL.md` frontmatter (`name`, `description`, `license`),
upsert a `SkillVersion` per content hash. Add to `ACTIVITY_CONFIG` in `temporal/dispatch.py`
with `STANDARD_RETRY` and a stable `workflow_id` per source.

**Curation pipeline.** `unreviewed → scanned → approved(workspace) → published`.

- `scan_skill_version` activity flags: network egress to non-allowlisted hosts, base64 blobs,
  instructions that name `aexy_*` tools or ask to widen scope, licence absent or non-permissive.
- Findings render in the admin approval UI at `/settings/skills`, next to a full diff of the
  skill body. Approval is per workspace, per version — a new upstream version re-enters review
  rather than auto-updating.

**The trust rule, non-negotiable.** A skill's text is **data**. It never widens the caller's
capability grant. Capability is resolved server-side per `tools/call` from
`AppAccessService`, so a skill that instructs the agent to call `temporal_signal_workflow` gets
a 403 from a caller without `mcp.temporal`, exactly as if the skill had said nothing. WS3's
defence-in-depth check is what makes WS8 safe to build at all — the ordering below is not
negotiable.

**Attribution.** Store `source_url`, `license`, `upstream_commit` per version; surface them on
load. Skip any source without a licence we can honour.

---

## 4. Sequencing

| Phase | Contents | Why here |
|---|---|---|
| **0** | WS1 manifest + parity; WS5 `docs/mcp.md`; WS4 corrected stdio instructions incl. Claude Desktop, Cursor, VS Code | Pure docs/tooling, ships immediately, stops the drift. ChatGPT still absent. |
| **1** | WS3 in full — capabilities as modules, temporal proxied through the backend, `/mcp/capabilities`, token scopes, seeding | **The security fix.** Everything after this depends on capabilities being real. |
| **2** | WS2 remote transport + OAuth 2.1; WS4 remote tabs; ChatGPT + Claude Desktop connectors | Unblocks the two clients named in the request. |
| **3** | WS6 twelve new tools + `aexy_api_discover` | Coverage, now that every tool has a grant to declare. |
| **4** | WS7 `/aexy_skill` over a workspace-local catalog + an Anthropic-official seed set | Useful on its own before any crawling exists. |
| **5** | WS8 crawler, scanner, approval UI | Last, because it is only safe on top of Phase 1. |

Phase 1 before Phase 2 matters: shipping a remote endpoint while `AEXY_ENABLE_TEMPORAL` is still
the only gate would put self-asserted workflow-termination on the public internet.

---

## 5. Risks

- **OAuth 2.1 + DCR is the hard part.** ChatGPT and Claude Desktop are strict about metadata
  discovery and will fail with unhelpful errors. Budget real time; test against both connector
  UIs early rather than against a spec document.
- **Well-known routes escape `/api/v1`.** Mounting them needs a change in `main.py` outside the
  versioned prefix, plus whatever ingress sits in front in production.
- **Tool-count ceiling.** 43 tools is workable; each further addition costs selection accuracy
  for every call. Route the long tail through `aexy_api` + `aexy_api_discover`.
- **Manifest pinning.** A stale pin means the page under-reports tools; a floating pin makes
  builds non-hermetic. Pin by version, commit the fetched file, bump deliberately.
- **Crawled skills are an injection surface.** Mitigated by Phase 1 ordering, per-workspace
  approval, per-version re-review, and server-side capability checks that no skill text can
  influence.
- **`api/mcp.py` vs the frontend route group.** The frontend already owns `/mcp`; the backend
  endpoint is `/api/v1/mcp` plus a root-level `/mcp` for remote clients. Confirm the production
  ingress routes these to the right service before Phase 2 ships.
