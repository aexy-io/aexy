# Team Inbox — Plan

Status: proposed
Depends on: `feat/gmail-multi-account-v2`
Supersedes: §3 Phase 1–2 of `UNIFIED_EMAIL_PLAN.md` (see D2)

---

## 1. What this is

An **inbox-shaped view over Service Desk**. Not a new system, not a mail client.

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

### D3 — The ticket stays underneath, hidden rather than removed.

The view renders conversations; the `Ticket` id, `pending_with`, breach state and
escalation keep working unchanged. Anyone who prefers the queue keeps it — this is a
second view, not a replacement.

This matters for reporting. A conversation answered in the inbox must appear in desk
analytics identically to one answered in the queue, or the numbers split and both
become untrustworthy.

*Consequence to design for:* ticket numbers and SLA badges are desk vocabulary. They
should be available but not foregrounded, and a first-time reader should not need to
know what `BSD-142` means to answer an email.

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

---

## 4. Open questions

Answerable while Phase 1 is built; none of them block starting.

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Which mailboxes go in here — `support@`, `sales@`, both? | Decides whether one inbox is scoped per mailbox or spans several | One view, mailbox filter, defaulting to all the caller can see |
| Q2 | Should the inbox show ticket numbers and SLA badges? | D3 says available, not foregrounded — but "available" needs a shape | Behind a detail pane, not in the list row |
| Q3 | Is "done" the same as the desk's closed state? | Two different notions of finished would split reporting | Same state. An inbox "Done" writes the desk's closed `pending_with` |
| Q4 | Do internal notes need @mentions? | Notes exist; mentions are how teams actually use them | Ship without, add if asked — chat already has a mention pattern to copy |
| Q5 | Volume per mailbox per day? | Under ~50/day, pagination and search barely matter; over ~500 they are the whole design | Assume low hundreds; revisit before Phase 3 |

---

## 5. Phases

### Phase 1 — The inbox view (shippable alone)

1. `GET /workspaces/{id}/service-desk/inbox` — conversations, not tickets: subject,
   requester, last message, snippet, unread, assignee, mailbox. Backed by existing
   ticket queries.
2. Conversation list + reading pane at `/inbox`, top-level. Reply box, internal-note
   toggle, assignee picker inline.
3. Reply posts through `service_desk_ticket_service` → `service_desk_mailer`, so the
   loop marker, threading and template handling are inherited unchanged.
4. Presence (D4): who is viewing, who is replying. `ConnectionManager` pattern,
   heartbeat + TTL so a closed laptop clears.

### Phase 2 — The context panel

5. Requester → CRM record → open deals, other open conversations, past tickets.
   This is the reason to answer mail here rather than in Gmail, and it is the piece
   Gmail structurally cannot show.
6. Actions from a conversation: create sprint task, link/create CRM record. Ticket
   creation already happened at intake.

### Phase 3 — Volume tooling

7. Search and filters (assignee, mailbox, unread, breaching).
8. Bulk actions: assign, close, apply template.
9. Keyboard shortcuts for the reading pane.

Gate Phase 3 on Q5. Below a few hundred a day it is polish; above it, it is the
product.

### Phase 4 — Then reconsider personal mailboxes

Only after Phase 1–2 have been used. If people ask for their own mail in here, that
is the `UNIFIED_EMAIL_PLAN` track and the sync work (`SENT`, label history, deletes,
push) goes first.

---

## 6. Risks

| Risk | Handling |
|---|---|
| Two views over one dataset diverge | D3: one state model. An inbox action writes the same fields the queue reads. |
| Inbox becomes a worse Gmail | Phase 2 before Phase 3. If it does not show what Gmail cannot, it has failed regardless of polish. |
| Reporting splits | D3. Same ticket, same states, same analytics. |
| Collision on a shared mailbox | Phase 1 item 4, not deferred. |
| Webhook mailbox replies do not thread | D5: surface the channel rather than hide it. |
| Ticket vocabulary leaks and confuses | Q2. Detail pane, not list row. |

## 7. Non-goals

No compose-to-a-stranger (this is a reply surface). No folder or label management.
No offline. No mobile app. No personal mailboxes in Phase 1–3. No replacement of the
ticket queue.
