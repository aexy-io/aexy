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

Stages are marked with the commit that built them. All nine are built. Items inside a stage that
were *not* delivered are called out in place under **Not delivered**, so a stage marked built
never implies more than it shipped — and what is left is legible without reading the diffs.


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

#### Decision: `ProposedChange` — argued against, then built (`9b29ce49`)

Worth recording as a reversal rather than quietly rewriting, because the
reasoning that changed is the useful part.

**The argument against.** The two gates do not review the same kind of thing. The content gate
reviews a *result*: prose exists, diff it against the page. The policy gate fires *before
execution*, so there is nothing to review but the request — running the call to find out what
it would produce is exactly what the gate prevents. Two different things, two tables.

**Why that was only half right.** The objection was really to a *shape*: eighteen kind-specific
columns, half null on every row, with a discriminator telling you which half to ignore. Putting
the kind-specific part in one JSONB `payload` removes that entirely. What is left — who asked,
when, what for, what was decided — is genuinely common to both. Six shared columns and no nulls
per kind is a different proposition from twenty-four columns and eight nulls, and the pre- vs
post-execution distinction survives untouched as `kind`.

**What it bought.** One queue, one lifecycle, one place to add a third kind, and a review inbox
that is a query rather than two lists merged in the client. The document queue moved without
changing: `ProposedEditsService` keeps its own vocabulary and translates at the boundary, with
read aliases on the model, so no caller and no test moved — which is what proves the move was
behaviour-preserving.

**What it cost.** A data migration on the one queue in this area that already worked. Both
source tables are copied rather than dropped so a rollback is a deploy rather than a restore;
that debt is recorded under *Owed* below.

### Stage 1b — One inbox, and a UI for held actions **(built — `9b29ce49`, `ed9acb0e`)**

Before this there were two queues and only one had a screen: clearing a blocked agent action
meant making an HTTP request by hand.

- **One endpoint returning both kinds.** A `review_items` read model over `proposed_changes`,
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
  discovers the right workflow instead of inventing one. **Since delivered** (`1b45f2a1`, extended
  in `a20c5df2`): four named tools — `aexy_docs_needing_update`, `aexy_docs_merged_changes`,
  `aexy_docs_propose`, `aexy_docs_create_from_code` — each declaring its real payload rather than
  `body: object`. Guarded against the real catalogue, because all three of the originals were
  declared wrong at first and a named tool that resolves to nothing is silently withheld: absent
  looks exactly like not-granted.
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
- A readable text diff replacing the two `JSON.stringify` views (F8).
- Per-document mode, which is stage 1's per-record override surfaced here.

**Not delivered by those commits, both since built:**

- Staleness dot in the sidebar tree — `f47cffcd`.
- The review inbox, grouped by the change that caused it, with approve-all, and the triggering
  commits shown above the diff — `f47cffcd`, once trigger context was recorded on the proposal
  (the commit, the pull request and the changed paths), which stage 4 called for and did not
  deliver, so until then there was nothing to group by.

### Stage 7 — Whole-repository generation **(built — `aeb455bb`)**

Reshaped once whole-repo generation moved to the CLI. The recursive traversal, ignore rules,
module segmentation and per-module context budget all belonged to a server that did not have the
files; an agent in the working tree has read them, so none of it was built.

What the server keeps is what the agent cannot do:

- `from-repository` accepts `markdown`, so prose the caller wrote is converted, linked and
  filed without the server generating or paying for anything.
- `parent_id`, so a repository becomes one parent and a child per module — a later change to one
  directory then revises one document instead of rewriting the world.
- A safe re-run: a path already documented gets a proposal against its existing document rather
  than a second near-duplicate. Without `markdown` it refuses and names the document.
- The named MCP tool spells the multi-call shape out, because an agent inferring it from an enum
  infers a different one each time.

**Since delivered (`4b4a3449`)** — the fan-out came back, in the browser rather than the server.
"Document every module" reads the repository tree, drops build output and tooling (mirroring the
sync layer's noise filter), shows a file count per module, and then runs one existing
`from-repository` call per module, sequentially, under one parent. That is the scope screen, the
per-module retry, and the onboarding path for a customer with no coding agent — all three, over an
endpoint that already existed.

**Deliberately not delivered:** the cost estimate. Modules differ in size by an order of magnitude
and the price depends on the configured model, so the figure would be invented — and an invented
number people plan against is worse than none. The screen states the document count and the model
call count instead, which are facts.

### Stage 8 — One GitHub relationship per document **(built — `6e8c8ddd`, `876a83c7`)**

- Shared `resolve_repository_access`, used by code links, GitHub sync, interactive generation
  and background sync alike. Fixed a real bug in passing: `github_sync_service` unpacked
  `(token, installation_id)` backwards in both its export and import paths, so publishing a
  document to GitHub had never worked.
- One "Connected to GitHub" section on the document, showing both directions — the source it
  was written from and the file it publishes to.
- Skip commits matching `last_export_commit`, so a document's own export cannot trigger its
  regeneration.

**Since delivered (`8172b6e6`)** — `GitHubSyncPanel` opens from the provenance strip, so the export
direction is editable and can be set up in the first place, and its form is pre-filled from the code
link: the repository a document was written from is overwhelmingly the one it publishes back to. The
pre-fill survives the post-save reset, because "add another sync" on the same document is still the
same repository.

**Remaining boundary:** a hand-written document with no code link has no doorway to publishing, since
the strip is what carries it. Linking to code first is the path, and keeping one place for the whole
GitHub relationship is why the panel was orphaned in the first place.

### Stage 9 — Discovery and language **(built — `876a83c7`)**

- "Document this" on each adopted repository in settings, opening the docs generator with that
  repository already selected.
- "Link to code" in the editor toolbar, mounting `CodeLinkPanel` — 433 lines that had never
  been reachable, and the only way a hand-written page could be connected to the code it
  describes.
- `GenerationPanel` deleted rather than wired: all three of its modes had live equivalents, and
  its improve mode only ever logged to the console. `suggest-improvements` therefore has no UI,
  deliberately.
- `messages/{en,hi}/docs.json` and `useTranslations` for everything added.

**Since delivered (`a20c5df2`)** — "Recently merged" on the docs page, plus `aexy_docs_merged_changes`
beside the stale-document tool. A work list rather than a button in a pull request view: there is no
pull request view to put a button in, and a list gets worked whereas a button only helps whoever
happens to be looking. "Document this" opens the generator with the repository chosen and the change
named.

It makes no claim about whether a change is already documented — `pull_requests` does not store the
files a change touched, so the badge would be a guess, and a wrong "already documented" is the one
that stops somebody writing. What it says instead is honest: this repository has no documentation at
all, when that is true.

**Also delivered (`ad607806`)** — `suggest-improvements` has a UI after all. Quality score,
prioritised issues, sections it expected and did not find, and per-suggestion Apply that queues a
proposal rather than editing the page: a suggestion is a model's judgement about prose a person
wrote, which is exactly the kind of change that should be diffed and approved. Run behind an explicit
button, because a page that spends a model call on open is a page people stop opening.

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

## Owed

- **Drop `document_proposed_edits` and `agent_pending_actions`.** Copied into
  `proposed_changes` rather than dropped, so a rollback stays a deploy rather than a restore.
  Due once the shared table has carried a release: no code reads either table today, and
  `document_proposed_edits` holds the only review history these workspaces have, which is the
  reason to wait rather than to keep waiting indefinitely.
- **Browser coverage for the repository file picker.** Verified by unit tests only; browsing a
  repository tree is a live GitHub App call, so file selection and the "doc type only for
  files" behaviour cannot be exercised locally without an installation.
- **A browser pass over everything after `1b45f2a1`.** The grouped review inbox, the staleness
  dot, the trigger paths, the publishes-to line, "Document this" and "Link to code" have never
  been rendered. The one pass that did run found a control that could not appear at all, and
  two later commits shipped things that resolved to nothing until a test caught them — so this
  is the highest-value outstanding work, not a formality. Now also covering the improvements
  panel, "Recently merged", the sync-configuration panel and the whole-repository scope screen.
- **An unmapped-tag gate that actually runs.** `feedback`, `feedback_admin` and `mcp_oauth` had
  no capability before this branch, and because the dump script refuses to write while any tag
  is unmapped, they had frozen the catalogue fixture for every router that landed after them —
  which is how two tool-surface assertions came to pass only because the fixture was stale.
  `a20c5df2` maps them and regenerates, but nothing prevents the next one: whatever was meant to
  run `--check` in CI evidently does not.

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
