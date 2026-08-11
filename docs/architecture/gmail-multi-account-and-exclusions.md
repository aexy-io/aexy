# Gmail: multiple accounts per workspace, and sync exclusions

**Status:** design, not built. No code in this document exists yet.

Two changes to how Aexy connects Gmail, written together because they only make
sense together. The first lets several people in a workspace connect their own
mailbox. The second is what makes the first acceptable to the people doing it —
without a way to keep some mail out, "connect your inbox to the company CRM" is
a request most people should refuse.

---

## Part 1 — Multiple Google accounts per workspace

### What happens today

A workspace has exactly one Google account. `google_integrations.workspace_id`
is `unique=True` ([`models/google_integration.py:29`][gi-model]), and the only
way a workspace acquires one is `POST /connect-from-developer`
([`api/google_integration.py:174`][connect]), which copies the calling
developer's tokens and address onto the workspace row:

```python
existing.google_email = dev_connection.google_email   # api/google_integration.py:240
```

It overwrites. The second person to connect silently replaces the first, and
the workspace's Gmail identity becomes whoever ran it last.

Nothing decided this. It is the shape of the original CRM sync — "the workspace
connects Google" — from when per-developer `GoogleConnection`
([`models/developer.py:371`][gc-model]) existed only for sign-in. Service Desk
came later and reused the workspace row for outbound mail.

The consequences are visible in support:

- a `gmail_sync` Service Desk mailbox can only ever be the one connected
  address, and asking for any other returns a 422 that used to advise an action
  that cannot succeed;
- two people cannot each pipe their own inbox into CRM;
- reconnecting as a different address silently stops syncing the first.

### What is already multi-account ready

More than it looks. Every child table already keys on `integration_id`, not on
workspace:

| Table | Keyed by |
| --- | --- |
| `synced_emails` | `integration_id` ([`:126`][gi-model]) |
| `synced_calendar_events` | `integration_id` |
| `email_sync_cursors` | `integration_id` |
| `google_sync_jobs` | `integration_id` |
| `service_desk_mailboxes` | `integration_id` ([`models/service_desk.py:286`][sd-model]) |

The outbound mailer already takes a per-mailbox `integration_id` and rejects one
belonging to another workspace ([`services/service_desk_mailer.py:57`][mailer]).
Its own comment says *the mailbox row names the integration*. Service Desk is
already written for the world this document describes; only the connection layer
is not.

### Changes

**1. Schema.** Drop the unique constraint on `workspace_id`; add
`UNIQUE (workspace_id, google_email)` so the same address cannot be connected
twice to one workspace. No data migration — existing rows stay valid, and a
workspace with one integration keeps behaving as it does now.

**2. Replace the singleton lookup.** `get_integration(workspace_id)`
([`api/google_integration.py:110`][get-integration]) ends in
`scalar_one_or_none()`, which raises `MultipleResultsFound` the moment a second
row exists. That is the right failure mode — loud, immediate, impossible to
miss — but it has to be replaced before the constraint is dropped, not after.

It becomes `get_integration(workspace_id, integration_id)` plus
`list_integrations(workspace_id)`. Blast radius is smaller than a naive grep
suggests: 8 Google call sites in `api/google_integration.py` (the other 29
`get_integration` hits belong to Jira, Linear and Slack services that share the
name) and 11 direct `GoogleIntegration.workspace_id ==` queries across six
files.

**3. Make connect additive.** `connect-from-developer` inserts a row per
`(workspace, google_email)` instead of overwriting, and a caller may only
promote or disconnect *their own* `GoogleConnection`. Disconnecting one account
must not disturb another's cursors.

**4. Route the consumers.** Each needs a stated rule for *which account*:

- **Service Desk** — already solved; the mailbox row names it.
- **CRM inbox** — needs an owner filter, defaulting to the viewer's own
  integration. See "Whose mail is it" below; this is the part that is a policy
  decision rather than a refactor.
- **Calendar** — per person by nature; the events table is already keyed right.
- **`gmail_sync_service.py:85`** — the "is this the user's own email" check
  selects the workspace's single integration. It becomes "any connected address
  in this workspace".

**5. Sync fan-out.** The Temporal schedules select integrations workspace-wide
([`temporal/activities/google_sync.py:139`][sched]). They iterate instead of
assuming one. Cursors are already per-integration, so this is mostly a loop and
a concurrency limit.

### Whose mail is it

With one workspace account, everyone with CRM access reads it, and that is
coherent — it is the company's mailbox. With per-person accounts the same rule
would mean connecting your Gmail to do CRM work exposes your inbox to every
colleague with the CRM app enabled.

**Decision: synced mail is visible to its owner by default.** Sharing an
integration's mail into the shared CRM view is an explicit, per-integration
choice made by the person who connected it. A workspace-wide shared mailbox
(`ops@`, `support@`) is that choice, made once, deliberately.

This is what makes Part 2 coherent rather than a bolt-on: exclusions are for the
mail you *do* share.

---

## Part 2 — Sync exclusions

### Requirement

Someone connecting their Gmail can keep mail out of Aexy:

1. up front, when connecting — by address and by domain;
2. per message, from the inbox view — hide this one;
3. as a follow-up to (2) — "also hide future mail from `bob@acme.com` / from
   `acme.com`", turning a one-off into a standing rule.

### Where the filter belongs

Both sync paths — full sync via `messages.list`
([`services/gmail_sync_service.py:698`][full-sync]) and incremental via history
([`:781`][incr-sync]) — funnel through `_sync_message` ([`:808`][sync-message].
It parses at line 828 and constructs the row at 832.

**The exclusion check goes between those two.** An excluded message never
becomes a row: no body, no snippet, no attachment preview, nothing to leak
later or to have to scrub afterwards. One choke point covers every path.

### The trap: deleting a hidden email un-hides it

Dedup is `SELECT … WHERE gmail_id = message_id` against `synced_emails`
([`:813`][sync-message]). **The row is the "already seen" marker.** So a
click-hide that deletes the row means the next full sync re-imports that
message — the user hides it, and it comes back.

Click-hide therefore needs a tombstone:

```
google_sync_hidden_messages (integration_id, gmail_id, hidden_by_id, created_at)
```

checked at the top of `_sync_message`. Delete the `SyncedEmail` row outright and
keep the tombstone: the content is genuinely gone rather than flagged-but-
present, and it stays gone across re-syncs.

Rule-based exclusions need no tombstone — the rule is evaluated before the
insert, so matching mail is never imported at all.

### Rules

```
google_sync_exclusion_rules (
    id,
    integration_id,      -- the account, not the workspace
    kind,                -- 'address' | 'domain'
    value,               -- normalised lowercase
    match_scope,         -- 'participants' (default) | 'sender'
    created_by_id,
    created_at
)
```

Keyed on the **integration**. A workspace-scoped rule would be one an admin
could delete, and the person who connected the mailbox is the one who owns the
decision.

**Match participants, not just the sender.** This matters more than it sounds.
Hiding `acme.com` while matching only `from_email` still exposes every reply
*you* sent them, because your side of the thread has Acme in `to_emails`. The
default matches `from_email` + `to_emails` + `cc_emails`. Sender-only is a
narrower option, not the default.

**Rules apply backwards.** Creating a rule purges already-synced matches — a
Temporal activity, since it can be a lot of rows. "Hide mail from this domain"
that leaves last month's in the CRM is not what anyone means by hide.

### The Service Desk conflict

`_sync_message` also feeds Service Desk intake ([`:855`][sync-message]) — the
same function that files CRM mail turns desk mail into tickets. A personal
exclusion evaluated before that would let someone hiding `acme.com` from their
own inbox silently stop Acme's support tickets from being created, and nobody
would find out until a customer asked why they had been ignored.

**Decision: exclusions apply to CRM/inbox ingestion only. A registered Service
Desk mailbox bypasses them.** A desk address is a shared business channel, not
private mail. This needs to be a stated rule with a test, not an accident of
ordering.

### Optional hardening

For the full-sync path only, exclusions can be pushed into Gmail's own query
(`-from:acme.com`), so excluded mail never leaves Google. The history-based
incremental path has no `q` parameter, so local filtering stays mandatory
regardless. Treat this as an optimisation, never as the mechanism.

---

## Governance

Exclusions are visible to workspace admins, and department heads are notified
when a rule is created. This is a deliberate policy choice: the organisation
wants a record that business correspondence is not being quietly suppressed.

It has a consequence that has to be designed for rather than discovered.
**The exclusion is itself a disclosure.** A list of hidden domains reads as a
list of things someone would rather their manager not see, and the metadata can
be more revealing than the mail it hides.

That is workable, but only if nobody learns it after the fact.

### Decisions

| | |
| --- | --- |
| **Admins can see** | every exclusion rule and every one-off hide, per integration |
| **Heads are notified** | on **rule** creation (address/domain) — the standing ones |
| **Heads are not notified** | on one-off click-hides; they appear in the admin list without a notification |
| **Viewing is logged** | an admin opening someone's exclusion list writes an audit entry |
| **The owner is not notified** | when their records are viewed — the log is for audit, not for them |
| **Disclosure** | before connecting, and again at the point of creating a rule |

Notifying a head on every individual click-hide would be noisy enough to be
ignored, and turns each "not this thread" into a small report. Rules are the
standing decisions worth a person's attention; one-off hides are visible without
being announced.

### Disclosure, specifically

Twice, in plain words, both before the moment of choice:

1. **On the Google connect step**, before anyone connects: exclusions you create
   are visible to workspace admins, and your department head is notified. Not a
   tooltip, not buried in terms — on the screen where the decision is made, so
   declining to connect is a real option for genuinely personal mail.
2. **On the click-hide follow-up**, before "also hide future mail from
   `acme.com`" is confirmed: this rule will be visible and notified. That prompt
   is the moment someone is most likely to assume privacy.

### Audit log

Reuse the `AppAccessLog` shape ([`models/app_access.py:189`][access-log]) —
`workspace_id` / `actor_id` / `action` / `target` / `extra_data` — rather than
inventing a second audit vocabulary. Actions:

| Action | Actor | Notified |
| --- | --- | --- |
| `gmail_exclusion_rule_created` | owner | department head |
| `gmail_exclusion_rule_deleted` | owner | department head |
| `gmail_message_hidden` | owner | nobody |
| `gmail_exclusions_viewed` | admin | nobody |

`gmail_exclusions_viewed` is the symmetry: whoever can see the list is recorded
seeing it. The owner is not told, by decision — the record exists so the access
can be reviewed later, not so it can be watched live.

---

## Sequencing

Part 2 does not depend on Part 1. Exclusion rules are self-contained and useful
against today's single-account workspace, and they do not touch the unique
constraint. Building them first also means that when multiple people *can*
connect their own mailbox, the thing that makes it safe to do so already exists.

1. **Exclusion rules + click-hide + tombstones** — self-contained.
2. **Governance: admin view, head notification, audit log, disclosure copy.**
3. **Schema + lookup replacement** (Part 1, steps 1–2) — mechanical, behind no
   behaviour change while a workspace still has one integration.
4. **Additive connect + consumer routing** (steps 3–4) — the visible change.
5. **Sync fan-out** (step 5).

## Open questions

- **Shared mailbox ownership.** When `ops@` is connected by a person who then
  leaves, whose integration is it? Today `connected_by_id` is `SET NULL` on
  developer delete, which leaves a live token with no owner.
- **Retroactive purge scope.** Does creating a domain rule purge synced mail
  that has already been linked to a CRM contact or deal, or only unlinked mail?
  Purging linked mail removes history someone may be relying on.
- **Rule limits.** A rule per correspondent is a plausible way to opt out of
  sync entirely while appearing to participate. Worth a cap, or a report, or
  neither — but worth deciding rather than discovering.

[gi-model]: ../../backend/src/aexy/models/google_integration.py
[gc-model]: ../../backend/src/aexy/models/developer.py
[sd-model]: ../../backend/src/aexy/models/service_desk.py
[connect]: ../../backend/src/aexy/api/google_integration.py
[get-integration]: ../../backend/src/aexy/api/google_integration.py
[mailer]: ../../backend/src/aexy/services/service_desk_mailer.py
[full-sync]: ../../backend/src/aexy/services/gmail_sync_service.py
[incr-sync]: ../../backend/src/aexy/services/gmail_sync_service.py
[sync-message]: ../../backend/src/aexy/services/gmail_sync_service.py
[sched]: ../../backend/src/aexy/temporal/activities/google_sync.py
[access-log]: ../../backend/src/aexy/models/app_access.py
