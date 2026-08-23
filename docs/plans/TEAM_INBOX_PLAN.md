# Team Inbox — Plan

Status: proposed
Depends on: `feat/gmail-multi-account-v2`
Supersedes: §3 Phase 1–2 of `UNIFIED_EMAIL_PLAN.md` (see D2)

---

## 1. What this is

A **reusable conversation module**, and an inbox-shaped view over Service Desk as its
first host. Not a new system, not a mail client.

The module is the durable part. It is embedded in the team inbox, the Service Desk
ticket page and the CRM record view, which is why it is keyed on a conversation
rather than on a ticket (D7) — and why its permissions come from the server rather
than from whichever page is rendering it.

The team-inbox capability already exists and is well built. What is missing is the
metaphor: a ticket queue asks *"what is breaching SLA?"*, an inbox asks *"what is
unread?"*. Same rows, different question. Teams who think in mail bounce off the
ticket framing and go back to Gmail, taking the conversation out of the workspace
with them.

## 2. Where we actually are

| Team-inbox capability | Aexy today |
|---|---|
| Shared address several people work | `service_desk_mailboxes`. Several, on different Google accounts, since this branch. |
| Mail becomes a work item | `service_desk_intake_service` |
| Replies thread onto the conversation | `_find_thread_ticket` on `thread_id` / `in_reply_to`, AI fallback for a dropped ticket number |
| Reply to the customer from inside Aexy | `service_desk_mailer` — sends **as the mailbox address**, threaded into the requester's own conversation |
| Loop protection | `X-Aexy-Service-Desk` header, checked by intake so an acknowledgement is never ingested as a fresh ticket |
| Assignment | `assignee_id`, account `assigned_owner_id`, department routing |
| Internal notes | `TicketResponse.is_internal` |
| Status | `pending_with` + `TicketPendingSegment` |
| Canned responses | editable email templates |
| SLA / escalation | breach clock, working hours, escalation matrix |
| Auto-triage | AI categorisation, auto-split |
| **Collision detection** | **Missing** |
| **Inbox-shaped view** | **Missing** — this plan |

### 2.1 The thing worth noticing

`service_desk_mailer` stamps `X-Aexy-Service-Desk` on every outbound message, and
intake checks it before creating a ticket. Without that, the desk replies to a
customer, its own sent mail syncs back through the same Google account, becomes a
new ticket, gets acknowledged — and the loop never stops.

That is the bug a naive team inbox ships with. It is already handled, and it is the
strongest argument for building on this foundation rather than beside it.

---

## 3. Decisions

Taken so the plan can proceed. Each names what would reverse it.

### D1 — Shared mailboxes, not personal. First.

"Team gmail account" reads as a shared address (`support@`, `sales@`). Google
Collaborative Inbox — which the phrase evokes — is sometimes used for the other
thing, so this is a decision rather than a reading.

Shared is chosen because it is ~80% built, and because the personal version carries
a sync bill the shared one does not (§3.1). Shipping shared first also answers the
personal question with evidence instead of argument.

*Reverses if:* the mailboxes people actually want in here are individuals' own
addresses, not team ones. Then this becomes the `UNIFIED_EMAIL_PLAN` mail-client
track and the sync work moves ahead of the UI.

### D2 — Build on Service Desk, not the CRM inbox.

`UNIFIED_EMAIL_PLAN.md` had this starting at `/crm/inbox`. That was wrong. The CRM
inbox is read-only, has no reply, no assignment, no threading and no internal notes.
Service Desk has all five. Building the inbox view there means the reply path, the
loop protection and the SLA clock are inherited rather than rebuilt.

The CRM inbox stays what it is: somewhere to link mail to records.

### D3 — The ticket is attached to a conversation, not the other way round.

The view renders conversations; the `Ticket` id, `pending_with`, breach state and
escalation keep working unchanged. Anyone who prefers the queue keeps it — this is a
second view, not a replacement.

This matters for reporting. A conversation answered in the inbox must appear in desk
analytics identically to one answered in the queue, or the numbers split and both
become untrustworthy.

**Revised by D7.** The first draft of this decision said the ticket sits "underneath"
the conversation, which quietly made `Ticket` the primary key of the view. That does
not survive the component being reused in CRM, where a thread linked to a contact may
have no ticket at all. The relationship is the other way round: a conversation may
*have* a ticket.

*Consequence to design for:* ticket numbers and SLA badges are desk vocabulary. They
should be available but not foregrounded, and a first-time reader should not need to
know what `BSD-142` means to answer an email.

### D7 — The conversation view is a shared module with three hosts.

It will be embedded in the team inbox, the Service Desk ticket page, and the CRM
record view. That is a constraint on the data contract, not a later refactor, because
getting it wrong is expensive in a specific way: keying the module on `Ticket` works
in two hosts and is unbuildable in the third.

**There are five hosts, not three, and they split cleanly by whether they write.**

| Host | Renders now | Source | Writes? |
|---|---|---|---|
| Team inbox (`/inbox`) | Does not exist | ticket | **Yes** — reply, note, assign, status |
| Service Desk ticket page | 653 lines, ticket + `TicketResponse` timeline | ticket | **Yes** |
| CRM inbox (`/crm/inbox`) | 1027 lines. Message list + body reader, link-to-record, hide. **Message-shaped, not thread-shaped.** | thread | Read-only |
| CRM record → Activity | `CRMActivity` summaries, no reader | thread | Read-only |
| CRM activities feed (`/crm/activities`) | Workspace feed with an `email` type filter | thread | Read-only |

Neither `ticket_id` nor `gmail_thread_id` alone identifies a conversation: a
webhook-sourced desk conversation has no Gmail thread, a CRM-linked thread has no
ticket. The module takes a **discriminated source** — `{kind: "ticket", id}` or
`{kind: "thread", integration_id, gmail_thread_id}` — and resolves both to one shape:
participants, messages, internal notes, attachments.

**The write split falls entirely along the source.** Every writing host is
ticket-sourced; every thread-sourced host is read-only (Q6). That is not a
coincidence to design around, it is the shape of the domain: a shared desk address
has an agreed owner and an agreed voice, and a thread in somebody's own mailbox has
neither.

It also disposes of a problem that would otherwise have needed solving. Replying to
a CRM-linked thread means replying *from the mailbox that received it* — an
individual's personal account — so the workspace would be sending mail as a person,
from a page that person may not be looking at. Read-only in CRM means the question
never arises. If it is ever wanted, it should be asked for deliberately.

**Read-only is not featureless.** `/crm/inbox` already links a message to a record
and hides it. Those act on the *relationship* and on the *sync*, not on the
conversation, and both survive. So `capabilities` carries two families:
`reply | note | assign | status` (desk) and `link | hide` (CRM).

**Capabilities come from the server, never from the host page.** The response says
what *this caller* may do on *this conversation* — reply, note, assign, change
status. If each host decides its own buttons, the three drift, and eventually one
offers an action the API refuses. The desk page and the CRM page then disagree about
who may answer a customer, which is a permissions bug wearing a UI costume.

**Build one adapter first.** The contract is designed now; only the ticket source is
implemented in Phase 1. Writing three adapters before one host exists is how the
abstraction ends up shaped like nothing in particular.

*Settled:* CRM is read-only (Q6), so the contract does **not** collapse — it
simplifies in a better way. The module keeps one read shape across five hosts, and
only the ticket source carries a write path. The thread adapter needs no send code
at all.

*Reverses if:* somebody asks to reply from CRM. That is not a UI change — it is the
"as whom?" question above, and it needs answering before any button appears.

### D4 — Collision detection copies the collaboration pattern.

`api/collaboration.py` already runs a WebSocket `ConnectionManager` for documents,
and `ChatUserPresence` already models presence. Viewing/replying presence on a
conversation follows both rather than inventing a third mechanism.

Two people answering the same customer is the failure that makes a team distrust a
shared inbox, so this is in the first shipping phase, not a later polish.

### D5 — True threading needs `gmail_sync`; webhook mailboxes are second-class here.

`service_desk_mailer` sends through Gmail only for `gmail_sync` mailboxes. A webhook
mailbox falls back to `EmailService`, so its replies may not thread into the
customer's conversation.

The view surfaces the channel rather than hiding it. A webhook mailbox in an inbox
view that silently does not thread would be worse than one that says so.

### D6 — Sent mail: no new sync work for this plan.

Desk conversations are already complete, because replies are stored as
`TicketResponse` when sent. The `INBOX`-only sync gap only bites for mail sent from
Gmail directly, outside Aexy.

That is a real gap but a narrow one, and it belongs to the personal-mailbox track.
Fetching `SENT` is deferred, not forgotten.

### D8 — Filter by client, not by domain string.

"Everything from Acme" is the question people actually have. A raw domain box answers
a narrower one, and answers it wrong whenever a client has more than one domain —
which is most of them, once `acme.com` and `acme.co.uk` and the CEO's `gmail.com`
address are all the same account.

**`service_desk_account_domains` is the reliable source.** It already exists, already
maps many domains to one account, and already accepts a whole address as well as a
domain (the multi-account work made the whole-address form outrank the domain form,
so a shared provider does not swallow every account keyed on it). Master Data is
where clients are already defined, so the filter is reading a table people maintain
rather than inventing a second place to say who Acme is.

**CRM companies are best-effort.** `crm_records.values` is schemaless JSONB — a
company's domain lives under whatever attribute the workspace defined, if any. So CRM
resolution is opportunistic and must not be the primary path (Q10).

**Unknown senders still need a raw filter.** A domain with no account behind it is
exactly the case worth looking at — a prospect, or a client nobody has set up yet. So
the control resolves to an account where it can and falls back to the literal domain
where it cannot, and says which it did.

**This is where the module earns its keep.** One filter spanning desk conversations
*and* CRM threads is the answer to "show me everything from this client", and it is
the thing no single existing surface can do: the desk knows the tickets, the CRM
knows the correspondence, and neither knows the other.

#### D8.1 — The filter must not become a way to read colleagues' mail

The thread-sourced hosts read `synced_emails` across every connected Google account
in the workspace. A client filter over that, applied naively, returns the personal
mail of anybody who has ever corresponded with that domain — and returns it to
whoever typed the domain.

That is the same leak as `UNIFIED_EMAIL_PLAN` §1.2, arriving through a different
door, and a filter makes it worse rather than better: the workspace-wide inbox at
least buries a colleague's mail in a long list, whereas a filter surfaces exactly the
correspondence somebody was looking for.

So the filter is scoped before it is applied:

- **Desk conversations** — visible to the desk, unchanged. A shared mailbox is shared.
- **Thread-sourced results** — the caller's own accounts only, unless a Service Desk
  mailbox reads the account, which makes it a team address rather than a personal one.

Stated as a rule: *the filter narrows what you can already see. It never widens it.*

---

## 4. Open questions

Answerable while Phase 1 is built; none of them block starting.

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Which mailboxes go in here — `support@`, `sales@`, both? | Decides whether one inbox is scoped per mailbox or spans several | One view, mailbox filter, defaulting to all the caller can see |
| Q2 | Should the inbox show ticket numbers and SLA badges? | D3 says available, not foregrounded — but "available" needs a shape | Behind a detail pane, not in the list row |
| Q3 | Is "done" the same as the desk's closed state? | Two different notions of finished would split reporting | Same state. An inbox "Done" writes the desk's closed `pending_with` |
| Q4 | Do internal notes need @mentions? | Notes exist; mentions are how teams actually use them | Ship without, add if asked — chat already has a mention pattern to copy |
| Q5 | Volume per mailbox per day? | Under ~50/day, pagination and search barely matter; over ~500 they are the whole design | Assume low hundreds; revisit before Phase 4 |
| ~~Q6~~ | ~~Readable-and-answerable, or read-only, in CRM?~~ | — | **Answered: read-only.** See D7. |
| ~~Q7~~ | ~~Hosts beyond the three?~~ | — | **Answered: five.** `/crm/inbox` and `/crm/activities` are both hosts; both read-only. See D7. |
| ~~Q8~~ | ~~Message-shaped or thread-shaped list in `/crm/inbox`?~~ | — | **Answered: thread-shaped.** |
| Q10 | Is a "client" a Service Desk account, a CRM company, or both? | Decides what the filter resolves against — see D8 | Desk account first (it has real domains), CRM company where the workspace defines a domain attribute |
| Q9 | Does the CRM activity feed open a conversation inline, or navigate to `/crm/inbox`? | Decides whether the module is embedded in three CRM surfaces or one | Navigate. Fewer embeddings until the contract has been proven twice |

---

## 5. Phases

### Phase 1 — The conversation module, and one host

The module is the deliverable. The inbox is its first host, chosen because it is the
only one of the three with no existing surface to preserve.

1. `GET /workspaces/{id}/conversations/{kind}/{id}` — resolves a ticket **or** a
   Gmail thread into one shape: participants, messages, internal notes, attachments,
   and a `capabilities` block saying what this caller may do (D7).
2. `<Conversation>` component: message timeline, reply box, internal-note toggle,
   assignee picker. Every control rendered from `capabilities`, never from which page
   it is on.
3. `GET .../service-desk/inbox` — the conversation *list*: subject, requester, last
   message, snippet, unread, assignee, mailbox. Backed by existing ticket queries.
4. `/inbox` page: list + `<Conversation>` in the reading pane.
5. Reply posts through `service_desk_ticket_service` → `service_desk_mailer`, so the
   loop marker, threading and template handling are inherited unchanged.
6. Presence (D4): who is viewing, who is replying. `ConnectionManager` pattern,
   heartbeat + TTL so a closed laptop clears.

### Phase 2 — The second writing host

7. Service Desk ticket page renders `<Conversation>` in place of its own timeline.
   The test of the contract: if the module cannot replace 653 lines that already
   work, the contract is wrong, and it is far cheaper to learn that here than in CRM.

Both Phase 1 hosts are ticket-sourced, so the thread adapter is still unwritten at
the end of this phase. That is deliberate — the write path is the harder half and it
is proven twice before the read-only half is started.

### Phase 3 — The thread adapter and the CRM hosts

8. Thread source: resolve `synced_emails` by `gmail_thread_id` into the same shape.
   Read-only, no send path (D7).
9. `/crm/inbox` swaps its message list for a thread list and its body reader for
   `<Conversation>`. Keeps link-to-record and hide, which are `capabilities`
   entries rather than special cases (Q8).
10. CRM record gains a conversations tab. Activity feed links through to
    `/crm/inbox` rather than embedding (Q9).
11. **Client filter (D8)**, spanning both sources — resolving against
    `service_desk_account_domains`, falling back to a literal domain, and scoped per
    D8.1 so it narrows what the caller can already see rather than widening it.

### Phase 4 — The context panel

12. Requester → CRM record → open deals, other open conversations, past tickets.
    This is the reason to answer mail here rather than in Gmail, and the piece Gmail
    structurally cannot show. A slot in the module, filled per host — the CRM record
    view already knows the company, so it fills it differently.
13. Actions from a conversation: create sprint task, link/create CRM record.

### Phase 5 — Volume tooling

14. Search and filters (assignee, mailbox, unread, breaching).
15. Bulk actions: assign, close, apply template.
16. Keyboard shortcuts for the reading pane.

Gate on Q5. Below a few hundred a day it is polish; above it, it is the product.

The **client filter (D8)** is deliberately not here. It is not volume tooling — it is
the cross-source question the module exists to answer, so it ships with the thread
adapter in Phase 3 where it first has both sources to span. Within Phase 1–2 it would
only ever filter desk conversations, which the queue's existing filters already do.

### Phase 6 — Then reconsider personal mailboxes

Only after the module has hosts on both sources. If people ask for their own mail in
here, that is the `UNIFIED_EMAIL_PLAN` track and the sync work (`SENT`, label
history, deletes, push) goes first.

---

## 6. Risks

| Risk | Handling |
|---|---|
| Two views over one dataset diverge | D3: one state model. An inbox action writes the same fields the queue reads. |
| Inbox becomes a worse Gmail | Phase 4 before Phase 5. If it does not show what Gmail cannot, it has failed regardless of polish. |
| Reporting splits | D3. Same ticket, same states, same analytics. |
| Collision on a shared mailbox | Phase 1 item 6, not deferred. |
| Webhook mailbox replies do not thread | D5: surface the channel rather than hide it. |
| Ticket vocabulary leaks and confuses | Q2. Detail pane, not list row. |
| **The shared module is over-abstracted** | D7: contract designed for three hosts, only one adapter built in Phase 1. The Service Desk page in Phase 2 is the cheap test — if the module cannot replace a timeline that already works, fix the contract before CRM. |
| **Capabilities drift between hosts** | D7: the server returns what the caller may do. No host decides its own buttons. |
| **The client filter exposes colleagues' personal mail** | D8.1: scoped before applied. Desk conversations are shared; thread results are the caller's own accounts, or accounts a desk mailbox reads. The filter narrows, never widens. |
| **A client has several domains and the filter finds one** | D8: resolve against `service_desk_account_domains`, which already maps many domains — and whole addresses — to one account. |
| **Replacing a working 653-line ticket page regresses it** | Phase 2 item 7 is a replacement, not a rewrite: the existing page keeps its layout and swaps its timeline. If parity is not reached, the module is not ready for CRM either. |

## 7. Non-goals

No compose-to-a-stranger (this is a reply surface). No folder or label management.
No offline. No mobile app. No personal mailboxes in Phase 1–3. No replacement of the
ticket queue.
