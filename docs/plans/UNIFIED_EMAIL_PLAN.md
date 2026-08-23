# Unified Email — Plan

Status: proposed — **partly superseded by `TEAM_INBOX_PLAN.md`**
Depends on: `feat/gmail-multi-account-v2` (multi-account, exclusions, opt-in sync)

> **Read `TEAM_INBOX_PLAN.md` first.** This plan builds the unified view from
> `/crm/inbox`, which is the weaker foundation: read-only, no reply, no assignment,
> no threading, no internal notes. Service Desk has all five, so the inbox view is
> built there instead (see D2 in that plan).
>
> What survives here: §1.2 (the account-mixing leak, still live and still worth
> fixing), §2.2–2.3 (the label agent and triage), and Phase 4. The mail-client
> track — `SENT` sync, label history, deletes, push — remains the prerequisite for
> putting *personal* mailboxes in Aexy, and is deferred until the shared inbox has
> been used.

---

## 1. Where we actually are

| Thing | Reality |
|---|---|
| Inbox UI | One page, `frontend/src/app/(app)/crm/inbox/page.tsx`, 1027 lines. Reached from CRM only. |
| Thread grouping | **None.** The string "thread" does not appear in that file. Gmail is thread-native, Service Desk threads replies onto tickets, and the inbox shows a flat list of messages. |
| Account scoping | The inbox reads `list_emails`, which is workspace-wide. Since multi-account landed, several people's mailboxes render as one undifferentiated list. |
| Email → CRM | `synced_email_record_links`. Works, from the inbox, manual, person or company. |
| Email → ticket | `service_desk_ingested_messages`, written by **intake only**. Automatic, one-way, Service Desk only. You cannot turn an inbox message into a ticket from the inbox. |
| Email → sprint task | **Does not exist.** No table, no endpoint, no UI. `sprint_tasks` has no email relation of any kind. |
| Labels | `SyncedEmail.labels` is written by sync and never read back to Gmail. There is no code path that creates, applies, or removes a Gmail label. |
| OAuth scopes | `GOOGLE_SCOPES` already requests `gmail.modify` (`api/google_integration.py:110`). Label writes need no new consent — see 2.3 for the exception. |
| Spam | Nothing. `google_sync_exclusion_rules` is the nearest thing: manual, per-address-or-domain, permanent, and it purges. |
| Agent runtime | LangGraph + `BaseAgent`. Four prebuilt agents (`email_drafter`, `lead_scoring`, `sales_outreach`, `data_enrichment`). Tools exist for email (send, draft, history, writing style) and CRM (search, get, update, create, activities). |
| AI classification | Exists, but only inside Service Desk intake — request type, product, auto-split. Not available to the inbox. |

### 1.1 The structural problem, stated plainly

The inbox is **message-shaped and the rest of the product is thread-shaped**.

Service Desk already collapses a reply chain onto one ticket. Gmail hands us `threadId` on
every message and we store it. The opt-in work just added a thread-level permission table.
But the inbox renders messages, so a five-message exchange with one customer appears as five
rows, each individually linkable to a CRM record, none of them aware of the others.

Every feature in this plan gets worse if built on the message. "Convert to ticket" on a
message creates a ticket from one reply. "Label this conversation" applied per-message
diverges from what Gmail shows. The thread is the unit users already think in, and it is the
one the product is missing.

**Phase 1 is therefore thread grouping, and nothing in Phases 2–4 should start before it.**

### 1.2 The account-mixing problem

`list_emails` filters by `workspace_id`. Before multi-account there was one connected
mailbox, so workspace-wide and account-wide were the same thing and the inbox was correct by
accident. They are now different, and the inbox still asks for workspace-wide.

The result: if two colleagues each connect their own mailbox, the CRM inbox shows both
people's mail to everyone in the workspace, interleaved, with no indication of whose is
whose. The exclusion rules mitigate it but do not address it — they are opt-out, and their
whole premise is that some mail should stay out of a shared space.

An `integration_id` filter already exists on the endpoint (added with multi-account). The
inbox does not pass it. **This is the cheapest high-value fix in the plan and it is Phase 1.**

### 1.3 What "unified" should not mean

Not a fourth inbox. Aexy already has: the CRM inbox, the Service Desk ticket queue, and
Gmail itself. Adding a page that is a better Gmail loses — people keep Gmail. The thing
Gmail cannot do is tell you that the sender is a £40k account whose renewal is in three weeks
and who has two open tickets.

So the unified view is not "read your mail here". It is **"this conversation, and everything
Aexy knows about the people in it, and the actions worth taking"**.

---

## 2. The three asks, sized honestly

### 2.1 Unified access — ticket, task, CRM from one place

The pieces are unevenly built. CRM linking works. Ticket creation exists but only via intake.
Task linking does not exist at all.

Work: a polymorphic link table (`email_thread_links`: thread → `crm_record` | `ticket` |
`sprint_task`), a context panel that resolves participants → CRM records → their open
tickets and tasks, and three "create from this thread" actions. The CRM half is mostly
re-pointing existing code at threads.

### 2.2 An agent that manages labels

Cheaper than it sounds, because the scope is already granted and the agent runtime already
exists. It needs Gmail label write tools (`labels.create`, `messages.modify`) — roughly the
`email_tools.py` pattern — plus an agent that proposes a labelling scheme from the threads it
can see and applies it on approval.

The real design question is not technical: **an agent that relabels somebody's personal Gmail
is operating in a space Aexy does not own.** Applying a label is visible in their phone's
mail app forever. This must be proposal-then-approve, never autonomous, and reversible.

### 2.3 Auto spam

The honest framing: this is not spam detection, it is **triage**. Gmail's spam filter is
better than anything we would build. What Aexy can do that Gmail cannot is decide "this is
real mail, but it is not workspace mail" — newsletters, recruiter outreach, personal
correspondence that opt-in mode would have kept out.

That makes it the same decision as the exclusion rules, made by a model instead of by hand.
It should therefore reuse that machinery — including its disclosure and audit — rather than
inventing a parallel one.

**The scope exception:** `connect-from-developer` reuses the developer's existing
`GoogleConnection`, and only checks for `gmail.readonly` + `calendar`. An account connected
that way may not hold `gmail.modify`. `granted_scopes` is stored per integration, so this is
checkable — every label write must check it and degrade to "propose only" rather than
failing at the API call.

---

## 3. Phases

### Phase 1 — Make the inbox honest (foundation, no new features)

1. **Thread grouping.** Group `synced_emails` by `gmail_thread_id`. A thread row shows
   subject, participants, message count, last activity; expanding shows messages. Reuses the
   shape already proven in `GoogleThreadIndex`.
2. **Account scoping.** Pass `integration_id` from an account selector, defaulting to the
   caller's own. This stops the workspace-wide leak in 1.2.
3. **Move and rename.** `/crm/inbox` → `/email` (top-level). It is not a CRM feature once it
   also reaches tickets and tasks.

Ships alone. Fixes a live privacy problem and is a prerequisite for everything below.

### Phase 2 — The context panel and the three links

4. `email_thread_links` — polymorphic, `(workspace_id, gmail_thread_id, target_type, target_id)`
   unique. Migrate `synced_email_record_links` forward rather than keeping two systems.
5. Context panel: participants → CRM records → open tickets, open sprint tasks, recent deals.
   Read-only first; it is useful before any action exists.
6. Actions: create ticket from thread, create sprint task from thread, link/create CRM record.
   The ticket path should reuse `service_desk_intake_service` so a thread-created ticket and a
   mail-created ticket are the same thing.

### Phase 3 — The email agent

7. Gmail label tools: `ListLabelsTool`, `CreateLabelTool`, `ApplyLabelTool`, `RemoveLabelTool`
   — all gated on `granted_scopes` containing `gmail.modify`.
8. `EmailTriageAgent` (LangGraph, `BaseAgent`): reads the thread index, proposes a labelling
   scheme, explains each proposal, applies only on approval.
9. Proposal UI: a queue of "apply label X to these 12 threads because Y" with accept/reject
   per group. Nothing is applied without a click.

### Phase 4 — Triage and rules

10. Classification into workspace / not-workspace, reusing the AI settings and audit that
    Service Desk categorisation already has.
11. Suggested exclusion rules: "you have ignored 40 threads from `noreply@`, exclude the
    domain?" — routed through the existing exclusion machinery so the disclosure and the
    department-head notification still fire.
12. Auto-apply, off by default and per-account, only after 10–11 have been observed being
    right by the person whose mailbox it is.

---

## 4. What could go wrong

| Risk | Handling |
|---|---|
| A unified inbox becomes the fourth place to read mail and nobody uses it | Lead with the context panel, not the message list. If it does not tell you something Gmail cannot, it has failed. |
| Agent relabels somebody's personal Gmail wrongly | Propose-then-approve throughout. Never autonomous in Phases 3–4. Every applied label is reversible and recorded. |
| The workspace sees a colleague's personal mail | Phase 1 item 2 fixes today's leak. Opt-in mode is the stronger answer and already exists. |
| Thread migration loses existing `synced_email_record_links` | Migrate forward in Phase 2, do not run two link systems. A link on a message becomes a link on its thread. |
| `gmail.modify` missing on accounts connected via `connect-from-developer` | Check `granted_scopes` per account; degrade to proposals rather than erroring. |
| Scope creep into "we rebuilt Gmail" | Explicit non-goals: no compose-first UI, no folder management, no offline, no attachment editing. |

---

## 5. Sizing

| Phase | Rough size | Independently shippable |
|---|---|---|
| 1 | Small-to-medium. Mostly re-pointing existing queries. | Yes — and worth shipping alone for the leak fix. |
| 2 | Medium. One migration, one panel, three actions. | Yes |
| 3 | Medium. Four tools, one agent, one approval UI. | Yes |
| 4 | Medium, and the least certain. Depends on 3 being trusted. | Yes, and should be last |

Phase 1 is worth doing whatever happens to the rest of this plan.
