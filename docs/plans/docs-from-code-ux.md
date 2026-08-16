# Docs from code — UX review and plan

Scope: the generation experience, multi-file and whole-repository generation, and the
experience of documents keeping up with code.

## The chain, and where it is cut

The product is a loop: generate a document from code → the code changes → the document
notices and proposes an update → a human approves. Every part of that loop exists in the
backend. The loop is cut in **five** independent places, any one of which is enough to
stop it dead.

| # | Break | Evidence |
| --- | --- | --- |
| 1 | Generation never creates a code link | [page.tsx:291](../../frontend/src/app/(app)/docs/page.tsx:291) has repo, branch and path, calls `createDocument`, never `createCodeLink`. No UI anywhere calls it — `CodeLinkPanel.tsx` (433 lines) has zero importers. |
| 2 | Nothing tells Docs that code changed | `handle_code_change` ([document_sync_service.py:188](../../backend/src/aexy/services/document_sync_service.py:188)) has **zero callers**. The push webhook parses commits and delegates only to `ingest_commits` ([webhook_handler.py:188](../../backend/src/aexy/services/webhook_handler.py:188)). |
| 3 | The batch tier never runs | `process_document_sync_queue` is registered on the worker ([worker.py:78](../../backend/src/aexy/temporal/worker.py:78)) but has **no entry in `schedules.py`**. Pro-tier daily sync never fires. |
| 4 | The background regeneration call cannot succeed | `_generate_and_propose` passes a bare `GitHubAppService` where a `GitHubService`-shaped object is expected ([document_sync_service.py:362](../../backend/src/aexy/services/document_sync_service.py:362)). `generate_from_repository` then calls `get_file_content(repository_full_name, path, branch)` — three positional args — against a method whose signature is `(installation_id, owner, repo, path, ref)` ([github_app_service.py:458](../../backend/src/aexy/services/github_app_service.py:458)). The API path wraps it in `GitHubServiceAdapter` for exactly this reason; the background path does not. The `TypeError` is swallowed and logged as a generic failure. |
| 5 | A proposal is only findable inside its own document | `list_proposed_edits` is per-document ([documents.py:1797](../../backend/src/aexy/api/documents.py:1797)). No workspace-level view. |

Break 1 was in the previous draft. Breaks 2–4 mean that even after fixing it, nothing would
happen. Break 5 means that even after fixing 1–4, nobody would find the result.

What *is* solid and worth building on: `ProposedEditsService` supersedes stale proposals,
computes a section-level `diff_summary`, and notifies the document owner through the real
notification bell with a per-user preference ([proposed_edits_service.py:139](../../backend/src/aexy/services/proposed_edits_service.py:139)).
That layer is well made. It has nothing feeding it.

## Findings

### F1 — Generation discards the link (break 1)

See table above. In production `document_code_links` is empty, so every document is
permanently unlinked, `SyncStatusPanel` never renders (it is gated on `hasCodeLinks`,
[[documentId]/page.tsx:147](../../frontend/src/app/(app)/docs/[documentId]/page.tsx:147)), and the
feature is a one-shot text generator. Same shape as the dead `TemplateSelector` in #258:
complete machinery, no doorway.

### F2 — "Whole repository" today reads one directory level

`generate_module_documentation` calls `get_directory_contents` — **non-recursive** — then
fetches only files passing `_is_key_file`, truncates each to **2000 characters**, and passes
bare filenames for everything else
([document_generation_service.py:230-263](../../backend/src/aexy/services/document_generation_service.py:230)).

Pointing it at a repository root produces a document written from a list of file names plus
the first 2 KB of the README. That is the real reason the output feels thin, and it is the
substance of the multi-file ask: this is not a scale problem to be solved by looping, it is
a missing traversal and context-budget design.

### F3 — Source code travels in the URL query string

[api.ts:7125](../../frontend/src/lib/api.ts:7125) posts with `params: { code }` against
`code: str = Query(...)` ([documents.py:1021](../../backend/src/aexy/api/documents.py:1021)). A
200-line file puts ~8 KB in the request line — the default ceiling in nginx and uvicorn's h11
limits — and the 414 surfaces as `alert("…Please try again.")`, which cannot work because the
input is the problem. The code also lands verbatim in access logs and browser history.
`custom_prompt` rides the same way.

### F4 — In repo mode, most controls are inert

The doc-type select ([page.tsx:697](../../frontend/src/app/(app)/docs/page.tsx:697)) posts
`template_category`, which the endpoint declares deprecated and ignores — it always produces
module docs ([documents.py:1114](../../backend/src/aexy/api/documents.py:1114)). Files are
simultaneously un-clickable ([page.tsx:741](../../frontend/src/app/(app)/docs/page.tsx:741)), so
"Function Documentation" is unreachable by construction.

### F5 — Errors are destroyed at the boundary

The backend distinguishes 403 "No GitHub App installation found. Please install the app
first." ([documents.py:1163](../../backend/src/aexy/api/documents.py:1163)), 429, and 503
([documents.py:1213](../../backend/src/aexy/api/documents.py:1213)). The frontend collapses all of
it into one `alert()` reading "Please try again", wrong advice for three of the four. The rest
of Docs uses `toast`.

### F6 — Blocking request, no progress, no cancel, no recovery

Generation runs inline in the request handler
([documents.py:1180](../../backend/src/aexy/api/documents.py:1180)). Close the tab or hit a gateway
504 and the work and the LLM spend are gone. This was a nice-to-have while the unit was one
file; with whole-repo it is a hard prerequisite.

### F7 — No preview before the document exists

Content is committed unread ([page.tsx:274](../../frontend/src/app/(app)/docs/page.tsx:274)), while
`/{document_id}/generate` was deliberately changed in 0.8.26 to route through the proposed-edit
queue, its docstring calling direct overwrite "user-hostile (no preview, no rollback short of
version history)" ([documents.py:896](../../backend/src/aexy/api/documents.py:896)). The judgement
was made for regeneration and never applied to first generation.

### F8 — The review UI shows raw TipTap JSON

Two of `ProposedEditReview`'s three modes render `JSON.stringify(proposed_content, null, 2)`
([:133](../../frontend/src/components/docs/ProposedEditReview.tsx:133),
[:152](../../frontend/src/components/docs/ProposedEditReview.tsx:152)) and the "Current" column is
the literal string "(use editor view to see current document)"
([:145](../../frontend/src/components/docs/ProposedEditReview.tsx:145)). This is the only gate
protecting a document from an automated rewrite, and it asks the reviewer to read a JSON dump
against nothing.

### F9 — Nothing checks the generated content is a TipTap document

`_parse_llm_json` returns whatever parses
([document_generation_service.py:150](../../backend/src/aexy/services/document_generation_service.py:150)).
`{"title": …, "sections": […]}` is valid JSON and an invalid document. #258 established the
cost: an invalid node makes TipTap render an entirely blank page. Saved first, discovered later.

### F10 — Dead better implementations, and smaller things

`GenerationPanel.tsx` (374 lines, per-mode inline errors, auto-detect language) and
`CodeLinkPanel.tsx` (433 lines) both have zero importers, and the live modal is the weaker of
the three. `suggest-improvements` has a complete backend whose only caller `console.log`s the
result ([GenerationPanel.tsx:100](../../frontend/src/components/docs/GenerationPanel.tsx:100)). No
entry point from the repository or PR side. The docs module has zero `useTranslations` outside
`drive/`, against the rule in CLAUDE.md.

### F11 — The pipeline authenticates and bills as a person, and people leave

Three separate couplings to an individual:

- **Credentials.** Every GitHub access in Docs resolves an installation through
  `GitHubConnection.developer_id == developer_id`
  ([github_app_service.py:292](../../backend/src/aexy/services/github_app_service.py:292)). There is
  no repository- or workspace-scoped resolution. When that person's connection is removed or
  their installation deactivated, every document sourced through them loses its credentials.
- **Plan tier.** `handle_code_change` reads the sync tier from `document.created_by_id`
  ([document_sync_service.py:245](../../backend/src/aexy/services/document_sync_service.py:244)) —
  a different fact from "who set up this sync", and after a whole-repo run one person's tier
  governs an entire repository's documentation.
- **Spend.** The background path passes no `developer_id` into `gateway.analyze`
  ([document_sync_service.py:361](../../backend/src/aexy/services/document_sync_service.py:362)),
  so automated LLM cost is attributed to nobody, while the interactive paths attribute
  correctly.

There is no owner field on `DocumentCodeLink` at all, so there is currently nothing to
transfer even if a transfer existed.

### F12 — Every code change triggers a full rewrite, from scratch

`_generate_and_propose` calls `generate_from_repository`
([document_sync_service.py:362](../../backend/src/aexy/services/document_sync_service.py:362)) — it
re-reads the source and regenerates the whole document, discarding both the existing document
and all knowledge of what actually changed.

The incremental path already exists: `update_documentation(existing_doc, old_code, new_code,
changes_summary)` with a dedicated `DOC_UPDATE_PROMPT`
([document_generation_service.py:294](../../backend/src/aexy/services/document_generation_service.py:294)).
Only `apply_suggestion` uses it, and that caller passes empty strings for both code arguments
([documents.py:1308](../../backend/src/aexy/api/documents.py:1308)). The code-change path — the one
that actually has an old version and a new version — does not use it at all.

Two further defects in the same path: `regenerate_document` hardcodes
`TemplateCategory.FUNCTION_DOCS` ([document_sync_service.py:437](../../backend/src/aexy/services/document_sync_service.py:436)),
so regenerating a module document silently converts it into function docs; and
`handle_code_change` overwrites `link.last_commit_sha` with the *new* commit at flag time,
destroying the only record of what the document was generated from — so there is no base to
diff against even if we wanted one.

### F13 — Two GitHub relationships, no shared plumbing

`DocumentCodeLink` (document ← source path it documents) and `DocumentGitHubSync` (document →
a Markdown file in the repo, export/import) are different relationships that carry the same
three facts: repository, branch, path. They share no credential resolution, no webhook
handling and no UI. `GitHubSyncPanel` (622 lines) is also unmounted, so a document can have
either relationship configured only by an API call, and configuring one tells the other
nothing.

### F14 — MCP writes are permission-checked but ungoverned

`McpToolExecutor` re-enters the app over ASGI with a scoped token, so every endpoint runs its
own auth, workspace membership and app-access checks — that design is right, and the docstring's
reasoning about not building a second access model is sound.

But it never consults `AgentPolicyEngine`. The governance layer already exists —
`TOOL_BLOCK`, `TOOL_REQUIRE_APPROVAL`, `FIELD_RESTRICTION`, `RATE_LIMIT`, `TOKEN_BUDGET`, a
`REQUIRE_APPROVAL` decision type, `notify_approval_required`, and an immutable
`AgentPolicyDecision` audit log ([agent_policy.py:14](../../backend/src/aexy/models/agent_policy.py:14)).
It is evaluated in exactly one place, `agent_service.py`, and it is bolted to CRM agents by
foreign key (`crm_agents.id`, `crm_agent_executions.id`).

So the path we are about to hand to external coding agents has permissions but no approval
requirement, no field restrictions, no token budget, no rate limit and no decision audit. The
gate is built. It is wired to one module and not to the door everyone is about to walk through.

---

## The split

**Aexy is the system of record. The agent is the writer.**

| | Runs where | Pays | Why there |
| --- | --- | --- | --- |
| Detection — what changed, what is now behind | Aexy | ~nothing (compare API + path matching, no LLM) | Only Aexy knows which documents claim which paths |
| Governance — may this actor write, and who approves | Aexy | nothing | It is the record; the gate cannot live on the client |
| Review — diff, approve, reject, history | Aexy | nothing | Same |
| Generation — writing the prose | The developer's agent, over MCP | the customer's existing agent subscription | The working tree is already in its context |

The cost saving is real but it is the second-best argument. The first is that generation from a
working tree is simply better than generation from a file list and 2 KB of truncated README
(F2), and it deletes the traversal, context-budget and installation-token work that the
server-side path would otherwise need.

What this does **not** solve: noticing. A tool only fires when a human invokes it, and that is
precisely the discipline that fails today. So detection, staleness and the review queue stay
server-side and become the product, rather than the plumbing under a generator.

## Two gates, one inbox

Everything below rests on separating these:

- **Policy gate** — *pre*-execution. May this actor call this tool, on this field, within this
  budget? `AgentPolicy` already models it; it just needs to be evaluated in the MCP executor.
- **Content gate** — *post*-generation. Does a human approve this change to the record?
  `DocumentProposedEdit` already models it, for documents only.

A write can pass the first and still wait on the second.

They are separate records, not one generalised table — the first reviews an *intent* and the
second a *result*, and the reasoning is recorded under stage 1. Both feed one review inbox,
which is a read-layer concern rather than a storage one; stage 1b is where that convergence
lives.

---

## Plan

Stages are marked with the commit that built them. Stage 1b is the outstanding piece of
stage 1 — the part that was traded away when `ProposedChange` was rejected, and the largest
user-facing gap in the area today.


### Stage 1 — The review gate **(built — `b1cad54d`, `de035aa1`)**

First, because everything after it writes through it.

- **Evaluate `AgentPolicy` inside `McpToolExecutor.call`**, before the ASGI re-entry (F14).
  Decouple the policy foreign keys from `crm_agents` so an MCP session is a valid actor, and
  write every decision to the existing `AgentPolicyDecision` audit log.
- **A `REQUIRE_APPROVAL` decision queues the call rather than refusing it.** The engine could
  only ever say no, and a refusal an agent cannot act on is a dead end.
- **Three modes, overridable per record**: auto-apply, propose (default), off. Graded by blast
  radius. A gate that blocks high-volume classification is switched off wholesale, which is
  worse than a graded one. Shipped for documents as `DocumentSyncMode`.
- **Reads are never gated.** A gate that made an agent ask permission to look something up
  would be switched off within a week and take the write gate with it.

#### Decision: `ProposedChange` was considered and rejected

The original plan here read *"generalise `DocumentProposedEdit` into `ProposedChange`"* — one
table with `entity_type` / `entity_id`, so any module could register as a governed entity and
one queue would hold everything. It was not built, and the reason is worth keeping because
otherwise it gets proposed again.

**The two gates do not review the same kind of thing.** The content gate reviews a *result*:
generation ran, produced prose, and a human compares it to the page. The policy gate fires
*before execution*, so there is no proposed content — the call has not run, and running it to
find out what it would produce is exactly what the gate prevents. The only thing that can be
stored is the request, replayed verbatim on approval.

That shows up in the columns. `DocumentProposedEdit` and `AgentPendingAction` share six —
`id`, `status`, `reason`, `reviewed_by_id`, `reviewed_at`, `created_at` — against eight and ten
that are disjoint. A merged table is 24 columns where every row leaves 8 or 10 null and the
discriminator tells you which half to ignore, plus a data migration on the one queue in this
area that already worked (supersede-on-create, stale detection, owner notification) in exchange
for no behaviour it did not already have.

**Revisit when a second *content-review* consumer appears** — an AI proposing new content for a
CRM record or a workflow definition, where a human diffs before and after. Two tables of
genuinely the same shape is when generalising pays. One pre-execution consumer and one
post-generation consumer is not that case.

Until then the convergence belongs at the **read** layer, not in storage — see stage 1b.

### Stage 1b — One inbox, and a UI for held actions

The cost of the decision above, paid down. There are currently two queues and only one of them
has a screen:

- `/docs/review` renders document proposals with a readable text diff.
- `/workspaces/{id}/agent-actions` holds tool calls an agent is blocked on, and is API-only —
  clearing one today means making an HTTP request by hand.

That is the fragmentation the single-table plan was trying to avoid, and it does not need a
single table to fix.

- **One endpoint returning both kinds.** A `review_items` read model over the two tables,
  each item carrying a `kind` (`document_proposal` / `agent_action`) and a common envelope:
  who asked, when, why it is waiting, and a one-line summary.
- **One page renders both**, with a per-kind body: documents keep the diff; a held action shows
  the operation, its arguments and the policy that stopped it, in plain language — "an agent
  wants to update 3 CRM contacts" rather than a JSON payload, which is the same mistake the
  document diff made before it was fixed.
- **Approve and reject in place**, including approve-all within a group. A held action replays
  as the developer who requested it, never the approver — approval is permission to proceed,
  not a way to lend someone your access.
- **A count where people already look**: the sidebar entry, so the queue is discoverable
  without visiting it. A queue nobody opens is the failure mode this whole area keeps running
  into.
- **Empty state that explains the mechanism**, because for most workspaces this page is empty
  until the day it suddenly is not, and arriving at an unexplained queue of blocked robot
  actions is its own kind of alarming.
- Translations in both locales, per CLAUDE.md.

### Stage 2 — The docs write contract over MCP **(built — `9e516800`)**

- **Purpose-built tools** beside the generic `aexy_call`: list documents behind their code,
  fetch a document with its provenance, propose an update, create a document from a path *with
  its code link*. The generic proxy can already do most of this; named tools exist so an agent
  discovers the right workflow instead of inventing one.
- **Markdown in, server converts.** Do not accept raw TipTap JSON from clients. Convert and
  validate server-side and reject on failure — which also closes F9 permanently, for every
  writer, rather than patching the one generation path.
- **Writes to a linked document land as proposals** through stage 1, never as direct writes.
- **Attribution**: proposals carry "via <human>'s agent", or the review inbox cannot tell a
  colleague's edit from a robot's.

### Stage 3 — Linked by construction **(built — `c1632d81`)**

Unchanged in substance and still required: the code link is the join that detection runs on,
whoever writes the prose.

- `code` and `custom_prompt` into the request body (F3).
- One operation that creates document *and* code link in a single transaction — reachable from
  the UI and from MCP.
- File selection allowed; doc-type control shown only where it is honoured (F4).
- `toast.error(getApiErrorMessage(...))` instead of `alert()` (F5).

### Stage 4 — Detection, and ownership that survives departure **(built — `82b06df3`)**

Breaks 2, 3, 4 and F11. This is now the core product rather than plumbing.

- Call `handle_code_change` from the push webhook's push branch.
- Add the missing `process_document_sync_queue` schedule entry.
- Fix break 4 — wrap the background GitHub client in `GitHubServiceAdapter` — with a test that
  asserts the outcome, since the current `TypeError` is swallowed.
- `_path_matches_link` gets tests over directory links, file links, renames and deletions.
- Add `owner_developer_id` to `DocumentCodeLink`; there is no owner field today.
- **Resolve credentials by repository first, owner second**, so departure is not fatal.
- Transfer on deactivation, notify the new owner, allow manual transfer. Proposed default
  recipient: the workspace owner, overridable per workspace.
- Read the sync tier from the sync owner, and attribute background spend to them.

### Stage 5 — Cheap precision **(built — `8fa10db2`)**

Under the split this is less about the LLM bill and more about the nudge being worth reading:
"three sections reference the function you changed" beats "something changed".

- Split `last_commit_sha` into `last_synced_commit_sha` and `last_seen_commit_sha` — the
  current single field is overwritten at flag time, destroying the base (F12). Migration.
- Fetch the compare between the two SHAs, scoped to the link's path.
- **Stop before any LLM call** when nothing relevant changed, or only whitespace, comments or
  lockfiles. Most pushes are irrelevant to most modules; this filter is the bulk of the saving
  on whatever generation stays server-side, and it is what keeps the agent from being pinged
  about nothing.
- Batch by push, not by link.
- Where server-side generation does run, use `update_documentation` with the patch rather than
  regenerating from scratch, and fix the hardcoded `FUNCTION_DOCS` category.

### Stage 6 — Make "in sync / behind" visible **(built — `1b45f2a1`, `de035aa1`)**

- Provenance strip under the title: `backend/src/aexy/services · main · in sync as of a1b2c3d`,
  or `3 commits behind` — plus the owner and a transfer action.
- Staleness dot in the sidebar tree.
- The review inbox from stage 1, grouped by the change that caused it, with approve-all.
- A readable text diff replacing the two `JSON.stringify` views (F8), with the triggering
  commits and changed paths above it.
- Per-document mode, which is stage 1's per-record override surfaced here.

### Stage 7 — Server-side generation, as the fallback it now is **(not started)**

Much smaller than in the pre-split plan. It exists for the two cases MCP serves worst.

- **Onboarding**: a new customer documenting a repository on day one should not have to sit
  through a long agent session. Keep whole-repo generation server-side, on Temporal, with the
  scope screen — modules found, documents to be written, estimated time and spend, editable
  exclusions — and per-module retry.
- **Non-agent users**: a PM asking for a document has no coding agent.
- The recursive traversal, ignore rules, module segmentation and per-module context budget are
  still needed *here*, but only here, and they no longer gate the main flow.
- Rate-limit or tier-gate it honestly: it is the most expensive action in the product.

### Stage 8 — One GitHub relationship per document **(not started)**

- Shared `resolve_repository_access` from stage 4, used by code links and GitHub sync alike.
- Adding a code link to a document that already has a GitHub sync pre-fills repo and branch.
- One "Connected to GitHub" section showing both directions.
- One push delivery, two consumers.
- Skip commits matching `last_export_commit`, so a document's own export cannot trigger its
  regeneration.

### Stage 9 — Discovery and language **(not started)**

- "Document this" from the repository view and from a merged PR.
- "Generate from code" in the document header.
- `GenerationPanel`'s improve mode wired to `suggest-improvements`, or deleted.
- `messages/{en,hi}/docs.json` and `useTranslations` across the module.

## Hazards to name

- **The gate must not become the thing people switch off.** Graded modes and sensible
  per-type defaults are what prevent that; a uniform "approve everything" policy will be
  disabled within a fortnight and take the audit trail with it.
- **Proposal storms.** Grouping by change, batching by push, and the off switch.
- **Hand edits.** `base_content_sha` and the stale-proposal UI already handle this; the batch
  and MCP paths must not bypass them.
- **Client trust.** An MCP write is an assertion by someone else's agent. Markdown-in with
  server-side conversion, the content gate, and the policy audit are the three things standing
  between that and a rewritten wiki.
- **Onboarding cost** stays real, because stage 7 stays server-side. Estimate before, actual
  after.

## Out of scope

Documentation coverage metrics; a scheduled freshness report.

## Verification

- An MCP tool call that a policy marks `REQUIRE_APPROVAL` produces an `AgentPendingAction`
  and an `AgentPolicyDecision` row, and the call never reaches the application at all — a
  gate that ran it and undid it afterwards would satisfy a test that only read the message.
- An MCP write to a linked document never lands directly, regardless of tool used, including
  through the generic `aexy_call` proxy.
- Malformed Markdown from a client is rejected at the boundary; no document is ever saved in a
  state TipTap renders blank.
- A push touching nothing under a link's path produces no proposal and **no LLM call at all**,
  asserted against the gateway.
- The background regeneration path is covered by a test asserting the outcome, which is what
  break 4 needed and did not have.
- Deactivating a sync owner transfers their syncs, notifies the new owner, and regeneration
  still succeeds on repository-scoped credentials.
- Document proposal behaviour is untouched: supersede-on-create, stale detection, owner
  notification. Preserved by not migrating that table at all — see the stage 1 decision.
- Browser: agent proposes an update over MCP → it appears in the inbox attributed to the human
  behind the agent → the diff is readable → approving changes only that document. Check at
  1280px and 375px.

---

## Appendix — where else the split applies

Docs is the first case, not the only one. The test for any other module is narrow:

> **Does the agent hold context Aexy lacks?**

Not "is a human present at authoring time" — that reads as a fit far more often than it is.
For documentation and code analysis the answer is yes: the working tree is in the agent's
context and is exactly what the server-side path cannot reach cheaply (F2). Nearly everywhere
else the expensive context lives in Aexy — its own schemas, catalogues, connected integrations
and stored data — and an external agent would be guessing at what it cannot see, so quality
falls rather than rises.

Evidence base: 27 services under `services/` call the LLM gateway.

### Agent-side generation

| Module | Services | Why it fits |
| --- | --- | --- |
| Docs | `document_generation_service` | The working tree. Deletes the traversal and context-budget work entirely. |
| Engineering intelligence | `code_analyzer`, `commit_analyzer`, code insights | Aexy pulls diffs through the GitHub App and pays to analyse them; the agent has them locally with more surrounding context. Aexy keeps the trend store and history, which is the part that compounds. |
| Knowledge extraction | `knowledge_extraction_service`, repo-derived `file_search_service` | Same argument as docs. |
| Sprints, partially | `task_matcher`, diff-based estimation | Matching work to code is local. Backlog grooming from issue text is not. |

### Server-side, and staying there

| Module | Services | Why |
| --- | --- | --- |
| Automations | `workflow_generator` | The context is Aexy's — trigger catalogue, action schemas, connected integrations, secrets — so an external agent guesses at a schema it cannot see. More importantly a workflow *executes*: unattended, with the workspace's credentials, in a namespace that also holds `secrets` and `webhooks`. Boundary validation catches malformed JSON, not a loop, a mass-send trigger or a webhook aimed somewhere hostile. And the primary author is an ops person with no coding agent. |
| CRM | `contact_enrichment_service`, `competitor_intel_service`, `outreach_personalization_service`, `reply_classification_service` | Input is CRM data plus external sources, not a working tree. Moving it client-side ships customer PII outward for no gain. |
| Hiring | `assessment_evaluation_service`, `proctoring_service`, `question_generation_service`, `soft_skills_analyzer` | Integrity. The candidate's machine cannot grade the candidate, and generated questions reaching a client is an exam leak. |
| Reviews | `review_service`, `contribution_service` | Performance content about a named person; fairness and auditability both argue for keeping it under our control. |
| Service desk, insights | `service_desk_intake_service`, `insights_ai_service`, `predictive_analytics` | No human session at trigger time — a ticket arrives at 3am, analytics run in batch. |
| Learning | `learning_path` | No repo-derived context. |

The agent-side list is short, and that is the honest result: the split pays strongly in one
place — anything derived from a working tree — and is a poor trade nearly everywhere else.

### What every module gains regardless

- **The gate.** With MCP policy evaluation in place (stage 1), any module's writes can be
  governed without touching that module. Automations arguably needs it most: an AI-authored or
  AI-modified workflow should never activate without approval, whoever generated it.
- **Read traffic over MCP.** An agent mid-session asking which sprint task a branch belongs to,
  whether the author is on call, what a ticket actually said, or which documents cover a
  module. Costs nothing, writes nothing, and it is what makes Aexy the thing an agent consults
  rather than a place people file reports. `aexy_discover` already reaches all of it.

### Precondition

Every module exposed over MCP inherits F14 — permissions enforced, governance absent — until
stage 1 lands. The gate is not groundwork to do alongside a broader MCP surface; it comes
first.
