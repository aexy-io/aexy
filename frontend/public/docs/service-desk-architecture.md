# Service Desk — architecture

How the desk is built. For how it is *run* — connecting a mailbox, working the
queue, the clock, the reports — see [Service Desk](./service-desk.md), which is
the document a reader arriving at this module usually wants.

An email-first support desk. Mail arrives at a shared mailbox, becomes a
tracked ticket, and moves between the people responsible for it until it is
closed — with the time spent on each side of every handoff recorded.

The thing that distinguishes it from `tickets-and-projects.md` is the model of
responsibility. A sprint ticket has an *assignee*: one person who owns it. A
service-desk ticket has a **pending-with** — the party the ball is currently
with, which is frequently not your company at all. Most of the design follows
from that.


## Mental model

- **Ticket** — a `Ticket` row (shared with the sprint ticketing system) plus a
  1:1 `ServiceDeskTicket` extension holding the desk-specific fields. The base
  row gives you the title, body, status and comment thread; the extension gives
  you everything below.
- **Pending with** — who owes the next action. Not a status and not an
  assignee. A ticket can be pending with the customer, a vendor, or an internal
  team, and it is normal for it to bounce between all three.
- **Pending segment** — one interval of one pending-with value, in
  `ticket_pending_segments`: entered at, exited at, duration, who changed it,
  and an optional note. A ticket's history is the ordered list of its segments,
  which is what makes "we were waiting on the vendor for nine days" a fact
  rather than an argument.
- **Stakeholder** — a party the desk can be pending with. Workspace-defined,
  not an enum, so a desk can have "Customer", "Vendor", "Finance" and "Legal"
  without a migration.
- **Request type** — the taxonomy a ticket is classified into. Also
  workspace-defined.
- **Account / Vendor / Product** — the master data. Accounts and vendors own
  email **domains**, and that ownership is how inbound mail routes itself.
- **Mailbox** — a shared address the desk ingests, either by provider webhook
  or by Gmail sync (`MailboxChannel`).
- **Origin** — `email`, `manual` or `internal` (`TicketOrigin`).

## Intake

`services/service_desk_intake_service.py` has one entry point, `ingest`, shared
by both channels. In order, it:

1. **Threads.** If the message references a known `thread_ref` or
   `source_message_id`, it is appended to the existing ticket rather than
   opening a second one.
2. **Routes by domain.** The sender's domain is matched against
   `service_desk_account_domains`, then `service_desk_vendor_domains`, then
   internal, then an arbitrary-owner fallback. This is why keeping domains on
   accounts matters more than any other piece of master data.
3. **Creates** the `Ticket`, the `ServiceDeskTicket`, and opens the first
   `TicketPendingSegment`.
4. **Classifies, best effort.** An LLM proposes `ai_request_type`,
   `ai_product_id` and an `ai_confidence`. Below the workspace's threshold the
   ticket is flagged `needs_triage` rather than silently mis-filed. Failure
   here never blocks the ticket.
5. **Acknowledges**, using the workspace's receipt template.

Duplicate delivery is handled by `service_desk_ingested_messages`, so a
provider that retries a webhook does not create a second ticket.

## The breach clock

A turnaround target is stated in business days, and `service_desk_clock.py`
takes that literally:

- The clock runs only during working hours on working days, in the
  **workspace's own timezone**. Nothing accrues overnight, at weekends, or on
  holidays.
- "2 business days" means `2 × WORKING_DAY_SECONDS` of working time — 18 hours
  on a 09:30–18:30 day, not 48 hours of wall clock.

Configure the window at `/settings/service-desk/hours`. Getting the timezone
wrong is not a rounding error: whether an instant falls inside Tuesday's shift
depends on the timezone you ask in.

## Splitting

One email often contains two requests. `POST /tickets/{id}/split` creates a
child ticket carrying `split_parent_ticket_id`, so the two can be pending with
different parties and close on different days while the thread stays linked.

## API

`api/service_desk.py`, 46 endpoints under
`/workspaces/{workspace_id}/service-desk`. The shape:

| Group | Endpoints |
|---|---|
| Settings | `GET/PATCH /settings`, `GET /industry-templates`, `POST /industry-templates/apply` |
| Taxonomy | `/stakeholders`, `/request-types` (full CRUD each) |
| Master data | `/accounts`, `/vendors`, `/products`, `/mailboxes` |
| Templates | `GET /templates`, `PATCH /templates/{key}` |
| Tickets | `GET /tickets`, `/tickets/count`, `/tickets/export.csv`, `POST /tickets/manual`, `GET /tickets/{id}` |
| Ticket actions | `/split`, `/pending-with`, `/email`, `/convert-to-task`, `PATCH /tickets/{id}` |
| Reporting | `/dashboard`, `/analytics`, `/report-options`, `/ai-accuracy` |
| Digest | `GET /digest/preview`, `POST /digest/send-now` |

`api/public_tickets.py` serves the unauthenticated customer view of a ticket by
token; `api/ticket_forms.py` handles form-based intake.

## Frontend

Three routes — `/service-desk`, `/service-desk/tickets`,
`/service-desk/tickets/[ticketId]` — and **eight settings pages**, which is the
largest settings surface of any module:

| Page | What it configures |
|---|---|
| `/settings/service-desk/mailboxes` | Shared addresses and their ingest channel |
| `/settings/service-desk/intake` | Routing and auto-assignment |
| `/settings/service-desk/stakeholders` | Who a ticket can be pending with |
| `/settings/service-desk/master-data` | Accounts, vendors, products, domains |
| `/settings/service-desk/hours` | Working window and holidays — the clock |
| `/settings/service-desk/ai` | Classification model and confidence threshold |
| `/settings/service-desk/digest` | Scheduled summary mail |
| `/settings/service-desk/identity` | The From address and reply identity |

## Common pitfalls

- **Domains, not addresses.** Routing matches the sender's *domain* against
  account and vendor domain tables. A new customer whose domain is not
  registered lands in the fallback owner's lap.
- **`pending_with` is not `status`.** Closing a ticket does not clear the
  pending-with, and changing pending-with does not reopen it. They answer
  different questions and both are recorded.
- **The clock needs the timezone.** A workspace with no working hours
  configured has no meaningful breach figures, and the analytics endpoints will
  happily compute against the default.
- **`needs_triage` is a queue, not an error.** It means the classifier was
  under threshold. Working that queue is what improves `ai-accuracy`.
- **Splitting is not moving.** A split child is a new ticket; the parent keeps
  its own history and clock.
