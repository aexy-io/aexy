# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.28.0] - 2026-08-22

The public site: a new look, and the SEO and conversion audit that came with it.

### Changed: the marketing site is "Open Ledger"

Every public page — the homepage, sixteen product pages, eleven comparisons,
the ICP and use-case pages, the guides, pricing, the handbook, login and the
legal pages — moves off the dark gradient it shared with every other developer
tool and onto bone paper. Ink `#101913` on `#F2F3EE`, ledger-green for links and
actions, hairline 1px rules, 2px corners, and dark panes reserved for product
UI. No gradients, no glass, no glow. Display type is Bricolage Grotesque, mono
utility text is IBM Plex Mono, body stays Inter; the brand faces load only on
marketing routes, so the authenticated app ships no extra font bytes.

The header lost the thirteen-product and eight-solution catalogues it was
carrying — those live in the footer now — and keeps Products, Solutions,
Pricing, Docs, GitHub and one call to action.

### Fixed: every page told Google it was a duplicate of the homepage

The root layout carried `alternates: { canonical: "/" }`. Next inherits metadata
down the route tree, so all sixty-four public pages emitted
`<link rel="canonical" href="https://aexy.io">` — every product page, every
comparison, every guide, nominating the homepage as its canonical URL. Nothing
about this is visible in a browser or a build; the pages render perfectly while
asking to be dropped from the index.

Each route owns its canonical now, server pages through their `metadata` export
and client pages through a sibling `layout.tsx`. A source-scan test fails if a
public route ships without one, and fails again if a site-wide canonical
reappears on the root layout.

### Fixed: twenty pages had no title or description of their own

Their `page.tsx` is a client component, where a `metadata` export is silently
ignored, and no layout supplied one — so `/about`, `/security`,
`/for/developers`, `/products/uptime` and sixteen others served the homepage's
title and description verbatim. Each has its own now. `/login` is `noindex`: it
is a gate, and it was competing for brand queries.

Titles that already carried the brand rendered it twice — "About Aexy | Aexy",
"MCP (Model Context Protocol) - Aexy Docs | Aexy" — because the root template
appends " | Aexy". Those opt out with `title: { absolute }`.

The handbook's fifty-one pages were missing from `sitemap.ts` entirely,
reachable only by crawling links from `/handbook`. They are generated from the
same index the pages render from, so a new doc is listed the moment it exists.
The sitemap goes from 62 URLs to 113.

### Changed: the highest-intent pages have a self-serve path

Every comparison, use-case and ICP page sent its primary call to action to
`/contact`, which is a page of `mailto:` links. Somebody typing "aexy vs jira"
is mid-evaluation, and the product is open source and free to self-host — that
visitor wants a workspace or a `git clone`, not a calendar invite. Primary is
"Start free" now, with the demo kept as the secondary action.

Product pages had the mirror problem. Their call to action went straight to the
Google OAuth URL, which excludes anyone without a Google account on a product
whose audience is developers; `/login` offers GitHub too and already reads "Sign
in or create your workspace". Twenty pages in total pointed at a single
provider, `/pricing` among them. `/for/engineering-leaders` had a button
labelled "Schedule Demo" that opened a Google sign-in screen.

Secondary actions on product pages pointed at `/manifesto`, which has no next
step; they go to pricing.

### Removed: two claims the site cannot support

"Join thousands of teams planning smarter with Aexy" on `/products/planning`,
and "40% faster hiring" on `/for/people-ops`. Neither number exists anywhere.
A test now fails on unsourced volume and outcome claims across the public tree.

### Added: real product screenshots on the pages that sell the product

Forty-four interior pages had no product imagery at all — a visitor arriving
from a search never saw the thing before being asked to sign up. `/products/crm`,
`/products/planning`, `/products/docs`, `/products/reviews`, `/products/tickets`
and `/products/mcp` now show the actual surface, framed as a dark plate.

The captures come from a script against a seeded workspace, so they can be
regenerated rather than hand-collected. Surfaces that photograph badly are left
out on purpose: `/agents` looks good but reads "0% Success" in red on every
card, because the seeder creates no agent runs, and shipping that would argue
against the product.

### Fixed: marketing pages had no banner, contentinfo or main landmark

Pages rendered the header, their content and the footer as siblings inside one
page-wide `<main>`. ARIA grants `<header>` the `banner` role and `<footer>` the
`contentinfo` role only when they are *not* inside `<main>`, so every marketing
page lost both, while `<main>` itself meant nothing by spanning the whole
document. Screen-reader users had no landmark to jump to.

`LedgerPage` owns the structure now — header, then `<main>` around the page's
content, then footer — because a page can only control one of the three
elements' position relative to the others, and so cannot get this right on its
own. Verified across all 113 sitemap routes.

### Added: structured data on the pages that had none

Twelve of the sixteen product pages emitted no JSON-LD at all and were
ineligible for any rich result. Nothing on the site emitted `BreadcrumbList`.
Both are in place. The guides breadcrumb pointed at `/guides`, which 404s — that
crumb is gone rather than linking to a dead URL.

### Fixed: the demo seeder could be pointed at a production database

`seed_marketing_demo.py` resolved "the first developer's first workspace" and
wrote to it with no confirmation — CRM records, a sprint, a review cycle, docs,
and two automations with `is_active=True`. Its documented invocation is
`docker exec aexy-backend python scripts/seed_marketing_demo.py`, the same shape
as the migration command that is run against real environments. Pointed at
production it would have dropped fictional deals into a customer workspace and
switched on automations that then fire on live records.

It prints the database, workspace and developer it resolved, and refuses to
write without `--yes`.

## [0.27.1] - 2026-08-21

Files & Storage, from one upload that arrived three times.

### Fixed: one upload became three files, with three AI summaries

Dropping a single file into Files & Storage created three rows, each analysed
separately, so the same document ended up with three different AI summaries
sitting side by side. The upload panel said "1 of 1 uploaded" the whole time,
because there genuinely was only one queue item — the duplication happened
below it.

The queue drains in a loop bounded by how many uploads may run at once, and it
read the queue through a ref. Marking an item as started goes through React
state, which does not apply until the next render, so every remaining pass of
that loop found the *same* item still reporting itself as pending and sent it
again. Three concurrent slots meant three POSTs for one file; a five-file batch
sent twenty-one.

What has been dispatched is now tracked directly instead of being inferred from
a queue snapshot that cannot have caught up yet. Existing duplicates are not
touched — they are real rows, and they can now be deleted from the page.

### Fixed: a Word document rendered dark

A .docx preview showed light text on a dark page. The editor canvas asked the
operating system what colour mode to use and no caller had ever told it
otherwise.

Dark mode inverts the page but not the ink. A document's black body text,
coloured headings and table rules were all chosen by its author against white
paper, so keeping them over a dark canvas is neither what the author wrote nor
what the file prints as. Documents now render on paper regardless of the app's
theme, which is what Word Online, Google Docs and Preview all do — they theme
the chrome around the page, not the page. This covers the document editor as
well as the Drive preview. PDF previews get the same treatment. Images and
video keep a neutral mat that does follow the theme, which is conventional for
media.

Separately, every AI badge and status pill had picked a text colour that only
works on a dark background, so "Ready", "Failed" and the tag chips were washed
out to near-invisible in light mode.

### Added: storage says how much room is left

The sidebar reported a percentage and a byte count. It now draws a meter that
goes amber and then red as the quota fills, and states the space remaining —
the number that actually decides whether the next upload will fit.

### Added: retrying one failed upload, and deleting a file

A failed upload was a dead end. The only control was "Clear", which threw away
the whole batch including the files that had succeeded, and the failure itself
could not be retried without picking the file again. Individual items can now be
retried or dismissed, and batch progress is weighted by bytes rather than by
file count, so one large file among small ones no longer jumps from nothing to
finished.

Files could not be deleted from this page at all, which is why clearing up
duplicated uploads meant going elsewhere. Cards now carry a delete action behind
a confirmation.

Empty folders, searches with no matches and the loading state each used to be a
single grey line of text. They are now sized like the content they stand in for
and say what to do next.

## [0.27.0] - 2026-08-21

### Added: a board knows which queue its work is pending with

Converting a ticket to a task said nothing about who now owed the work, so the
ticket kept whatever `pending_with` it had and somebody moved it by hand every
time.

The chain to compute it was already in the schema and used by nothing:
`teams.department_id` (whose own comment said it drives Service Desk pending-with
resolution) → `departments.function_key` → `service_desk_stakeholders.function_key`.
Nothing except the bulk org mirror ever wrote `department_id`, and no API exposed
it, so in practice every board rolled up to nothing.

A board's owning department is now set when the project is created and editable
on its settings row, with a per-board bucket override for the board the org chart
cannot describe — a shared triage board two departments feed. Boards resolve only
to *internal* buckets: a board is where work is done, and pointing one at
"Partner" would move tickets out of the desk's own queue the moment somebody
started on them.

Matching tolerates the retired `ops_kam` spelling on either side of the join.
Live workspaces hold it in `departments.function_key` while newer rows
canonicalise to `operations`, and comparing a single string is how this kind of
join silently resolves to nothing — indistinguishable from routing being off.

**Every unresolved case says which one it is.** No department, a department with
no function, no bucket claiming that function: three distinct answers with three
distinct sentences, shown on the board row, in the convert dialog before the
operator commits, and written into the ticket. A routing feature that quietly
does nothing is the complaint this release is answering; a blank badge would have
been the same bug wearing a different hat.

### Added: pending-with buckets are editable

The backend has had full CRUD on this taxonomy since `PendingWith` stopped being
an enum, and nothing rendered it. A desk seeded from the insurance template had
KAM, Insurer, Partner, Sales, Finance and Marketing — and no amount of clicking
could add Tech or Product, which is also why an engineering board had nowhere to
hand a ticket to.

There is a new settings page for it. The server's invariants surface as its
error messages rather than being re-implemented in the UI: one terminal bucket,
the terminal bucket cannot be retired or deleted, one claimant per master-data
table, and no deleting a slug that a ticket or a closed TAT stage still names.

One gap closed underneath: nothing stopped an *internal* bucket being saved with
no owning department, though the industry templates had always refused it on
seeded rows. Such a bucket looks finished in the list and then matches nothing.
The department is now required, chosen as a department rather than as a raw
function key, so the two sides of the join agree by construction.

Retiring a bucket also now actually keeps it out of the hand-off picker. Nothing
filtered `is_active` before — harmless while nobody could retire anything.

### Added: the ticket follows its task between boards

Moving the card onto the Tech board is how work gets handed to Tech, so the
ticket follows.

That surfaced a bug. `move_to_project` is a *fork*: the clone lands on the target
board and the source is archived or marked done. A ticket raised from the source
was left pointing at a dead task — and since conversion refuses a ticket that
already has one, it could not be converted again either. The link now follows the
fork.

### Added: open tickets rolled up by department

The dashboard matrix answers "which queue is this in". With two departments
owning three buckets between them, the question being asked is "who is behind".
Both views are folded from the same numbers server-side, so they cannot disagree,
and external buckets are kept under their own row rather than dropped — otherwise
the department view would quietly sum to less than the bucket board.

### Changed: a resolved ticket stops holding its queue

Completing the linked task moved the ticket to Resolved and left `pending_with`
alone, so it sat in Tech's queue for good — work finished, and the breach clock
still running against them.

It now moves to the terminal bucket, which is what stops the clock. Deliberately
*not* through the normal hand-off, which couples the terminal bucket to
`status = CLOSED` and sends the closure email: both are right when a person
closes a ticket, and neither is right here, because a developer finishing a card
has not spoken to the requester. Resolved-not-Closed stands.

### Changed: long email bodies arrive folded

A partner's first email is often the whole history of a case pasted in, and at
full height it pushed the ticket's own fields, actions and reply box off the
screen — so reading the ticket meant scrolling past the mail to reach anything
you could act on. Folded past a threshold, with the cut faded rather than square:
a hard edge mid-sentence reads as the email itself having been truncated.

### Fixed: converting from the ticket page asks who picks it up

The Log-ticket dialog has always asked for an assignee and the ticket detail
page's own convert dialog never did, so the same action produced an assigned task
from one screen and an unowned one from the other. The backend argument existed
and was simply never sent.

### Migration

`backend/scripts/migrate_team_desk_routing.sql` — adds
`teams.desk_stakeholder_slug` (nullable) and a partial index. Nothing to
backfill: an unset override means "resolve through the department", which is the
behaviour every existing board keeps. Refuses to run if `teams.department_id` is
absent, so a database missing the organization migration fails there rather than
at the first conversion.

## [0.26.0] - 2026-08-21

Which model does this run on? There were four answers, and one of them did nothing.

### Added: one place to configure AI models

`/settings/ai/models` lists every AI feature in the product — fifty of them,
grouped the way you would look for them — and for each one: the model it will
actually use, and where that answer came from. Set a model for a whole group, or
for one feature inside it.

**Nothing on the page is decorative, because the thing it replaced was.** There
was a haiku/sonnet dropdown under code insights, admin-only, that no code had
ever read: you could change it, save it, and change nothing. It is deleted rather
than wired up — making it live would have silently downgraded every workspace
showing the default while it was actually running something else.

**A model belongs to a provider, so a stored choice can go stale.** Pick a Claude
model, then move the workspace to Gemini, and that choice cannot apply. The row
says so — "not being used", with the reason — instead of showing a setting that
looks live. The alternative is a 404 from somebody else's API, hours later, inside
a background job.

### Fixed: AI settings did not apply to agents or to Ask

The workspace AI switch and bring-your-own-key were enforced in one place, and
two of the three paths that call a model did not go through it. An organisation
that switched AI off still had its agents running, and Ask answering, on the
platform's credential. Agents were also pinned to a model Anthropic had retired.

All three paths now resolve through the same function, so the switch means what it
says.

### Added: Word documents, and asking the AI to edit them

A `.docx` is a first-class document — the same tree, permissions, comments,
version history and review queue as any other page — rather than an attachment.
Editing is structure-aware, and pagination matches Word, because a page count
that drifts puts every anchored comment on the wrong page.

Three ways to ask for an edit, and the third is the one that does not start here:
a reviewer opens the file in Word, types `@aexy` in a comment asking for a change,
and sends it back. They hear about the answer, because they are the one who asked
— not the document's owner, who did not.

**Every AI edit arrives as a redline to accept or reject**, never as a saved
change. The panel lists what is in a proposal before you replay it, since "12
changes waiting" is a count rather than something you can review, and it says
which changes will not appear as markup so you are not left hunting for them.

### Added: turning a Word document into issues

A requirements document, a client's review with twenty comments in the margin, a
QA report where every finding is a defect. Read it for work items — open comments,
TODO lines, or whatever the AI finds — and create sprint tasks, bugs, stories or
tickets from the ones you keep.

Two steps, always. It proposes; you remove what does not belong; then it creates.
These become work a team is measured against, and a model that mistook a heading
for a deliverable should not be able to put a phantom task in somebody's sprint.

### Fixed: five AI features had never once run

Each had a call that passed an argument the gateway has never accepted, raised on
every invocation, and had the error swallowed by a surrounding catch. Commit
analysis, attrition risk, burnout risk, performance trajectory and team health
were all switched on, all reported as working, and all doing nothing.

The calls are fixed. They ship **off**, named in `AI_ENABLE_DORMANT_FEATURES`,
because repairing a call is not the same decision as starting to pay for five
analyses nobody has seen run — and the models page says which are off and why. A
feature that is not running should say so; that is the whole lesson of the
dropdown above.

### Fixed: two issues could be given the same key

Bug, story and ticket keys were `count(*) + 1` read in one statement and written
in another, so two people creating at once got the same number. Tickets failed
loudly — a 500 on a public form. Bugs and stories had no uniqueness constraint at
all, so you simply ended up with two things called BUG-004 and every reference to
"BUG-004" ambiguous from then on.

Keys are now allocated atomically, the constraints exist, and deleting BUG-003 no
longer causes the next bug to be called BUG-003.

### Fixed

- **A workspace using its own Gemini key read answers the platform's Claude
  wrote.** The analysis cache was keyed on the prompt alone, with no record of
  which model produced the result.
- **Uploaded files were read by the AI regardless of the workspace's settings** —
  the highest-volume AI path in the product, bypassing the switch, the
  credential, the rate limit and the usage record.
- **Three report metrics crashed instead of rendering.** Team health, bus factor
  and attrition risk built a service without an argument it required.
- **An AI redline was signed by whoever opened the review**, so the document
  claimed a reviewer had written changes they were in the middle of judging. The
  name the workspace configures for the AI was stored, validated, shown in the
  API — and never read.
- **Two notification toggles could not be switched on by anything.** The events
  existed and nothing emitted them.
## [0.25.1] - 2026-08-21

### Changed: a ticket is one email thread

The request and the correspondence were two cards. The request *is* the first
email and each reply is another, so splitting them meant reading one
conversation across two boxes with different shapes — and the request, which
carries the quoted history and the attachments, did not look like a message at
all. One card now, oldest first, same entry shape throughout. The message that
opened the ticket keeps a "Request" badge, and its attachments sit inside it,
where they arrived.

Nothing is hidden by the merge: `body` is the original inbound email and
`correspondence` is the replies in both directions, so the desk's own outbound
messages are still on the thread.

### Fixed: quoted history in the request body

The folding shipped on the correspondence entries only. The request body — the
first thing on every ticket, and the one most likely to arrive forwarded twice —
still rendered its markers raw.

It would not have folded that body anyway. The splitter required everything
after the boundary to be quote, attribution or blank, and real mail ends with
the sender's own signature *after* the quoted block, so no boundary was ever
accepted. The rule is now the first attribution line, or the start of a run of
two or more quote-marked lines; the trailing signature folds with the history,
as mail clients do. A body quoted from its first line still stays whole, and a
lone `>` in prose is still ignored.

Quote depth is indentation rather than markers. Peeling one level per step left
`>` on the oldest lines of a deep thread — the same characters, fewer of them —
so the quoted block recurses and no marker survives at any level. Wrapped
attribution lines ("On <date>, <name> <addr>" / "wrote:") fold too; matching only
the single-line form meant the same email rendered two ways depending on where
it happened to wrap.

### Added: links and images in email bodies

Inbound mail is stored as text, and that conversion leaves artefacts: a
signature logo becomes `[image: https://host/logo.png] <https://host/logo.png>`
and every hyperlink appears twice as `url <url>`, repeated down the whole
thread. Links are links now, duplicated pairs collapse to one, and an image
placeholder becomes a chip naming its host.

The email's own HTML is deliberately not used — dropping a partner's markup into
the page would be a script-injection hole on a body anyone outside the workspace
can send, and sanitising third-party HTML well is not a thing to take on for a
signature logo. Images are not fetched until asked for either: a one-pixel image
in a signature is how "has this been read" gets measured, and a full-size photo
would take over the card.

## [0.25.0] - 2026-08-21

Service Desk, from the ops head's and the tech team's reports.

### Fixed: a logged ticket reaches the partner's own KAM

"Assignment based on Partner in Master Data is not working — I have to move
every ticket to the right KAM by hand."

A manual ticket is created through intake, and intake decides the owner from the
sender address. For a logged call that address is the literal `manual@local`, so
it matched no account and fell through to an arbitrary member of the desk. The
account the operator picked in the dialog was applied to the ticket *afterwards*
and never touched the assignee — so choosing the partner did nothing at all.

Routing now runs after the operator's fields are applied, narrowest answer
first: the account/product pairing, then the account's own owner. A named
account that owns nobody says so on the ticket, because that case still gets an
arbitrary assignee and is the one most in need of explaining.

The unmatched case is now the desk's choice rather than a constant.
`unmatched_assignment` defaults to **"random"** — the historical behaviour, so no
existing desk changes on upgrade — and that is also the option that hid this
class of bug: an arbitrarily-assigned ticket is indistinguishable from a
deliberately-assigned one, so a missing domain mapping surfaced only as a KAM
asking why a partner they do not handle is in their queue. "unassigned" leaves it
visibly waiting and flagged for triage; "desk_head" gives it to one accountable
person. The last-ditch workspace-owner fallback no longer fires under
"unassigned", which would have quietly undone the setting.

Master Data also warns when an account has no domains at all. Sender matching
joins on the domain rows, so such an account can only ever be attached by hand —
and the owner shown next to it makes that look configured.

### Added: finishing the task resolves the ticket it came from

`Ticket.linked_task_id` has been written by the convert-to-task flow since it
existed and was read by nothing. The engineering finished, the card went to
done, and the ticket stayed open — so the requester chased something fixed days
earlier and the desk's open count was wrong.

**Resolved, not Closed.** The ticket is a conversation with somebody outside the
workspace and the developer who moved the card has not spoken to them; closing it
there would end that conversation on a board action. Both status write paths are
hooked, because a card can be completed from either and a ticket that closes only
via one of them looks random. It goes through `update_ticket`, so `resolved_at`,
the status-change row, the automation events and the activity entry all happen
exactly as when a human resolves it, and it is idempotent on the transition so
dragging a card back and forth does not re-resolve or re-notify.

Notifications reach two audiences on two channels: the ticket's owner through the
notification system (new `TICKET_RESOLVED` event, email on by default), and the
requester by plain email since they usually have no account. The requester's copy
is marked auto-generated — without that a watched Service Desk mailbox turns our
own outbound message into a new ticket, so resolving one would open another.

Fixes a pre-existing crash found on the way: the cycle/lead-time arithmetic on
the done path subtracts `created_at` from an aware `now()`, which raises when a
driver returns a naive timestamp. SQLite always does, so completing a task threw
`TypeError` on any non-Postgres connection — which is why no test covered task
completion through that path.

### Added: a ticket has a title of its own

There was no such column. The subject lived in `field_values["subject"]`, so the
detail page headlined the **form** name and every ticket raised through one form
read identically; sorting or filtering by subject went through a JSONB
expression no index helps; and a form with no subject field produced tickets with
nothing to call them.

`tickets.title` is backfilled from where the subject has always been kept —
trimmed, blanks and JSON nulls left NULL rather than becoming a title of "", and
bounded to the column. Readers prefer the column and fall back to the submission
blob, so a row the backfill could not fill displays exactly as before. The form
name now sits under the heading instead of standing in for it.

### Added: attachments and the task, while logging the call

The log dialog can attach the files the requester sent and raise the project task
in the same pass, with the project and who is picking it up. Converting a ticket
to a task now carries the ticket's files onto the task as well — they reference
the same stored objects rather than being re-uploaded, so deleting one copy
cannot leave the other resolving — and takes an assignee, validated as a member
of the workspace before work is put on them.

The three steps run in that order because each needs the id the one before
produced: the attachment endpoint is addressed by ticket, and the task copies the
ticket's files as it is created. If a later step fails the ticket still exists and
the dialog says what did not finish, because somebody is on the phone.

### Added: pagination on the dashboard

`GET /dashboard` returned every open ticket. It now takes `limit`/`offset` — but
only the ticket list is paged: the stakeholder matrix and the open/breaching
counts stay whole-desk, because a queue board reporting "3 waiting" when that is
all that fitted on the page would be worse than a long page. The CSV export
re-fetches unpaged, so pressing export never quietly gives you one page.

### Changed: quoted email history is folded away

Correspondence was rendered raw, so every reply carried the whole thread again
behind `>` and `>>` markers and the newest message — the only part being read
for — sat above screens of text already read, repeated once per reply. The quoted
part is now folded behind a toggle. Folded, not dropped: it is the record of what
was actually sent, and on a ticket forwarded twice it is sometimes the only place
the original request survives.

## [0.24.3] - 2026-08-20

### Fixed: an attachment whose name was not ASCII returned a CORS error

Reported from production immediately after 0.24.2:

```
Access to XMLHttpRequest at 'https://server.aexy.io/api/v1/task-attachments/…'
from origin 'https://aexy.io' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

CORS was configured correctly, and the endpoint returned the right headers on a
401 and on preflight. The real fault was `Content-Disposition`: it interpolated
the filename straight into the header, and header values are encoded latin-1, so
any character outside that range raised `UnicodeEncodeError` while the response
was still being built.

The character doing it in production was `\u202f`, a narrow no-break space —
what macOS writes before AM/PM in a screenshot filename. So this was not an
exotic-name edge case: it was every screenshot dragged off a Mac, which is most
of what gets attached to a task. Devanagari, em dashes and emoji fail the same
way.

`CORSMiddleware` sits inside `ServerErrorMiddleware`, so a 500 raised in the
router is answered by the outer one and never gets CORS headers added. The
browser has no way to tell that apart from a real CORS refusal, and reports the
symptom rather than the cause — which is why the message named the one thing
that was not wrong.

The name is now emitted in both forms: the plain one with non-ASCII characters
substituted, so an extension survives for clients that pick an application from
it, and an RFC 5987 `filename*` carrying the real name. Substitution rather than
deletion matters here — `Screenshot 2026-08-20 at 3.46.22_PM.png` still reads as
the file somebody recognises. A blank name falls back
to "attachment", because an empty plain form reads as "no name given" and those
clients answer with the last URL segment, which on these routes is a bare id.

Ticket attachments had the identical bug and were more exposed to it — those
names arrive from whoever emailed the desk. The service desk's own download had
already solved this correctly; all three now share one builder rather than three
copies of the reasoning.

## [0.24.2] - 2026-08-20

Two silences. An account that had stopped working and never said so, and a file
that could not be fetched because nothing served the bucket it lived in.

### Fixed: a connected account could stop working without telling anyone

A desk went a day without tickets. The mailbox was fine, the schedule was fine,
the worker was fine — Google had revoked the refresh token, the integration was
marked inactive, and the poller's `is_active` clause skipped it on every tick.
Finding that out meant reading the poller's query and then querying the database
by hand.

A connection that is refused now notifies the person who connected it and the
workspace's owners and admins — the connector may have left, and an account
nobody owns is the one that goes unnoticed longest. Email is on by default,
because whoever can reconnect it is not necessarily looking at the app.

It fires when the connection is refused, not when a sync fails. Timeouts, rate
limits and one bad message all retry and resolve themselves; notifying on those
teaches people to ignore the channel, which costs the one message that mattered.
Wired into the three places a connection actually dies — Google auth failure
mid-sync, Google refresh-token revocation, GitHub credentials refused — and
GitHub notifies once per account rather than once per repository, since thirty
repos would otherwise mean thirty notifications an hour.

The notification also has to land somewhere that can fix it. Google pointed at
`/settings/integrations`, which has no Google section; the accounts live on
`/settings/connected-accounts`. GitHub pointed at `/settings/identity` while the
Reconnect banner sits on `/settings/integrations`. And on the Google page the
button did not exist: a disconnected account showed a red pill whose only
neighbouring control was the bin, so the way back was to delete the account and
re-add it — which on a desk mailbox is refused outright, leaving no way back at
all. There is a Reconnect now, and the row says *why* it stopped: `last_error`
was already on the response and the list ignored it.

### Fixed: `check_auto_sync_integrations` never reported an outcome

It announced itself every minute and said nothing about what it did, so a desk
receiving no mail looked exactly like a desk with no mail to receive. It logs the
tally now, and warns by name when a desk mailbox's integration is inactive, with
the reason.

### Fixed: a sync job whose worker died blocked that account forever

`has_live_sync_job` matched pending/running with no age bound, so a job killed by
a deploy, an OOM or a database that went away mid-sync reads as live
indefinitely. Anything past an hour is marked failed and no longer blocks the
next run. Timestamps are normalised before comparing — Postgres returns them
aware and SQLite naive, and the raise would have been swallowed by the caller's
broad `except` and reported as a failure to trigger, which is how both previous
defects in this function hid.

### Fixed: attachments 404'd because storage had no public route

A task attachment resolved to
`https://server.aexy.io/storage/aexy-storage/task-attachments/…`, and that host
terminates at the backend. RustFS is `expose`-only in `docker-compose.prod.yml`,
the nginx meant to broker it was never a service in that file, and
`nginx/nginx.conf` was mounted by nothing — so the request reached FastAPI,
which has no such route and answered `{"detail":"Not Found"}`. A 404 that reads
like a deleted file and means an unrouted bucket.

Presigning the URL, which an earlier fix did, could not have helped: a signature
is only worth as much as the hostname carrying it.

Task attachment reads now go through `GET /api/v1/task-attachments/{id}`. The
backend already holds an internal connection to storage, so serving the bytes
itself removes the dependency on a proxy existing, resolving, and leaving the
signed path alone. Three ways to serve a dead link, gone. It also turns the URL
from a capability token that anyone holding it can redeem into a membership
check against the task — an attachment stops being readable when someone loses
access, rather than when the signature happens to expire.

The route is keyed on the attachment alone, with no workspace, sprint or team in
the path, so one URL stays correct when a task moves between a sprint and the
backlog. It resolves the governing workspace from the task, falling back to the
sprint or the team for rows written before tasks carried a workspace, and
refuses rather than serves when it can place the file with none of them.

### Fixed: the AI metadata pipeline depended on the same missing hop

It presigned a URL and fetched it over HTTP — routing our own bytes out through
a public hostname to come back in. Where that hostname doesn't reach storage,
every extraction failed as a 404 that said nothing about the cause. It reads the
object directly whenever it holds the key, which is every case that isn't a
genuinely remote file.

### Added: a way to publish storage for everything else

Drive files, compliance documents, chat downloads and assessment recordings are
still handed presigned URLs, and those still need storage on a reachable
hostname. `docker-compose.prod.yml` now has an `nginx` service behind an `edge`
profile:

    docker compose -f docker-compose.prod.yml --profile edge up -d

Behind a profile because most deployments already terminate TLS elsewhere, and
starting a second thing that wants port 80 would take a site down rather than
fix one. The alternative is copying the `location /aexy-storage/` block into the
proxy you already run.

Two rules either way, both now stated in `DEPLOY.md` and the file-uploads guide:
`S3_PUBLIC_ENDPOINT_URL` is a bare origin, and the path is not rewritten. SigV4
signs the URI, so a `/storage` suffix signs a path the origin never sees and a
prefix strip invalidates every signature. Two docs had been prescribing the
suffix.

## [0.24.1] - 2026-08-20

### Fixed: adding an account 500'd instead of naming the clash

```
UniqueViolationError: duplicate key value violates unique constraint
"uq_service_desk_account_domain"
```

The constraint is right — a domain decides which account a ticket belongs to, so
two accounts claiming one has no correct answer. What was wrong is that it was
refused as a 500, raised from inside an autoflush that `_replace_account_products`
happened to trigger, so the person adding the account saw a stack trace naming a
constraint rather than which entry to change, and no way to find the account
already holding it.

The clash is looked up before anything is written, and the message names both
halves: the domain, and the account that has it. Update excludes the account's
own rows, or renaming an account would refuse its own domains back to it. The
pre-check runs inside `no_autoflush`, since flushing the pending domains to run
the check is exactly what produced the 500. A second claim arriving between check
and flush still hits the constraint, so that stays caught — the constraint
remains what decides, and the message says to reload rather than pretending to
know whose it is now.

### Fixed: a database built by the older version of the email migration

Reported from a deployment: `column "is_active" does not exist`, and the runner
stops there, taking every migration behind it.

This one was self-inflicted. The earlier fix renamed `dedicated_ips.status` to
`is_active` because that is what the model says — correct for a database the ORM
built, wrong for one this file built, which still has `status`. `CREATE TABLE IF
NOT EXISTS` does nothing to an existing table, so the column never appears and
the index over it cannot be created.

Three renames shared the assumption. Each is now added with `ADD COLUMN IF NOT
EXISTS` before anything indexes or writes it, and the two renames carry their old
values across rather than leaving a column of defaults. Legacy columns are left
in place — dropping somebody's data is not this file's call.
`dedicated_ips.status` maps active/warming to true and pending/paused to false;
defaulting every row to true would have quietly resumed sending from a paused IP,
which is the one outcome here worth being careful about.

Verified against four databases — one built by the previous version of this file
carrying rows in all four legacy statuses, one built by the ORM, one empty, each
run twice. All four converge on the app's schema and stay at three system
schedules.

## [0.24.0] - 2026-08-20

### Added: search the ticket list, and sort it by any column

The list had seven filters and no way to search. With a screen of tickets that is
tolerable; a desk past twenty and climbing is looked through by the subject line
somebody half-remembers, or the number in a colleague's message.

Search matches subject, requester name and address, and the ticket number — typed
as "SD-26", "sd 26" or "26", since the prefix is per-workspace and is not stored
on the row. Deliberately not the body: the desk keeps whole email threads, so
matching quoted history would return every reply in a chain for a word said once,
ranked by nothing. LIKE metacharacters are escaped rather than rejected —
somebody searching for a subject with "100%" in it means the character.

Sorting is server-side, because the list is paged and sorting a page would
reorder fifty rows out of six hundred and read as data loss. The key is a
`Literal` on the filters model, so an unknown column is refused at the edge
rather than reaching a query, and an id tiebreak sits under every order —
without it two rows sharing a sort value can swap between pages, showing one
twice and the other never. A column starts in the direction that reads as its
interesting end, newest-first for a date and A→Z for text, and clicking the
column already in force reverses it.

Both live on `TicketFilters` alongside the filters, so a CSV export still carries
exactly the rows, in exactly the order, of the screen it came from.

### Added: filter chips, and an age column

Ten controls sat in one wrapped row, each with its own label, all the same
weight — two reached for constantly and eight rarely, and no answer at all to
"which of these are set?" without reading every one. Search and state stay out
front with a Filters button; the rest move behind it, opened by default whenever
something inside is already set, so a narrowed list never hides its own reason.

Each applied filter is a chip saying what it narrowed and to what, removable on
its own, because clearing everything to undo one wrong choice is why people stop
using filters. Values resolve to names — a chip reading `Customer: 352b8193-…`
would be worse than no chip.

The table grows an age column. It was sorted newest-first and showed no date at
all, so "has this been sitting for a week" was unanswerable without opening rows.
Age rather than a timestamp because that is the question being asked, and rounded
down, so a ticket does not read as breaching a two-day target an hour before it
does.

### Fixed

- **Three filters the API already supported were never on the screen** — vendor,
  owner, and the caller's own queue. Owner keys on developer id, not the
  membership row id, which looks identical in a dropdown and matches nothing.
- **An empty search said the work did not exist.** "No open tickets. New email
  requests will appear here automatically" is untrue of a desk with twenty
  tickets and one bad search, and points the reader at waiting for mail instead
  of at the filter they just set.

## [0.23.3] - 2026-08-20

### Fixed: mail that copies the desk opened no ticket

The inbound webhook read one address — the first name in the To line — and looked
for a mailbox at exactly that. A customer writing to their account manager and
copying the desk resolved to the account manager, matched no mailbox, and
returned False. No ticket, no log line, nothing on the desk to notice.

Two ways to lose a request, not one: Cc was never parsed at all, and even within
To only `[0]` was read, so a desk named second on a message addressed to two
people was dropped the same way.

Every recipient is now collected from all three payload shapes the providers
send, and the mailbox is looked up across them. Plain To stays first so a desk
addressed directly still wins when two desks are on one mail, and the address
that matched is what intake receives as `to` — downstream reads that as "which
desk is this", and on a copied-in message the first To is a customer's account
manager. `_recipient_addresses` takes what the providers really send rather than
what they document: a bare string, a comma-separated header, a list of strings,
or a list of `{"Email": …}` dicts.

The Gmail path finds its mailbox from the integration and was never affected.

## [0.23.2] - 2026-08-20

### Fixed: the email migration could not complete on a fresh database

Answering "is this safe for production" turned up the case the earlier fixes
missed: a fresh database where migrations run before the app starts. That is the
normal deploy order, and it was the one order this file could not survive.

Two blocks add columns to `email_campaigns` and `campaign_recipients`, each
correctly wrapped in `IF EXISTS (…)` because both tables come from
`migrate_email_marketing.sql`, which sorts after this file. Both blocks then
appeared a second time, unguarded — so on a fresh database the unguarded copy
aborts the migration and the runner stops, taking every later migration with it.

With those gone the file completes on an empty database and then creates tables
the ORM cannot use, because `create_all` adds missing *tables* and never missing
*columns*. Fourteen columns across five tables existed only in the models. They
are added as `ADD COLUMN IF NOT EXISTS` beside the ones already there, so both
orders converge.

### Fixed: the warming-schedule seed duplicated itself on a second run

The seed is `ON CONFLICT DO NOTHING` against a unique constraint on
`(workspace_id, name)`, and the system rows it inserts carry `workspace_id IS
NULL`. Postgres treats NULLs as distinct in a unique constraint, so that clause
never fires for them: a second run inserts a second complete set of Conservative,
Moderate and Aggressive, and a third inserts a third — silently, with no error
anywhere.

Existing duplicates are collapsed, repointing `sending_domains` and
`dedicated_ips` at the surviving row first so a schedule in use is not quietly
detached, then a partial unique index on `name` where `workspace_id IS NULL AND
is_system` makes the existing conflict clause mean something against any future
writer.

The predicate is narrowed to `is_system` deliberately. Covering every
`workspace_id IS NULL` row while the dedupe only collapses system ones leaves a
non-system row sharing a system schedule's name as a duplicate the dedupe had no
mandate to remove — and `CREATE UNIQUE INDEX` fails on it. asyncpg runs the whole
file as one implicit transaction, so that failure rolls back the migration and
stops the runner: the same cascade this work exists to end, reintroduced by the
fix for it.

## [0.23.1] - 2026-08-20

### Fixed: 81 migrations were queued behind one that had never applied

The email-infrastructure migration was written against a schema the ORM models
have since moved away from. Because the app creates these tables from the models
on startup, its `CREATE TABLE`s were all skipped and only its indexes and seeds
ran — against columns that no longer exist. The runner stops at the first
failure, so 81 later migrations sat behind it.

Four points of drift, each taken from the model rather than guessed:
`dedicated_ips.status` is `is_active`, a boolean; `warming_progress.ip_id` is
`dedicated_ip_id`; `warming_schedules` has neither `total_days` nor `is_active`,
and does have `auto_adjust_volume`. Its seed also spells out the three thresholds,
because the model's defaults are Python-side and leave the columns NOT NULL with
no server default.

### Fixed: two crashes reached the error boundary

Both the same shape — an optional chain that stops one property too early.
`departmentOf` read `functionCatalog?.options.find(…)`, where `?.` guards the
object and nothing guards `.options`, so any catalogue response without that key
took the whole dashboard down. `AiAccuracyPanel` read `data.by_request_type.map(…)`
behind a `data.classified === 0` guard, which a payload missing `classified`
walks straight past. Both now guard the property they actually index.

A third looked identical and was not: `ticket.email_recipients` is non-optional
in the type and always sent, so the mock was simply wrong. Guarding it would have
hidden a broken fixture behind a defensive `??`; the fixture is fixed instead.

The service desk e2e spec had been failing on all seven tests against a route
table that had drifted from the API — accounts, vendors and products still mocked
under the old partners/insurers/lobs names, `{}` where a list belonged, and three
tests pointing at a settings path that is now a redirect. One of those was hiding
a real gap rather than a fake one: the ticket list route matched a bare path, so
once filters added a query string the empty-list fixtures silently stopped
applying, and the test asserting "no misconfiguration message" was passing
against a list of two tickets.

### Fixed

- **A ticket read `in_progress`** while every cell beside it went through a label
  helper. `ticketFieldLabel` already existed for exactly this: the same state
  should not read two ways on one screen.
- **The digest and AI settings pages said the same sentence twice**, an inch
  apart — one string feeding both the page header and the toggle beneath it. Each
  toggle now says what it does.
- **Ignored senders moves to its own card.** Sharing the department card, its
  description read as if it explained the department picker.
- **Two placeholders were clipped mid-word** — measured, not guessed: 203px of
  text in 194px, and 295px in 262px. Widening the input was tried and rejected,
  because at 240px the Add button wraps to its own line.
- **`NotificationItem` imported `GitMerge` and `GitPullRequest` from
  `next/navigation`**, which exports neither, breaking `tsc`.

## [0.23.0] - 2026-08-20

Six things, all found by running the catalogue generator against main and reading
what it complained about.

### Fixed

- **Two capabilities sat outside the access model.** `documentation_impact` and
  `gmail_push` had no `TAG_TO_CAPABILITY` entry — exactly what the MCP
  catalogue's `--check` guard exists to catch. `gmail_push` maps to `system`
  rather than a domain capability: an inbound Pub/Sub webhook is machine ingest,
  not something an agent should be able to address at all.
- **The generated catalogue fixture was stale by twelve operations.** A fixture
  the code no longer matches is worse than none, because the check reports green
  while the tool list a client receives disagrees with it.
- **Two routes were registered twice.** `get_public_form` existed in both
  `forms.py` and `public_forms.py` under the same prefix, and the four reminder
  instance handlers were byte-identical copies within one file. In both cases the
  later copy was unreachable — dead code still emitting a duplicate operation id.
- **`days_open` was holding seconds.** The arithmetic divided correctly at the
  end, but that is how a later measure gets the unit wrong. It is `open_seconds`.
- **Service desk analytics reached for a private method** to reuse the ticket
  scope clause. It is public now: a second module using a leading-underscore
  method makes that boundary a lie rather than a rule, and the risk is a chart
  narrowed differently from the list above it.
- **The version was describing pre-feature code.** The service desk shipped under
  0.22.1 without a bump.

## [0.22.1] - 2026-08-18

Reviewing the previous entry found nine things, and one of them was the way in.

### Fixed: the documentation impact page could only be reached once

Its only entry points were a notification row and a pull request comment — and
the comment is off until an admin turns it on. Clear the notification and the
page was gone, for everybody, permanently. Merged changes on the docs list now
link to it, with the number of pages each merge affected, so there is a way back
that does not depend on nobody having tidied their bell.

### Fixed

- **A failed request said the pull request had never been checked.** Those are
  opposite facts: one means we looked and found nothing, the other means the
  request did not arrive. The wrong one sends you to look in the wrong place.
- **The page never named the repository**, so "#412" was all you got — useless
  with pull requests open in more than one — and there was no link back to the
  pull request at all.
- **"Ask for an update" could be double-clicked**, which meant two generated
  proposals, two model calls, and two things for somebody to review. It also did
  not re-read the page afterwards, so the button stayed there inviting the
  second click.
- **"2 of 1 changed files are described by a page here."** The matched count
  spanned every push; the total only the latest one.
- **Your own pull request notifications rendered as an anonymous grey bell** —
  indistinguishable in the list from a document somebody shared with you.
- **A pull request comment kept claiming work after everybody had answered.**
  Mark every page as needing no update and the comment still said "2 pages
  affected"; it now says there is nothing outstanding. It never posts a comment
  purely to say nothing is wrong.

### Fixed: accessibility on the impact card

"No update needed" reveals a panel, so it announces as one now, and the panel it
claims to control is asserted to exist. Saying no announces its outcome — the
sighted feedback is a line appearing and the card fading, and neither reaches
somebody who cannot see it. The reason field takes focus when it appears rather
than leaving a keyboard user to tab past the input they just asked for.

## [0.22.0] - 2026-08-18

Your pull request affects three pages, and one of them is full of screenshots.

### Added: documentation impact, per pull request

The existing sync tells the person who *wrote* a page that its code moved, after
the merge. This tells the person who *changed the code*, while the pull request
is still open — the only moment when updating the page is part of the same piece
of work rather than a separate errand.

**It names what it checked.** Which pages describe the code you touched, which of
your files matched each one, and — the part nothing here could answer before —
how many screenshots each page carries and which sections they sit in. Images in
a document are bare URLs somebody pasted, absent from the search index, with no
record of what they depict; finding them at all meant walking the document.

**Every line has to be earned.** A rule fires only with a signal from the change
*and* a signal from the page. A backend-only pull request against a page full of
screenshots says nothing about screenshots — that silence is the feature. A
generic "remember to update the docs" is what this exists instead of.

**"No update needed" is a real answer.** Per pull request, per page, attributed,
and it suppresses the merge-time nudge for that page. Without it the only way to
stop being asked is to mute the category, and then everything else goes quiet
too. It deliberately does *not* clear the page's own out-of-date badge, and says
so — that badge answers a different question.

**Asking for a generated update warns you first.** Generation rewrites prose from
the source and cannot emit an image, so on a page with screenshots it deletes
them. The control is demoted to a text link there, with the warning next to it.

### Added: optionally, in the pull request itself

A workspace admin can have Aexy comment on the pull request, add a
"Documentation impact" check to the commit, or both. One comment per pull
request, edited in place as you push — a bot that posts on every push is the
surest way to get an integration switched off. The check reports as neutral and
never blocks a merge unless you ask it to.

Both are **off until switched on**, and both need permissions the GitHub App does
not request by default. Grant "Pull requests: write" or "Checks: write" and it
starts working immediately — Aexy now handles the `installation` webhook, so
there is nothing to re-authenticate. If a write is refused, the reason appears in
Settings → Repositories, where the person who can fix it is; the in-app
notification goes out regardless, because an org's App permissions are not the
author's fault.

This is a workspace setting rather than a personal preference, which is a real
cost and is stated in the settings copy: a comment is one artifact every reviewer
sees, so an individual author cannot opt out of it.

### Fixed

- **`ready_for_review` did nothing.** The webhook branched on it for real-time PR
  analysis, but it was missing from the processable-action list, so marking a
  draft ready produced nothing at all.
- **The setup guide's GitHub App permissions were wrong** — read-only, and missing
  the `contents: write` the publish path has always needed.

## [0.21.0] - 2026-08-17

Documentation that notices when the code it describes has moved on.

### Added: a document can be linked to the code it documents

A page points at a repository path — a directory, a file, a module — and keeps
the commit it was generated from. When something merges into that path, the page
knows it is behind.

**It proposes a revision rather than rewriting itself.** The revision is made
against the diff, not from scratch, so prose somebody wrote by hand survives a
change to the function it describes. A document says how it wants to be kept up
to date; "propose" is the default because a page that silently rewrote itself
would make the last person who edited it wrong without telling them.

**Nothing wakes the LLM for a whitespace commit.** The change is checked for
whether it touches anything the document could describe before any generation
happens, which is also what keeps a busy repository from spending a workspace's
month of tokens on formatting.

**A sync has an owner.** The tier it runs on and the LLM spend it incurs are the
owner's, and ownership carries a GitHub credential fallback — so it transfers
when that person leaves the workspace, and only the current owner or an admin can
hand it to somebody else. That last part was a member-level action, which made
it a way to bill a colleague for regeneration you were not entitled to.

### Added: one queue for everything waiting on a person

Proposals, agent writes awaiting approval, and comments needing an answer, in one
place per workspace, **grouped by the change that caused them** — one merge that
touches six documents reads as one item with six pages under it rather than six
unrelated rows. The diff is rendered as a diff. The count fills in the sidebar
without having to open the page, and a page that is behind its code is marked in
the tree while you are browsing rather than after you click it.

### Added: generating documentation without a coding agent

Point at a repository and get a first draft: whole-repository from the server, or
module by module from the CLI for a large codebase. The docs workflow has named
MCP tools, so an agent asks for "the document for this path" instead of inferring
it. `suggest-improvements` is reachable now — one suggestion at a time, each
applicable on its own.

### Changed: an agent's write always lands as a proposal

The gate read a request header, which the caller sets. The hole ran the opposite
way from the obvious one: an agent holding an ordinary workspace token could call
the document API directly and write straight through. The marker lives in the
signed token now, so it is the server's decision and not the client's.

### Fixed

- **The repository picker listed your repositories, not the workspace's.** Anyone
  who had not personally connected GitHub saw an empty list on a workspace with
  dozens of repositories.
- **"admin" meant different things in different places.** A custom role based on
  the admin template, or carrying admin priority, was admin to one check and a
  member to another. One function decides it now.
- **A push whose commits carry a PR number is attributed to it**, so a proposal
  from a squash merge says which pull request it came from instead of only a SHA.
- **Changing app access could fail silently** — a 403 left the grid looking as
  though it had saved.
- **A button read `review.approveAll`**, and the insights page gated on a list it
  was not using.

### Fixed: the test suite was reading a developer's own database

One arbitrary test went red per full run — `'float' object has no attribute
'replace'` from inside `uuid.UUID`, in whichever test happened to be running, and
never reproducible on its own. Two causes, both about the process-cached engine:
it outlived the event loop that opened it (pytest-asyncio gives each test a new
one, and aiosqlite connections are loop-bound), and it was built from
`DATABASE_URL` rather than the test database, because `get_async_session()` is
called directly and so cannot be redirected by a dependency override. The
readiness check was therefore asserting that the developer's Postgres was up.
Both are fixed, and the guard that refuses to drop a database whose name is not
clearly a test database now covers the application's own engine too.

## [0.20.1] - 2026-08-17

Tell us what Aexy should do next — and the first app that asks you to.

### Added: feedback, and voting on it

A suggestion, a problem, a question, or a request for an app we have not
switched on. Written from one composer, reachable from the command palette, the
feedback board, and the access grid.

**The board is shared and votable.** Ten teams asking for the same thing should
read as one item with a count rather than ten copies nobody can compare, which
is why items are visible across workspaces. That is only acceptable if wanting
something does not also disclose who wants it, so a row on the board carries no
author and no workspace — only whether it is yours. Sending something counts as
your first vote for it, because a new item sitting at zero next to a week-old
one reads as unwanted rather than new.

**Every item gets an answer.** Feedback goes to the people who build Aexy rather
than to your own admins, and a status — triaged, planned, shipped, declined —
notifies whoever wrote it. "Declined" is a status on purpose: an answer of no
that is never delivered is indistinguishable from being ignored.

The composer shows you the context it is attaching — the page you were on, the
workspace — before you send, because collecting that quietly is the sort of
thing you should be able to check first.

### Changed: Learning is switched on by us, not from the access grid

Learning is off everywhere and cannot be enabled from inside a workspace. It
stays listed in the access grid, because an admin should be able to see that the
app exists and ask for it, but the checkbox is inert and every path that could
grant it — a member's overrides, an access template, approving a request —
refuses it rather than only the obvious one.

Asking for it opens the feedback composer instead of filing an access request.
An access request asks your workspace's admin for something they control; nobody
in your workspace can grant this one, so a request would have sat in a queue
with no action available to anybody who could see it.

### Fixed: the app catalog endpoint could not be read at all

`get_app_list()` assumed every module has a route. The MCP modules gate groups
of API capabilities and have nothing to navigate to, so the lookup raised and
took the whole catalog down rather than the one module with it.

## [0.20.0] - 2026-08-17

### Added: your service desk tickets, on Home

Home listed tasks, bugs, stories and form tickets — everything on your plate
except the queue some people spend their whole day in. Service Desk tickets are
rows in the same table as form tickets but they are not the same thing: the desk
is its own app, with its own permission and its own row-level visibility, and
the generic ticket list excludes them on purpose so that turning the module off
does not leave its tickets showing up elsewhere. So they arrive here as their
own source rather than by loosening that exclusion.

**Only the ones assigned to you.** The desk's own scope can be an entire
account's traffic — that is a triage view, and this page is a personal one. The
filter is applied on top of the desk's visibility rules and never instead of
them: asking for "assigned to me" cannot surface a ticket the desk would deny
you, so an assignment left behind when somebody moved off an account stays
invisible to them. The "Everyone's tickets" toggle beside it still widens the
form tickets it was built for, and deliberately does not reach across.

The source is gated on Service Desk access on its own, so somebody on the desk
and off forms sees their desk queue and no form tickets, and the reverse holds
too. Rows open the ticket in the desk. A tracker you have no access to is left
out of the breakdown entirely rather than shown sitting at zero, which reads as
"none of those" rather than "not yours to see".

## [0.19.1] - 2026-08-17

Switching workspace now moves the page you are on, and the changelog is
readable.

### Fixed: switching workspace left the page showing the old one

The selected workspace was component state inside `useWorkspace`, so each of
the roughly 270 places that ask for it kept its own copy of the answer.
Switching re-rendered whichever component owned the switcher and wrote the
choice to storage; everything else went on querying the workspace you had just
left until something happened to remount it.

Navigating hid it, because a page freshly mounted reads the stored choice — so
for as long as the landing page was a set of charts about you rather than a
list scoped to a workspace, it mostly went unnoticed. Home is a list scoped to a
workspace, the switcher sits beside it, and nothing remounts: the page simply
did not respond. Its own workspace selector was no better, since the widgets
and the page around them each held their own copy.

There is one selection now, and every consumer hears about a change, so
anything keyed to the workspace refetches where it stands.

### Fixed: Automations on Home looked like a dead button

The panel opened below every widget on the dashboard, which on any layout with
more than a couple of them is off the bottom of the screen. Pressing the button
moved nothing you could see. It opens directly under the toolbar it belongs to
now.

### Fixed: the changelog was a narrow column of fragments

Three things, none of them width alone.

Entries here are hard-wrapped at about eighty columns, and each of those lines
was being rendered as its own paragraph — so the text broke every eight or nine
words, at whatever point the source happened to wrap rather than where the
sentence ended. A paragraph is everything up to a blank line now, as the format
means it.

Section headings passed their whole title — "Fixed: most of the list was not
clickable" — to a lookup keyed on "fixed" or "added", so the colour coding never
matched anything: every section came out the same grey, with the heading itself
set in the twelve-pixel type of the pill it sat in. The kind is a coloured pill
now and the sentence after it is a heading.

The column is wider, and the width went to a version rail that stays with you
down a long entry rather than to longer lines — prose stops being readable much
past seventy characters, so widening the text would have been the wrong use of
the space.

### Fixed: the frontend lockfile version

Three releases behind at 0.14.0, where it had been left by whichever release
last bumped `package.json` without it.

## [0.19.0] - 2026-08-16

The work assigned to you is now the first thing you see, and the four things
about that list which quietly did not work.

### Changed: Home is your work; the old dashboard is Insights

Landing on Aexy showed language proficiency charts and a growth trajectory.
Useful once a quarter, but not what anyone opens the app to find out. What you
came for — the tasks, bugs, stories and tickets on your plate — was at
`/my-work`, behind a nav item most people never clicked, beside a second nav
item that opened the same list under a different name.

So My Work is Home, at `/dashboard`, and the widget dashboard it replaced is
Insights, at `/dashboard/overview`. `/my-work` and `/tickets` redirect there, so
bookmarks and the links scattered through the command palette, the app header,
the `t` shortcut and several widgets all still land somewhere sensible. The
duplicate nav entry is gone rather than moved: two items opening one list is
what this navigation keeps being cleaned up for.

Home is built from the same widget system as Insights — same registry, same
drag-to-reorder, same customize modal — so it can be shaped like any other
dashboard. Three new widgets (the stat tiles, the work queue, a breakdown by
tracker) share one filter store, which is what lets a tile scope the queue below
it even after the two have been reordered or one has been hidden. Layouts are
per surface: rearranging Home leaves Insights untouched, and the other way
round.

Widgets that read their data from the Insights page are kept off Home's picker.
Rendered without it they show "Top: undefined", or throw when a handler that was
never passed gets called — a widget offered and then broken is worse than one
not offered.

### Fixed: your work list showed every workspace at once

`GET /developers/me/assigned-tasks` filtered by assignee and nothing else. For
anyone in more than one workspace that meant both workspaces' work in a single
undifferentiated list, with no way to say which one they meant — and no way to
tell, looking at a row, which one it came from.

The list is scoped to a workspace now, each row says which, and a workspace the
caller is not a member of is refused rather than quietly returning nothing. The
selector appears once you are in two or more workspaces and follows the
workspace switcher rather than remembering a workspace of its own, because a
dashboard showing one workspace while the header names another is the same
confusion in a new place. "All workspaces" stays, as something you choose.

### Fixed: most of the list was not clickable

A task opened its board only when it knew both its sprint and its project. Bugs
and stories never opened anything at all, because the API never sent the ids a
link needs. The rows looked interactive throughout and, for most of them, did
nothing.

Every row is a link now — so middle-click and cmd-click work, which they never
did while rows were click handlers — and each one resolves somewhere: a task
through the resolver that finds its own board, a bug to its board's detail panel
through a new deep link, a story to its epic.

### Fixed: the counts at the top were decoration

Four cards told you three things were in progress and gave you no way to see
which three. Each is a filter now, pressing the active one clears it, and the
counts stay whole while filtered so you can still see what else is waiting.

### Removed: Manage Forms, from the page about your own work

Ticket form configuration is settings, and it sat on a page that answers "what
is on my plate?". It is still in settings. The workspace-wide ticket triage
queue some people rely on survives as the assigned-to-me toggle, and ticket
automations open on request instead of holding a permanent tab.

### Migration

`migrate_dashboard_surfaces.sql` adds a `surfaces` column to
`dashboard_preferences`, where the layouts of dashboards other than the default
one live. There is one preferences row per person and it also carries sidebar
state, so a second dashboard could not simply take a row of its own — every
sidebar lookup selects by developer alone and would have started finding two.
Empty by default: an absent entry means "never customised", which the API reads
as the surface's own built-in layout.

## [0.18.2] - 2026-08-13

A month-end engineering report built from what the repo sync already knows —
and the five things the sync was not recording that a report of that kind
needs.

### Added: Monthly Engineering Report

Reports → Monthly Engineering. The report an engineering lead assembles by hand
at month end: contributors, commits, source lines, merged pull requests, a
per-person table, activity per repository, and observations drawn from the data
— where work concentrates, who carries the merges, how much of the month went
into porting the same change between branches, and how many merged PRs nobody
commented on.

Three commitments shape the arithmetic, because a report about people's work is
read as a judgement about people whether or not it was meant that way.

**Bots and merge commits are out.** A release bot's version bumps and a merge's
combined diff are not somebody's contribution, and counting them flatters
whoever happens to integrate.

**Lines are source lines.** Lockfiles, `dist/`, `build/`, `vendor/`,
`node_modules/`, coverage output, minified bundles and generated code do not
count as somebody's writing — one `npm install` can outweigh a month of real
work.

**A change ported to three branches is one change.** Deduplication is by diff
content, so it survives the new SHA a cherry-pick gets. It is keyed per
repository, because the same edit made in two repositories is two pieces of
work and collapsing them would delete one from somebody's month.

Everything the report could not measure is stated in the report itself rather
than left for the reader to discover: commits with no fingerprint, line counts
that predate source-only counting, merges with no recorded merger, and
repositories whose last sync predates the end of the period. A number nobody
can audit is worse than a gap somebody can.

Repository freshness sits above the figures, not in a footnote — a repository
that has never synced and one with a quiet month look identical otherwise — and
an admin can trigger a sync of every adopted repository from there before
generating. Asking twice while a sync is running does nothing rather than
starting a second one.

The report is available as JSON or as markdown to paste into a document.

### Added: the sync now records what a contribution report needs

**Who merged a pull request.** On most teams a couple of people carry the
integration load and nothing in the schema could show it. Bot mergers are
recorded by login only — resolving them to a developer would invent a person
and credit a merge queue with the team's integration work.

**Real pull-request metrics.** GitHub's *list* endpoint returns none of
additions, deletions, changed files, commits or comment counts — only the
per-PR detail call does — and the sync read them off the list. Every
backfilled PR stored six zeros. The zeros also made `size_bucket` "xs", which
the AI pass treats as too small to look at while stamping `ai_analyzed_at` on
the way past, so those pull requests were never analysed and never would be.
There is now one detail request per *new* pull request, rows already stored
are refilled once, and the migration clears the stamp on the ones that were
skipped without ever being read.

**Source-only line counts**, stored beside the raw ones so nothing is lost.

**A content fingerprint per commit**, patch-id in spirit, which is what lets a
cherry-pick collide with its original.

**When work was written, and on which branch**, as distinct from when it landed.

### Fixed: an adopted repository could sync every five minutes, or never

`check_repo_auto_sync` throttles on `workspace_repositories.last_sync_at` and
skips rows already syncing. No sync path ever wrote either column — every one
of them wrote its state to the adopter's `developer_repositories` row instead.
So `last_sync_at` stayed NULL for the row's whole life, the frequency check
behind it was permanently true, and every eligible repository was re-dispatched
on each five-minute tick no matter which frequency the adopter had chosen. The
in-flight skip matched nothing. The catalog API had already worked around the
stale row by overlaying the adopter's values onto its response, so the page
looked right while the scheduler read columns nobody wrote.

The sync now stamps the workspace row on every exit path. Duplicate dispatch is
prevented by a stable Temporal id rather than by a database flag: the flag is
written inside the sync's own transaction and is not visible until it commits,
and a worker lost mid-sync would leave it set for good, blocking that
repository permanently.

Two dead writes alongside it. The scheduler marked a repository
`no_credentials` when the adopter's GitHub auth was broken and then closed the
session without committing, so the reclaim prompt never appeared. And a broken
token now marks the workspace row directly.

### Fixed: adopting a repository left it unable to sync

Adoption created the workspace catalog row and nothing else, while the sync
looks its state up by developer and repository — so an adopter who had never
listed the repository themselves got `Repository not found for this developer`
on every run. Nothing surfaced it: the scheduler dispatches and moves on, and
the catalog page went on saying pending.

Adoption and reclaim now create that row, and the sync creates one if it is
missing, so repositories adopted before this need no backfill. Presence of the
row is a weaker signal of GitHub access than it was, so the fallback that picks
an adopter prefers whoever has actually synced the repository over whoever
merely holds a row.

The same endpoint's fallback contradicted its own comment: it claimed to prefer
the caller when they had access, but took the fallback whenever it named a
different person, so adopting a repository you could see handed the sync to an
arbitrary colleague.

### Changed: contribution metrics count differently

`ContributionService` counted bots and merge commits, and summed raw churn
including lockfiles. It now uses the same definition of "somebody's
contribution" as the report, so two screens in the same product cannot disagree
about how much work happened.

Two defects surfaced while applying it. Pull requests were windowed on
`created_at` — when our sync first wrote the row, so a backfill dropped a year
of pull requests into whichever period it happened to run in — rather than when
the pull request was created on GitHub. And lines added summed commits *and*
pull requests, double-counting every line that went through review, which is
all of them on any team that reviews its work.

### Changed: who can read a contribution report

Owners, admins and department heads only, and a head sees their department
rather than the workspace. Read by the people who run a team this is a
management tool; read by everybody it is a leaderboard, and the numbers are too
easy to misread for that — commit volume tracks branching style as much as
effort, and none of the work that leaves no git trace appears at all.

A head's report is recomputed over their department, not the workspace's with
rows hidden: totals, the repository table and every observation. Pull requests
count from either end, so a head still sees merges they made on another team's
work, without that work's author gaining a row. The scope is stated on the
page, under the markdown title, and in the limitations, because a partial total
that does not announce itself is the easiest way to mislead somebody with true
numbers.

Headship is read from both places it is recorded — `Department.head_id` and a
`role_in_department` of `head` — since the two do not always agree, and reading
one silently locks out whichever half of the org chart was written the other
way. That helper moved out of the Google mailbox module it grew up in; the org
chart is not a Google question.

## [0.18.1] - 2026-08-13

Work landing on you now tells you so. Documents get comments, and stop having two
notification systems. And "My Work" stops being two different pages, one of them
called Tickets.

### Added: assignment notifications, which did not exist

Nothing in this product ever told anybody that work had been assigned to them.
Not a task, not a project card, not a bug, not a story, not a form ticket, not a
Service Desk ticket. Every assignment path wrote a history row and returned. The
only way to find out something was yours was to go looking — or, for the Service
Desk alone, to wait for the next daily digest, which can be a day late.

`task_assigned` and `task_unassigned` fire from every path that can change who
owns a work item: the dedicated assign endpoint, the multi-assignee add and
remove, task creation with an assignee already set, the generic PATCH, the
project-card create, and the bug and story endpoints. Bugs and stories are their
own tables but they land on the same person and appear in the same list, so they
notify like anything else.

`task_status_changed` and `task_commented` go to the people on the item, minus
whoever did it. Both are in-app only by default: they fire on every column drag
and every comment, and defaulting those to email is how a notification system
teaches people to filter it. Someone @mentioned in a comment gets the mention
instead, never both for one comment.

`ticket_assigned` and `desk_ticket_assigned` come from one shared assign path
that serves both queues, so it picks the event, the reference format and the deep
link by which kind of ticket it actually is — sending a desk owner to
`/tickets/{id}` would land them on a page that cannot show pending-with or the
clock. `desk_ticket_pending_with_changed` notifies the queue a ticket is handed
to, because `pending_with` is the desk's real unit of handoff: a ticket changes
queue far more often than it changes owner, and the queue it lands in is the one
that has to act before the clock runs out. Both are queued and sent after the
commit, following the pattern the desk service already documents for closure
mail — telling somebody a ticket is theirs and then rolling the change back is
worse than saying nothing.

### Fixed: on-call and reminder emails arrived empty

`EmailService` built every email from `NOTIFICATION_TEMPLATES` and never looked
at the notification's own title and body. Sixteen events have no template entry,
so they sent subject "Aexy Notification", body "You have a new notification." The
in-app row for the same event read perfectly well.

The affected set was exactly the wrong one: all six on-call events, all six
reminder events, mentions, and both insight alerts — the events nobody is sitting
in the app waiting for. The notification's own title and body are now the
fallback, which also means any new event gets a correct email without a template.

The same function cast the event type through an enum that did not contain every
event, and the resulting `ValueError` was swallowed by a broad `except` that
recorded the send as failed and never retried. Now passed through as a string.

### Fixed: notification events that could not be switched off

`aexy.schemas.notification` declared a second copy of `NotificationEventType`,
and the two copies drifted. Because `EmailService` imports the schema copy, an
event that existed only in the model failed the cast above. Worse in the other
direction: `workspace_join_request` was firing in production from a member that
existed only in the schema copy, so it had no category, no channel defaults, no
row in the notification settings screen — and `get_preference`'s unknown-event
fallback defaults email to on. Admins were getting mail they had no way to stop.

The schema module now re-exports the model's enum. `usage_alert_80/90/100` were
emitted with no defaults entry and had the same problem: billing mail nobody
could switch off.

Three tests now enforce the invariants — every event has a category, complete
channel defaults, and a label on the settings screen — plus a generated fixture
so the frontend cannot fall behind the backend. Three events had no label and
rendered as a de-underscored slug.

### Added: document comments

`DocumentPermission.COMMENT` has been a grantable permission level since the docs
module was written, on documents that had nothing to comment with. An admin could
grant somebody comment access to a document and there was no comment box.

Threads are one level — a root comment plus replies. Deeper nesting reads badly
in a panel and turns "who is in this conversation?", which decides who gets
notified, into a recursive walk. Resolve, reopen, edit and delete are all there;
deletion is soft, so a deleted comment keeps its place and its replies keep
theirs. Resolved threads collapse to their opening comment rather than vanishing:
a resolved conversation is still the record of why the document says what it
says.

Comment bodies are rich text carrying mention anchors, so `document_mentioned`
and `document_commented` travel the same path as every other mention in the
product rather than growing a second parser. Bodies are sanitised on render —
they are HTML written by one workspace member and displayed to every reader of
the document.

### Changed: documents had two notification systems; now one

`document_notifications` was a second, parallel notification table with its own
endpoint, its own hook, and an "Inbox" entry in the docs sidebar. One thing wrote
to it: an `ai_proposal` row when an AI proposed an edit, telling the document
owner a review was pending.

That was the problem rather than the incidental detail. Because the row lived
there instead of in `notifications`, it got no email, no per-user channel
preference, and no place in the main notification bell — so a proposal generated
by a *scheduled sync*, which nobody clicked anything to cause, waited for the
owner to happen to open one specific panel.

It now emits `document_ai_proposal` through `NotificationService`, alongside
`document_shared`, `document_commented` and `document_mentioned`. The table,
endpoint, hook, panel and sidebar entry are gone. Existing rows are not
migrated — they are "go and look" pointers whose proposals are still visible on
the document, and importing weeks-old ones into the main bell would page people
the moment this ships.

### Changed: "My Work" was two pages, and one of them was called Tickets

The sidebar had a **My Work** under Planning and a **Tickets** in Engineering.
The Tickets item opened a page whose heading was also "My Work". Meanwhile the
Business section had a Service Desk with its own **Tickets** child, an unrelated
system. Two names for one question, and one name for two different things.

Worse, the two overlapped unequally: the Tickets page filtered its task list to
`item_type == "task"`, so your bugs and stories were missing from the page
claiming to show everything assigned to you, and appeared only on the other one.

The richer page now lives at `/my-work` and lists tasks, bugs, stories and form
tickets together. The Planning entry is gone; Engineering's item is renamed **My
Work** at the same level, so Tickets unambiguously means the Service Desk.
`/tickets` redirects, and the keyboard shortcut, command palette, app header and
hiring tiles point at the page directly rather than through the redirect — which
sits behind the tickets app guard and dead-ended anyone with sprint access and no
ticket access.

Form tickets are gated per *source* rather than per page, because `/my-work` is
the personal work list: somebody with sprints and no ticket access must still
reach their own tasks.

### Added: due-date reminders for the work you are assigned

`deadline_reminder_1_day` and `deadline_reminder_day_of` were declared, given
defaults, listed in settings, and fired by nothing. Review cycles had their own
sweep, so the only deadlines anyone was reminded about were review deadlines.

Being told a task is yours and never being told it is due is most of the way to
not being told at all. A daily sweep now covers `SprintTask.end_date` and
`UserStory.target_date`. Bugs have no due-date column, so there is nothing to
sweep. Overdue items are skipped: a reminder that a deadline is coming, sent
after it passed, reads as a bug.

Idempotent by inspecting the notifications already sent rather than adding a
column to every table with a due date, so it survives running twice in a day or
catching up after a missed one.

### Added: a candidate has an owner

`candidate_stage_changed` was another declared event with a toggle and no
emitter, for one reason: `hiring_candidates` had no owner column, so the only
choices were notifying every hiring-app member on every Kanban drag, or nobody.

Candidates now have an owner, settable on the board and validated to be a member
of the candidate's workspace — otherwise stage notifications get addressed to
somebody with no access to the candidate. Existing candidates are left unowned,
because there is no correct guess and assigning them all to whoever runs the
migration would be worse. An unowned candidate notifies nobody, which is what
happens today.

### Changed: dead notification toggles

Eleven events were declared, defaulted, and rendered as switches in the settings
screen with nothing firing them. A toggle that controls nothing is worse than no
toggle, because it reads as a delivery failure rather than an unbuilt feature.

Seven are now wired: `goal_at_risk` on the transition into that status,
`learning_approval_requested` to the approver the request already names,
`assessment_completed` to the assessment's creator, `goal_auto_linked` counting
only newly linked contributions, `automation_run_completed`, and the two
deadline reminders above. `chat_mention` was firing the generic `mention` event,
so the "Chat mention" toggle did nothing — its own docstring said otherwise.

`goal_auto_linked` and `automation_run_completed` default to off on every
channel: one fires during GitHub sync and can match many commits at once, the
other reports that a thing worked. The toggle now does something for people who
want it without making either noisy for everyone who does not.

One remains unwired — `oncall_shift_started`, redundant with the wired
`oncall_shift_starting` that fires 30 minutes ahead. It is off on every channel,
and a test enforces that an event nothing can fire may not default any channel
on.

### Migrations

Three, to run in order: `migrate_document_comments.sql`,
`migrate_drop_document_notifications.sql`, `migrate_hiring_candidate_owner.sql`.

## [0.18.0] - 2026-08-12

Connecting your own mailbox stops being an admin favour, the setup questions
only reach the person they belong to, and an MCP connector can no longer step
outside the workspace it was granted.

### Fixed: an MCP grant could reach another workspace

A connector consented to one workspace could name a different one in a tool
call's `path_params` and be served from it. The executor filled `workspace_id`
from the grant with `setdefault`, which only fills a value that is *absent* — so
a caller who supplied one won, and the comment above the line claimed the
opposite.

The developer's own membership still gated every call, so this was never
cross-tenant: a connector could only reach workspaces that person already
belongs to. But per-workspace consent is the guarantee the whole flow is built
on. The consent screen asks you to pick one, Connected Apps shows one, and the
docs say the grant is scoped to it. All three were overstating the case.

The grant now overwrites whatever the caller sent, and the regression test
inspects the URL the executor actually issues rather than whatever the
downstream endpoint happened to return — so it fails on the routing, not on a
symptom.

Two smaller transport fixes alongside it: `initialize` replied to
notifications, and an empty JSON-RPC batch answered 202 rather than reporting a
malformed request.

### Added: Settings → Connected Accounts

Connecting your own Google account was already a *member* action on the server —
`GET /integrations/google/connect` requires only workspace membership, and says
why: requiring admin meant a new joiner could not put their own inbox on the
Service Desk unless an admin sat at Google's sign-in screen as them.

The UI never offered it anywhere a member could reach. Every surface with a
connect button sat behind a workspace-admin gate — Integrations behind
`can_manage_integrations`, the Service Desk pages behind `can_manage_tickets`,
and the account list only inside CRM settings, which needs the CRM app. A
support agent or a sales analyst with none of those had exactly one chance to
connect Gmail, during onboarding, and no way back afterwards.

So this page is ungated, like Appearance, Notifications, Identity, API Tokens
and Connected Apps: it manages something that is yours. Sync switches itself on
when you connect, so nothing further is needed from an admin. The asymmetry the
API already encoded is preserved — connecting affects only you; removing
somebody else's account still requires admin.

### Changed: you no longer see every mailbox in the workspace

The account list was readable by every member, which was reasonable while
connecting was an admin act and the list held one or two shared addresses. Once
any member can attach their own inbox, the same list becomes a roster of who has
linked their personal mail.

Owners and admins see everything. A department head sees their own plus their
departments' — read from both places headship is recorded, because
`Department.head_id` and a `role_in_department` of `head` do not always agree and
reading one silently narrows the answer. Everyone else sees their own.

Two things stay visible on purpose. **Service Desk mailboxes** are team
addresses rather than personal ones, so they remain visible to whoever can
manage tickets — the mailbox form has to be able to offer them, and hiding them
would break the queue rather than protect anyone. **Accounts with no owner**
predate `connected_by_id` and belong to the workspace; hiding them would empty
the list for single-account workspaces that have worked for months, which reads
as data loss rather than as a privacy fix.

### Fixed: a connected mailbox that never synced

Two defects sat between connecting an account and mail arriving, and neither
announced itself. Both only bite a workspace with more than one Google account —
the shape multi-account support introduced — which is why they went unnoticed.

**The sync interval defaulted to 0.** The scheduler only picks up integrations
whose interval is above zero, so a freshly connected account had
`gmail_sync_enabled = true`, reported itself connected, and then did nothing.
Nothing errored; the mail simply never came. The only cure lived on an
admin-gated settings page most of the affected people cannot open — so the
person who most needed it was the least able to reach it.

0 stays meaningful: the settings UI offers it as "Off", and reconnecting does
not touch the column, so anyone who chose that keeps it. New accounts now start
at 15 minutes, which matches a preset in that UI rather than being a number
nobody picked. `migrate_google_autosync_default.sql` gives the same start to
accounts already stranded, identified by having never synced at all — an
account that synced and was later set to 0 was somebody's decision and is left
alone.

**The "already syncing?" guard ignored the account.** It matched on workspace
and job type, so one mailbox's in-flight sync suppressed every other mailbox in
the workspace: the second person to connect could wait indefinitely. The same
query used `scalar_one_or_none()`, which *raises* when an account genuinely has
two live jobs — swallowed by the surrounding `except` and logged as a failure to
trigger.

The guard is now per-account, and extracted so it can be tested directly. A test
that restated the query would have passed against the bug just as happily as
against the fix.

### Changed: onboarding's use-case step is for whoever sets the workspace up

The "What will you use Aexy for?" step configures the *workspace* — which apps
are on, which departments and teams get seeded — and the endpoint behind it has
always been owner-only. An invited member answering it got a 403 that the
completion step swallowed into a `console.error`: they filled in the form, saw
no error, and nothing happened.

It now runs for the person who owns the workspace or is about to create one, and
members go straight to connecting their accounts. The ownership check waits for
the workspace list to load rather than treating "not loaded yet" as "not the
owner" — that inversion would have skipped owners past their own setup on a slow
query, which is the same bug wearing the opposite mask.

## [0.17.0] - 2026-08-12

ChatGPT can now use Aexy, and you can see and cut off everything that connects
this way. Both halves matter: the first without the second is a door with no
lock on your side of it.

### Added: a remote MCP server, and the authorization server it needs

The MCP page listed ChatGPT and told you to use something else. That was
accurate — ChatGPT consumes *remote* MCP servers reached over HTTP with OAuth,
and cannot launch a local stdio process the way Claude Code, Claude Desktop and
Codex do. No arrangement of the existing setup guides would have made it work,
because the gap was in the transport rather than the documentation.

Aexy is now an OAuth 2.1 authorization server. A client discovers it through
the two well-known documents, registers itself (RFC 7591 Dynamic Client
Registration — there is no human to approve an install of ChatGPT in advance),
and walks the authorization-code flow with PKCE, which OAuth 2.1 requires of
every client rather than only public ones. ChatGPT gets a URL to paste instead
of a config file, and a consent screen instead of an API token.

Nothing replayable is stored. Client secrets, authorization codes, access
tokens and refresh tokens are all kept as SHA-256 digests, so reading the schema
yields nothing that can be used; only a prefix survives, and only so a person
can recognise a credential in a list.

Two behaviours look like bugs the first time you hit one, and are deliberate.
Redeeming an authorization code twice does not merely fail — it revokes every
token issued from that code. Presenting a retired refresh token does the same to
its whole chain. A replayed secret means somebody other than the client is
holding it, and refusing that one request would leave the tokens it already
produced alive.

A grant is scoped to one developer in one workspace, chosen by the person at
consent. Capabilities resolve from the same app-access model that governs the
web app: holding the `sprints` app is what grants `mcp.sprints`. There is no
second permission model to configure, drift from, or forget to revoke when
somebody changes teams. The tool list is built from those capabilities, so a
tool the caller cannot use is absent rather than offered and then refused —
carrying it would cost selection accuracy on every call they *can* make.

The three MCP surfaces that were never apps — workspace and member
administration, provider integrations, and billing — became modules on the
`mcp` app rather than a parallel access model of their own. This also retires
`AEXY_ENABLE_TEMPORAL`, which gated nothing: the caller set it on their own
machine, so anyone holding an API token decided their own access to the
Temporal tools. That decision is now made server-side.

### Added: Settings → Connected Apps

Every client you have authorized, in whichever workspace, with the workspace it
reaches and when it last ran. Revoking kills every token on the grant at once —
both the access token and the refresh token behind it — so a client cannot
quietly mint a replacement; it has to ask for consent again. The client is not
notified, and finds out on its next request.

Revoked connectors stay listed rather than disappearing. Somebody auditing what
reached their workspace needs to see that a connector existed and when it last
ran; deleting the row would erase exactly the evidence they came for.

A grant is several token rows — an access token, the refresh token that minted
it, and every rotation before them — collapsed back into the one decision you
actually made, so refreshing does not grow the list. "Active" is judged on the
refresh token rather than the access token: an access token expiring hourly does
not mean access ended, and showing "expired" beside a connector that still works
would invite people to think they were safe.

### Fixed: two handlers sharing one operation id

`/integrations/google/calendar/calendars` and
`/integrations/google-calendar/calendars` derived the same operation id once
`-` and `/` both normalise to `_`. Both are reachable and they are different
handlers backed by different services, so anything addressing an operation *by
id* — the MCP catalogue, generated clients — could only ever reach whichever
resolved first. The sync route now declares `list_google_sync_calendars`
explicitly.

### Fixed: the admin sidebar view is honoured only for admins

Settings → Appearance offered the `admin` sidebar persona to everyone, and that
persona is the one that switches curation off entirely. Removing the button
would not have been enough: people who are not admins can already have it saved,
and the preferences endpoint accepts any string. The stored value is now ignored
for non-admins, who fall back to their derived persona.

## [0.16.0] - 2026-08-11

A workspace can hold more than one Google account, and a connected mailbox can
keep parts of itself out of Aexy. Both are things the previous shape made
impossible rather than merely awkward.

### Added: several Google accounts in one workspace

A workspace held exactly one Google account. Several people could not each sync
their own mailbox, and a `gmail_sync` Service Desk mailbox could only ever be
that one address.

The cost was silent. `connect-from-developer` matched on the workspace and
overwrote, so the second person to connect took over the first person's row and
their mailbox stopped syncing with nothing said. Both OAuth callbacks did the
same. The 0.15.1 notes describe a 422 message written around this limit —
"a workspace has exactly one Google account, and when that account is a
different address no amount of connecting the requested one changes the answer".
That is no longer true, and the message now says you can add more than one.

`workspace_id` is no longer unique; `(workspace_id, lower(google_email))` is.
Case-insensitive because Gmail addresses are: two rows for one inbox would be
two cursors fighting over it.

`get_integration` ended in `scalar_one_or_none()`, which raises the moment a
second row exists, so it had to be replaced before the constraint dropped rather
than after. It now takes an explicit account, else prefers the caller's own,
else the oldest — and every endpoint that reads a mailbox names which one.
Two of those lookups hid a worse bug than arbitrary resolution: the "is a sync
already running?" guard matched on workspace and job type but not the account,
so syncing one mailbox returned another mailbox's job and returned early. The
account you asked for never synced, and the job id you got back belonged to
somebody else's inbox.

The "is this our own email" check now tests every connected address. Before,
mail from a colleague's connected mailbox was auto-enriched into a CRM contact.

Connecting is member-level. Both connect paths only ever attach the caller's own
mailbox, so requiring admin meant a new joiner could not put their own inbox on
the desk without an admin sitting at Google's sign-in screen as them, which asks
for a password nobody should share. Settings and sync follow the same rule —
your own account, or admin for anybody else's. Disconnecting someone else stays
admin-only: connecting affects yourself, disconnecting affects a colleague.

The workspace-wide `/disconnect` no longer guesses. It resolved "the"
integration through the same lookup, so with several accounts it deleted one
arbitrary person's connection under a name promising something workspace-wide.
One account and it goes; several and it refuses, naming them.

### Added: what a connected mailbox never syncs

Connecting a personal account to a shared workspace is only a reasonable thing
to ask if some of it can stay private. Addresses and domains can now be excluded
from a mailbox: the mail is never stored, and adding a rule removes what is
already synced — a rule that applied only forwards is not what anyone means by
"never sync", so the response says how much it took.

Rules belong to whoever connected the mailbox, not to admins: a rule an admin
could remove is not a rule the person relied on. They are visible to admins and
notify a department head, and the UI says so before the choice rather than
after, because that is what keeps "don't connect this mailbox" an option.
Reading the admin list writes an audit entry — looking at an exclusion list is
itself revealing.

### Changed: Service Desk settings live in Settings

The desk's own configuration was the one settings surface not reachable from
Settings, while Escalation Matrix and Ticket Forms — which configure the same
desk — were already there. The 849-line `/service-desk/settings` route is now
six pages under `/settings/service-desk/*`: mailboxes, master data, working
hours and SLA, ticket intake, desk identity, and AI. The old route redirects
rather than 404s, since it is bookmarked and linked from the desk's nav.

Master Data now explains itself. It described the app rather than the page, and
Vendors and Products rendered nothing at all when empty, so those cards read as
broken. Each table now says what intake does with it, and the empty states say
the consequence: with no accounts, every incoming email lands in triage with an
arbitrary owner. That is a desk quietly not working, and "Nothing here yet" gave
no reason to act.

### Fixed: form tickets are a filter, not a second tab

Already on main and unreleased, so it belongs in these notes.

### Fixed: the welcome step lists Operations & Support

The welcome step keeps its own copy of the module list, separate from the
use-case step, so adding the Operations card to the second left the first
showing six. Someone arriving to run a support desk read the pitch, saw nothing
describing their work, and found the option a screen later.

## [0.15.1] - 2026-08-11

Three fixes, all of them cases where the thing that was supposed to enforce a
rule was not present where it mattered.

### Fixed: reassigning a task

Assigning work to somebody returned an error. Any task that already had an
assignee failed to be reassigned; a task assigned for the first time worked,
which is why it read as intermittent rather than total.

`uq_task_assignees_one_primary` — at most one `is_primary` row per task — was
declared only in `migrate_task_assignees.sql`, never in the model. The tests
build their schema from the models, so production enforced the index and the
suite did not, and the suite was green.

What it was hiding: every path that moved the primary wrote the new one in the
same flush that cleared the old one. SQLAlchemy emits saves before deletes
within a flush, so the promote landed while the previous primary still held the
flag, and a partial unique index is checked per statement and cannot be
deferred. Three paths did this — the generic PATCH and `/assign`, the
multi-assignee editor, and promoting a collaborator. Each now clears the
outgoing primary and flushes before the incoming one is written.

Declaring the index in `__table_args__`, for both dialects, is the part that
keeps it from coming back: doing so turned three existing tests red before
anything was fixed.

### Fixed: the Operations use case seeds a department

Picking "Operations & Support" during onboarding left the sidebar in Developer
view, with Service Desk demoted to "available in Support, Sales view" — the app
the pick exists to turn on, hidden from the person who chose it.

`suggested_persona` reads the primary department's `default_persona`, and the
pick seeded no department, so it resolved to null and the sidebar fell back to
`developer`. The Business section that Service Desk lives in is gated on
sales/support/admin, so it was filtered out of the navigation entirely.

It seeded no department on the belief that no profile bundle granted Service
Desk. Every bundle grants it, `business` included. Operations now seeds an
Operations department on the business profile with the support persona, which is
both the access its people need and the persona that shows it. It shares
`function_key: "operations"` with the Service Desk industry templates on
purpose: the key is unique per workspace, so whichever runs first creates it and
the other finds it, and onboarding fills in the access profile the templates
leave empty.

A test now asserts the general rule rather than this one instance — a use case
that turns on a persona-gated app has to seed a department carrying a persona
that can see it.

### Fixed: Service Desk settings say when something failed

Adding a `gmail_sync` mailbox returned 422 and the screen showed nothing at all.

Every mutation in `useServiceDesk` declared `onSuccess` and nothing else, the
settings page drives them with bare `mutateAsync`, and there is no
`MutationCache` handler — so a rejection became an unhandled promise rejection.
No toast, no inline error, the input still holding its text as though nothing
had been tried. That was every mutation on the page — accounts, vendors,
products, mailboxes, stakeholders — not only the one that surfaced it.

The message was wrong too. "Connect and enable Gmail sync for this mailbox
address first" describes an action that cannot succeed in the case people
actually hit: `google_integrations.workspace_id` is unique, so a workspace has
exactly one Google account, and when that account is a different address no
amount of connecting the requested one changes the answer. The four states are
now told apart — nothing connected, connected as someone else, sync off,
disconnected — and the second names the address in use and points at the webhook
channel, which is the option that would actually work.

## [0.15.0] - 2026-08-06

Three things the tech team asked for after using the ticketing and sprint
features in anger. All three are cases where the data model admitted only one
answer to a question that really has several.

### Added: more than one person on a task

A task had exactly one `assignee_id`, so work with two names on it — a pair, a
dev plus the reviewer who owns the follow-up, an ops handover — had to either
reassign, losing who else was involved, or write the second name into the
description where no filter, board or report can see it.

`task_assignees` now holds everyone. **`is_primary` marks the one accountable
owner and is mirrored to `sprint_tasks.assignee_id`**, which stays the single
source of truth for everything that must resolve to exactly one developer:
board grouping, workload and velocity attribution, Slack and email
notifications, auto-assignment, and roughly 250 call sites that read it. Not one
of them changed. The mirror is maintained in one place —
`SprintTaskService.sync_assignee_rows_from_column` — and every path that can
write the column funnels through it, including the generic PATCH, the dedicated
`/assign` endpoint, sprint and project task creation, and the automation action
(which runs on a sync session and so carries its own copy, kept deliberately
identical).

The legacy single-assignee paths behave exactly as they did before. Reassigning
A to B leaves B alone on the task rather than quietly demoting A to
collaborator — accumulating everyone who ever held a task, and telling A they
are still on work they handed over, is worse than the old behaviour. Unassigning
removes the owner outright. Collaborators added deliberately are never touched
by either.

Both arrangements the team asked for are real states rather than a mode flag.
"Primary plus collaborators" is one primary row and some others. "Everyone
equally on this" is collaborators with **no** primary, and `assignee_id` is
genuinely null, because nobody is individually accountable. The cost of being
honest about that is that such a task groups under "no assignee" on
assignee-grouped views; in exchange, the cards, the table and the picker all
name the actual people instead of showing a single face that was never the whole
story. Cards and rows read `assignees`, so a task with several people and no
primary no longer renders as "Unassigned" — the opposite of the truth.

Assignee filters now match collaborators too. Filtering to a person and not
seeing work they are genuinely on reads as "nothing assigned to them", which is
worse than having no filter at all.

The project-scoped router had no assignment endpoints at all — the project board
could only reassign through the generic PATCH, which is part of why assignment
from the project view behaved differently from the sprint view. Both routers now
expose the same four operations, with the bodies shared so they cannot drift.

`migrate_task_assignees.sql` backfills every already-assigned task with its
current assignee as primary. This is the load-bearing part: the new UI reads
`assignees`, so without it every existing task in every workspace would render
with nobody on it while `assignee_id` still held a name.

### Added: progress updates, separate from the comment thread

A task carried two kinds of writing and neither answered "where does this
actually stand?". Comments are a conversation — the current state is buried
somewhere in a thread, interleaved with questions and customer replies, and you
have to hope the last relevant line is still true. The activity log is an audit
trail of field changes: it records that status became `in_progress` on Tuesday,
and cannot record why it is still `in_progress` on Friday. Standups were filling
that gap verbally, with nothing written against the work itself.

`work_updates` is that missing record — a short, author-owned statement of
progress, on tasks and on tickets, with an **Updates** tab on both detail views.
Its author can reword it, which a comment thread cannot do without becoming a
thread of corrections; an edit is marked, and only the author may make one, since
letting someone else rewrite a statement under that person's name is worse than
leaving a wrong one standing. Admins can delete.

Posting mirrors an event into the activity log so an update is visible in the
History tab and the workspace feed rather than sitting in a silo. The body is
deliberately not copied there: the update is editable and the log is not, so a
copy would leave the feed quoting a version that no longer exists.

The endpoints span two apps (a task belongs to `sprints`, a ticket to
`tickets`), so the module gate is resolved per request from `entity_type`
instead of at the router, and a test pins that every supported entity type has a
gate — an unmapped one would otherwise skip the check.

### Added: a History tab on tickets

The ticket page showed "Activity & Responses", which was only
`ticket_responses`: the conversation, plus the synthetic "Status changed from x
to y" notes the service writes there. That is not an audit trail. A response row
only exists when a developer was attached to the change, so anything done by an
automation, an escalation or the alert ingest path left no trace on the ticket at
all.

The real record was already being written — `TicketService` has been logging to
`entity_activities` on create, update, assign, response and delete all along,
and a per-entity timeline endpoint already existed. Nothing read it back for a
single ticket. The tab is that read, presented like the task's History tab, with
developer ids in assignment changes resolved to names.

Two things found while wiring it up. The generic activity endpoints did not
validate a `ticket` entity against the workspace before stamping activity on it,
unlike the other entity types; `ticket` is now in that map. And the ticket
status, priority and severity labels lived in two copies, so History could say
`waiting_on_submitter` while the picker directly above it said "Waiting on
Submitter" — one shared vocabulary now, imported by both.

## [0.14.2] - 2026-08-05

### Added: departments decide access, and say what they are for

0.14.0 made a department's access profile the thing that decides what its people
see. Two things were missing from that: a department's *function* was a free-text
box, and its profile could only be set to a whole bundle.

**A department's function is now picked from a declared list.** `function_key` is a
routing key, not a label — Service Desk row-level visibility resolves it (a queue
names the function that owes the next action, and only that department's people can
see those tickets), the digest resolves it to find a head to send an entire desk's
open list to, and ticket auto-assignment resolves it to pick an owner. Nothing
declared the vocabulary, so two modules invented their own and disagreed: the
Service Desk templates shipped `ops_kam` for Operations in insurance-broking and
`operations` in financial-services, for the same concept. Since the key is unique
per workspace, which spelling you got depended on which template your desk started
from — and a mismatch raises nothing at all. That department's people open the
queue and see an empty list, indistinguishable from a quiet day.

`services/org_functions.py` is now the single registry — ten functions with labels
and descriptions, `ops_kam` recorded as a retired spelling that still resolves. The
set stays **open**: anything not covered is `x_<name>` and every consumer treats it
identically. Both seeders import from it and assert their keys at import time,
which is the check that would have caught the divergence when it was written.

The picker names what each function does *in your workspace* — "Service Desk queues
routed here: kam" — computed from your own taxonomy rather than declared statically,
because a hardcoded list would start lying the first time an admin edited theirs.
Taking a function another department already holds warns before saving instead of
409-ing after, and the Departments page now flags the one failure this mapping has
no natural symptom for: a queue routed to a function **no department claims**, whose
people can currently see nothing.

Departments also became editable at all. `updateDepartment` existed in the API and
the hooks with no caller, so a department's name and function were create-only.

**A department's access can now be set app by app and module by module.** The
backend has stored per-module department profiles all along and the resolver has
always read them, but the only UI could assign a whole bundle — so "Business" was
as specific as a department could get, and *CRM without the Inbox* could not be
expressed anywhere. The app × module grid moved out of the member editor into a
shared component rather than being written twice; the two describe the same shape
and are read by one resolver, which is exactly how the member editor came to have
module toggles the department editor never got.

The two levels now link to each other. An override is often the wrong tool: if the
whole department needs the change, editing the profile fixes it for everyone
instead of pinning one person out of every future change to it.

### Added: onboarding gives a workspace its first teams

A *department* decides what someone can see. A *team* decides who chases them —
standups, blocker escalation, review digests, sprint boards and leave approvals all
resolve through team membership. Onboarding seeded departments and no teams, so a
founder finished setup with everyone navigating correctly, nobody enrolled in any of
that, and the team field on an invite opening onto an empty dropdown.

Now asked rather than assumed: one team per department, one team for everyone, or
none. Seeded teams carry `department_id` (the rollup that already existed for this
and was never written), record the founder as `lead` — `review_service` and
`leave_request_service` both look for exactly that string, so a team without one
sends its approvals to "any workspace manager" — and note their provenance so a
later repo sync can offer to merge rather than guess. Skipped entirely when the
workspace already has teams, since the repos step may have created repo-based ones
that reflect how work is actually split.

`POST /teams/mirror-departments` offers the same action afterwards, so choosing
"none" and adding a department in March are both recoverable.

### Added: choose which department receives incoming tickets

Which department runs the desk decides who incoming mail is auto-assigned to and
whose head receives the digest. It had never been a choice. It began as the literal
`function_key == "ops_kam"` — a key only workspaces set up from the
insurance-broking template ever had, so everybody else's mail arrived unassigned
with nothing on screen to say why — and then became "the department behind the
desk's first internal queue", a fair inference but still an inference. A desk whose
first queue is Support while its intake team is Operations had no way to say so.

It is a setting now, with that inference as the documented fallback, and the picker
names the department it would use anyway ("Automatic — Support (from the first
queue)") so choosing nothing is informed rather than blank. One setting for both
consumers: auto-assignment and the digest resolve it through the same function,
because a workspace where those two disagreed about who runs the desk would be
worse off than with either answer alone.

A stale choice — department deleted or deactivated — degrades to the inference and
says so in the log rather than stopping intake, and is not reported as explicit, so
the page cannot show "Support, chosen" while mail goes to Operations.

### Added: headcount seats can be filled

`department_positions` carried a `filled_by_id` column that nothing ever wrote.
Creating a seat was the only thing the product could do with one: every position
read "Open" for ever and no member could be connected to the seat they occupy, so
the titles an admin typed in were decoration. The seat now owns the link — no new
column, no migration. Vacating reopens it, and so does removing someone from the
department, because a seat left "filled" by someone who has left reads as taken and
could never be offered again.

### Fixed: the two app catalogues disagreed about five apps

`backend/src/aexy/models/app_definitions.py` and
`frontend/src/config/appDefinitions.ts` are two hand-written copies of one
decision. CLAUDE.md says to keep them in sync; nothing checked, so every one of the
four system bundles disagreed about `chat`, `community`, `gtm`, `leave` (granted on
the backend, absent from the frontend) and `service_desk` (the reverse). Twenty
divergences, none of which raised anything — which apps a role or department profile
granted simply depended on which file the code path read.

Both directions had already bitten. A department on the Engineering profile could
not reach the Service Desk while the department editor's own "Start from
Engineering" grid said it could; and filling that same grid from a bundle silently
revoked Chat, Community, GTM and Leave from everyone in the department.

Resolved in the granting direction on both sides — these bundles are starting points
and role defaults, and the workspace toggle plus each app's `required_permission`
are the real gates. The catalogues themselves turned out identical, so only the
bundles needed touching.

More usefully, they now check each other: `scripts/dump_app_catalog.py` writes the
backend's answer to a committed fixture, a frontend test asserts the TypeScript
matches it, and a backend test asserts the fixture still matches the Python.
Without that last half, adding an app and forgetting to regenerate would leave both
sides passing while the files disagreed — the exact failure the fixture exists to
catch.

### Fixed

- **Member access was never enforced past the sidebar** for module-level toggles,
  and a stale `ops_kam` comparison meant several reads silently resolved to nobody.
  Every `Department.function_key` comparison now goes through one resolver that also
  matches retired spellings.
- **`deskIdentity.prefixWarning` threw on every render** of the Service Desk
  settings page: it contained `{prefix}-<number>`, which ICU parses as an unclosed
  tag, so the user saw nothing where the warning should be. Found while verifying
  the intake setting; every message in both locales was then parsed to confirm it
  was the only one — 8458 checked, 0 malformed.
- **The function picker could rewrite a valid key as a custom one.** It seeded its
  custom/standard mode in a `useState` initialiser while the catalogue is fetched, so
  on first render every stored key looked unknown and the field opened in custom mode
  holding the real key — one Save from turning `engineering` into `x_engineering`.

### Migrations

```
python scripts/run_migrations.py --file migrate_org_function_keys.sql
```

Additive and idempotent. Moves `departments.function_key` and
`service_desk_stakeholders.function_key` off the retired `ops_kam` spelling
together, in one transaction, because they point at each other.
`service_desk_tickets.pending_with` holds stakeholder *slugs*, not function keys,
and is deliberately untouched. Until it runs, reads resolve either spelling. A
workspace holding both spellings has its Operations department left alone and listed
for inspection — merging two departments means deciding what happens to their
members, which is not a migration's call.

## [0.14.1] - 2026-08-04

### Fixed: nine things a review of 0.14.0 turned up

Reviewing the campaign work against its own claims found the places where three
components still disagreed, or where a fix stopped one step short.

**The wizard's send gate was workspace-wide; the backend's is campaign-specific.**
"Send Now" appeared whenever *some* domain was verified, while `start_sending`
requires *this campaign's* From address to resolve to one. With `acme.com` verified
and a From of `hi@other.com` the wizard offered to send, the field below said it
would save as a draft, and the detail page then refused — three answers to one
question. The wizard now asks the same question the backend does, through a
client-side twin of `email_matches_domain`, and the Review step says which domains
would work rather than silently dropping the button.

**"Send Now" had never sent.** It routed to the campaign with `?action=send`, and
the detail page read no search params at all — so the wizard's final button
created a draft and left the user to find Send themselves. It now fires the send
on arrival, still through the same confirm: an irreversible action deserves the
same prompt however you reach it.

**A test send on a pooled campaign showed an address it would never use.** The
endpoint resolved the domain through the pool but then sent from
`campaign.from_email`, while a real pooled send takes the From address from the
domain the router picked per recipient. Address resolution now lives in one place
(`resolve_send_sender`) that both the real send and the test send call, and the
response reports the address each test actually went out as. A test send that
reassures you about the wrong address is worse than no test send.

**Scheduling no longer refuses an unverified sender.** 0.14.0 gated it at schedule
time *and* in the poller, which meant you couldn't schedule next week's newsletter
while DNS propagated — even though the poller is built to hold exactly that
campaign until the domain verifies. Scheduling now records what it is waiting for
and leaves the gate to the poller, which is where it can actually be re-checked.

**But the poller no longer waits forever.** A blocked campaign was retried on
every poll indefinitely, with the reason living only in a worker's log. It is now
held for three days — long enough for DNS and for a weekend — and then handed back
as a draft with the reason on it, notifying the campaign's creator (new
`campaign_send_blocked` notification, email on by default since the send time has
already passed). `last_error` also rides the campaign *list*, so a blocked campaign
is visible as a **Blocked** chip without opening it.

**A campaign built from "Custom HTML Content" could never be sent** — found while
verifying the above in the browser, and it is the same shape. The wizard's Content
step offers custom HTML as an alternative to picking a template, but
`start_sending` requires `campaign.template` and `process_campaign_sending` cancels
a campaign whose template is missing. Confirmed against the running API:
`POST /campaigns/{id}/send` returns 400 *"Campaign must have a template"*. The
wizard's Send Now now requires a template as well as a sendable sender, and says
which of the two is missing. HTML-only still saves as a draft. Note this is the
gate reported honestly, not the underlying limitation removed: making the send path
render `html_content` is a feature, not a fix.

**Two defaults could claim to be the default pool.** `create_pool` cleared the
previous holder; the `PATCH` added in 0.14.0 — the path the *Make default* button
takes — did not.

**`resolve_domain_for_email` fetched every domain in the workspace** and filtered
in Python, once per recipient. The name match is now a SQL predicate, so a
workspace with fifty domains stops shipping fifty rows per recipient; the Python
rule still decides, so the two cannot drift apart.

**A stalled backend could make the app unbuildable.** `community-api`'s server-side
fetches had no deadline, and `community/[slug]/sitemap.xml` is prerendered — so a
backend that accepted the connection and then hung took out the whole production
build at Next's 60s per-route limit, which is exactly what happened here. Those
fetches now time out at 10s and fall back to the empty result they already had a
path for.

### Fixed: the frontend had no working linter

Next 16 removed `next lint` and ESLint 9 stopped reading `.eslintrc.*`, so
`npm run lint` had been failing with *"Invalid project directory provided, no such
directory: .../lint"* and a bare `eslint` had no config to load. A flat
`eslint.config.mjs` restores it, and `npm run lint` now runs `eslint .`.

It finds 244 errors and 1039 warnings across the existing codebase — mostly
`react-hooks/*` rules from the plugin's v7 rewrite (86 `set-state-in-effect`) and
79 unescaped apostrophes. None are new; nothing had been checking. Left as the
shared config rates them rather than quietly downgraded, so the number is visible.

### Changed

- Next.js 16.2.3 → 16.3.0, `eslint-config-next` to match.
- `connect-calendar` is back on the sales onboarding checklist — 0.14.0 dropped it
  to make room for the sending-domain item, which nothing required.

## [0.14.0] - 2026-08-04

### Feature: sending pools have a UI

The pool endpoints had no client code at all, so a pool could only be created with
curl — which is why the routing they drive stayed broken without anyone noticing.

A **Pools** tab on Settings → Email Infrastructure creates a pool, picks its
strategy, and manages its member domains. Two details it gets right rather than
showing everything unconditionally: a new pool starts with every verified domain
already in it, because a pool with no members routes nothing; and the per-member
knob shown follows the strategy — `weight` only means something under *Weighted*,
`priority` only under *Failover*. Each strategy explains what it does, since
"health_based" is not self-evident. Members show whether they can currently send
and how much of today's limit they have used, so a pool that looks full but
cannot route is visibly so.

Two endpoints were missing and are added: `PATCH /pools/{id}` (used by the
strategy dropdown and *Make default*) and `DELETE /pools/{id}`, which refuses
while an unfinished campaign still routes through the pool and says how many —
a campaign's `sending_pool_id` FKs only to `sending_pools.id`, so deleting the
pool beneath it would leave it pointing at nothing and quietly fall back to the
platform mailer. A sent campaign does not pin a pool forever; only unfinished
sends do.

The campaign wizard offers a pool when one exists, and says plainly that picking
one means the From Email above will not be used — the pool takes the address from
whichever domain it routes to.

### Fix: sending-pool routing, which could never have run

A sending pool spreads a campaign across several domains, picking the healthiest
per recipient — which is how you keep one domain's reputation from sinking a whole
send, and how transactional mail is kept off the marketing domain. It shipped with
the multi-domain infrastructure and had never executed once.

**Nothing could set a pool.** `EmailCampaign.sending_pool_id` and
`sending_identity_id` existed as columns and the send path branched on both, but
neither was on any schema or endpoint, so both were always NULL and both branches
were dead. `RoutingConfigUpdate` — the schema written to set them — was referenced
by nothing at all. They are now on campaign create/update and behind
`PUT /campaigns/{id}/routing`, validated against the caller's workspace, because
both columns FK to their own tables rather than to anything workspace-scoped.

**And it would have crashed if it had run.** `route_email` was called with
`pool_id`/`strategy` and no `workspace_id` (a `TypeError`), its `RoutingDecision`
return was read as a dict, and `get_fallback_domain` was called with
`exclude_domain_id` where it takes `exclude_domain_ids` — the same three mistakes
in both call sites. `RoutingDecision.provider_id` was also non-optional while the
column is nullable, so a pool member without its own provider raised a validation
error instead of falling back to the workspace default.

**Fallback escaped the pool.** `get_fallback_domain` selected from every active
domain in the workspace, so a campaign whose pooled domain hit its daily limit
would have sent from a domain the pool deliberately excluded — defeating the
separation the pool was built for. It now takes `pool_id` and stays inside.

**The From address follows the domain.** Pool routing picks the domain per
recipient, so the decision's `from_email` (from that domain's identity) now wins
over `campaign.from_email`. Sending as an address on one domain through another is
precisely what the sender gate exists to prevent.

**And the gate asks the right question per mode.** A pooled campaign's From is
chosen from the pool, so validating `from_email` against a verified domain would
refuse a perfectly sendable campaign. `sender_status` now reports its `mode`
(`from_email` / `identity` / `pool`) and checks accordingly — for a pool, whether
any member can send; the reason names the pool.

**Creating a pool through the API had never returned successfully.**
`POST /pools` committed the pool and then 500'd serializing the response, because
`SendingPoolResponse.members` lazy-loaded on an async session
(`MissingGreenlet`) — so the natural retry then failed on the unique name.
`GET /pools/{id}` had always eager-loaded correctly; create had not.

### Fix: campaigns sent from the platform's address, and scheduled ones sent to nobody

The Email Marketing empty state promised a four-step setup starting with *"Configure
a sending domain"* — and then offered one button, which skipped all four into the
campaign wizard. Following the instructions was the slower path. Underneath, the
domain it told you to configure was never read.

**A campaign never used the workspace's own domain or provider.** The send path
resolved a sending domain only through `campaign.sending_identity_id` or
`sending_pool_id`, and neither field exists on any schema or is set by any
endpoint — so both were always NULL, every campaign fell through to the
platform-global mailer, and mail went out from the deployment's own address
(`noreply@yourdomain.com` on an unconfigured install) rather than the From address
the user chose. `ProviderService.get_default_provider` had never been called by
anything. The path now resolves the domain from `from_email`, checks it with the
existing `can_send`, and sends through that domain's provider or the workspace
default. The platform mailer remains, but only for a workspace that has configured
no provider at all — and a provider that *is* configured and fails now fails the
recipient instead of quietly re-sending from the platform address.

**The sender gate was workspace-wide, so it checked the wrong thing.** It asked
"does this workspace have any verified domain?", which let a campaign send as
`sender@somewhere-else.com` on the strength of an unrelated verified domain — and
it was the only sender validation anywhere, since nothing compared `from_email` to
a domain. It now resolves *this campaign's* `from_email`, using the same rule
identity creation already used (extracted, so the two cannot disagree). Sending,
scheduling and test-sending all refuse with the same message, which names the
address and what to do about it.

**A scheduled campaign reported success having delivered nothing.** The poller
flipped a due campaign to `sending` and dispatched by hand rather than calling
`start_sending`, so it skipped both the sender gate *and* `populate_recipients`.
With no recipient rows the send activity found nothing pending and marked the
campaign `sent`. It now goes through `start_sending`; a refusal leaves the campaign
`scheduled` with the reason in a new `email_campaigns.last_error`, so it sends
itself once the domain verifies instead of needing to be rescheduled by hand.

**The test send proved nothing.** `POST /campaigns/{id}/test` bypassed every check
and used the platform mailer, so a test could arrive from the deployment's address
and appear to validate a sender that a real send would refuse. It now resolves the
sender the same way and reports which path delivered it.

**And the Send button on the campaign detail page was disabled forever.**
`useSendingDomains` returns `{ domains }`, but the page destructured `{ data }`, so
the value was always `undefined` — no number of verified domains could enable it.
Its status list also tested `active` and `warming`, which the frontend
`DomainStatus` union does not contain, leaving two of three arms dead. The campaign
payload now carries the backend's own `sender` verdict, so there is nothing left to
re-derive.

**Setup comes first, and the steps know whether they are done.** A panel derived
from live rows replaces the inert list: each step shows todo / pending / done —
"added but not verified yet" is a state worth distinguishing — and links to where
it is actually done. The primary action is *Set up a sending domain* until one
exists, with drafting still available beside it, because DNS propagation can take a
day. The wizard now warns on the Details and Review steps rather than after the
record is written, validates the From address for real (the `type="email"` input is
not inside a `<form>`, so the browser never checked it and `hello world` passed),
and offers addresses on verified domains. `/email-marketing` and
`/email-marketing/campaigns` show the same panel — they previously carried
different copy for the same empty state.

#### Upgrade notes

```bash
docker exec aexy-backend python scripts/run_migrations.py --file migrate_campaign_last_error.sql
```

### Feature: the org chart shows the member hierarchy

It drew departments and nothing else, so a one-department workspace rendered as a
single row reading "3 members" and the reporting lines on
`workspace_members.manager_id` — which `set_manager` validates and rejects cycles
for — were visible nowhere. `GET /organization/org-chart` now returns each
department's members with their manager, and the chart nests people under whoever
they report to. Three queries for the whole chart rather than one per department.

Someone whose manager sits in a different department, or who has no manager set,
appears at the department's top level: most workspaces start with no reporting
lines, and a chart that only rendered nested people would show them nothing.

## [0.13.0] - 2026-08-04

### Feature: the Service Desk is industry-agnostic — vocabulary and taxonomy per workspace

0.11.0 shipped a ticketing desk shaped like one insurance brokerage. The
stakeholders a ticket could wait on were a Python enum (`KAM`, `INSURER`,
`PARTNER`), the request types were another (`POLICY_ISSUANCE`, `CLAIMS`,
`PAYOUT`), and the master-data tables were named `service_desk_partners`,
`service_desk_insurers` and `service_desk_lobs`. None of it was editable, because
none of it was data.

**Four industry templates**, in `service_desk_industry_templates.py`: `generic`,
`software_support`, `insurance_broking` and `financial_services`. Each declares
its stakeholders, request types, departments and vocabulary as frozen
dataclasses, validated at import time — duplicate slugs, a stakeholder routed to
a department no template provides, more than one default request type, or
anything other than exactly one closed stakeholder is a startup error rather
than a runtime surprise. Templates are code, not rows, for the same reason
dashboard presets are: they are product decisions, and a half-applied one is
worse than none.

**The enums became per-workspace tables.** `service_desk_stakeholders` and
`service_desk_request_types` are editable, and each stakeholder carries a stable
`semantics` value (`internal` / `external` / `closed`). Code branches on
semantics; only humans read the slug and label. That is the pattern
`WorkspaceStatusCategory` already used, and it is what makes renaming "Insurer"
to "Carrier" a text edit rather than a migration.

**Master data is named for what it is**: accounts, vendors and products, with the
ticket foreign keys renamed to match. The insurance template deliberately pins
the old slugs (`kam`, `insurer`, `partner`, `query`, `policy_issuance`, …), so an
insurance desk reads exactly as it did before — the vocabulary moved out of the
schema, not out of the product.

**Everything else that was one operation's constant is now workspace
configuration**: the ticket prefix (`BSD` → a neutral `SD`), the digest hours,
the breach target and its amber threshold, the working-hours window the clock
resolves day boundaries in, and the eight terminology words the UI interpolates.
The frontend reads all of it from the API; `statusColors.ts` no longer holds a
label map keyed by insurance slugs, and assigns colours by position and
semantics.

**First run.** A desk with no taxonomy now shows a template picker instead of an
empty queue board, and applying one also creates the departments its internal
stakeholders route to — so Organization is populated as a side effect, which is
the ordering that actually works, because visibility rules resolve through
departments.

**A read was writing configuration.** `list_stakeholders`, `list_request_types`
and `get_dashboard` all seeded a default taxonomy when they found none, so merely
opening the desk pre-empted the first-run picker and left an eleven-stakeholder
mixture of two templates. Of the thirteen call sites, only ticket creation still
seeds — inbound mail must never be dropped for want of configuration.

**`migrate_service_desk.sql` creates the current shape.** It was still building
the insurance-named tables for the agnostic migration to rename moments later in
the same run, which was churn on a fresh install and a hard stop on a
Docker-first one: `create_all` had already made `service_desk_tickets` with
`account_id`, so `CREATE TABLE IF NOT EXISTS` no-oped and
`CREATE INDEX … (partner_id)` failed with *column "partner_id" does not exist* —
taking the whole run down with it, since the runner stops at the first failure.
Corrected in place, which is safe because a changed checksum is a warning the
runner will not act on without `--force`. Verified on all three shapes — nothing,
`create_all`-built, and legacy-migrated — which now converge on identical
columns, constraint names and foreign keys.

#### Upgrade notes

```bash
docker exec aexy-backend python scripts/run_migrations.py --file migrate_service_desk_agnostic.sql
```

The migration handles three database shapes, because `create_all` on startup may
already have built the new tables alongside the populated old ones: it renames
when only the old tables exist, copies then drops when both exist and only one
side holds rows, and **refuses** when both hold data rather than guessing which
is authoritative. It applies no taxonomy: an existing desk keeps its data, and
choosing a template is a deliberate act. Seeding a fresh workspace:

```bash
docker exec aexy-backend python scripts/seed_service_desk.py --workspace <id> --template insurance_broking
```

### Feature: Settings, rebuilt — one design system, a real index, and access control

Settings had grown to 40 pages with no shared anything. Four different page-title
sizes, six competing per-page `max-w-*` values fighting the shell's own width, 18
copies of the same `bg-card rounded-xl border` block, and two unrelated ideas of
"loading" (17 bespoke skeletons, 22 spinners). `bg-card` is the *same* value as
`bg-background` in dark mode, so every one of those cards had no elevation at
all — the reason the whole area read as unfinished.

**A design system**: `SettingsPage`, `SettingsSection`, `SettingsRow`,
`SettingsChoiceCard`, `SettingsEmptyState`, `SettingsSkeleton`, `SettingsSaveBar`
and `SettingsAccessDenied`, on `bg-surface` so sections are actually raised. All
40 pages are migrated onto them, each with a `useTranslations` namespace and
English plus Hindi messages.

**A landing page.** `/settings` was a bare `router.replace("/settings/appearance")`
— "Settings" dropped you into the theme picker with no sense of the other 29
destinations, discoverable only by reading the sidebar top to bottom. It is now a
searchable index built from the same declarations the sidebar uses, and the
sidebar itself has collapsible categories, an inline filter and persistence.

**CRM and Email Marketing settings moved in**, to `/settings/crm`,
`/settings/crm/integrations` and `/settings/email-marketing`. They were the only
pages where "Settings" meant somewhere outside `/settings`, which also meant the
shell's permission gate never applied to them. The CRM page had carried two
navigation trees of its own — a section switcher and the object list — that would
have sat beside the Settings sidebar; the switcher is gone and Integrations has
its own URL, replacing a route that existed only to redirect into
`?section=integrations`. The old URLs redirect: `/crm/settings` cannot simply
404, because `/crm/[objectSlug]` matches it and a stale link would render an
object page for a nonexistent object called "settings".

### Feature: Settings access control — owner is no longer the same as admin

**`owner` and `admin` were byte-identical.** Both role templates were
`list(PERMISSIONS.keys())`, so "owner" meant nothing. Seven permissions are now
owner-only — the four deletes, billing, and the two role-management
permissions — leaving the owner with 61 and an admin with 54. Roles are on that
list because an admin who can edit roles can grant themselves every other
owner-only permission and lock the owner out. An owner can still delegate any of
them to one person through the existing `permission_overrides`.

**`Workspace.owner_id` is now authoritative.** `get_effective_permissions`
resolves ownership up front but applies it last, after project-role replacement
and after overrides, so a transferred or externally-seeded workspace can no
longer leave its real owner on admin permissions — and an override cannot strip
the owner of their own workspace.

**The client had no workspace permission data at all.** `usePermissions` returned
a literal `false` for every workspace-level check, with a comment saying it should
be wired up. There is now a `GET /workspaces/{id}/my-permissions` behind it,
modelled on the project-level endpoint.

**Every settings page declares a gate.** The old mechanism was an `adminOnly`
boolean set on 10 of 30 entries — repositories, projects, task configuration,
integrations, escalation, ticket forms and billing were visible to every member.
A page you may not open is now hidden from the sidebar and the index, and
visiting the URL renders a panel naming what is missing and who can grant it.

**Hiding a page is not access control**, so the routers behind them enforce it
too: one `require_workspace_permission` dependency, plus a method-aware variant
for routers whose reads should stay open, applied to the eight that backed
ungated pages. A 403 now names the permission it wanted.

**39 phantom permission constants** were removed from the frontend map, which had
drifted to naming permissions the backend has never defined — `can_manage_webhooks`,
`can_view_teams`, `can_delete_workspace` — while missing 30 real ones. Gating a
page on a key that does not exist hides it from *everyone*, permanently, with no
error anywhere. A test now reads the backend catalogue directly and asserts the
two agree, that every non-personal page is gated, and that every nav entry points
at a page that exists on disk.

### Feature: Teams settings page

`models/team.py`, `api/workspace_teams.py`, `teamApi` and the `useTeams` hooks
were all complete, and ten places *consumed* teams — escalation routing, on-call
rotations, standups, insights, tickets, forms. There was simply nowhere in the UI
to create one, so a workspace could only get a team by calling the API directly.
The page manages the list, members and in-team roles, the optional department
link, and repository-backed sync. Deleting a team is owner-only.

### Fixed

**Only platform staff ever saw the admin-only settings pages.** The gate called
`useAdmin`, which reports Aexy staff, not workspace admins — so a workspace owner
was denied their own Organization, Billing and SSO pages while an Aexy employee
saw them in every tenant.

**Sidebar tooltips broke the layout they wrapped.** `SimpleTooltip` renders an
`inline-block` wrapper, which re-flows block children; a caller passing
`className="block w-full"` now wins, since `cn` is tailwind-merge.

**`GET /crm/objects` returned 500 for any workspace that ran the standard seed.**
`seed_standard_objects` creates a Lead object, but the response schema's
`CRMObjectType` literal omitted `"lead"` — the response model rejected a row the
service itself had written. The frontend union also gained the `"project"` type
the backend allows.

**The Google OAuth callback pointed at a route that no longer exists** in ten
places, so completing a connect landed on a dead page.

**The email-delivery page fetched with a null caller**, and the CRM attribute list
offered two affordances with nothing behind them: rows were draggable with no
endpoint to persist an order, and an edit button set state nothing rendered.

**Four `service_desk` entries had gone missing from the stock app bundles**, which
would have left new workspaces without the module. Its own module blurb still
read "Partners, insurers, LOBs" as well.

## [0.12.0] - 2026-08-04

### Fix: Service Desk hardening — cross-tenant mail, an open webhook, and one customer's constants

Review follow-up on 0.11.0. Three of these are tenancy bugs, one is an
authentication gap, and the rest is the module quietly being Bimaplan-shaped in
ways no other workspace could change.

**A mailbox could point at another workspace's Google account.** `integration_id`
arrived in the request body and was stored unchecked; it only FKs to
`google_integrations.id`, and the Gmail-sync fan-out matched on that id alone.
A service-desk manager who knew another workspace's integration id therefore got
that workspace's inbound mail filed as tickets *in their own desk* on the next
sync, and outbound closure mail sent *as them*. Now: refused at create/update
time, the sync lookup is scoped to the integration's own workspace, and the
mailer refuses a mismatch outright — every other body-supplied id on this branch
was already checked (`_validate_refs`, `_require_own`, the `convert_to_task` team
check); this one had been missed.

**Two workspaces could claim the same mailbox address.** The unique constraint is
per workspace, but the inbound webhook has no workspace context and resolves
`to` → mailbox across all of them, picking the oldest. Registering an address you
don't own therefore diverted someone else's mail — first registration won.
Addresses are now globally unique among service-desk mailboxes.

**The inbound-mail webhook was unauthenticated.** `/webhooks/email/inbound`
verified nothing, unlike the four event webhooks hardened under WS-057/WS-082.
Since 0.11.0 it also creates tickets and sends an acknowledgement to the address
in the payload, which made it both a ticket-injection vector — spoof a partner
domain and land in that partner's KAM queue — and an email reflector on the
workspace's own sending domain. It now accepts Postmark Basic Auth, a Mailgun
signature block, or a shared token in the URL/header, and falls through to the
existing `webhooks_require_signing` rule (default **True**, so an unconfigured
deployment fails closed). SendGrid Inbound Parse does not sign its posts at all,
which is why the token exists.

**Migrations could not be applied in order.** `migrate_org_onboarding.sql` sorted
*before* `migrate_org_structure.sql` (`o` < `s`) but references `departments`,
which the latter creates — and `run_migrations.py` stops at the first failure, so
the whole 0.11.0 migration set failed on any database that didn't already have
the table from `create_all`. Renamed to `migrate_org_structure_onboarding.sql`.
The three partial unique indexes are now declared in the model metadata as well
as in SQL, because `create_all` only builds what is in the metadata: a
Docker-first environment could accumulate rows that made `CREATE UNIQUE INDEX`
impossible afterwards. And accepting an invite no longer writes a second
`is_primary` department row — which violated exactly that index, and was
swallowed by the placement's own error handler, so the person joined with no
department at all: the one outcome the feature exists to prevent.

**Everything that was one customer's operation is now per workspace.** The ticket
prefix (`BSD`, for "Bimaplan Service Desk", written as a constant in four
modules), the timezone the breach clock resolves day boundaries in
(`Asia/Kolkata`, hardcoded), the 2-business-day breach target and its amber
warning, and the built-in email copy that signed off as "Bimaplan Operations" —
so every other company sent Bimaplan-branded acknowledgements until someone
edited three templates. All of it is editable on `Service Desk → Master Data`,
and **every default reproduces the previous behaviour exactly**: display ids are
rendered from `ticket_number` rather than stored, so changing the default would
have silently relabelled existing tickets. Subject-line threading accepts the
workspace's prefix *and* the legacy `BSD`, so mail already in flight still lands
on the right ticket. Service Desk is also no longer force-enabled in all four
stock app bundles; it stays in the catalog and is enabled per workspace, which is
appropriate for a module with insurers, LOBs and KAMs in its data model.

**Also fixed:** the closure email was sent inside the request, before the
transaction committed, so a rollback left the requester told their ticket was
resolved — it is queued and flushed after commit now, like intake already did.
The digest no longer mails people who have left the workspace (department rows
outlive membership, which is why intake's `_random_kam` already joined
`WorkspaceMember`), isolates each workspace so one bad template can't cost every
later workspace its digest, and runs with a 30-minute activity timeout instead of
the 300s default it inherited while fanning out over every workspace. A
department head and a headcount seat must now be workspace members —`head_id`
decides who receives the entire desk's open-ticket list. A duplicate
`function_key` returns 409 naming the clash instead of a 500. Reopening a ticket
clears `resolved_at` as well as `closed_at`. Manual logging calls a public
`create_ticket` rather than reaching into intake's private method. And
`TemplateService` renders through Jinja's `SandboxedEnvironment`: template bodies
are authored through the API, and `can_manage_service_desk` (which defaults to
include `support`) had made a plain environment reachable by more roles.

`test_digest_builder` asserted a 3-calendar-day age against a clock that only
accrues working hours, so it passed on a Thursday and failed on a Monday — the
same trap 0.11.0's own changelog describes fixing in `test_service_desk_tat.py`,
missed one file over.

#### Upgrade notes

Inbound mail now requires a credential. Set one and put it in the provider's
webhook URL, or inbound mail will 401:

```bash
INBOUND_EMAIL_WEBHOOK_TOKEN=<random string>
# SendGrid/other: https://…/api/v1/webhooks/email/inbound?token=<same value>
# Mailgun and Postmark inbound routes are verified by their own scheme already.
```

### Feature: workspace-wide AI controls — one kill switch, and your own provider keys

Two things a workspace owner could not previously say: "no AI on our data", and
"use our Anthropic account, not yours".

**The kill switch.** Every module that used AI carried its own toggle — Service
Desk's `ai_classification_enabled`, agent settings, file understanding — so
turning AI off across a workspace meant finding each one and hoping nobody
shipped a new module next week. `Settings → AI & Providers` now has a single
switch for the whole workspace, with an optional reason recorded alongside it so
the answer to "why has nothing been classified since Tuesday?" is in the row
rather than in somebody's memory.

It is enforced in `llm/gateway.py`, at the point a provider is resolved — not at
the API edge. A switch that only guarded HTTP handlers would leave every Temporal
activity, scheduled job and inbound webhook still calling out, which is most of
the AI in the product. `analyze`, `analyze_batch`, `extract_task_signals`,
`call_llm` and `score_match` all route through the same check, and the
vision/embeddings helpers are covered through their shared rate-limit gate — image
understanding of a workspace's own files is AI processing of that workspace's
data, whatever the endpoint is called. The check sits *before* the analysis cache,
so a disabled workspace gets a hard stop rather than a previously-generated
answer. It raises `AIDisabledError`, deliberately not `ValueError`, because
Temporal's LLM retry policy treats ValueError as non-retryable and everything
else as worth retrying for an hour — a disabled workspace is neither.

**Your own provider.** An owner or admin can point the workspace at claude,
gemini, openrouter, deepseek, ollama or lmstudio with its own key, model and (for
self-hosted) endpoint. The credential is stored with the same Fernet envelope as
integration credentials and has no read path at all: the API returns only the
last four characters and when it was installed. Provider instances are cached by
a fingerprint that includes the key, so rotation takes effect immediately and a
per-call `httpx` client isn't leaked on every LLM call.

`allow_platform_fallback` defaults to **off**. An organisation that supplied a
key did so precisely so its prompts would not travel through the platform's
account; falling back the moment that key misbehaved would defeat the point
without anyone noticing. With fallback off and the key unusable, the workspace
stops instead. Rate-limit accounting follows the provider actually used, so a
workspace on its own Claude key is no longer counted against — or throttled
by — the deployment's provider bucket.

Editing these settings requires the **Pro or Enterprise** plan and an owner/admin
role. *Enforcement of an existing setting is not plan-gated:* a workspace that
turned AI off keeps it off after a downgrade, and gets a 402 if it tries to turn
it back on. Silently resuming LLM calls on someone's data because a card expired
would be the worst available failure mode for this particular switch. Reading the
settings is open to any member — whether AI is on is about their data.

A live **Test connection** button probes the configured provider with a
one-token prompt and reports the provider's own message, because "wrong key" and
"wrong model name" and "endpoint unreachable" otherwise all present identically:
as a batch of features quietly degrading, hours later, in a worker log.

**Two provider bugs found while testing this, both fixed.** `ClaudeProvider`
used the full messages endpoint as its httpx `base_url` and then requested `""`,
which resolves to `/v1/messages/` — with the trailing slash — and Anthropic
answers `307` to the un-slashed form. httpx does not follow redirects by
default, so *every* Claude call raised instead of completing; it went unnoticed
because this deployment defaults to Gemini. And a workspace that selected a
provider without naming a model was handed the deployment's model name
regardless of provider, so picking Claude on a Gemini deployment asked Anthropic
for `gemini-2.0-flash`.

An absent settings row means "platform default, AI on", so nothing changes for
any existing workspace and no backfill is needed. If
`migrate_workspace_ai_settings.sql` has not been applied yet, the lookup degrades
to that default in a savepoint rather than taking every AI feature down —
fail-open for exactly that one error, and fail-closed for anything else, because
ignoring any other failure would mean ignoring a switch somebody deliberately
turned on.

#### Upgrade notes

```bash
docker exec aexy-backend python scripts/run_migrations.py --file migrate_workspace_ai_settings.sql
```

## [0.11.0] - 2026-07-30

### Feature: Bimaplan Service Desk — email-intake ticketing + Organization structure

Three parts, released together: the two modules, the onboarding paths that
turned out never to place anyone in a department, and the breach clock.

Adds two new modules. **Organization** models the company itself — departments,
reporting lines, headcount — and **Service Desk** is an email-first ticketing
desk for Bimaplan's insurance operations: mail sent to a shared mailbox becomes
a ticket, gets classified and auto-assigned to a KAM, and is tracked by *who
currently owes an action* rather than by a status column.

**Organization structure.** `departments` is a materialised-path tree
(`path`/`depth`, so subtree reads are one `LIKE` query and reparenting rewrites
descendants in a single statement), plus `department_members` with
head/manager/member roles and per-person allocation, and `department_positions`
for planned-vs-filled headcount. Two joins into existing tables: delivery teams
roll up via `teams.department_id`, and people-level reporting lines live on
`workspace_members.manager_id` — both nullable, so existing workspaces are
unaffected. A `function_key` (`ops_kam`, `sales`, `finance`, `hr`, …) marks what
a department *does*, which is what Service Desk routing keys off, so ops can
rename "Operations" without breaking assignment. Frontend: departments manager,
org chart, and a people directory. `migrate_org_structure.sql`.

**Email → ticket.** Service Desk tickets are ordinary `Ticket` rows
(`source='service_desk_*'`) with a 1:1 `service_desk_tickets` extension, so they
inherit comments, attachments and audit trail — but they're filtered out of the
generic tickets list and stats, which stay the general-purpose module. Intake
accepts both inbound-parse webhooks and Gmail sync, resolves the sender to a
partner (by email domain) or insurer, picks the request type (`query`,
`policy_issuance`, `claims`, `payout`), assigns the partner's KAM (falling back
to a random active member of the ops/KAM department), and sends an
acknowledgement. Replies thread back onto the original ticket by subject token
(`BSD-123`) and reopen it if it had been closed.

**Pending-with ledger.** Instead of a status field, every hand-off appends to
`ticket_pending_segments` — an append-only ledger of who held the ticket and for
how long. The TAT/breach clock counts only time held by *Bimaplan* functions
(`kam`, `sales`, `finance`, `marketing`), so a ticket parked with an insurer or
partner doesn't accrue against us. Dashboard aggregates open volume, breaches
and per-function load off the same ledger.

**Master data, templates, digest.** Workspace-scoped partners (with KAM +
domains), insurers, and lines of business drive classification and assignment;
the three customer-facing emails (receipt, hand-off, closure) are editable
templates with a live preview. A Temporal schedule (`service-desk-digest`,
09:00/13:00/17:00 IST via new cron support in `schedules.py`) mails each KAM
their open tickets. Any ticket can be converted into a sprint task, linked both
ways.

**Authorization.** `require_app_access` only checks the workspace-wide module
toggle — and defaults to *enabled* — so it says nothing about who is asking. A
new `require_workspace_member()` guard is mounted alongside it on both routers,
where a future endpoint can't forget it; mutations additionally require
`can_manage_service_desk` / `can_manage_org`, and every by-id ticket path (not
just the list) applies the KAM row-scope clause, 404-ing rather than 403-ing so
out-of-scope ids stay unenumerable. Cross-workspace ids passed as
`partner_id`/`lob_id`/`project_id` are validated against the caller's workspace.
Intake is idempotent per `Message-ID` (`service_desk_ingested_messages`, enforced
by a unique constraint rather than a read-then-write check), subject threading is
joined to `service_desk_tickets` so a `Re: BSD-7` can't attach an external
sender's mail to an unrelated generic ticket #7, ticket-number collisions retry
on a savepoint, and outbound mail is queued and flushed only after commit so a
requester can't be acknowledged for a ticket that rolled back.

**Read-only UI.** Both modules tell the client what the caller may do, so pages
stop offering actions that would only 403: Service Desk returns `can_manage` on
the settings payload the Master Data page already fetches, and Organization —
which has no settings object — gets a small `GET /organization/my-permissions`,
named after the existing `projects.py::get_my_permissions`. Non-managers see the
data with an explanatory banner and no controls.

Fully internationalised (new `serviceDesk` + `organization` namespaces, en + hi).
Migrations: `migrate_org_structure.sql`, `migrate_service_desk.sql`,
`migrate_service_desk_hardening.sql`.


#### Fix: nobody was ever put in a department

The Organization module shipped with departments, reporting lines and Service
Desk routing that all key off department membership — and no path that ever
creates it. Workspace creation seeds no departments, the invite carried only
email and role, and `addMember`/`removeMember`/`addPosition`/`setManager` existed
in the API and the hooks with **no caller anywhere in the UI**. The only way to
place a person in a department was the seed script. So every new joiner landed
unassigned: invisible in the directory (which iterates departments), permanently
out of scope for Service Desk row filtering, and ineligible for KAM
auto-assignment.

**The seed produced unusable KAMs.** It created a `Developer` and a
`DepartmentMember` but never a `WorkspaceMember`. Since auto-assignment requires
an active workspace member and every Service Desk route sits behind
`require_workspace_member`, seeded KAMs could not be assigned a ticket and could
not open the workspace at all. Fixed, and re-seeding now reactivates a
previously-removed KAM instead of silently skipping them.

**Membership is confined to the workspace.** `add_member` accepted any
`developer_id` on the platform and returned that person's name and email, so it
doubled as a cross-workspace read of someone else's contact details;
`set_manager` accepted a manager from another workspace (the column FKs to
`developers.id`, not to `workspace_members`) and accepted reporting cycles — A→B
plus B→A was fine, which would make anything walking the chain recurse until it
ran out of stack. Both now require an active member of the same workspace, and
cycles are refused by walking the proposed manager's chain.

**Somewhere to actually do it.** A department roster dialog on
Organization → Departments wires up the four orphaned mutations: add and remove
people, change head/manager/member, and define positions (the department detail
read now returns `positions`, which it previously accepted writes for and never
returned). The person picker offers only people not already in the department and
flags the ones in no department at all. Everything is gated on `can_manage_org`,
so a read-only caller gets the roster without the controls.

**Unassigned people are visible.** A new `GET /organization/people` walks from
workspace membership rather than from departments — the only read that can show
someone who belongs to nothing. The directory now renders an "Unassigned"
group off it (and dropped its per-department N+1 reads), the
workspace members settings page shows each person's departments or an
"assign" link, and reporting lines are finally readable and editable there
instead of `manager_id` being a write-only column.

**Optional department on invite.** `workspace_pending_invites` gains nullable
`department_id` and `role_in_department` (`migrate_org_onboarding.sql`), applied
on accept as the person's primary department with `source="invite"`. It stays
optional by design — an admin inviting someone in a hurry is never forced to
settle the org structure first. A department that no longer exists cannot cost
someone their invitation: the placement runs in a savepoint and only logs. A
mistyped id is rejected at invite time rather than silently doing nothing days
later. Pickers appear in the settings invite dialog and the onboarding wizard,
and only when the workspace actually has departments to choose from.

**`can_view_org` / `can_view_service_desk` are enforced.** Both were in the
catalog and advertised by `app_definitions` from the start, but nothing checked
them, so revoking someone's access to a module had no effect. A new
`require_workspace_permission` guard is mounted on both routers. `developer` is
added to `can_view_service_desk`'s defaults because the legacy workspace role
`member` maps to that template and a KAM is usually a plain member — opening the
module is not the same as seeing everything in it, and row-level scoping is
unchanged. In practice the gate bites on per-member overrides and custom roles;
every legacy role that clears the membership guard still has both permissions.

**An empty ticket list says why.** `GET /service-desk/settings` now reports
`scope` (`all` / `function` / `none`), so the tickets page can tell a quiet day
apart from "you are in no department, so nothing can ever match you" — the state
a new joiner is in, and previously indistinguishable from having no work.

Also fixes a latent `TypeError` in invite acceptance: `expires_at` was compared
directly against an aware `datetime`, which raises rather than returning False if
a naive value ever reaches it.


#### Change: the Service Desk breach clock counts working hours in IST

The BRD's ">2 days in the same stage" was implemented as calendar days, so a
ticket arriving Friday evening was already red by Monday morning — three days
elapsed, not one of them a working hour. The clock now measures **2 business
days of working time**: it accrues only inside the shift and stops overnight, at
weekends, and on holidays.

One "day" is one shift, not 24 hours, so `to_days` divides by the shift length
and the 2-day target is 18 working hours on a 09:30–18:30 day. A ticket arriving
17:30 on Friday has one hour of allowance left that day, reads 1.11 days at
Monday's close, and does not breach until 17:30 on Tuesday — by which point four
calendar days have passed.

The shift defaults to **09:30–18:30 IST** and Ops can change it themselves from
the Master Data page — `PATCH /service-desk/settings` now takes
`working_hours_start`/`working_hours_end` (gated on `can_manage_service_desk`)
and persists to `Workspace.settings["service_desk"]["working_hours"]`, so no
migration is needed. The patch is partial, so flipping the AI toggle can't wipe
the hours. An inverted or malformed window is refused at the API rather than
saved, and the change is logged with the actor, because moving the window
re-scores every open ticket's stage age. `Clock` still falls back to a 9h day if
it meets bad data, but that guard is for rows written before the validation
existed — not a licence to save nonsense. Boundaries resolve
in `Asia/Kolkata` — whether an instant falls inside Tuesday's shift depends on
the timezone you ask in, and 13:00 UTC is exactly the 18:30 IST close. IST has
no DST, so the boundaries are unambiguous.

Holidays come from the Leave module's existing `holidays` table rather than a
hardcoded calendar — its own docstring says it is for business-day calculations.
Only mandatory, workspace-wide entries count: optional holidays are not days off
for everyone, and an SLA that changes depending on which team you ask about is
not an SLA.

**Overall TAT deliberately stays wall-clock.** Stage and per-stakeholder figures
answer "are we late?" and must not accrue over a weekend; overall answers "how
long has the requester been waiting?", and they waited through the weekend. The
two are now labelled distinctly in the UI ("Current stage (business days)" vs
"Overall TAT (elapsed)").

All of it lives in one new `services/service_desk_clock.py`. The threshold was
previously written four times — as a bare `> 2` in the ticket service, again in
the digest service, and a third time in the digest email copy — so it could
drift silently. The segment ledger's `duration_seconds` is untouched: it remains
the wall-clock audit record of each hand-off, and business time is recomputed
from the segment boundaries rather than trusting that column.

The existing red-breach test asserted on `now - 3 days`, which under a business
clock passes on a Thursday and fails on a Monday. It now uses a 7-day window,
which is exactly five business days whatever day the suite runs on.

## [0.10.2] - 2026-08-04

### Fix: uploaded files that were never uploaded, and uploaded files that could never be opened

Reported as "file upload on the public form is not working". It wasn't, but
chasing it turned up a second, wider failure with the same shape: files that
uploaded perfectly and then could not be fetched by anyone.

**The form never sent the file.** The `file` field's handler called
`onChange(file.name)` — it put the *filename* into the submission and threw the
`File` away. The submit payload is JSON, so bytes could never have ridden along
with it, and no upload endpoint existed to send them to. A submitter picked a
file, saw its name appear, submitted, and got a ticket whose attachment field
was a string. The field's own rules (`max_file_size_mb`, `allowed_file_types`)
were never enforced either, because there was nothing to enforce them against.

There is now `POST /public/forms/{token}/uploads`. The page uploads as soon as a
file is picked and submits a reference to the stored object. The reference is
**HMAC-signed**: attachments on a form-created ticket are readable through that
ticket's public share link, so accepting a caller-supplied storage key would
have let anyone attach — and then read — any object in the bucket. Unsigned,
tampered, or cross-form references are dropped rather than trusted. Being an
unauthenticated endpoint it is also bounded by a per-IP rate limit, the field's
size and MIME rules, and a per-field count cap.

**Task attachments uploaded fine and then 404'd.** These were never broken at
the upload step — the bytes are in storage. What was stored alongside them was a
dead link. `get_object_url()` composes `{S3_PUBLIC_ENDPOINT_URL}/{bucket}/{key}`
and that value went into `task_attachments.file_url`, but nothing serves the
configured public path in production — the request reaches the API, which
correctly 404s a route it has never had. Objects are also written with no
public-read ACL, so an unsigned URL is refused (`403 AccessDenied`) even where
the proxy does exist. Two independent reasons the link could not work, which is
why it looked like an upload bug: the failure only ever showed up at read time.

Client-facing URLs are now **presigned per response** and never persisted — a
signed URL expires, so storing one only moves the problem. Rows carry
`storage_key`, and the ticket module's existing approach (store the private key,
never a public URL) is now what every one of these surfaces does.

**Audited the rest.** Ticket attachments and compliance documents were already
correct. Chat presigns. Two more had the same defect and are fixed here:

* **Drive** persisted the same dead URL, and the Drive UI opens `file_url`
  directly while the Docs viewer renders it into `<img>`/`<video>`.
* **Assessment proctoring recordings** *did* presign, but recovered the key by
  splitting the URL on `.r2.cloudflarestorage.com/` — an R2-only form. On the
  path-style URLs this deployment actually writes that yields no key, silently,
  inside a `try/except`. Recordings never played back and nothing logged why.
  Key recovery now handles both addressing styles.

That last pattern also explains a quieter casualty: the AI metadata pipeline
prefers `file_url` over `file_key`, so it had been fetching these dead URLs too.
Summaries and tags for drive files and task attachments were failing for the
same reason the previews were.

**Existing rows repaired.** `migrate_storage_keys_backfill.sql` recovers
`storage_key` for every task attachment and drive file from the URL already
stored. Nothing was lost — upload success was always checked — so recovering the
key is enough to make old attachments load again. The derivation keys off the
object prefix rather than the bucket name, so it holds across deployments with
different `S3_BUCKET_NAME` values, and it skips rows whose URLs don't match
rather than writing a wrong key; those still resolve through the read-time
fallback.

#### Upgrade notes

**The object storage route must pass the path through unmodified.** SigV4 signs
the URI path along with the `Host` header, so the previous
`rewrite ^/storage/(.*)$ /$1` silently invalidates every presigned URL
(`SignatureDoesNotMatch`). `nginx/nginx.conf` now serves storage from a
bucket-rooted location with no rewrite:

```
location /aexy-storage/ {   # must equal S3_BUCKET_NAME
    proxy_pass http://rustfs;
}
```

paired with a **bare** origin — `S3_PUBLIC_ENDPOINT_URL=https://server.aexy.io`,
no `/storage` suffix (the prod default is updated). This needs no new DNS record.
Deployments whose edge is not this nginx must apply the equivalent rule there;
until they do, attachment URLs will fail at the edge rather than at storage.

## [0.10.1] - 2026-07-30

### Fix: tasks moved to In Review disappeared from the board

Reported by the tech team using the feature. A task set to review didn't land in
the wrong column — it left the board entirely.

Two spellings of the same status exist. The seeded status row is `in_review`
(`task_config_service.DEFAULT_STATUSES`), but the shared UI `STATUS_CONFIG` map
— which every status picker writes from — said `review`, as do the keyboard
shortcut and several hardcoded lists. The kanban builds its columns from the
seeded slugs and buckets tasks by `sprint_tasks.status`, so a task stored as
`review` went into a bucket no column reads and was never rendered.

That also explains why it looked erratic: **dragging** a card onto the In Review
column always worked, because the drag handler uses the project's real slugs.
Only the status dropdown, the edit modal, and the `4` shortcut broke it.

**Canonicalised on write.** `SprintTaskService.canonical_status_slug` resolves
whichever spelling a caller sends to the one that task's own board has a column
for, and all three write paths use it. So it no longer matters which spelling
arrives — an older client, the Slack integration, or a UI path nobody has found
all store something renderable. A workspace whose status set genuinely uses
`review` keeps it; the alias resolves toward the board, not toward one spelling.

**Existing rows rescued.** `migrate_task_status_review_slug.sql` moves stranded
tasks, per workspace so a set that legitimately uses `review` is untouched. It
also repairs two things the status column alone would have left broken:

* **Both sides of each history transition.** Rewriting only the destination left
  a later row reading `review → done` right after an earlier one reading
  `todo → in_review` — a timeline that jumps through a status which no longer
  exists.
* **WIP limits.** They live in `sprints.settings->'wip_limits'` keyed by status
  slug and are read back by slug, so a limit set on `review` silently stopped
  applying once the column became `in_review`. No error — the cap just never
  fired again.

**And it can't hide a task again.** The board now renders an amber
"unrecognised status" column for anything matching no column. A card in an ugly
column is a nuisance; a card that vanishes costs someone their work.


## [0.10.0] - 2026-07-29

### Workflow secrets, and the credential fields that were never safe

A place to put a credential that is not the workflow definition. Minor rather
than patch: a new stored resource with its own settings surface, a palette
action that was never runnable becoming runnable, and several behaviour changes
that affect automations already saved (see Upgrade notes).

Also covers #218 and #219, which merged without versions of their own.

**Workspace secrets.** Named values, Fernet-encrypted, referenced from a step
as `{{secrets.NAME}}`. Managed under Settings → Security → Workflow Secrets.
There is no endpoint that returns a value — not to a member, not to an admin,
not to whoever saved it — so rotation is an overwrite and a lost credential is
replaced rather than looked up. The builder inserts references from a picker on
webhook headers and on the `api_request` auth fields.

**Run an automation by hand** (#218). A published automation can be run for one
chosen record from the builder. It refuses up front — paused, over the monthly
allowance, record from another workspace, record of the wrong type — rather
than reporting "triggered" for work that cannot happen. The response promises
only that the run started; the outcome lands in run history.

### Fixed

- **A credential pasted into a webhook header was readable by the whole
  workspace.** Header templates live in the workflow definition and reading a
  workflow needs only `member`. Pasting one is now refused at save, with the
  reference offered in its place.
- **A resolved credential came back out through run history.** The webhook step
  records the response body, and receivers commonly echo the request they were
  sent, so the value returned by the far end landed in the run log. Resolved
  values are scrubbed from the stored response.
- **The scrub could still leak a prefix.** Truncation ran before redaction, so a
  credential straddling the 1000-character cut was sliced in half and the
  remaining prefix matched nothing. Ordering is now an invariant of the helper.
- **`api_request` never worked and leaked its credential.** The config panel
  wrote `api_url`/`api_method`/`api_body` while the executor read
  `webhook_url`/`http_method`/`body_template`, so every step failed on "No
  webhook URL specified"; meanwhile its Bearer Token and API Key fields were
  read by nothing and sat in the workflow definition in plain text. Both
  executors now read those keys and apply the auth config as a header, from a
  secret reference only. The action leaves the hidden set.
- **`send_slack` collected headers and a timeout that nothing read.** Both were
  copy-pasted from `webhook_call`; the headers field invited a credential into
  the graph to no purpose. Removed, stripped on save, and cleared from existing
  definitions, versions and templates by migration.
- **The durable executor could not resolve a secret in a header at all.**
  Templates render before secrets resolve and the renderer rejects any
  unresolvable `{{...}}`, so every `{{secrets.NAME}}` header failed with
  "Dynamic value is missing".
- **PATCH accepted fields it silently discarded** (#218). Undeclared fields were
  dropped with a 200 — `runs_this_month` looked resettable and was not, and the
  builder's trigger sync had never once taken effect, leaving the canvas and the
  stored trigger free to disagree. Unknown fields are now refused.
- **Creating an automation with a bad `object_id` returned 500** (#218), and one
  belonging to another workspace was accepted outright — the foreign key has no
  workspace in it. Both are refused with a 400.
- **`greenlet` was never a declared dependency** (#219). It reached the Docker
  image transitively, so production worked by accident while a clean checkout
  could not run the async test suite. `uv.lock` had also drifted from
  `pyproject.toml` for several releases.

### Upgrade notes

- `migrate_workspace_secrets.sql` and `migrate_strip_inert_slack_config.sql`
  are picked up automatically. The second rewrites stored workflow JSON —
  definitions, version history and templates — to drop the dead `send_slack`
  keys. It only touches rows that carry them.
- **Behaviour change:** a literal credential in a webhook header or in an
  `api_request` auth field now blocks save, and fails the step at run time for
  workflows saved before this release. Move those values into a workspace
  secret before deploying — an `api_request` step with a pasted token was
  sending unauthenticated requests regardless.
- **Behaviour change:** a canvas save whose trigger node carries a trigger the
  module does not offer now returns 422 instead of silently succeeding.
- Secrets are encrypted with the same key as integration credentials. Losing
  `SECRET_KEY` loses them, and there is no read path to export them first.

### Known limitations

- Redaction matches a credential verbatim, so a receiver echoing it
  HTML-escaped or URL-encoded would not be caught.
- Secret values have no minimum length; a very short one would over-redact the
  recorded response.
- Secrets resolve into headers and the `api_request` auth fields only — never
  into a body, subject or message, where they would reach run history or an
  inbox.

## [0.9.0] - 2026-07-29

### CRM automations: visual builder wired to a durable execution engine

Both halves of the release — the authoring foundation (#214, which merged
without a version of its own) and the durable execution layer (#215). Minor
rather than patch: a large feature, and it carries one behaviour change that
affects automations already running (see Upgrade notes).

**Authoring and triggers.** The canvas persists nodes, edges and per-node
configuration, and the palette is driven by the backend capability registry, so
an unfinished step is hidden rather than offered. Invalid configuration blocks
save and publish with per-node reasons. Record created/updated/deleted,
field-changed, list membership, form submission and tracked email open/click
all start matching automations.

**Durable execution.** A canvas containing timing, logic or AI steps runs on
Temporal instead of the inline executor: conditions route, waits survive a
worker restart, branches record the rule they matched, and agent output flows
into later steps through workflow variables. Action-only canvases keep the
inline path.

**Delivery honesty.** Automation email is recorded in an outbox inside the same
transaction as the run, so a send can no longer be handed to a worker that
cannot yet see the run. Steps report queued, sent, failed or needs-review
rather than an optimistic success, and a run abandoned without an outcome is
closed by a reaper instead of sitting on "running" for good.

### Fixed

- **A published condition or branch could be silently dropped.** Publish
  accepted structural nodes while only `wait` was routed durably, and
  flattening keeps only action nodes — so "if deal value > 50k, notify the VP"
  published cleanly and then notified the VP on every deal, every step green.
- **Record values reached email bodies unescaped**, so markup in a field such
  as a company name was delivered live to the recipient.
- **Open and click tracking fired on every hit** of an unauthenticated,
  replayable URL, each starting another automation run. First one only.
- **Webhook steps could reach inside the network** — cloud metadata, Redis,
  Temporal, internal APIs. The target must now resolve to a public address,
  enforced in both executors. `ALLOW_PRIVATE_WEBHOOK_TARGETS` re-enables
  internal targets for self-hosted deployments.
- **The monthly run cap enforced nothing**: checked at the start of a run and
  incremented at the end, so concurrent triggers all passed at the limit.
- **Success and failure tallies lost increments** when written concurrently by
  the executor, the email activity, the outbox and the reaper.
- **Concurrent writers overwrote each other's step log**, so a delivered email
  could quietly lose its "sent".
- **A deploy could wedge an in-flight wait.** Command-affecting changes sit
  behind a Temporal patch gate, so an execution started earlier replays its
  original path.
- **Retried steps could duplicate work** — SMS could send twice, and a retried
  node could enqueue a second independent email, Slack message or campaign.
- **A half-delivered notification read as success**: on "both", Slack failing
  while email queued left the step green.
- **Numeric conditions treated an empty field as zero**, so `amount < 100`
  matched every record with no amount.
- **Runs started from the builder's Run button stayed "pending" forever**,
  success and failure alike, with no per-step detail.

### Upgrade notes

- `migrate_automation_email_outbox.sql` and
  `migrate_automation_delivery_attempts.sql` are picked up automatically.
  Apply `normalize_crm_automation_trigger_types.sql` explicitly after reviewing
  its preview.
- Restart the backend and the Temporal worker together, and make sure the
  worker consumes both the workflow and integration queues.
- **Behaviour change:** an unresolved `{{...}}` reference now fails its step
  instead of rendering empty. Deliberate — a blank recipient or body is worse
  than a visible failure — but it affects automations referencing an optional
  field that happens to be unset. Audit live automations before deploying.
- Rollback is unsafe for automations containing condition, branch, wait or
  agent nodes: the older executor flattens those away.

### Known limitations

- An SMS attempt that reaches the provider and never finishes recording is
  reported as needing review rather than retried automatically. Only the
  provider's log can say whether it was delivered.
- Parallel branch paths are not implemented; a branch selects one path.
- Enrich, classify and summarise actions have no executor and stay hidden.

## [0.8.59] - 2026-07-28

### Fix: opening a task from All Tasks stranded you on a project board

Clicking any task on `/sprints?tab=tasks` navigated to that task's project
board (`/sprints/{projectId}/board?task={taskId}`) and opened the detail modal
there. Closing it left you on a board you never asked for — the only way back
to All Tasks was the browser button, and every filter, search term and view
you'd set up on the tab was gone. The tab was doing this to avoid duplicating
the board's task detail modal.

- **`EditTaskModal` is now a shared component** at
  `components/sprints/EditTaskModal.tsx`, extracted verbatim out of
  `sprints/[projectId]/board/page.tsx` (~1.3k lines) along with its
  `AssignmentHistoryPanel` helper. It was already route-agnostic — every
  scoped call derives its ids from `task.sprint_id` / `task.team_id` — so no
  behavior changed on the board. The `STATUS_CONFIG` / `PRIORITY_CONFIG` /
  `SPRINT_STATUS_COLORS` maps both files need moved to
  `components/sprints/taskFieldConfig.ts`.
- **The Tasks tab opens that same modal in place.** The selected id lives in
  `?task={id}` (via `replace`, not `push`, so closing doesn't need two Backs),
  so refresh and link-share reopen the same task over the same filtered view.
  Lookup prefers the already-loaded workspace list and falls back to an
  archive-inclusive fetch, so a deep link opens even when the task is archived
  or sits past the 1000-row cap. The sprint picker is scoped to the task's own
  project — the workspace list spans all of them.
- **`useWorkspaceTasks` gained `updateTask` / `archiveTask`**, routed to the
  sprint or project API the way `useProjectBoard` does but taking the owning
  project id per call, since this tab spans projects. Also exposes `epics` for
  the modal.
- **`/sprints?task={id}` still redirects to the board** for activity-feed and
  chat deep links, but skips that redirect on the Tasks tab, which now owns the
  param. Switching tabs drops `task` so it can't re-arm the redirect elsewhere.
- Two fixes fell out of the reuse: the tab's `n` / `/` hotkeys are now disabled
  while the detail modal is up (the shortcut hook only ignores keystrokes from
  inputs, not a focused `<select>`), and the modal's attachment add/delete
  invalidate through `invalidateTaskCaches` so the workspace list refreshes
  too, not just the sprint/project ones.

## [0.8.58] - 2026-07-18

### Feature: Community page becomes a logged-in member hub

Extends the public `/community/{slug}` forum so that, once you sign in, it stops
being a read-only crawlable page and becomes a hub: members see their internal
(non web-public) threads inline, can start new threads without leaving the page,
and non-members get a CTA to spin up their own community. The public shell stays
anonymously ISR-cached — all member content hydrates client-side from a new
authenticated endpoint, so nothing private ever touches the shared cache.

**Authenticated member context.** New `GET /public/community/{slug}/me` resolves
the caller's workspace membership and returns the internal channels/topics they
may access, their role, and what they may do (`can_create_thread`,
`can_post_public`). Access mirrors in-app chat exactly — never the public
predicates: DMs and archived channels are excluded, web-public channels are
omitted (they're already in the public view), a `private` channel needs
membership, a `private` topic needs channel membership, and a `restricted` topic
needs an access grant. Non-members get an `is_member:false` payload with no
`workspace_id` and no channels (a 200, not a 403), so the client can offer the
"start your own community" CTA without leaking anything. A web-public topic
nested in an otherwise-internal channel is kept but flagged `is_web_public` so
the UI can badge it. Backed by a dedicated `CommunityMemberService`, kept
separate from the deliberately-anonymous `PublicCommunityService`.

**Inline member layer (frontend).** A client island (`CommunityMemberPanel`)
reads the token from `localStorage`, calls `/me`, and renders one of: the
signed-out / non-member "start your own community" CTA (→ Settings → Community),
or — for members — an **Internal threads** section listing their accessible
channels/topics with unread badges and "Public" flags, deep-linking each topic
into the full in-app chat (`/chat/{channelSlug}/{topicId}`).

**New-thread composer.** Members start a thread in an existing channel or a
brand-new one via a dialog that reuses the existing chat create endpoints;
workspace admins get a "Post publicly on the web" toggle that publishes the new
topic (`web_public`) in one step. Publishing stays server-side admin-gated — the
toggle is only a convenience, the API returns 403 for non-admins.

**Public page polish.** A sticky header with the community logo/monogram + name,
a stats line, a dedicated "Channels" section, richer channel cards (icon tile,
last-activity date, pluralised topic/message counts), and a proper empty state.
All strings are internationalised (new `community` i18n namespace, en + hi); the
previously-hardcoded header/footer/auth strings now go through next-intl too.

## [0.8.57] - 2026-07-16

### Feature: Public community forum (opt-in, SEO-friendly, Slack/Discord-style)

Turns workspace-internal chat into the substrate for an **opt-in** public
community forum — a crawlable, workspace-scoped `/community/{slug}` site for
community building and SEO — while DMs stay strictly private. Nothing is public
unless a workspace explicitly enables it.

**Community-only account isolation.** Signing in from a public forum ("Sign in
to reply") creates a walled-off `community` account (`developers.account_type`),
carried as a JWT claim. A `CommunityIsolationMiddleware` restricts these accounts
to auth, `/public/*`, and their own `/developers/me` — every other internal
endpoint returns 403 (workspace creation is additionally blocked explicitly).
The frontend app shell redirects such accounts to the forum. Accounts are
promoted to `internal` automatically when invited to a workspace at viewer+.
`migrate_2026_07_17_developer_account_type.sql`.

**Discoverability.** A public directory at `/community` lists communities that
opted in (`enabled` AND a new `listed` flag; `migrate_2026_07_17_community_directory.sql`);
unknown slugs get a friendly `not-found`. In-chat, admins publish a channel to
the web from a new channel-settings dialog (3-tier visibility + "view public
forum" link), set per-thread visibility from the message header, and hide/unhide
individual messages from the public view (redaction, still visible internally);
the create dialog uses the workspace/private model. A "Community" sidebar entry
and the Settings → Public Community page round out the entry points.

- **Three-tier visibility.** Channels are `private | workspace | web_public`;
  topics can override with `inherit | private | restricted | web_public` (can
  only ever *narrow* the channel's reach, never widen it). Effective public
  visibility is the floor of the chain, gated behind a per-workspace master
  switch (`workspace_community.enabled`). A single resolver
  (`services/chat_visibility.py`) is the source of truth, mirrored as SQL
  predicates in the public read model so nothing leaks even if a caller forgets
  to filter.
- **DMs are structurally excluded.** Direct messages are modelled as 2-person
  private channels (`kind='dm'`, deduped by a partial unique index
  `uq_chat_dm_key`) and are excluded from every public query by predicate, not
  by caller-side filtering.
- **Anonymous public read API** (`/public/community/{slug}/...`) + **SSR
  frontend** with ISR (`revalidate=300`), canonical/OG metadata,
  `DiscussionForumPosting` + `BreadcrumbList` JSON-LD, and a per-community
  `sitemap.xml`. `noindex` and thin-content topics are excluded from indexing.
- **External participation** (optional). With `allow_participation` on, any
  signed-in Aexy user can reply to web-public topics; brand-new posters
  auto-join the host workspace as a non-billable `community` role that ranks
  below every internal permission gate. Posts are rate-limited (Redis,
  fail-open) and support `post` (visible immediately) or `pre` (held for admin
  approval) moderation, with a moderation queue in settings.
- **Per-member public identity.** Each member chooses how they appear publicly:
  real name, alias, or anonymous. Mention markup is stripped to plain `@Name`
  and internal fields are never emitted.
- New tables `chat_topic_access_grants`, `chat_public_member_prefs`,
  `workspace_community` + visibility/kind/permalink columns on
  `chat_channels`/`chat_topics`/`chat_messages`
  (`migrate_2026_07_16_public_community_chat.sql`); admin settings UI at
  `/settings/community`; SSR wiring (`INTERNAL_API_URL`, `NEXT_PUBLIC_SITE_URL`)
  added to dev and prod compose.

### Fixed

- **Stored XSS on public topic pages** — JSON-LD structured data embedded
  user-authored content via `JSON.stringify` + `dangerouslySetInnerHTML`, which
  does not escape `<`/`>`, allowing a `</script>` breakout. Now serialized
  through a `safeJsonLd()` helper that escapes `<`, `>`, and U+2028/U+2029.
- **Community settings response dropped `allow_participation` /
  `post_moderation`** — the hand-built response omitted both fields, so the API
  always reported participation off regardless of what was saved, making the
  settings toggle appear to revert. Both fields are now returned.
- **Public message list inner-join dropped messages** whose sender was a
  system/agent identity or a since-deleted developer (and desynced the paging
  `total`). Switched to a left outer join with null-safe author resolution.
- **Moderation approval regressed topic ordering** — approving a held post
  unconditionally overwrote `last_message_at`; it now only advances the
  last-message pointers when the approved post is genuinely the newest.
- **`AlertIntegrationService.list` shadowed the builtin `list`**, breaking a
  `list[...]` annotation under Python 3.13's eager annotation evaluation.
  Renamed to `list_integrations` (root fix, replacing the `from __future__
  import annotations` band-aid).

## [0.8.56] - 2026-07-16

### Feature: OpenObserve → ticketing integration (deduplicated incident tickets)

Connects online logging/observability platforms (OpenObserve first; the design
generalizes to Grafana/Datadog/Sentry) to the ticketing system, so a recurring
error collapses to a **single** ticket instead of one per firing.

- **Inbound webhook** `POST /webhooks/alerts/{inbound_token}` — token-addressed,
  HMAC-or-shared-secret authenticated (fail-closed), Redis rate-limited, and
  offloaded to a Temporal `process_alert_event` activity so a slow ticket write
  can't time out the webhook and trigger duplicate upstream deliveries.
- **Routing rules** (first match wins) map an alert's service/severity/env to a
  team, assignee, form, and priority.
- **Dedup via a fingerprint** (`provider:service:normalized_alert_name`, or a
  per-integration template). Volatile tokens (UUIDs, timestamps, hex/pod
  suffixes) are stripped so recurrences of one error share a fingerprint while
  `5xx`/`sev2`-style tokens stay distinct. The one-open-ticket-per-fingerprint
  guarantee is enforced by a **partial unique index** `uq_tickets_open_dedup`,
  not app logic alone — recurrences bump an occurrence counter + throttled
  comment, recently-closed tickets reopen (flapping), and recovery alerts
  auto-resolve.
- **Auto-populated custom fields** — severity, affected microservice, log
  context, and trace deep-links land as structured fields via a new
  `incident_auto` form template.
- New `alert_integrations` / `alert_events` tables + dedup columns on `tickets`
  (`migrate_alert_ticketing.sql`); `alert.ticket_created` / `alert.ticket_updated`
  automation triggers; settings UI at `/settings/alerting`; operator docs at
  `docs/integrations/openobserve.md`.

### Fix: concurrency hardening in the alert ingestion pipeline

Found in review of the above, before first ship:

- **Concurrent distinct alerts could be silently dropped.** The create path's
  `except IntegrityError` assumed the only constraint that could fire was the
  dedup index, but a `uq_ticket_number` collision (two concurrent deliveries for
  *different* alerts computing the same `max()+1`) was misread as a dedup race
  and finished as `ERROR` with no Temporal retry — losing the alert in exactly
  the alert-storm scenario the feature targets. It now re-raises when no
  same-fingerprint ticket surfaces, so the activity retries and picks a fresh
  number.
- **`_maybe_reopen` now scopes its reopen in a SAVEPOINT**, so a race with a
  concurrent open ticket rolls back only the reopen and falls through to the
  create path's bump-existing fallback instead of raising an unhandled error.
- **The "send test alert" endpoint no longer fires automations** — it still
  creates a real ticket for setup verification but skips `alert.ticket_*`
  dispatch, so a test can't page on-call or trigger escalation.
- Tests: 22 SQLite unit tests + 4 Postgres-only tests (partial-index invariant,
  close-then-reopen, service race fallback, and the ticket-number-collision
  regression).

## [0.8.55] - 2026-07-15

### Fix: CRM record-triggered automations never fired (0 runs)

A published `record.created` automation showed 0 runs when a record was added.
Root cause was a NULL-object mismatch: the `/automations` builder never sets
`object_id`, so automations are stored with `object_id IS NULL`, but
`process_trigger` matched with a strict `object_id == object_id` predicate —
which never matches NULL in SQL. Every record-triggered CRM automation built in
that UI silently never fired.

- **`process_trigger` now matches `object_id` null-tolerantly** (`IS NULL OR ==
  record's object`), so a global (unbound) automation fires for the workspace
  and an object-bound one fires only for its object.
- **Fixed the field/stage filters in the same function**, which compared against
  `"field_changed"`/`"stage_changed"` (underscores) while the dispatched values
  are `"field.changed"`/`"stage.changed"` (dots) — so those filters never
  applied. Now keyed off the enum values.
- **Replaced three silent `except Exception: pass` blocks** in `crm_service`
  (record created/updated/deleted dispatch) with `logger.exception(...)`. The
  dispatch stays best-effort (never fails record creation) but failures are no
  longer invisible — this is what made the broken trigger impossible to see.
- Added `tests/unit/test_crm_automation_trigger_matching.py` reproducing the
  production scenario plus object-scoping, inactive, trigger-type, and
  field-filter cases.

## [0.8.54] - 2026-07-15

### Harden the MCP / API-token surface: tests, soft-revoke, i18n

Follow-up to the MCP review. API tokens are what the (external) MCP server and
other integrations use to authenticate into the platform, and that surface was
previously untested.

- **Test coverage (was zero).** Added `backend/tests/unit/test_api_tokens.py`
  covering `ApiTokenService` (generation/hashing, expiry, `list`/`revoke`/
  `delete` owner-scoping, `validate` including the 5-minute `last_used_at`
  debounce) and the `aexy_`-prefix branch of `get_current_developer_id` end to
  end via the real endpoints — valid / unknown / expired / revoked tokens, plus
  a JWT-still-works regression check.
- **Soft-revoke.** `POST /developers/me/api-tokens/{id}/revoke` marks a token
  inactive but keeps the row for audit; a revoked token immediately fails
  `validate()`. `DELETE` remains for permanent removal. This makes the
  previously unreachable "Revoked" UI state real: active tokens get a **Revoke**
  action, revoked tokens can then be **Delete**d.
- **i18n.** The `/mcp` docs page and the API Tokens settings page were 100%
  hardcoded English. Both now use `next-intl` with full en + hi message files
  (`messages/{en,hi}/mcp.json`, `messages/{en,hi}/api-tokens.json`); technical
  terms and tool identifiers stay in English per convention.
- **Docs drift guard.** Documented that the `/mcp` tool catalog is
  hand-maintained and mirrors the external `aexy-io/mcp-server` repo, which is
  the source of truth.

## [0.8.53] - 2026-07-15

### Rename "Operations" nav group to "Autopilot" + restore the MCP link

- The AI-section group previously labelled **Operations** is now **Autopilot**,
  and its "All Operations" entry is renamed to **Overview** (the old label was
  vague and redundant with its own child). Applied to both the grouped and flat
  sidebar layouts and the `/operations` page title (en + hi).
- **Restored the MCP link to the sidebar.** When agents + automations were
  merged into the unified group, the old nav array that held the MCP entry was
  orphaned, so MCP silently disappeared from navigation (the page itself was
  always reachable by URL). MCP is now a sub-item of the Autopilot group:
  Overview / Agents / Workflows / MCP.
- Removed the orphaned `aiAgentsItems` / `automationsItems` nav arrays so the
  dead-link regression can't recur.

## [0.8.52] - 2026-07-15

### Fix: more LLM paths ignored LLM_PROVIDER (audit follow-up to 0.8.51)

Auditing for the same anti-pattern behind the Ask chat bug turned up two more
LLM call sites that ignored the configured provider, plus one UI gap:

- **Writing-style email generation** (`writing_style_service.generate_email`)
  built a hardcoded `AsyncAnthropic` client, so the agent "generate email"
  action failed on any non-Anthropic deployment. It now goes through the LLM
  gateway (honours `LLM_PROVIDER`, works on DeepSeek/Gemini/etc., and gets
  rate-limiting + billing tracking for free).
- **LangGraph agents** (`agents/base.py`) only handled `gemini` and `lmstudio`;
  every other provider fell through to `else -> ChatAnthropic`, so an agent
  configured for `openai`, `ollama`, `deepseek`, or `openrouter` silently ran
  on Claude. Provider resolution is now an explicit, unit-tested map — DeepSeek/
  OpenRouter/OpenAI/Ollama route through the OpenAI-compatible client with the
  correct base URL, and an unknown provider raises instead of masquerading as
  Claude.
- **Agent defaults endpoint** (`GET /agents/defaults`) now includes `deepseek`
  and `openrouter` in `provider_models` so they're selectable in the UI.
- Added `tests/unit/test_agent_provider_selection.py` (8) and
  `tests/unit/test_writing_style_generate_email.py` (2).

## [0.8.51] - 2026-07-15

### Fix: Ask AI chat ignored LLM_PROVIDER and hit a suspended Gemini key

The Ask feature (the floating chat widget's "AI" tab and the full `/chat` AI
panel) failed to return any response in production: it silently routed to
Gemini and got `403 CONSUMER_SUSPENDED`, so nothing streamed back.

Root cause: `AskService` ignored `settings.llm.llm_provider` and instead picked
a provider by "first API key present" in the order Anthropic → OpenAI → Gemini,
with no DeepSeek branch at all. Every other part of the platform honours
`LLM_PROVIDER` via the LLM gateway — the Ask feature was the one place that
didn't. A deployment configured for `deepseek` therefore still called Gemini.

- `AskService` now resolves the provider from `LLM_PROVIDER` (the same source of
  truth the gateway uses). DeepSeek, OpenRouter, and LM Studio reuse the
  OpenAI-compatible streaming path with the correct base URL; Claude/OpenAI/
  Gemini keep their existing paths.
- If the configured provider has no usable credentials, it falls back to the
  previous auto-detect so deployments that never set `LLM_PROVIDER` are
  unaffected.
- Added `tests/unit/test_ask_provider_selection.py` (11 tests) pinning the
  resolver, including the exact prod scenario (DeepSeek chosen even when a
  Gemini key is also present).

Note: honouring `deepseek` requires `DEEPSEEK_API_KEY` to be set in the target
environment; without it the resolver falls back to auto-detect.

## [0.8.50] - 2026-07-15

### CRM automation hardening: CRM-only scope, real send path, workspace isolation

Automations, email, and the CRM activity feed were audited and hardened, and
the automation surface was officially scoped to CRM only. The recurring finding
was "visible ≫ wired" — the builder palette exposed triggers and actions that
nothing dispatched or handled. All changes are covered by 95 new tests (unit +
integration) plus live E2E specs.

- **CRM-only scope (single source of truth).** The trigger/action registry now
  filters to `ENABLED_MODULES = ("crm",)` and hides unwired capabilities
  (`schedule.*`, `date.*`, `webhook.received`, `email.*` triggers;
  `api_request`/`enrich_record`/`classify_record`/`generate_summary` actions).
  The palette, generate-workflow endpoint, and generated fixture all consume
  the filtered registry, so descoped modules disappear everywhere at once.
  Non-CRM modules are inventoried in `prds/automations-noncrm-deferred.md`.
- **Workflow validation.** The visual builder now rejects actions missing
  required fields (e.g. an email node with no recipient), malformed literal
  email addresses, non-numeric wait durations and numeric-operator condition
  values, and malformed/unknown-namespace `{{variable}}` references — instead of
  saving a workflow that fails at execution time.
- **Real email send path.** `send_workflow_email` now validates the address,
  honours the unsubscribe/bounce/complaint suppression list (previously only the
  campaign path did), registers each recipient as a tracked subscriber (consent
  basis), and carries a one-click `List-Unsubscribe` header (RFC 2369/8058) —
  on both the multi-domain path and the default-service fallback (SES via
  `send_raw_email`, SMTP, and Postmark).
- **Campaign send-gating.** Campaigns refuse to send until the workspace has a
  verified sending domain (`start_sending` raises); the UI mirrors this by
  disabling "Send Now" with an explanatory hint.
- **Template validation** flags typo'd/undeclared merge tags via a strict Jinja
  environment (rendering stays lenient so a missing optional var never breaks a
  real send).
- **CRM activity feed fixes.** Fixed a 500 (`a.metadata` → `a.activity_metadata`,
  a reserved SQLAlchemy attribute), a silently-dropped activity metadata payload,
  and a missing actor name; automation runs now surface in the feed
  (`automation.triggered`), and the feed's category tabs map correctly to the
  dotted activity types actually stored.
- **Workspace isolation (P0 security).** Added 36 standing regression tests
  across CRM records/objects/notes/activities and the automations, campaigns,
  pipelines, lists, and attributes modules, covering both non-member→403 and
  cross-tenant IDOR→404 (reads and mutations). No isolation vulnerabilities were
  found — the tests lock the invariant in place.

## [0.8.49] - 2026-07-10

### Fix: ticket→task description, source backlink, and notification polling

- **Description carries over.** Creating a task from a ticket now populates
  the task's `description_json` (TipTap doc), not just the plain-text
  `description`. The task detail editor renders `description_json`, so the
  carried-over ticket body (with a clean `From:` / `Ticket: TKT-N` header) is
  now visible instead of an empty body.
- **Source-ticket backlink.** The task detail header shows a "Source ticket"
  link when the task was created from a ticket (`source_type === "ticket"`),
  opening `/tickets/{id}`. The frontend `TaskSourceType` union was aligned with
  the backend (added `ticket`/`automation`).
- **Notification polling hardened.** The poll cursor now seeds to "now" (a user
  with zero notifications previously never polled) and always advances past the
  fetched window, fixing repeated re-fetching/duplication of the same
  notifications every 30s. (Note: the `ERR_CONNECTION_CLOSED` seen against the
  hosted API is a server-availability issue, not a client bug.)

## [0.8.48] - 2026-07-09

### Fix: tasks created from a ticket were orphaned

The "Create task from ticket" flow accepted a required `project_id` but never
assigned it to the task, leaving `team_id` NULL. Such a task belonged to no
project — it showed on no board, sat in no sprint, and couldn't be opened via
`/sprints?task=<id>` deep links.

- `create_task_from_ticket` now sets `team_id` from the request's
  `project_id`, so ticket-created tasks land in the right project and are
  visible/openable.
- Added a best-effort backfill migration
  (`migrate_2026_07_09_backfill_ticket_task_team.sql`) that recovers already-
  orphaned tasks from their linked ticket's `team_id` (where the ticket was
  assigned a team).

### Ticket form templates: fix duplicate email, normalize, and expand the catalog

The public ticket form already collects the submitter's name and email in a
built-in contact section, but every pre-built template *also* defined its own
email field — so users saw two email inputs. The templates had drifted from
each other in other ways too, and the picker couldn't show anything beyond the
original three.

- **No more duplicate email.** The redundant `email` field is removed from all
  templates; submitter contact is handled solely by the form's built-in
  section (`require_email`, default on). A new invariant test
  (`test_ticket_templates.py`) prevents a contact field from creeping back in.
- **Consistent template structure.** All templates now share reusable field
  builders: title-first ordering, a single `attachments` file convention
  (always last, 10 MB), and uniform `external_mappings`.
- **Bigger catalog.** Expanded from 3 to 10 templates — added General Inquiry,
  Incident Report, Feedback/NPS, Sales/Demo Request, Change Request, Complaint,
  and Security Report. Each carries `icon`/`color`/`category` metadata.
- **Data-driven picker.** The ticket-forms settings picker now renders whatever
  templates the API returns (icon-name → lucide with a fallback), so new
  templates appear automatically instead of being hardcoded.
- **Field-type alignment.** Added `datetime` and `number` to the backend
  `TicketFieldType` enum/schema to match the types the field editor already
  offered (previously a 422 on save). Extended `TicketFormTemplateType` in the
  model enum and schema Literal for the new template keys.

Existing forms created from a template are left as-is; the fixes apply to newly
created forms.

## [0.8.47] - 2026-07-09

### Fix: task deep links open the task regardless of its state

The `/sprints?task=<id>` links emitted by activity feeds and chat
widgets only carry a task id (no project), so they landed on the
Planning overview and did nothing. They now open the task.

- **Project-less deep links resolve.** `/sprints?task=<id>` looks up
  which project the task belongs to (via the workspace-wide task list,
  including archived) and forwards to that project's board, showing an
  "Opening task…" state while it resolves and a "Task not found" notice
  if the id can't be resolved (deleted or no access).
- **Open regardless of state.** The board's `?task=` handler no longer
  requires the task to be in the loaded board set: if it isn't there
  (archived, hidden by an active filter, or otherwise outside the set),
  the board fetches it directly by id and opens it. A guard ensures a
  genuinely-missing task is attempted only once.

## [0.8.46] - 2026-07-09

### Publicly shareable ticket links with gated attachments

Tickets can now be shared with people outside the workspace through a
tokenised link that opens the ticket directly — no login required to
read, with an optional path to reply for members who are signed in.

- **Share links.** A new `TicketShareLink` model backs a per-ticket
  link (`/public/tickets/{token}`) that can be enabled, copied,
  regenerated, and revoked from a Share dialog on the ticket page.
  Links support an optional password (bcrypt-hashed), an expiry, and a
  max-use count; a public router (mounted without the `tickets` app
  gate) serves the read-only view and enforces all four rules.
- **Filtered public view.** Anonymous visitors see the ticket fields,
  status, submitter name, and public replies only — internal notes,
  assignee/team, and submitter PII beyond the name are stripped. A
  visitor who is already authenticated as a member of the ticket's
  workspace additionally gets a reply box (`can_reply`).
- **Configurable default.** Ticket forms gained a
  `default_share_enabled` toggle ("Create a public share link for new
  tickets"); when set, `create_ticket` mints a share link
  automatically.
- **Attachments, privately stored and token-gated.** Attachments are
  uploaded to private storage keys (never public URLs) and served
  through a proxy that re-validates the share token on every fetch, so
  revoking/expiring/password-protecting a link also cuts off its
  files. Internal-note attachments are never exposed publicly, and
  downloads don't consume the link's use-count.
- **Memory-safe large files.** Uploads stream to S3 via
  `upload_fileobj` (automatic multipart) and downloads stream back in
  256 KB chunks with HTTP Range / 206 support, so large files no longer
  buffer wholly in memory. A configurable cap
  (`TICKET_MAX_ATTACHMENT_MB`, default 100) returns 413 when exceeded,
  mirrored by a client-side guard.
- **Plumbing.** New migration
  (`migrate_2026_07_09_ticket_share_links.sql`) creates the table and
  adds the form column; storage service gains
  `upload_fileobj`/`get_object_stream`; 18 unit tests cover token
  validation, expiry/password/exhaustion, internal-note filtering,
  streaming + Range, and the gated proxy.

## [0.8.45] - 2026-07-08

### Reports: working exports, scheduled delivery, and a live report UI

Custom reporting moves from a read-only shell to a working feature. The
missing background layer meant export jobs were created but never
processed (stuck "pending" forever) and scheduled reports were saved but
never sent; both are now wired end to end, and the reports UI can build,
view, schedule, and edit reports.

- **Exports actually complete.** A new `process_export_job` Temporal
  activity is dispatched when an export is created, moving jobs from
  pending → processing → completed and writing the file. All formats
  work — CSV, JSON, XLSX, and PDF (adds the `reportlab` dependency, so
  PDF export is now available).
- **Scheduled reports are delivered.** A `deliver_scheduled_reports`
  schedule polls due schedules every 15 minutes, renders each report to
  its configured format, delivers via email and/or Slack, and computes
  the next run. A daily `cleanup_expired_exports` job removes expired
  export files and records.
- **Live report UI.** The report view fetches and renders widget data
  (charts via Recharts, graceful per-widget notes) instead of showing
  static metadata; the previously inert Schedule button opens a working
  scheduling modal; and a new `/reports/[id]` editor edits report
  metadata and widgets. Report actions now surface success/error toasts
  and loading states.
- **Fuller widget data.** Code-quality, team-health, attrition-risk, and
  skill widgets return real data (or cached predictive insights) instead
  of stub placeholders.
- **Plumbing.** Reporting tables gained a migration
  (`migrate_analytics_reports.sql`); Reports is registered in the app
  catalog (accessible to all authenticated users); the widget position
  type was aligned to the backend (`{x, y, width, height}`); and the
  schedule-create client now sends `report_id` in the body to match the
  API contract.

## [0.8.44] - 2026-07-08

### CRM leads, pipelines, and stage management

The CRM gains first-class sales pipelines, a dedicated Lead object with
conversion, and pipeline analytics — the pieces needed to run a real
sales workflow instead of hand-managing a status field.

- **First-class pipelines and stages.** New `CRMPipeline` /
  `CRMPipelineStage` tables let a workspace define multiple named
  pipelines per object, each with ordered stages carrying a color, win
  probability, and open/won/lost type. Stages remain the source of
  truth but are *projected* into the object's managed `status`
  attribute, so the existing Kanban board renders them unchanged — the
  board's "Add stage" button is now real (it previously showed a "coming
  soon" alert). Stages can be added, renamed, recolored, reordered, and
  deleted (with record reassignment) from a new stage manager, and every
  object now offers a board view so a pipeline can be created on the
  spot. Existing workspaces are backfilled: the seeded Deal "Stage"
  attribute is adopted into a default "Sales Pipeline" with no record
  data rewritten.
- **Dedicated Lead object + conversion.** New workspaces seed a Lead
  object (lead status, source, estimated value, owner) with its own
  default pipeline, plus a one-click **Convert** action that creates the
  linked Company, Contact, and Deal, back-links them onto the lead, and
  marks it converted. Leads are routed to a rep automatically on
  creation and when they reach *qualified*, wiring the existing lead
  routing/SLA engine into the CRM record lifecycle.
- **Stage history, automation, and analytics.** Moving a record between
  stages now records queryable stage history, emits the `stage.changed`
  automation trigger and webhook, and feeds a new **Pipeline Analytics**
  page: weighted forecast, open/won value, value-by-stage, conversion
  funnel, and average time-in-stage.

## [0.8.43] - 2026-07-07

### Public forms render again, and the task @-mention field no longer freezes

Three related fixes to public forms and the task description editor:

- **Public forms returned 404 even when active.** Both the legacy
  ticket-forms module and the newer Forms module publish under the
  same `/public/forms/{token}` URL, and their two API routers each
  registered `GET /public/forms/{token}`. The ticket-forms router is
  mounted first, so it handled *every* request — any form built in the
  Forms module missed the `ticket_forms` table and 404'd, regardless of
  its Active/visibility toggle. The public endpoints (get, submit,
  verify-email) now resolve a token against ticket-forms first and fall
  back to the Forms module, so both systems are reachable through the
  shared public page.
- **The task description `@`-mention selector got stuck.** Typing `@`
  opened the mention dropdown but then swallowed every subsequent
  keystroke, leaving the field unusable. The Tiptap key handler was
  reading stale state (the editor captures its options once) and
  `return true`-ing on each character, which blocked the editor from
  inserting text; the dropdown was also clipped by the container's
  `overflow-hidden`. The handler now reads live values via refs, never
  blocks typing, and the dropdown is no longer clipped.
- **Forms-module field types rendered as plain text.** On the shared
  public page, `phone`, `url`, and `datetime` now use the correct input
  types, `radio` renders a proper option group, and `hidden` fields are
  no longer shown as text boxes — their `default_value` is seeded and
  submitted instead. Field default values are now applied on load in
  general.

## [0.8.42] - 2026-07-05

### Marketing site is now crawlable and shareable (SEO)

The homepage shipped almost no server-rendered content — it gated its
entire body behind a client-side `isChecking` spinner, so a crawler
(or any no-JS fetch) saw only the page title and zero links. The
content now renders unconditionally in the server response (real
headings, the FAQ, and the full internal link graph including the
GitHub repo); logged-in visitors are redirected to the app at the
edge (middleware, `aexy_authed` cookie) instead of behind a render
gate.

Alongside that:

- **robots.txt and sitemap.xml** now exist (`app/robots.ts`,
  `app/sitemap.ts`) — robots allows the public marketing routes and
  disallows the authenticated app; the sitemap lists the real public
  URLs.
- **Open Graph & Twitter Card** tags, a **canonical** link, and
  **`WebApplication` JSON-LD** (with `offers`/`featureList`) were
  added to the root metadata, so shared links render a card and
  Google can build a rich result. The title now includes the ICP
  keywords (engineering, CRM, HR, GTM) within the display limit and
  the meta description fits in ~130 characters.
- **favicon** (`favicon.ico` + `icon.svg`) and a dynamic **Open
  Graph image** were added — all previously 404'd.
- **HSTS** (`Strict-Transport-Security`) is now emitted by the app,
  and responses are **gzip-compressed** (`compress`). Hashed
  `/_next/static/*` chunks are served `immutable` so repeat visitors
  stop re-downloading the JS bundles.

The nginx template also gained a `www → apex` redirect, immutable
static-asset caching, and a broader gzip type list. Note: `www`
still needs a DNS record to resolve, and the marketing HTML itself
remains dynamically rendered (a consequence of per-request i18n) —
tracked for a future locale-routing change.

## [0.8.41] - 2026-07-05

### Workspace module toggles are now enforced on the API

Disabling a module for a workspace (App Access settings) only hid it
from the sidebar — the underlying API kept serving it, so a member
could still read and write a "disabled" module by calling it
directly. The toggle is now enforced server-side via a shared
`require_app_access` dependency (plus `ensure_app_enabled` for
endpoints that resolve their workspace from the request body or a
referenced entity).

Enforcement covers every router of a gated app, not just its primary
one: disabling **Sprints** now also blocks epics, stories, bugs,
releases, sprint analytics, planning poker and retrospectives;
**Docs** covers documents, templates, collaboration and document
spaces; **Tickets** covers ticket forms and escalation. Tracking is
enforced where the workspace is resolved server-side (standups,
blockers, time, dashboards) rather than via a query param that most
of its routes never receive. An unknown app id now fails at startup
instead of silently disabling enforcement, and the workspace's
`app_settings` are read through a short-lived in-process cache with
cross-process invalidation (Redis pub/sub) so a toggle takes effect
immediately across workers.

The frontend guard was aligned to the same rule: it now blocks a
route only on the workspace-level toggle (not on a member's role
bundle), so members are no longer redirected off modules the API
would happily serve.

### "My Work" page

New `/my-work` page listing everything assigned to the current user
across sprint tasks, bugs and stories in one view, with a "show
completed" toggle. Terminal bug statuses (`verified`, `closed`,
`wont_fix`, `duplicate`, `cannot_reproduce`) are excluded from the
default view via a shared constant, and finished bugs no longer show
as open work. Each query is capped so a long-tenured user can't pull
their entire history in one response.

### Integration connect no longer blocks or mis-maps

Connecting Jira or Linear ran a full issue sync inline in the connect
request, so a large project could time the request out (and a retry
then hit "integration already exists"), and a mid-sync failure left
the request's DB session poisoned. The initial sync now runs in the
background on its own session, so connect returns immediately. The
"map the primary team to the first remote project when nothing
matches by name" fallback was removed — unmatched teams get no
mapping rather than silently importing an unrelated project's issues.

### Bug fixes

- **`PATCH /developers/me` returned 500.** Updating your own profile
  expired the eagerly-loaded connection relationships and then
  lazy-loaded them during serialization; the update now re-fetches
  with the relationships loaded.
- **Analytics endpoints returned 500 on every call.** The skill
  heatmap, productivity trends and collaboration network endpoints
  read request fields that didn't exist on their schemas; the
  productivity/collaboration queries also mis-built their
  `date_trunc`/`cast` expressions. All now work.
- **Slack webhooks 500'd on bad input.** `/slack/events` with
  malformed JSON now returns 400, and `/slack/commands` with a
  missing signature timestamp returns 401, instead of crashing.
- **`GET /developers/{id}` with a malformed id** now returns 404
  instead of 500.
- **Developer efficiency metrics** could raise when mixing
  timezone-aware and naive timestamps; datetimes are normalized to
  UTC before comparison.
- **Task GitHub links** were fetched and rendered twice in the task
  modal under two query keys, so linking/unlinking left one list
  stale; the section is now a single source of truth.
- **Blocker analytics** counted recently-resolved blockers as active
  after the active-blockers endpoint began returning both; the
  analytics page and dashboard count only unresolved blockers again.
- **Epic linked-task rows** linked to a broken URL; they now point at
  the correct project/sprint board.

### Testing

The backend test suite can now run against real Postgres (set
`TEST_DATABASE_URL`), catching pgvector/JSONB/UUID/`date_trunc` and
foreign-key behavior SQLite silently ignores; the full unit and
integration suites pass on both SQLite and Postgres.
## [0.8.40] - 2026-06-17

### Added

#### Aexy Tracker — macOS work tracker + AI auto-attribution
A local-first macOS menu-bar app that captures lightweight semantic signals (frontmost app, window title, file/git context, dev/browser context, idle state) and uploads them as append-only, idempotent event batches. A downstream Temporal/LLM pipeline enriches, attributes, and narrates the activity so time tracking happens with no manual entry.

- **macOS client** (`aexy-mac/`, Swift): durable local buffer, batched idempotent upload, OAuth device-code onboarding, Keychain-persisted config, and best-effort nil-safe collectors. Events are removed from the buffer only after the server confirms them.
- **Ingest API** (`/tracker/*`): device enrollment, partial-success batch ingest (idempotent on `event_id`), heartbeat/config pull, sync high-water mark, and evidence presign. Sliding-window rate limiting (fail-open) and a 30d-past/5m-future timestamp guard. `category`/`attribution` are server-derived only — never accepted from the client.
- **Enrich/attribute loop** (Temporal + LLM): collapses consecutive samples into spans, categorizes them (productive/neutral/personal), and attributes each to a candidate task — rolled up into inferred `TimeEntry` rows that show in the existing tracking module. Fire-and-forget per-batch dispatch (time-bucketed `workflow_id` coalescing) plus a 5-min safety-net sweep.
- **Daily journal + proactive insights**: an LLM narrative per developer per day (idempotent `WorkLog` upsert), and deterministic insight signals (context switching, meeting load, after-hours, focus fragmentation) surfaced as deduped in-app notifications.
- **Q&A + auto-attributed timesheet** (`/tracker/qa`, `/tracker/timesheet`): individual-scoped natural-language Q&A over one's own journals + inferred time, and a day-grouped timesheet view with confidence badges. New `/tracking/tracker` UI page + `useTrackerTimesheet` hook.
- **Confirm / correct attribution**: the timesheet is now a review queue — confirm the AI's task guess, reassign it (`TaskSelect` fed by `GET /tracker/candidate-tasks`), or dismiss it, via `PATCH /tracker/timesheet/entries/{id}` and a new `attribution_status` column. Dismissed entries drop out of totals. Page fully localized (`tracking.tracker` namespace, en/hi); Q&A now follows the selected date range and the date picker no longer shifts a day in non-UTC zones.
- **Browser sign-in (macOS app)**: **Sign in → GitHub / Google / Microsoft** opens the system browser to the new `GET /auth/device/login?provider=&port=`, captures the developer JWT on a `127.0.0.1` loopback listener (RFC 8252), exchanges it for a long-lived `aexy_…` API token (`POST /developers/me/api-tokens`), and enrolls — no env vars or manual code entry. Replaces the dead device-code default that 404'd.
- **Docs**: `docs/aexy-tracker.md` (feature + macOS client + sign-in) and `docs/api/tracker-ingest.md` (ingest + device-login contract), linked into the handbook nav; code references repointed to them.
- **Desktop companion (Aexy for macOS)**: the macOS app (renamed to **Aexy**, in `aexy-mac/`) is now a hybrid companion — web sign-in, native Today/Board(Kanban)/Table/Docs/Time/Standups, native notifications, and embedded web for everything else. The web app gains a **chromeless `?embed=true` mode** — `AppShell` hides its sidebar, and the **docs layout + `DocumentEditor`** hide the docs sidebar/title-header so the embedded editor is editor-only — letting the desktop app's native sidebar be the sole navigation with full web parity.

### Fixed

- **Security (OAuth redirect):** the post-login redirect now delivers the developer JWT only to an allowlisted target — the configured frontend, local dev, ops-configured `OAUTH_EXTRA_REDIRECT_HOSTS`, or a `127.0.0.1`/`localhost` loopback (native apps). All provider login/connect entry points reject a disallowed `redirect_url` with `400`, and every callback funnels through one guarded chokepoint, closing a token-exfiltration vector where an attacker-supplied `redirect_url` could capture a victim's token.
- Tracker enrich now locks pending event rows (`FOR UPDATE SKIP LOCKED`) and is backstopped by a partial unique index on inferred `time_entries` dedupe keys, so the per-batch dispatch and the periodic sweep can't double-attribute the same events into duplicate time entries.
- Tracker enrich tolerates non-numeric LLM `confidence` values instead of crashing (and Temporal-retrying) the whole activity.
- Tracker timesheet no longer leaks daily journals dated after the requested `end` date (added the missing upper `logged_at` bound).
- Tracker ingest counts within-batch duplicates so `accepted + duplicates + rejected` reconciles to events sent; insight runs no longer overcount notifications suppressed by recipient preferences.
- macOS client: onboarding completes when the server mints no enroll token (falls back to the device-code token), the local buffer is capped to bound offline growth, and the sample interval is clamped to the server's accepted `1…600s` range.

## [0.8.39] - 2026-05-28

### Pick destination status when moving a task across projects

Cross-project move (0.8.34) silently re-resolved the new task's
status to the destination's first "open" status. For sibling boards
that's fine; for cross-board moves (Product → Tech) the user
usually has a specific column in mind and the default was wrong.

`MoveToProjectModal` now fetches the destination project's status
set via the existing `useTaskStatuses` hook once a target is
picked, and renders a "Status on destination board" dropdown. The
default selection follows: same slug on the target → same name
(case-insensitive) → first active status by position. The picked
slug rides through as `target_status_slug` on both the single and
bulk move requests; the backend (`SprintTaskService.move_to_project`)
validates it against `TaskConfigService.get_statuses_for_project`
before any write, raising `invalid_target_status` (400) on
mismatch. Bulk move applies one status to every cloned task.

`_clone_task_to_project` now accepts an `override_status_slug` and
short-circuits the open-status resolver when supplied. Subtasks
under `cascade` still resolve their own open status — the picker is
parent-only, which matches the existing "subtasks inherit the
destination's defaults" semantics.

### Archive view on the project board and workspace All-Tasks tab

`SprintTask.is_archived` and the unarchive endpoint have existed
since the early sprint module, but no UI ever surfaced archived
rows. Once a task was archived (manually or as part of a cross-
project move), it disappeared.

Both `/sprints/[projectId]/board` and the workspace All-Tasks tab
get an `Active | Archived` segmented toggle (URL-synced via
`?view=archived` so reloads and link-shares round-trip). In
archived view:

- The kanban is replaced by `TaskTableView` — archived rows don't
  belong in status columns, and the table is the right surface for
  a flat list. The Board/Table layout toggle, Sprints/Status
  view-mode toggle, Add Task, Columns shortcut, Import button, and
  priority/labels/epics filters are all hidden (search, assignee,
  project, sprint stay). On the board page this is driven by a new
  `minimal` flag on the existing `FilterBar` component.
- Each row has an Unarchive icon-button; the bulk-action toolbar on
  the workspace tab gains an "Restore selected" entry that fires
  parallel unarchives.
- The workspace endpoint already accepted `include_archived`; both
  endpoints now also accept `archived_only`. `list_project_tasks`
  was hard-coded to `is_archived = false` — that's been generalized
  to the same flag pair. `archived_only` is strict regardless of
  `include_archived`.

New `useUnarchiveTask` hook wraps `projectTasksApi.unarchive` and
reuses `invalidateTaskCaches` so the active view re-fetches
correctly when a row is restored.

### Workload analytics no longer 500s

`POST /analytics/workload` was crashing with
`AttributeError: 'WorkloadRequest' object has no attribute 'days'`
because the handler read `request.days` but the schema didn't
declare the field. The frontend has been sending `days: 30` since
that endpoint shipped. Added `days: int = 30` to the schema.

## [0.8.38] - 2026-05-23

### Visible move-link on cross-project moves

Cross-project moves (shipped in 0.8.34) already created a
`task_dependencies` row linking the new task back to the source —
but nothing in the UI rendered that linkage. Anyone opening either
side of the move saw a context-free task.

`SprintTaskService.move_to_project` now prepends a one-line
"Moved from <KEY> — <title>" breadcrumb to the new task's
description and a matching "Moved to" line on the source. The
breadcrumb is written into both `description` (plain text) and
`description_json` (a ProseMirror paragraph with a `link` mark
pointing at `/sprints/<team>/board?task=<id>`) so every surface
that renders descriptions shows it without any extra UI plumbing.
Cascade subtasks each get their own pair of breadcrumbs pointing
at the corresponding clone — the parent's pointer alone wouldn't
reach the children.

The existing `task_dependencies` row is still recorded as the
structured source of truth for any future banner work.

### Docs sidebar: Recent apps + section-grouped app list

The flat "Apps" section in the docs sidebar (0.8.35) is replaced
with a sidebar that mirrors the main app sidebar's grouping —
Engineering / People / Business / AI / Compliance — plus a
"Recent" strip at the top tracking the user's last-visited apps.

Implementation:

- `recentAppsStore` (Zustand + localStorage, cap 8) records each
  app visit. Mounted once in `app/(app)/layout.tsx` via
  `useRecentApps()` so visits from any surface count.
- `NotionSidebar` reads the main sidebar's `GROUPED_LAYOUT`,
  applies the same persona filter (`useSidebarPersona`) and
  app-access filter (`useAppAccess`) the main sidebar uses, and
  renders each section collapsed by default to keep the docs
  surface focused.
- The Knowledge section is hidden in the docs sidebar (the docs
  sidebar IS the knowledge view; re-listing it would be
  tautological). Docs and Drive are filtered out of the Recent
  strip for the same reason.
- New `SidebarAppGroup` component renders apps with sub-items
  (Tracking → Standups/Blockers/Time, etc.) as expandable rows
  inside the section, matching the main sidebar's depth.

## [0.8.37] - 2026-05-23

### Doc editor no longer unmounts on every save

Reported: "after typing the doc refreshes and the cursor becomes
deselected".

Root cause was on the page, not the editor. `/docs/[documentId]/page.tsx`
was passing `isLoading={isUpdating}` to `DocumentEditor`, where
`isUpdating` is the mutation-pending flag from `useDocument`'s
`updateContent` mutation. `DocumentEditor` returns its loading skeleton
when `isLoading` is true — so every debounced autosave kicked off by
typing flipped `isUpdating` to true, the editor was replaced by the
skeleton, then `isUpdating` flipped back to false and the editor was
remounted — fresh TipTap instance, fresh selection, cursor lost.

Removed the prop. The page-level initial-load guard (above the
component) still shows a skeleton on first fetch; once the document
is loaded the editor stays mounted, and the in-editor "Saving… / Saved"
indicator reflects save state without tearing anything down.

## [0.8.36] - 2026-05-23

### Remove BubbleMenu from DocumentEditor (selection crash, take 2)

0.8.35 gated BubbleMenu on `editorMode === "rich"` thinking the
crash was a mode-switch race. The user kept hitting the same
`removeChild` error while selecting text in rich mode — the gate
fixed the switch path but not the steady-state path. Re-diagnosis:

- `@tiptap/react`'s `BubbleMenu` wraps Tippy.js.
- Tippy appends its tooltip node into `document.body`, outside the
  React tree.
- Every `selectionchange` causes BubbleMenu to remount its Tippy
  instance, moving DOM nodes between body and the editor.
- React's reconciler then tries to remove a node from a parent that
  no longer owns it → `NotFoundError: Failed to execute 'removeChild'
  on 'Node'` in the commit phase.

This is a known incompatibility between `@tiptap/react`'s BubbleMenu
and React 18+ concurrent reconciliation
(ueberdosis/tiptap#3580, #2658).

Removed the BubbleMenu entirely. The top `EditorToolbar` already
exposes Bold / Italic / Underline / Code, so the affordance isn't
lost — only the floating bubble. If we want the bubble UX back, the
replacement should use `@floating-ui/react` (in-tree positioning)
rather than Tippy.

## [0.8.35] - 2026-05-23

Two docs surface fixes.

### Apps escape-hatch in the docs sidebar

The main app sidebar is hidden on `/docs/*` routes, so the docs sidebar
(`NotionSidebar`) was the only navigation chrome — but it had no path
to other modules. Users had to back out via browser nav or memorize
URLs to jump to Sprints, CRM, etc.

Added a collapsed-by-default "Apps" section at the bottom of the docs
sidebar (above the divider before "Add space"). It reuses
`useAppAccess(workspaceId, developerId)` to list only the apps the
current user can access, with each row linking to that app's
`baseRoute` from `APP_CATALOG`. Same access logic as the main sidebar
— no new permissions surface.

### Selection bug — `removeChild` race on editor mode switch

Reported: selecting text in `/docs/[id]` would intermittently throw
`NotFoundError: Failed to execute 'removeChild' on 'Node': The node to
be removed is not a child of this node` in the React commit phase.

Root cause: `DocumentEditor`'s BubbleMenu was rendered when
`editor && !readOnly`, regardless of `editorMode`. In markdown mode
the `EditorContent` is replaced by a `<textarea>`, but the BubbleMenu
(and its Tippy.js portal) stayed mounted. Any subsequent `selectionchange`
would race React reconciliation — Tippy holds DOM references that React
no longer owns, the next reposition tries to `removeChild` a detached
node, and the commit phase throws.

Fix: gate BubbleMenu on `editorMode === "rich"` so it tears down
cleanly when the user switches modes. One-line conditional change in
`frontend/src/components/docs/DocumentEditor.tsx`.

## [0.8.34] - 2026-05-22

New: cross-project task move (fork + link). A task can now be moved to
another project in the same workspace; a fresh task is created in the
destination, linked back to the source as a "duplicates" dependency,
and the source is either archived or marked done at the operator's
choice.

### Why fork instead of true move

Moving the row in place would orphan the source's history, sprint
membership, comments, and attachments — and `task_key` is workspace-
scoped but tasks reference sprint/epic/story IDs that don't translate
across projects. A new task in the destination plus a `task_dependencies`
link preserves provenance while letting the destination start fresh.

### Backend

- `SprintTaskService.move_to_project(task_id, target_project_id,
  source_action, subtask_strategy, actor_id)` and a `bulk_move_to_project`
  variant that returns per-task results (one failure doesn't abort the
  batch). See plan `mutable-herding-flute.md` for the full contract.
- New endpoints in `api/project_tasks.py`:
  - `POST /teams/{team_id}/tasks/{task_id}/move-to-project`
  - `POST /teams/{team_id}/tasks/bulk-move-to-project`
- Stable error codes mapped to HTTP 400: `cross_workspace_move`,
  `same_project_move`, `target_project_not_found`,
  `task_already_archived`, `task_has_subtasks`,
  `source_task_not_found`, `invalid_source_action`,
  `invalid_subtask_strategy`.
- Subtask handling — caller picks per move:
  - `block` (default, safest) — reject the move if subtasks exist.
  - `cascade` — clone every active subtask into the destination under
    the new parent; archive each original subtask.
  - `orphan` — leave subtasks in place; their `parent_task_id` still
    points at the archived/done source.
- Source-action — caller picks per move:
  - `archive` — `is_archived=True` on the source.
  - `mark_done` — set the source's status to its project's first
    `semantics="done"` slug (workspace fallback, then canonical "done")
    and set `completed_at = now()` if null.
- Assignee on the new task is preserved only if the developer is a
  member of the target project; otherwise cleared. Sprint, started_at,
  completed_at, cycle/lead time, epic, story, and parent_task_id are
  intentionally not copied — see the plan for the rationale.
- Activity log on both ends: `moved_to_project` on the source (carries
  new task's id/key and the chosen strategies in `activity_metadata`)
  and `created_from_move` on the new task (carries source's id/key).
- No schema migration — existing `task_dependencies` with
  `dependency_type="duplicates"` is the link mechanism.

### Frontend

- New shared `MoveToProjectModal` (`components/planning/MoveToProjectModal.tsx`)
  used by both single-task and bulk entry points. Project picker excludes
  the source project and any archived project. Subtask-strategy radio
  shows only on single-task moves when the task has subtasks.
- New `useTaskMove` hook (`hooks/useTaskMove.ts`) wrapping both the
  single and bulk mutations, with `invalidateTaskCaches` integration and
  friendly toast messages mapped from each stable error code.
- `EditTaskModal` sidebar (project board) gains a "Move to project…"
  button above "Archive Task".
- The board's multi-select bulk toolbar gains a "Move to Project"
  button next to the existing "Move to Sprint" dropdown.

### Tests

- 12 unit tests in `backend/tests/unit/test_task_move_to_project.py`:
  happy path, mark-done variant, cross-workspace reject, same-project
  reject, archived-source reject, subtask block / cascade / orphan,
  assignee membership rule, sprint+timing fields not copied,
  activity logged on both tasks, bulk-move continues on per-task
  failure.

## [0.8.33] - 2026-05-22

Follow-up sweep on the 0.8.32 status work — two production bugs and the
missing admin surface for editing categories themselves.

### Custom status slugs now round-trip through the API (bug fix)

`PATCH /teams/{id}/tasks/{id}` was rejecting any non-canonical slug
with a Pydantic `literal_error`:

```
Input should be 'backlog', 'todo', 'in_progress', 'review' or 'done'
```

Root cause: `TaskStatus` was still a `Literal[...]` at the schema
layer, defeating the whole point of project-scoped custom statuses
from 0.8.32. Two-part fix:

- `TaskStatus = str` in both `backend/src/aexy/schemas/sprint.py` and
  `frontend/src/lib/api.ts`. Any slug parses; validity is decided at
  write time, not parse time.
- New `SprintTaskService.validate_status_slug(task, slug)` checks the
  slug exists in the task's scope (`workspace_task_statuses` rows for
  the project OR workspace defaults). On miss → `400 unknown_status`.
  Wired into both `update_task` and `update_task_status`, on both
  PATCH endpoints (`/teams/.../tasks/...` and
  `/sprints/.../tasks/...`).

The canonical five seed slugs (`backlog`, `todo`, `in_progress`,
`review`, `done`) are accepted unconditionally so workspaces that
pre-date the status table aren't bricked by tasks carrying slugs
without matching rows.

### Duplicate "On Hold" columns can no longer be created (bug fix)

Production was showing two columns titled `On Hold` on a kanban — the
admin had typed the name twice and `create_status` had silently
deduplicated only the *slug* (storing `on_hold` and `on_hold_1`).
Both rendered because the column title comes from `name`, not `slug`.

`create_status` and `update_status` now share an `_assert_name_unique`
helper that rejects case-insensitive name collisions within a scope
(workspace + project): error code `status_name_exists`, HTTP 400.

This prevents the future occurrence but does **not** clean up existing
duplicate rows in production data — admins need to delete one of the
duplicates via the new admin UI (below).

### Category admin UI on the per-project statuses page

`/settings/projects/{projectId}/statuses` gains a "Categories" section
above the existing statuses list:

- `CategoryModal` — create / edit a category with label, semantics
  (Open / Active / Done / Cancelled), and color. Slug is auto-derived
  from the label on create and locked on edit (existing statuses
  reference it as a string).
- `SortableCategoryItem` — compact row with color swatch, semantics
  badge, edit/delete menu.
- Delete is guarded both client-side (block if any status uses the
  category) and server-side (`category_in_use` error, HTTP 400).

### Tests

- `backend/tests/unit/test_task_status_validation.py` (new, 4 tests) —
  canonical slug accepted, project-scoped custom slug accepted,
  unknown slug rejected, slug scoped to a different project rejected.
- `backend/tests/unit/test_status_categories.py` (+1) —
  `test_create_status_rejects_duplicate_display_name` pins the
  case-insensitive name uniqueness check.

## [0.8.32] - 2026-05-22

Two threads landing together:

  1. **DB-driven status categories.** The `category` on each task status
     was previously locked to three Literal values (`todo`,
     `in_progress`, `done`). It's now a free-form slug validated
     against a new `workspace_status_categories` table that ships six
     canonical buckets per workspace (`backlog`, `todo`, `in_progress`,
     `in_review`, `done`, `cancelled`) and is open to admin additions.
  2. **Project-scoped statuses actually reach the board.** The
     `useTaskStatuses(workspaceId, projectId)` hook + endpoint existed
     since 0.8.29, but both the project board (`sprints/[id]/board`)
     and the workspace All-Tasks tab were silently rendering hardcoded
     5-status arrays. They now call the hook and render whichever
     statuses the project (or workspace fallback) defines.
  3. **Board ↔ Table layout toggle.** The orphaned `Settings2` button
     in the board toolbar is replaced with a `LayoutGrid | Table2`
     pill; the workspace All-Tasks tab gains the same toggle. Layout
     is persisted per scope via the new `useTasksLayout` hook.

### Status categories from the database

- `backend/scripts/migrate_status_categories.sql` creates
  `workspace_status_categories` and seeds the six canonical buckets
  for every existing workspace. The unique index uses
  `COALESCE(project_id::text, '')` so workspace defaults and project
  overrides occupy separate uniqueness buckets, matching the pattern
  already in use for `workspace_task_statuses`.
- Each category carries a `semantics` field (one of `open`, `active`,
  `done`, `cancelled`). All business logic that needs to branch on
  completion (burndown, velocity) should read `semantics` — slugs
  are user-facing and renameable.
- `StatusCategory` in `backend/src/aexy/schemas/sprint.py` becomes
  `str`; `CategorySemantics` is the new `Literal`. The frontend
  mirror in `lib/api.ts` matches.
- New service helpers in `TaskConfigService`:
  `get_categories`, `get_categories_for_project`,
  `create_category`, `update_category`, `delete_category`,
  `reorder_categories`, `seed_default_categories`.
- New endpoints under `/workspaces/{id}/status-categories` with the
  same `?project_id=` scope filter as `/task-statuses`.
- `create_status` / `update_status` validate the category slug
  against the workspace's category set (with project fallback) and
  raise `TaskValidationError("unknown_category")` on miss.
  Workspaces created before the categories table existed get
  lazy-seeded on first write so legacy data never trips.

### Status modal, dynamic now

- `StatusModal` accepts a `categories` prop instead of a hardcoded
  array. Each cell renders the category color, label, and a small
  `semantics` chip; the title attribute carries the burndown hint.
  Both consumers (project statuses page + workspace task-config
  page) wire `useStatusCategories` and thread it through.

### Project-scoped statuses on the kanban

- `frontend/src/app/(app)/sprints/[projectId]/board/page.tsx` calls
  `useTaskStatuses(workspaceId, projectId)` and renders status
  columns from the resolved set (project rows or workspace
  fallback). The hardcoded five-column `STATUS_CONFIG` is kept only
  as a label/color fallback for the canonical slugs.
- `WorkspaceTasksTab.tsx` does the same when exactly one project is
  filtered in; otherwise it falls back to workspace defaults.
- `useProjectBoard.tasksByStatus` and
  `useWorkspaceTasks.tasksByStatus` are now `Record<string, _>`
  instead of `Record<TaskStatus, _>` so custom slugs bucket correctly.

### Board / Table view toggle

- `frontend/src/hooks/useTasksLayout.ts` — localStorage-backed
  `"board" | "table"` preference, scoped per surface
  (`board:<projectId>` for each project, `workspaceTasks` for the
  All-Tasks tab).
- `frontend/src/components/planning/TaskTableView.tsx` — shared
  dense table view used by both pages. Columns: Key, Title, Status
  (with the project-scoped color dot), Priority, Assignee, Sprint,
  Pts, Updated. Sticky header, hover row, bulk-select column,
  row-click opens the same detail surface as the kanban cards.
- The board page swaps its orphaned `Settings2` button for a
  segmented Board/Table pill; `WorkspaceTasksTab` adds the same
  pill in its toolbar alongside the existing project-statuses link.

### Tests

- New backend suite `tests/unit/test_status_categories.py` (7 tests)
  covers: canonical seed, fallback resolver, project override,
  unknown-category rejection on create + update, lazy-seed for
  legacy workspaces, and refusal to delete a category in use.
- New frontend Vitest specs:
  - `src/test/useTasksLayout.test.ts` — persistence, hydration,
    malformed-value guard, scope isolation.
  - `src/test/StatusModal.test.tsx` — dynamic categories rendering,
    submit payload uses the selected slug, empty-state hint.
- New Playwright spec `e2e/tasks-view-toggle.spec.ts` — a custom
  project status (`design_review`) surfaces as a kanban column on
  the board; the Board ↔ Table toggle swaps content and persists
  across reload via the scoped localStorage key.

### Migration notes

- The new SQL migration is idempotent and safe to re-run; it uses
  `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` for the
  seed.
- Existing status rows keep their category strings unchanged. The
  migration also retags the seeded "Backlog" status from
  `category=todo` → `backlog` and "In Review" from `in_progress` →
  `in_review` for workspaces that hadn't renamed those rows.
- Pre-existing pre-existing pre-existing tests in
  `test_task_config_project_scope.py` continue to pass against the
  updated seed (it already used the `in_review` slug).

## [0.8.31] - 2026-05-22

Moves the status admin to its semantic home: project-scoped statuses
now live at `/settings/projects/<id>/statuses` next to General /
Permissions / Repositories, instead of the workspace settings page
with a `?project=` query param. The workspace task-config page keeps
its workspace-defaults mode; the project-scoped UI moves out.

### New project settings sub-route

- `frontend/src/app/(app)/settings/projects/[projectId]/statuses/page.tsx`
  hosts the project status admin in the same shell as General /
  Permissions: matching breadcrumb, project header chip, tab nav
  including the new `Statuses` link.
- Reuses `useTaskStatuses(workspaceId, projectId)`, the
  `DeleteStatusModal`, and the auto-fork backend from 0.8.29-0.8.30 —
  no new service or API.
- Fallback CTA ("Customize for this project") sits in the same
  position as the workspace settings page's version. Rows render
  read-only with a `Workspace default` chip until the fork happens.

### Shared status components

- Extracted `SortableStatusItem` to `frontend/src/components/settings/SortableStatusItem.tsx`
  — the row component used by both `task-config/page.tsx` and the
  new project statuses page. Includes the `readOnly` mode introduced
  in 0.8.30.
- Extracted `StatusModal` (the add/edit form) to
  `frontend/src/components/settings/StatusModal.tsx`. Both pages
  import it; the workspace page's inline copy is gone.

### Tab nav + deep-link re-aim

- Project settings (`/settings/projects/[projectId]` and `.../permissions`)
  pages grow a `Statuses` tab link. Repositories sub-page keeps its
  back-button layout untouched.
- `Columns` deep link on the project board
  (`/sprints/[projectId]/board`) now points at
  `/settings/projects/<id>/statuses` instead of
  `/settings/task-config?tab=statuses&project=<id>`.
- Same change on the workspace All-Tasks header — the link still
  only renders when the user has filtered to a single project.

### Notes

- `/settings/task-config` keeps its existing project picker for now;
  it still works but the project deep links no longer point at it.
  Once usage shifts to the new route the project-mode dropdown there
  can be retired.
- `useProject(workspaceId, projectId)` was already exporting
  `isLoading` — no hook changes needed for this PR.

## [0.8.30] - 2026-05-22

Finishes the project-scoped statuses UX: tasks no longer get orphaned
when a column is deleted; the project board has a direct entry point
into status editing; fallback projects render their inherited columns
as visually read-only; and adding a project status from fallback now
snapshots the workspace defaults first so the project doesn't lose
its inherited columns.

### Delete-with-migration (backend + UI)

- `TaskConfigService.delete_status(status_id, migrate_to_status_id=None)`
  now optionally rewrites every task pointing at the source status
  (`sprint_tasks.status_id` and the legacy `status` slug column) to
  the chosen target before the soft delete. Validation refuses a
  cross-workspace target, refuses a project-scoped target for a
  workspace-default delete (tasks come from across the workspace),
  refuses a different project's target for a project-scoped delete,
  and refuses self-target.
- New `GET /api/v1/workspaces/{ws}/task-statuses/{id}/usage` returns
  `{ count }` — powers the delete modal's "N tasks use this status"
  copy.
- `DELETE /api/v1/workspaces/{ws}/task-statuses/{id}` now accepts a
  `?migrate_to=<uuid>` query param.
- `frontend/src/components/settings/DeleteStatusModal.tsx` replaces
  the previous `confirm()` dialog. Renders the usage count, requires
  a target status when count > 0, defaults the target to a same-
  category sibling for sensible fallback, and surfaces the backend's
  stable error codes inline.

### Auto-snapshot on first project-scoped create

- `create_status(project_id=...)` for a project that's currently on
  fallback now clones the workspace defaults into that project before
  inserting the new row. Without this, the resolver would flip from
  "5 inherited statuses" to "1 manually-added status" the moment an
  admin clicked Add Status from a per-project view — silent column
  loss.

### Entry points from the project board

- `frontend/src/app/(app)/sprints/[projectId]/board/page.tsx` gets a
  "Columns" link in the toolbar (next to Add Task) that deep-links
  to `/settings/task-config?tab=statuses&project=<projectId>`.
- `frontend/src/components/planning/WorkspaceTasksTab.tsx` shows the
  same link in the All-Tasks header when filtered to a single project.
- `task-config/page.tsx` reads `?project=<uuid>` from the URL and
  preselects the scope dropdown so the deep links land where they
  promise.

### Read-only workspace-default preview

- `SortableStatusItem` gains a `readOnly` prop. When the page is in
  per-project mode and the project is in fallback (`isUsingWorkspaceFallback`),
  rows render with a `Workspace default` chip and the drag-handle /
  edit / delete affordances hide. The single primary action becomes
  the existing "Customize for this project" CTA.

### Tests

- 5 new unit tests in `test_task_config_project_scope.py`:
  - `count_tasks_using_status` returns the count.
  - `delete_status` with a target rewrites both `status_id` and the
    legacy `status` slug on every affected task.
  - `delete_status` without a target leaves tasks pointing at the
    now-inactive row (legacy slug still renders the card).
  - Cross-workspace / cross-project migration targets are rejected
    with `migration_target_other_workspace` / `migration_target_other_project`.
  - `create_status(project_id=...)` on a fallback project copies the
    workspace defaults in before adding.
- Test that previously asserted "creating one project status yields
  exactly one row" was updated to match the new auto-snapshot
  behavior; the invariant it now expresses is "the resolver returns
  project-scoped rows once any exist", which is what the codebase
  actually relies on.

## [0.8.29] - 2026-05-22

Project statuses are now genuinely isolated from workspace edits. The
0.8.28 release introduced project-scoped statuses with a workspace
fallback; this release closes the gap where a fallback project would
still see workspace renames, deletions, and reorders flow through.

### Lazy auto-fork on destructive workspace edits

- New `TaskConfigService._snapshot_fallback_projects(workspace_id)`
  finds every project in the workspace that has no project-scoped
  status row of its own and runs `clone_workspace_statuses_to_project`
  for each, capturing the current workspace defaults.
- `update_status` and `delete_status` now invoke the snapshot **before**
  applying the change when the target row is a workspace default
  (`project_id IS NULL`). Editing a project-scoped row is a no-op for
  the snapshot — those projects already own their statuses.
- `reorder_statuses` invokes the snapshot when any of the reordered
  IDs is a workspace default; reordering changes a project's visual
  workflow and counts as destructive for the same reason as a rename.
- `create_status` (workspace) is intentionally **not** wrapped — adding
  a new status is additive, so fallback projects pick it up via the
  resolver without being auto-forked into snowflakes.
- All snapshot writes share the API endpoint's transaction (`db.commit`
  is the last step in `update_task_status` / `delete_task_status` /
  `reorder_task_statuses`), so a partial failure rolls back cleanly.

### Tests

- 5 new unit tests in `test_task_config_project_scope.py`:
  - Workspace rename snapshots the fallback project (project keeps
    the old name).
  - Workspace add does **not** snapshot (project stays in fallback
    and resolves the new status via the workspace defaults).
  - Workspace delete snapshots the fallback project (project keeps
    the deleted status as an active project override).
  - Workspace reorder snapshots the fallback project (project keeps
    the original order).
  - Workspace edit with a mixed project set leaves the already-
    customized project untouched and only forks the fallback one.

### Notes for follow-up frontend work

This release is backend-only. The discoverability work proposed
alongside this (kanban-header drawer, `/sprints/[projectId]/settings/
statuses` route, delete-with-task-migration modal, read-only
"Workspace default" preview, "reset to workspace defaults" undo)
will land in a follow-up PR. Operators editing statuses today still
use `/settings/task-config` with the project picker.

## [0.8.28] - 2026-05-22

Workspace All-Tasks gains inline create, statuses become per-project
(with a workspace fallback), and the kanban picks up a round of
Linear-style polish. Backend tests now run against SQLite without
the previous `ARRAY`/`JSONB` schema-compile blocker.

### Inline task create on the workspace kanban

- `WorkspaceTasksTab` (`/sprints?tab=tasks`) was read-only. Adds a
  hover-only `+` button per column, a Trello-style dashed "+ New
  task" row at the bottom of every column (Enter to submit, Esc to
  cancel, refocus on success for rapid entry), and a global "+ Add
  task" button in the filter bar.
- New `AddWorkspaceTaskModal` (`components/planning/AddWorkspaceTaskModal.tsx`)
  — compact, keyboard-first form with Project, Sprint, Status,
  Priority, Assignee, Story points, dates, and Estimate. Status
  renders as a locked chip when the modal is opened from a column,
  so the new card lands in the column the user clicked.
- Backend: new `POST /api/v1/workspaces/{ws_id}/tasks` endpoint
  (`api/workspace_tasks.py`) backed by `SprintTaskService.add_workspace_task`.
  Resolves `team_id` from `project_teams`, validates that the sprint
  (if any) belongs to that team, and rejects a `status_id` that
  belongs to a different project (returns one of the stable error
  codes `project_has_no_team` / `sprint_not_in_project` /
  `status_belongs_to_other_project` so the frontend can branch on
  the detail string).
- Last-used project persists in `localStorage` so successive
  quick-adds land on the same project without re-picking.

### Project-scoped task statuses (with workspace fallback)

- New migration `migrate_project_task_statuses.sql`: adds a nullable
  `project_id UUID` column to `workspace_task_statuses` and replaces
  the workspace+slug unique constraint with a scoped expression
  index (`workspace_id, COALESCE(project_id, ''), slug`). Existing
  rows keep `project_id = NULL` and continue to act as workspace
  defaults; rows with `project_id` set are project overrides.
- `TaskConfigService.get_statuses_for_project(workspace_id, project_id)`
  returns the project's own status rows when any exist, falling
  back to workspace defaults otherwise. This is the single helper
  the column UI, task-create validation, and the status admin API
  all share.
- New `clone_workspace_statuses_to_project` service helper +
  `POST /workspaces/{ws}/projects/{p}/task-statuses/clone-from-workspace`
  endpoint — idempotent fork-the-defaults action that powers the
  new "Customize for this project" CTA on the Statuses settings
  page.
- Existing `GET /workspaces/{ws}/task-statuses` now accepts
  `?project_id=<uuid>`; `POST /task-statuses` accepts `project_id`
  in the body. Response schema gains a `project_id` field.
- Frontend `useTaskStatuses(workspaceId, projectId?)` switches
  scope, exposes `cloneFromWorkspace` and an
  `isUsingWorkspaceFallback` flag for the CTA.
- Settings page (`settings/task-config`) gets a project picker; in
  per-project mode and using fallback statuses, an info banner
  offers the one-click clone.

### Backfill script (manual, not auto-run)

- `backend/scripts/backfill_project_task_statuses.py` — operator CLI
  that clones workspace defaults into existing projects. Flags
  `--workspace-id`, `--project-id`, `--all`, `--dry-run`. Idempotent
  (skips projects that already have overrides). The non-`migrate*.sql`
  filename keeps it out of the migration runner so it only runs
  when invoked explicitly.

### Kanban UX polish

- Bulk-actions toolbar (floats from the bottom when 1+ cards are
  selected via shift-click / per-card checkbox): bulk "Move to…"
  status change plus Clear.
- URL-persisted filters: `?q=`, `?assignee=`, `?priority=`, `?team=`,
  `?sprint=` round-trip so refresh / back-button / link-sharing
  reproduces the view.
- Keyboard shortcuts: `n` opens the new-task modal; `/` focuses the
  search input.
- Sticky column headers with backdrop-blur so the column name and
  count stay visible while scrolling long lists.
- Loading skeleton swapped from a flat pulsing block to
  column-shaped placeholders with staggered card animation delays.
- Mobile kanban: columns stack vertically below `md` (full-width,
  no max-height) instead of forcing a horizontal scroll on phones.
- Critical empty-state fix: when a workspace had **zero tasks** the
  page rendered "No tasks found" and hid the columns — making the
  new inline quick-add unreachable. The full empty-state now only
  appears when filters are active and matched nothing.

### Test infrastructure fixes

- `core/database.py` registers SQLite dialect shims via
  `@compiles(... "sqlite")` for `ARRAY → JSON`, `JSONB → JSON`,
  `INET → VARCHAR(45)`. Models declared with PG-only types now
  compile under `sqlite+aiosqlite:///:memory:` so the test suite
  reaches the test bodies instead of failing in
  `Base.metadata.create_all()`. 401 previously-blocked tests now
  run; remaining failures are pre-existing fixture issues
  unrelated to this PR.
- Dropped `'::jsonb'` casts from four `server_default` literals in
  `models/dashboard.py` and `models/crm.py` so SQLite accepts the
  DDL. PostgreSQL still parses the bare `'[]'` / `'{}'` defaults
  into JSONB.
- Playwright fixture `setupTaskBoardMocks` now sets the
  `aexy_authed` presence cookie via `page.context().addCookies()`,
  preventing the middleware from bouncing every spec to `/` and on
  to `/onboarding`. Unblocks `task-card-drag`,
  `task-create-attachments`, `task-link-clickable`,
  `task-over-estimate`, `task-attachment-ai-tags`, and
  `task-overdue-badge` in addition to the two new
  `workspace-tasks-create` specs.

### New tests

- `backend/tests/unit/test_task_config_project_scope.py` — 5 unit
  tests covering fallback to workspace defaults, project override
  preference, no cross-workspace leak, clone copy fidelity, and
  clone idempotency.
- `backend/tests/integration/test_workspace_tasks_api.py` — 5 API
  tests covering the happy path, cross-project status rejection,
  project-without-team rejection, status-list fallback, and clone
  idempotency.
- `frontend/e2e/workspace-tasks-create.spec.ts` — Playwright spec
  exercising the inline quick-add row (asserts the wire shape:
  `title`, `project_id`, `status`) and the global "Add task" modal.

### Other

- Frontend `lib/api.ts`: new `workspaceTasksApi.create()`,
  `taskConfigApi.getStatuses({ projectId })`, and
  `taskConfigApi.cloneToProject()`.
- i18n keys: `addTask`, `newTaskPlaceholder`, refreshed
  `dropTasksHere` copy in both `en` and `hi`.

## [0.8.27] - 2026-05-22

Part B follow-ups: close the three loops Part B's commit message
flagged as "deferred". All three streams of AI-generated content
now route through the proposed-edits queue, the doc owner gets a
notification each time a proposal lands, and the stale-conflict
view exposes a Regenerate action to refresh against the current
base.

### Sync service writes proposals

- `DocumentSyncService.regenerate_document` and `process_queue` were
  referenced by the Temporal `regenerate_document` /
  `process_document_sync_queue` activities but didn't exist on the
  service — the whole sync regen path was dead. Implemented both,
  routing through `ProposedEditsService.create_proposal` with
  `source=code_change_sync`.
- `_trigger_real_time_sync` no longer marks the doc
  `pending_regeneration` and forgets about it — it generates fresh
  docs and creates a proposal via a new shared `_generate_and_propose`
  helper.

### suggest_improvements → queue

- New `POST /workspaces/{ws}/documents/{doc_id}/suggest-improvements/apply`.
  Takes a `suggestion_summary` query string (copy/pasted from the
  `improvements[].suggestion` field returned by the existing
  `suggest-improvements` endpoint), runs it through
  `DocumentGenerationService.update_documentation`, and lands the
  result as a pending proposal with `source=suggest_improvements`.
  The legacy GET-style `suggest-improvements` keeps its
  "return-suggestions-list" contract; the new endpoint is the
  "apply this one" action.

### Notifications on every new proposal

- `ProposedEditSource` lifecycle now fires a `DocumentNotification`
  to the document's `created_by_id` with the new `AI_PROPOSAL`
  type. Self-notifications (proposer == owner, e.g. owner-triggered
  manual regenerate) are suppressed. Best-effort: if the doc has no
  `created_by_id`, the notification step is a no-op (legacy fixture
  safety).
- New `DocumentNotificationType.AI_PROPOSAL` enum value
  (`backend/src/aexy/models/documentation.py`).

### Stale-conflict UX: Regenerate action

- `ProposedEditReview` gets a new optional `onRegenerate` prop. When
  the proposal is stale AND a handler is wired, the merge-conflict
  view renders a third action between Reject and "Apply anyway":
  Regenerate.
- `ProposedEditsBanner` wires this to a new `regenerate` mutation
  that calls `documentApi.generate(workspaceId, documentId)` — the
  new proposal supersedes the stale one server-side via
  `create_proposal`'s supersede sweep, so we just invalidate the
  query cache afterwards.
- Non-stale proposals never see the Regenerate button (test
  asserts this).

### Tests

- **Backend**: `test_proposed_edits_service.py` extended with
  `TestNotificationOnCreate` (3 specs): notification fired for
  owner, no self-notification, no notification when owner is
  missing.
- **Frontend**: `docs-proposed-edits.spec.ts` extended with two
  specs: stale conflict renders Regenerate + clicking it calls
  `POST /generate`; non-stale proposals don't show the button.
  Total docs E2E: 29 specs, ~60 s.

### Versions

Bumped both `backend/pyproject.toml` and `frontend/package.json`
to 0.8.27.

## [0.8.26] - 2026-05-22

Part B of the AI documentation initiative: the **proposed-edits
review queue**. AI-generated content no longer overwrites
`document.content` directly — it lands in a pending queue the user
approves or rejects through a banner above the editor.

### Data model

- **New table `document_proposed_edits`**
  (`backend/scripts/migrate_document_proposed_edits.sql`). Columns:
  `id, document_id, source, proposed_content (jsonb),
  base_content_sha, diff_summary (jsonb), status, proposed_by_id,
  proposed_at, reviewed_by_id, reviewed_at, reason`. Indexed on
  `(document_id, status)` for the banner's hot read path and on
  `(document_id, base_content_sha)` for stale-detection lookups.
- **`DocumentProposedEdit` SQLAlchemy model** in
  `aexy.models.documentation` + `ProposedEditSource` and
  `ProposedEditStatus` enums. Wired into `models/__init__.py`'s
  `__all__`.
- **Pydantic schemas** — `ProposedEditCreate`, `ProposedEditResponse`
  (carries computed `is_stale`), `ProposedEditReject`.

### Service

- **`ProposedEditsService`** (`backend/src/aexy/services/proposed_edits_service.py`)
  - `create_proposal` snapshots the current `content_sha` if the
    caller didn't supply one, then auto-supersedes prior pending
    proposals on the same document. The new row is flushed before
    the supersede UPDATE runs, so the new proposal's id can be
    referenced in the supersede `reason` without a null-id race.
  - `approve` routes through `DocumentService.update_document`
    which creates a `DocumentVersion` automatically — every approved
    proposal lands as a versioned change.
  - `reject` records an optional human-readable reason.
  - `is_stale` compares the proposal's `base_content_sha` against
    the document's current SHA; rows without a base are never
    flagged (legacy / migration safety).
  - `compute_content_sha` is key-order invariant (`sort_keys=True`)
    so JS round-trips that re-serialize equivalent content don't
    spuriously trigger the stale badge.

### API

- **`POST /workspaces/{ws}/documents/{doc_id}/generate`** default
  changed: now creates a pending `proposed_edit` instead of writing
  to `document.content`. Legacy overwrite behaviour is preserved
  behind `?apply=true` for scripted / migration callers.
- **`GET /workspaces/{ws}/documents/{doc_id}/proposed-edits`** —
  list pending (default), or `?status=approved|rejected|superseded|all`.
- **`POST .../proposed-edits/{id}/approve`** — applies and
  transitions; bumps the version chain via DocumentService.
- **`POST .../proposed-edits/{id}/reject`** — records reason.

### Frontend

- **`ProposedEditsBanner.tsx`** — banner above the editor when
  pending proposals exist. Groups by source (`regenerate`,
  `code_change_sync`, `suggest_improvements`, `manual_ai_edit`)
  with distinct icons/labels per group. Click a proposal to expand
  the review inline.
- **`ProposedEditReview.tsx`** — three diff modes:
  - **Summary (default)**: sections added / removed / headings
    changed, scannable, no scrolling.
  - **Unified**: full JSON view in a scroll container.
  - **Side-by-side**: current vs proposed columns.
  Approve / Reject actions live in the footer; Reject opens an
  inline reason input. When `proposal.is_stale` is true, the
  banner shows the merge-conflict UX and the Approve button copy
  flips to "Apply anyway".
- **Wired into `app/(app)/docs/[documentId]/page.tsx`** above the
  editor. The component self-hides when there are no pending
  proposals — no layout shift on docs that don't have AI edits.
- **`documentApi.{listProposedEdits, approveProposedEdit,
  rejectProposedEdit}`** added to `lib/api.ts` plus `ProposedEdit`,
  `ProposedEditSource`, `ProposedEditStatus` types.

### Tests

- **Backend**: `tests/unit/test_proposed_edits_service.py` — 10
  unit tests covering `compute_content_sha` invariants
  (deterministic, key-order invariant, None == {}), `create_proposal`
  (SHA snapshotting, flush-before-supersede ordering, string-source
  acceptance), and `is_stale` (no-base / matching / diverged).
- **Frontend**: `e2e/docs-proposed-edits.spec.ts` — 5 specs covering
  banner rendering, all three diff modes (summary / unified /
  side-by-side toggle), approve flow, reject-with-reason flow, and
  the stale conflict UX.

Full backend unit suite for docs: 10 specs pass.
Full docs E2E: 27 specs, ~58 s.

### Migration order

Run `python scripts/run_migrations.py` (the new
`migrate_document_proposed_edits.sql` is the only pending change).
No backfill needed — proposals only land going forward, legacy
generate callers that pass `?apply=true` keep working unchanged.

## [0.8.25] - 2026-05-22

Part A of the AI documentation testing initiative: TDD coverage for
autogenerate flows + the autoupdate plumbing. The audit had flagged
that the entire docs-AI surface had zero tests; this commit closes
that with 11 specs and surfaces three bugs along the way, two of
which are fixed in the same change.

Part B (`proposed_edits` model + approval UX) lands separately.

### Bugs caught + fixed

- **`PlanTier.TEAM` AttributeError in DocumentSyncService**
  (`backend/src/aexy/services/document_sync_service.py:68`).
  Line referenced `PlanTier.TEAM.value` but the enum has no `TEAM`
  member. Every free-tier or pro-tier-without-realtime developer
  hit AttributeError when `get_sync_type_for_developer` was called.
  Fixed to `PlanTier.ENTERPRISE.value`, matching the convention used
  in `api/knowledge_graph.py`, `api/notifications.py`,
  `api/app_access.py`. Caught by `test_document_sync_service.py`.
- **`suggest_improvements` schema drift** (multi-line fix).
  `DocumentGenerationService.suggest_improvements` claims to return
  `{quality_score, improvements[], missing_sections[],
  overall_assessment}` but was returning generic code-analysis JSON
  (`languages, frameworks, code_quality, summary`) because:
  1. `lmstudio_provider._build_analysis_prompts` had no branch for
     `AnalysisType.DOC_*` types — they fell through to
     `CODE_ANALYSIS_PROMPT`, dropping the service's custom prompt.
     Fixed by adding a DOC_* branch that honours
     `request.context["system_prompt"]` + uses the pre-formatted
     `request.content` verbatim.
  2. The service's `json.loads(result.raw_response)` blew up on
     markdown-fenced LLM output. Extracted `_parse_llm_json` helper
     that strips ```json fences before parsing. Applied to all four
     `raw_response` parse sites in the service.
  3. Tightened `DOC_IMPROVEMENT_SYSTEM_PROMPT` to say "Respond ONLY
     with valid JSON … No preamble, no analysis, no markdown fences".
  4. Bumped `lmstudio_config` `max_tokens` in the AI test conftest
     from 2048 → 8192 so Qwen "thinking" models don't run out of
     budget before producing JSON.
  Caught by `test_suggest_improvements.py::test_returns_documented_contract_shape`.
- **Orphan `SyncStatusPanel`** (`frontend/src/components/docs/SyncStatusPanel.tsx`).
  221 LOC of pending-changes UI implemented but never mounted in
  any page. Wired into `app/(app)/docs/[documentId]/page.tsx`:
  uses `useDocumentCodeLinks` to compute the pending count, renders
  above the editor when the doc has any code links, exposes a
  manual-sync button that calls `documentApi.generate`. Caught while
  writing the FE pending-banner spec.

### Coverage added — 5 backend specs

| File | What it covers |
| --- | --- |
| `backend/tests/ai/services/test_document_generation_paste.py` | `generate_from_code` returns TipTap doc shape with heading + paragraph + matching identifier (real LLM) |
| `backend/tests/ai/services/test_document_generation_repo.py` | `generate_from_repository` forwards to GitHubService correctly; missing file raises ValueError (mocked GH, real LLM) |
| `backend/tests/ai/services/test_document_regenerate_from_link.py` | The orchestration the `{doc_id}/generate` endpoint runs: load doc, load links, generate, write content back, flip `generation_status`, clear `has_pending_changes` |
| `backend/tests/ai/services/test_suggest_improvements.py` | Contract shape (`quality_score`, `improvements[]`, `missing_sections[]`, `overall_assessment`); locks in the fix for the schema drift above |
| `backend/tests/unit/test_document_sync_service.py` | Plan-tier routing in `get_sync_type_for_developer`: REAL_TIME / DAILY_BATCH / MANUAL for premium / pro+enterprise / free; the previously-dead enterprise branch now reaches DAILY_BATCH |

### Coverage added — 5 frontend specs

| File | What it covers |
| --- | --- |
| `docs-autogenerate-paste.spec.ts` | Full live flow: paste TS function, click Generate, real LLM round-trip, lands on new doc with editor visible |
| `docs-autogenerate-repo.spec.ts` | From Repository tab opens; either repo list or empty state renders; Generate disabled in empty state |
| `docs-autogenerate-repo-full.spec.ts` | End-to-end repo orchestration with mocked repo/branch/contents APIs; user picks repo → root dir → click Generate → mocked content lands as a new doc |
| `docs-pending-changes-banner.spec.ts` | SyncStatusPanel renders pending count + manual-sync label when a code-link is dirty (mocked code-links, live doc) |
| (orphan SyncStatusPanel finding informs this) | — |

### Frontend dev container & test container

- Installed `pytest`, `pytest-asyncio`, `pytest-cov`, `aiosqlite` into
  the `aexy-backend` image (they weren't there before, blocking any
  attempt to run the backend test suite via `docker exec`).

## [0.8.24] - 2026-05-22

Docs UI/UX follow-up sweep: the five items the 0.8.23 commit
deliberately left as "out of cluster scope" — visual gradient
heroes, ring-spinner duplication, Drive IA confusion, hardcoded
colour refs, mobile responsiveness on Drive/Files/Knowledge-Graph.
5 new E2E specs lock the changes in (18 total docs E2E specs now,
~32 s full pass).

### Visual: gradient heroes gone

- **Replaced the `from-primary-500/20 to-purple-500/20` rounded-2xl
  icon hero in two places** (`DocsLayoutClient.tsx`, `page.tsx`)
  with a typography-first treatment: small tracked eyebrow label,
  semibold tracking-tight headline, one line of supporting copy.
  The audit called this gradient pattern the strongest "AI-slop"
  tell in the surface — `docs-no-gradient-hero.spec.ts` regression-
  guards both heroes.
- Landing headline shifted from "Documentation / Create, organize,
  and auto-generate documentation from your code" to an inviting
  "What do you want to write today?" with shorter supporting copy.

### Spinner consolidation

- **New `components/ui/spinner.tsx`** with `xs|sm|md|lg` size variants,
  `role="status"`, `data-testid="aexy-spinner"`, and an sr-only
  label. Replaces four near-identical inline implementations:
  `DocsLayoutClient.tsx:81` (lg), `[documentId]/page.tsx:45` (md),
  `CollaborativeEditor.tsx:319` (sm), `TemplateSelector.tsx:140` (xs).
- Future docs/UI spinners should reuse this component; the old
  inline pattern accumulated four variants of the same idea across
  the surface.

### Drive IA: distinct from docs, discoverable from the sidebar

- **Sidebar gains a "Files" link** in `SidebarNavigation.tsx` pointing
  at `/docs/drive`. Drive was previously reachable only by URL.
- **Drive page heading renamed to "Files & Storage"** (`drive.page.title`
  in `messages/en/drive.json` + `messages/hi/drive.json`) with a new
  subtitle: "Workspace files, task attachments, and compliance
  documents — separate from your written docs." Makes the relationship
  to docs explicit.
- `docs-drive-ia.spec.ts` asserts the sidebar Files link is present,
  click lands on /docs/drive, and the renamed heading + subtitle
  render correctly.

### Colour tokens sweep

- **85 → 70 hardcoded colour refs in the docs surface.** Visible
  destructive/success states replaced with semantic tokens:
  `text-red-{300,400}` → `text-destructive`, `bg-red-50 dark:bg-red-900/20`
  → `bg-destructive/10`, `text-emerald-400` (saved indicator) → `text-success`.
  Touched: `DocumentItem.tsx` (Delete menu item), `[documentId]/page.tsx`
  (error state), `CodeLinksDisplay.tsx`, `CodeLinkPanel.tsx`,
  `CreateSpaceModal.tsx`, `GenerationPanel.tsx` (error+success banners),
  `DocumentEditor.tsx` (Saved indicator). 15 refs collapsed.
- Remaining ~70 are mostly: `CollaborationAwareness.tsx` (dead code),
  `VersionHistoryPanel.tsx` (diff visualization where red specifically
  means "removed"), `SyncStatusPanel`/`GitHubSyncPanel` (domain-specific
  status palettes), and `DocumentItem.tsx`'s yellow favorite-star.

### Mobile sub-routes

- **Audit at 390×844** of `/docs/drive`, `/docs/files`, and
  `/docs/knowledge-graph`. All three render usable content on
  mobile after the Cluster 1 fixes (Drive already had `lg:flex-row`
  + `lg:w-56` responsive utilities; KnowledgeGraph paywall is
  naturally vertically-flowed; `/docs/files` redirects to `/docs/drive`).
- `docs-mobile-sub-routes.spec.ts` locks in the regression: each
  route's primary content is visible at 390 px and the CTAs/headings
  don't overflow the viewport.

### Tests

5 new E2E specs (`frontend/e2e/docs-*.spec.ts`):

- `docs-no-gradient-hero` — regression guard
- `docs-drive-ia` — sidebar link + renamed heading + subtitle
- `docs-mobile-sub-routes` — 3 routes × 390 px content reachability

Total docs E2E: 18 specs, ~32 s full pass.

## [0.8.23] - 2026-05-22

In-app docs UX bug-fix sweep across three clusters (shell, editor,
a11y), TDD against 13 new E2E specs. Captures every fix in a failing-
then-passing test so the regressions can't sneak back. Cmd+K now
actually searches docs, mobile is no longer unusable, the editor
gets a real reading measure plus bullets + a floating BubbleMenu,
and the sidebar exposes tree semantics to assistive tech.

### Cluster 1 — shell fixes

- **`Cmd+K` in `/docs` opens the doc-scoped SearchModal, not the
  global CommandPalette.** Two `keydown` listeners on `document` were
  racing — the app-shell global was mounted earlier and won. The docs
  layout now installs its listener in capture phase and calls
  `stopImmediatePropagation()`, so the global never sees the event
  on docs routes. (`DocsLayoutClient.tsx`)
- **Sidebar collapses to a drawer below `md`.** The hard-coded
  `w-60 flex-shrink-0` was eating ~62 % of a 390 px viewport. Sidebar
  now slides off-screen via `-translate-x-full md:translate-x-0`,
  with a `data-testid="docs-mobile-menu-trigger"` hamburger in a new
  mobile top bar (`pl-14` so it doesn't collide with the app-shell's
  fixed-position trigger) and a backdrop that closes on tap.
  Drawer auto-closes on route change.
- **Delete confirmation is a styled dialog, not `window.confirm()`.**
  `NotionSidebar.tsx` now opens the existing `ConfirmDialog` from
  `components/ui/confirm-dialog.tsx` with `tone="danger"` and a
  "Delete" primary action. The native browser dialog (which broke
  visual consistency with the dark theme) is gone.
- **Inert menu items hidden until implemented.** "Duplicate" and
  "Manage Space" were `console.log("…")` TODOs surfaced as live
  affordances. NotionSidebar no longer passes the `onDuplicate` /
  `onManageSpace` props, so DocumentItem's existing
  `{onDuplicate && (…)}` guards collapse the rows. Real handlers
  can be wired later without changing markup.
- **`/docs/files` no longer strands on "Loading document…".**
  The bare prefix matched the `[documentId]` catch-all with
  `documentId="files"` and loaded forever. A new
  `app/(app)/docs/files/page.tsx` redirects to `/docs/drive`.

### Cluster 2 — editor fixes

- **Reading-measure cap.** `prose ... max-w-none` (which ran ~140
  cpl on 1440 px viewports) replaced with
  `prose ... max-w-3xl mx-auto` (~672 px / ~65 cpl). Editor
  spec asserts `≤ 900 px` at 1440 desktop.
  (`DocumentEditor.tsx:181`)
- **Lists render visible markers again.** Tailwind's preflight
  reset was stripping bullets off bare `<ul>`/`<ol>` inside the
  ProseMirror because typography-plugin `prose-ul:` modifiers
  weren't resolving in the cascade. Switched to arbitrary-variant
  utilities (`[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal
  [&_ol]:pl-6 [&_li]:my-1`) which carry enough specificity.
- **Emoji picker closes on Escape.** Audit caught the picker
  staying open across three intermediate actions. Added a
  scoped `keydown` listener while the picker is mounted; on
  Escape it sets `showEmojiPicker(false)`.
- **Manual `Save` button removed.** `autoSave` is on by default
  with a 1 s debounce; the duplicate Save button created
  "is autosave actually working?" doubt. Drop the `onSave` prop
  passed to EditorToolbar — the `{onSave && (…)}` guard already
  collapses the row. `handleManualSave` callback also removed.
- **Floating BubbleMenu is back in the non-collab path.** The
  BubbleMenu only existed in `CollaborativeEditor.tsx`, which is
  hard-disabled by `collaborationEnabled = false`. DocumentEditor
  now mounts its own BubbleMenu with Bold/Italic/Underline/Code
  controls. `data-testid="docs-bubble-menu"` lives on an inner
  wrapper because `@tiptap/react@2.27.1` BubbleMenu only forwards
  `className` to the rendered div (verified by reading
  `node_modules/@tiptap/react/dist/index.cjs`).

### Cluster 3 — ARIA / accessibility

- **SearchModal exposes the right contract.** `role="dialog"` +
  `aria-modal="true"` + `aria-label="Search documents"` on the
  modal root. Screen-reader users can now identify the overlay.
- **Sidebar is a real tree.** The scrollable content container
  gets `role="tree"` + `aria-label="Documents"`. Each
  DocumentItem row gets `role="treeitem"` + `aria-selected`
  (driven by `isSelected`) + `aria-expanded` when it has children.
  Active document is `aria-selected="true"`.

### Tests

13 new E2E specs under `frontend/e2e/docs-*.spec.ts`, all live-
backend, no LLM (use `backendOnlyReady` + `setupAiLiveAuth`).
Spec-first per cluster: write specs → run them red → implement
fixes → run them green. Files:

- `docs-cmdk-doc-search`, `docs-mobile-sidebar` (×2),
  `docs-styled-confirm-dialog`, `docs-todo-menu-items-hidden`,
  `docs-files-route-redirect`
- `docs-editor-reading-measure`, `docs-editor-list-bullets`,
  `docs-editor-emoji-picker-escape`, `docs-editor-no-save-button`,
  `docs-editor-bubble-menu`
- `docs-a11y-search-modal`, `docs-a11y-doc-tree`

Full suite passes in ~22 s.

## [0.8.22] - 2026-05-22

AI/automation E2E coverage expansion: the workflow builder now has a
schema-driven test fixture, 35 new Playwright specs across nodes,
triggers, actions, templates and end-to-end runs, plus tighter
assertions on the live-LLM tests so the suite actually catches
provider drift and prompt regressions instead of greenlighting them.

### Workflow builder — new `join` node + canvas testability

- **`join` is now a first-class node type.** Added to
  `WorkflowNodeType` in `backend/src/aexy/schemas/workflow.py`; the
  canvas's `JoinNode` was already wired up but the schema literal
  was missing, so `nodes: [..., { type: "join" }]` round-trips
  through validation now instead of being silently coerced.
- **`NodePalette` and `NodeConfigPanel` got stable test hooks.**
  `data-testid="palette-category-${kind}"`,
  `palette-subtype-${kind}-${value}` on every entry, plus
  `data-testid="node-config-panel"` + `role="dialog"` on the config
  drawer. One helper change updates every spec instead of 200.
- **Categories without subtypes show a hover-revealed `+` affordance.**
  A bare row gave no visual hint that clicking does anything;
  drag-first UX stays primary, the icon is subtle by design.

### Automation templates — save no longer silently 400s

- **`send_email` template actions now ship subject + body.** The
  backend's `validate_workflow` rejects email actions without
  `email_body`, so the "follow-up sequence" and "welcome sequence"
  templates were silently failing the save with HTTP 400 and the
  user saw an empty canvas after "saving" (`automationTemplates.ts`).
- **Template action `config` is spread flat into node `data`.**
  `NodeConfigPanel` writes action fields flat (`data.email_body`,
  `data.duration_value`) and the backend reads them flat too;
  nesting under `data.config` meant the validator never saw the
  required fields. No remaining `node.data.config.*` readers
  anywhere in the frontend.

### Schema-driven test fixture

- **`backend/scripts/dump_automation_schema.py`** emits the
  trigger/action registry to
  `frontend/e2e/fixtures/automation-schema.generated.json`. The
  per-subtype specs (`ai-automation-triggers-*`,
  `ai-automation-actions-*`) parametrise from this fixture so
  adding a new trigger on the backend forces a matching test entry.
- **`npm run schema:automation`** regenerates the fixture via
  `docker exec aexy-backend ...`. **`npm run schema:automation:check`**
  is the CI drift gate. Both now precheck that `aexy-backend` is
  running and exit with a clear message ("Start it with:
  docker-compose up -d backend") instead of leaving devs to parse
  a raw `docker exec` error.

### AI automation E2E suite — 35 new specs

- **Three layers, all live-backend:**
  1. **Per-node CRUD** (`ai-automation-node-{trigger,action,
     condition,wait,agent,branch,join}.spec.ts`) — palette add,
     config-panel render, click-to-select, delete.
  2. **Per-subtype parametrised loops** —
     `ai-automation-{triggers,actions}-{module}.spec.ts` covering
     every trigger and action in every module's registry, all
     driven by the generated fixture above.
  3. **End-to-end** — `canvas-wire` (6-node save/reload
     round-trip), `templates` (every gallery template lands a
     usable graph), `generate-workflow-per-module` (LLM generator
     across all 10 modules), `run-agent` and `end-to-end`
     (record-created trigger → seeded LLM agent → workspace
     state mutation, with marker-envelope assertions).
- **Shared helpers in `frontend/e2e/fixtures/automation-helpers.ts`**
  — `openCanvas`, `addNodeFromPalette`, `canvasNodes`,
  `openNodeConfig`, `connectNodes`, `saveWorkflow`,
  `fetchWorkflow`, `deleteAutomation`. Roughly 35 specs share one
  contract; testid drift breaks one helper, not the whole suite.

### Live-LLM assertions — false-positive class eliminated

- **Marker-envelope check on agent output.** `ai-automation-run-agent`
  and `ai-automation-end-to-end` now pass a per-test
  `echo_token` in `trigger_data` and instruct the agent (via its
  system prompt) to wrap it in a literal `[ECHO:<token>]`
  envelope. The envelope shape can't appear from stub providers,
  cached responses, or a passthrough copy of input data — only
  from an LLM that actually read and reshaped the payload.
- **`generate-workflow-per-module` now hard-fails on unknown
  `trigger_type`.** A `console.warn` previously demoted LLM
  hallucinations like `record.modified` (instead of
  `record.updated`) to log noise nobody reads — exactly the
  prompt-regression class this spec exists to catch. Now an
  unknown trigger fails the test with the known-trigger list in
  the failure message.
- **`run-agent` workflow status check tightened from
  `["completed", "running", "failed"]` to strictly `"completed"`.**
  `dry_run=true` is synchronous so anything else means the
  executor bailed before producing the node_results we go on to
  assert against.

### Test-env plumbing

- **`backendOnlyReady` (in `frontend/e2e/fixtures/ai-env.ts`)**
  splits the LM Studio probe out of `aiLiveReady`. Structural
  tests that don't invoke any LLM (canvas wiring, palette
  interaction, save round-trip) no longer skip the entire spec
  file when LM Studio happens to be down.
- **`setupAiLiveAuth` now sets the `aexy_authed=1` cookie before
  the first navigation.** Middleware redirects every protected
  route to `/?next=...` when the cookie is missing — and the
  cookie is normally set client-side by `useAuth` AFTER mount, so
  without this fix the very first goto bounced through the login
  page and dropped any query params we'd set.
- **`playwright.config.ts`** honours `PLAYWRIGHT_BASE_URL` instead
  of hard-coding `http://localhost:3000`, so the suite can run
  against a non-default host (CI runner, remote box).
- **`docker-compose.yml`** passes
  `LMSTUDIO_BASE_URL=${LMSTUDIO_BASE_URL:-http://host.docker.internal:1234/v1}`
  into the backend. `localhost` inside the container was the
  container, not the host — the agent action couldn't reach the
  developer's LM Studio during E2E and dev runs.

## [0.8.21] - 2026-05-22

AI surface hardening: the `/automations` canvas no longer crashes on
LLM-generated workflows, the agent provider list catches up with the
backend, the frontend dev container has the headroom to run the new
live AI E2E suite, and a small layout bug in the workflow generator
is fixed before it ships.

### Workflow generator — layout fix

- **LLM-generated workflows now render reliably.** The
  `POST /automations/generate-workflow` response had no `position`
  on its nodes, so ReactFlow crashed the `/automations` canvas and
  bounced the user to the route's error boundary. Backend now
  assigns `{x, y}` to every generated node via a one-shot
  auto-layout pass before responding
  (`backend/src/aexy/services/workflow_generator.py`).
- **Layout uses longest-path topological depth.** Diamonds and
  fan-in graphs (`A→B→C→D` plus `A→D`) now place the merge node at
  the depth of the longer path, with descendants cascading correctly.
  The earlier BFS variant settled the merge node at the shallower
  depth if the short edge was walked first. Five new unit tests in
  `tests/unit/test_workflow_generator.py` pin the contract: every
  node gets a position, linear chains cascade right, the diamond
  case settles on longest-path depth, existing positions are
  preserved, and cycles render rather than crash.

### Agent LLM provider list — FE/BE parity

- **DeepSeek and LM Studio show up in the provider picker.** The
  backend has accepted `"deepseek"` and `"lmstudio"` as
  `AgentCreate.llm_provider` values for a while; the frontend
  selector only knew the four originals, so any agent created with
  one of the new providers crashed the agent detail page when
  `LLMConfigDisplay` tried `PROVIDERS[provider].models.find(...)`.
  Selector now lists DeepSeek (Chat + Reasoner) and LM Studio
  (Qwen 3.5 9B), and `LLMConfigDisplay` falls back to a generic
  render for any future unknown provider rather than throwing.
  (`frontend/src/components/agents/shared/LLMProviderSelector.tsx`)

### Frontend dev container — heap headroom

- **No more silent OOM kills during AI E2E runs.** Turbopack's
  lazy compilation across `/agents`, `/automations`, `/chat`,
  `/compliance`, … in quick succession was exhausting the default
  Node heap and getting SIGKILL'd by Docker. Frontend service now
  sets `NODE_OPTIONS=--max-old-space-size=6144` (6 GiB V8 heap)
  with a matching `mem_limit: 7g` so Docker doesn't kill the
  process before V8 has a chance to GC (`docker-compose.yml`).

### AI E2E test suite — new live tier

- **15 new `frontend/e2e/ai-*.spec.ts` specs** drive every AI
  surface (agent chat + conversation create + prompt preview +
  test run, /ask, workflow generation, automation test run, code
  analysis, developer insights, email draft, file
  metadata/sidecar, file search, hiring re-evaluate, learning
  path, review-cycle generate) against the **live** stack — real
  frontend, real backend, real LM Studio. Mocked AI responses
  defeat the point of this tier; the existing `*.spec.ts` files
  cover UI-only behaviour.
- Auto-skips the whole file when LM Studio is unreachable, exactly
  like the backend `tests/ai/` suite.
- Shared helpers in `frontend/e2e/fixtures/ai-env.ts` (env +
  LM Studio probe + auth bootstrap) and
  `frontend/e2e/fixtures/ai-helpers.ts` (seeders, long-timeout
  response waiters, fatal-error collectors).
- Default LLM wait per request is 3 minutes (`AI_E2E_LLM_WAIT_MS`).
  A spec that times out is signalling that the model is genuinely
  slow, not flaky — don't lower it. See the new
  "AI E2E tests" section in `CLAUDE.md` for setup.

## [0.8.2] - 2026-05-21

`/reviews` surface UX overhaul, prod-bug fixes, and a tighter
contract between the frontend and the manager-review backend. One
hard 422 (manager Save Draft) is fixed via a backend schema relax
+ matching client change; the rest is i18n parity, draft-hydration
correctness, and accessibility nits.

### Reviews — bug fixes

- **Manager Save Draft no longer 422s.** The frontend used to send
  `overall_rating: 0` as a sentinel against `ManagerReviewSubmission`
  which is `Field(ge=1, le=5)` — every draft save before the manager
  had settled on a rating was rejected. `overall_rating` is now
  `Optional[float]` on the submission schema (the hard constraint
  stays on `FinalReviewData` where it actually matters), the service
  preserves any prior rating when `None` is passed, and the client
  drops the `?? 0` fallback. Three new regression tests pin the
  contract: null accepted, missing accepted, finalize still rejects
  out of range (`backend/tests/unit/test_reviews_prod_bugs.py`).
- **Discarded suggestions no longer leak across workspaces.** The
  hydration `useEffect` on `/reviews/manage` only wrote
  `discardedIds` when the new workspace key had data; switching to a
  workspace with no entry kept the previous team's discard list in
  state. Now always resets (`manage/page.tsx`).
- **Draft hydration re-runs on id change.** All three draft surfaces
  — manager review composer, self-review form, peer decline reason —
  used a boolean `hydratedRef` that stayed `true` across client-side
  nav, so visiting a second review/request id never hydrated its
  draft. Now keyed by id (`hydratedKeyRef === currentKey`), with an
  explicit reset when the new id has no stored draft.

### Reviews — UX consistency

- **Cycle list now shares the inline-error pattern.** Activate /
  advance on `/reviews/cycles` used to surface failures as a toast
  that sat hidden behind the open `ConfirmDialog`; the detail page
  rendered an inline red block inside the dialog. The list page now
  uses the same inline block — same place users see the failure
  matches the action that produced it.

### i18n — parity + sweep

- **25 new translation keys**, mirrored across `en` and `hi` (parity
  preserved at 550 keys each). Sweep covers: cycles list ConfirmDialog
  + toasts + status filter + breadcrumb + error panel; goal complete
  dialog; manage status filter; manage detail "Back to Reviews" +
  "Invite Peer Reviewers"; peer-requests error title.
- Hindi entries keep technical terms (PR, GitHub, peer reviewer,
  cycle, etc.) in English per the project convention.

### Accessibility

- **Notify dropdown trigger** on `/reviews/cycles/[cycleId]` now has
  an explicit `aria-label` alongside `title=` — screen readers don't
  reliably announce `title`, and the trigger needed a stable
  accessible name.

### Internal

- `next-env.d.ts` and `tsconfig.tsbuildinfo` are now gitignored —
  the former is rewritten by Next between dev (`.next/dev/...`) and
  prod (`.next/...`) builds, the latter is per-machine.

## [0.8.1] - 2026-05-20

UX overhaul of the agents + automations surface, plus a four-week
accessibility sweep across the workspace shell. Nineteen commits since
`0.8.01` consolidate three workstreams: a unified Operations IA, an
inbox triage rewrite, and a long polish tail that migrates the last raw
modals/drawers off ad-hoc divs onto Radix `Dialog` / `Sheet` primitives.
Closes with four follow-ups from the PR #148 review.

### Operations IA + agents UX

- **Unified Operations page** (`/operations`, new). Single entry for
  agents *and* automations — replaces the two separate `/agents` and
  `/automations` landings, which the audit flagged as the #1 user
  confusion ("am I building an agent, or wiring a workflow?"). New
  `frontend/src/app/(app)/operations/page.tsx` (534 lines) plus
  sidebar layout updates and `messages/{en,hi}/operations.json`
  translations.
- **Agent inbox triage v2** (`/agents/[id]/inbox`). Multi-select with
  shift-click range, bulk-action toolbar (approve / dismiss / mark
  read), and full keyboard navigation (j/k row movement,
  x = toggle-select, enter = open). Inbox detail polish adds five
  follow-up wins (HTML email rendering via DOMPurify, sender chip,
  read-state indicator, optimistic toggles, skeleton during refetch).
- **Per-tab dirty state on the edit page** (`/agents/[id]/edit`).
  Replaces the prior single `hasChanges` boolean — each of the seven
  tabs (General / LLM / Tools / Behavior / Prompts / Escalation /
  Email) reports its own dirty bit so users switching tabs see which
  sections still have pending edits. Help text and the
  system-agent-locks-non-LLM-tabs disable are part of the same pass.
- **`useRouteGuard` hook** (`frontend/src/hooks/useRouteGuard.ts`,
  new). Anchor-click intercept + `beforeunload` for unsaved-changes
  prompting; companion `requestConfirm(href)` API for programmatic
  navigations (toolbar shortcuts, form-success redirects). Wired into
  the edit page; ready for reuse on automation builder and CRM detail
  forms.
- **Live-streamed executions + inbox**. React Query polling on the
  agent detail page so executions and inbox counts refresh without a
  manual reload. Pauses on hidden tabs (default RQ behavior); no extra
  socket plumbing.
- **Automation builder onboarding via template gallery**. New
  `frontend/src/components/automations/TemplateGallery.tsx` and
  `frontend/src/lib/automationTemplates.ts` — the automation `/new`
  page now opens to a curated gallery (standup digest, blocker
  escalation, sprint kickoff, etc.) instead of a blank canvas.

### Accessibility + polish (Weeks 1–4)

- **Modal/drawer primitives**. Migrated the last raw `<div role="dialog">`
  surfaces (delete-agent confirm, email-disable confirm, multi-select
  bulk confirm, automation-version pick) to `components/ui/dialog.tsx`
  (Radix `DialogPrimitive` — focus trap, escape, restored focus on
  close). Drawers (workflow Test Results, Execution History, Version
  History) moved to `components/ui/sheet.tsx`. New
  `components/ui/confirm-dialog.tsx` for the destructive-action pattern.
- **Chat surfaces**. Markdown rendering in `MessageBubble` with safe
  link handling, `aria-live="polite"` execution-status region in
  workflow nodes, `prefers-reduced-motion` respected on the chat
  thinking-indicator and the workflow canvas pan/zoom transitions.
- **Light-theme contrast + focus-visible**. ARIA labels on every
  icon-only button across agents/automations/inbox; `focus-visible`
  outlines added to all interactive surfaces; light-theme contrast
  bumps on placeholder text and disabled-state buttons.
- **Optimistic toggles + inbox skeleton**. Enable/disable agent + mark-
  read/unread now flip instantly with rollback on error; inbox shows
  skeleton rows during the first fetch instead of an empty state.
- **`lib/datetime.ts`**. Centralized relative-time + locale-aware
  date helpers; replaced ~20 ad-hoc `Intl.DateTimeFormat` callsites.
- **ICU plurals on counters**. "1 task" / "N tasks" etc. now driven by
  `next-intl` ICU patterns so the Hindi locale gets correct plural
  forms without per-callsite branching.
- **`messages/{en,hi}` additions** — `automations`, `inbox`,
  `insights`, `operations` namespaces (full parity between locales).

### Frontend

- **Per-tab dirty indicators on `agents/[id]/edit/page.tsx`**. Each
  tab carries its own `dirtyByTab[id]` so the tab strip can dot-mark
  which sections have unsaved edits. Form-init effect skips re-sync
  when the user has local changes (UX-EDT-021) — a refetch from
  background polling or another mutation won't clobber in-flight
  typing.
- **`auth/callback/page.tsx` + `lib/oauth.ts`**. Refactored the OAuth
  inflight tagging into a shared `OAuthInflightTagger` component;
  callback page no longer touches localStorage directly.

### Review followups (PR #148)

- **`middleware.ts`** — `AUTH_REQUIRED_PREFIXES` matched `/docs/` but
  not bare `/docs`, leaving the docs root unprotected by the auth
  gate. Now matches both, consistent with every other entry in the
  list.
- **`api/app_access.py`** — extracted `_load_template_for_workspace`
  helper. `update_member_access` and `apply_template_to_member` had
  inlined the identical "template belongs to this workspace (or is a
  system template)" check; both now call the helper.
- **`useRouteGuard.ts`** — wrapped `new URL(anchor.href, ...)` in
  try/catch. A page with a malformed anchor href would have thrown
  inside the captured click handler.
- **`agents/[id]/edit/page.tsx`** — added a rationale comment next to
  the `react-hooks/exhaustive-deps` suppression: `hasChanges` and
  `name` are read inside the form-init effect but intentionally
  excluded from deps to avoid re-syncing the form mid-edit.

### Streaming chat + agent runtime

- **SSE streaming on the agent chat surface** (`/agents/[id]/chat/...`).
  New `AgentService.stream_message` emits tokens, tool-call markers,
  and citations as Server-Sent Events; the frontend `useAgentChatStream`
  hook wires them into the message bubble incrementally with an
  optimistic placeholder, mid-stream stop, and a token-cost meter.
  Migration `migrate_agent_message_streaming.sql` adds the supporting
  columns on `agent_messages` (stream state, token deltas, citations).
- **`agents/base.py` + `services/agent_service.py`** — the agent base
  class gained a `stream()` co-routine alongside the existing
  request/response shape; the service routes streaming-capable agents
  through it and falls back to a single-shot completion for the rest.
- **MessageBubble citations**. Inline numbered footnotes link back to
  the cited tool-call output; renders even after the stream completes.

### Inbox thread chain + generate-from-prompt

- **Inbox thread chain**. Inbox replies are now stitched together via
  `parent_message_id`, so the detail pane renders the full back-and-
  forth (incoming → agent reply → reply-to-reply, etc.) instead of a
  flat list. New `test_inbox_thread_chain.py` (316 lines) pins the
  resolver against forked threads and missing parents.
- **Generate workflow from prompt**. The automation `/new` page can
  now seed a workflow from a natural-language description. New
  `services/workflow_generator.py` calls the LLM, validates the
  produced node graph, and hands it to the existing builder. Wired
  into `TemplateGallery` as a "Describe your workflow" entry.
- **Inbox unarchive** + Postmark parser fix in `api/email_webhooks.py`
  (Postmark's `MessageStream` field was being dropped on rebound
  events, breaking attribution for unarchived items).

### Agent edit + wizard

- **Defaults endpoint** (`GET /agents/defaults`) returns the system
  prompt / tools / behavior defaults for a given agent type so the
  wizard and edit page render preview state without hardcoding.
  Backed by `useAgentDefaults` on the frontend.
- **Prompt preview** on the edit page — substitutes a sample
  `{{variable}}` payload through the system prompt and renders the
  result inline so users see what the agent will actually see at
  runtime.
- **Server-side wizard drafts** (UX-DEF-003). New `agent_drafts` table
  (`migrate_agent_drafts.sql`), `AgentDraftService`,
  `GET/PUT/DELETE /agents/drafts` endpoints, and the `useAgentDraft`
  hook. Replaces the localStorage-only draft that vanished on
  cross-device switches; drafts auto-restore on wizard re-entry and
  garbage-collect on completion.

### Frontend reliability

- **`lib/reportError.ts`**. Centralized error reporter — forwards to
  Sentry when `NEXT_PUBLIC_SENTRY_DSN` is set, falls back to a
  structured console log otherwise. `ModuleError.tsx` boundary now
  reports through it instead of swallowing. 156-line test suite covers
  both branches.
- **Misc UX-close batch**: status counts on inbox tabs, accessible
  Save button (`aria-busy` during inflight, error-region announcement
  on failure), email-cancel resets the form to persisted values
  instead of leaving stale local edits, NodeConfigPanel layout fix.

### Tests

- **~120 new vitest + pytest cases** across:
  - `reportError.test.ts` (156 lines) — Sentry / console branches.
  - `useAgentDraft.test.tsx` (326 lines), `useAgentChatStream.test.tsx`
    (430 lines) — hook lifecycle, abort, error paths.
  - `test_agent_stream_message.py` (510 lines) — five SSE flows
    including mid-stream cancellation and tool-call interleaving.
  - `test_agent_draft_service.py` (226 lines) — CRUD + workspace-
    scope assertions.
  - `test_workflow_generator.py` (233 lines) — graph validation +
    LLM error fallback.
  - `test_agent_cost_estimation.py` (125 lines), `test_agent_preview_prompt.py`
    (340 lines), `test_inbox_thread_chain.py` (316 lines),
    `test_inbox_unarchive.py` (193 lines),
    `test_email_webhook_parse.py` (117 lines).

### Review followups (agents-big-features)

Post-merge audit of the streaming-chat + agent-runtime branch surfaced
one Critical cross-workspace gap on the new SSE endpoint plus a
cluster of Highs around partial state, citation XSS, and an SSE chunk-
buffering blind spot. Fixed in place; tests added for each.

- **Security (Critical):** `POST /workspaces/{ws}/crm/agents/{aid}/
  conversations/{cid}/messages/stream` now calls
  `_assert_agent_in_workspace` and rejects conversations whose
  `workspace_id` doesn't match the URL. Previously the endpoint only
  checked `conversation.agent_id == agent_id`, so a developer in
  workspace A who knew a foreign workspace's (agent_id, conversation_id)
  pair could stream user messages into that foreign conversation.
- **Backend:** SSE stream commits the user message + execution shell
  in a single transaction so a flush failure can't strand a user
  message without a paired execution row. Inbox thread forward walk
  now queries only the new frontier per round (was O(n²) on long
  threads); capped at 50 rounds matching the backward walk. Workflow
  generator caps generated graphs at 100 nodes / 200 edges so a runaway
  LLM response can't spawn thousands of canvas nodes.
- **AgentDraft persistence:** `save_draft` now uses
  `attributes.flag_modified(...)` to force the JSONB UPDATE (previously
  relied on assigning a new dict, which worked but was fragile under
  in-place mutation). Documented the pattern on the model field.
- **Frontend (chat surface):** Citations + markdown anchors now drop
  back to plain text for non-`http(s)` schemes, blocking
  `javascript:` / `data:` URL XSS at the source. Live token meter +
  per-message meter + "Sources" + "Processing…" + generate-prompt
  placeholder all flow through `useTranslations` (`messages/en/agents.json`,
  `messages/hi/agents.json`, `messages/{en,hi}/automations.json`). Per-
  message meter stacks under the timestamp on narrow screens. Optimistic
  message ids use `crypto.randomUUID()` instead of `Date.now()` so two
  sends in the same millisecond can't collide React keys.
- **Frontend (state hardening):** `useAgentChatStream` awaits
  `refetchQueries` then clears pending in the same tick (was
  `invalidateQueries` + 80 ms setTimeout, which caused a one-paint
  flicker when the refetch resolved fast). `useAgentDraft` tracks a
  save-sequence + mountedRef so a slow in-flight save can't overwrite
  newer state and unmount races don't trigger React's "set state on
  unmounted component" warning. Inbox thread strip drives selection
  through a state callback instead of `document.querySelector(...).click()`.
- **Tests:** Added gpt-4o vs gpt-4o-mini and dated-pin regression
  cases to `test_agent_cost_estimation.py` (the longest-prefix-wins
  sort would silently bill the wrong rate if reversed). Added a
  `useAgentChatStream` test that tears a frame across two stream
  chunks (mid-JSON + across `\n\n`) to lock in the buffer-reassembly
  behavior. 77 backend + 82 frontend tests passing.

## [0.8.01] - 2026-05-19

Post-review hardening of the 0.8.0 workspace-scope authz pass. Four
parallel reviewers audited the branch and flagged five Criticals plus
several Mediums that were missed in the original sweep; this release
closes all of them.

### Security (Critical)

- **`api/sprint_tasks.py` — bulk task ops 500'd on the new authz path**.
  `_filter_task_ids_to_workspace` ended with a stray `return sprint`
  (undefined name), so `bulk_assign_tasks`, `bulk_update_status`, and
  `bulk_move_tasks` raised `NameError` for every in-workspace call
  instead of authorizing them. Removed the dead return.
- **`api/reviews.py` — submit/finalize routes missed caller-identity
  checks**. `submit_self_review`, `submit_manager_review`, and
  `finalize_review` accepted any authenticated caller. Added
  `_require_reviewee` (caller must equal `review.developer_id`) and
  `_require_review_manager_or_admin` (caller must equal
  `review.manager_id` or hold workspace `admin`); both return 404 to
  avoid existence oracles.
- **`api/dependencies.py` — story/task dependency mutations had no
  workspace scope**. `update_story_dependency`, `delete_story_dependency`,
  `resolve_story_dependency` and the three task-dependency twins
  loaded by id with `db.get()` and mutated without any tenancy check.
  Added `_load_story_dependency_authorized` and
  `_load_task_dependency_authorized` helpers that resolve the
  dependent resource's workspace, assert active membership, and 404
  on mismatch. Wired into all six routes.
- **`api/email_webhooks.py` — SES SNS Notification path skipped
  signature verification** (WS-082). Only the `TopicArn` was checked
  against the allowlist; the field is attacker-controlled in the body,
  so anyone who knew or guessed an allow-listed ARN could POST forged
  Bounce/Complaint events. Added `verify_sns_message_signature` that
  builds the canonical AWS SNS string-to-sign, validates
  `SigningCertURL` against the AWS SNS host pattern (no SSRF), fetches
  the cert (cached by URL), and RSA-verifies the message envelope.
  Supports SignatureVersion 1 (SHA-1) and 2 (SHA-256).
- **`services/email_webhook_verify.py` — no replay window on SendGrid /
  Mailgun verifiers** (WS-082). A captured signed payload could be
  replayed indefinitely. Added a 300s skew check on both providers,
  matching the mailagent internal-auth middleware.

### Security (Medium)

- **`services/github_task_sync_service.py` — cross-workspace
  `[slug:task-key]` auto-link** (WS-083). `_find_aexy_task` resolved by
  workspace slug alone, so a malicious PR body in repo X (owned by
  workspace A) containing `[victim-workspace:42]` could create a
  `TaskGitHubLink` row pointing at workspace B's task. The lookup now
  requires the resolved task's workspace to have actively adopted the
  mentioning repo (`WorkspaceRepository.is_active`).
- **`api/tracking.py` — four POST endpoints trusted body refs**
  (WS-084). `submit_standup`, `create_work_log`, `log_time`, and
  `report_blocker` accepted `task_id`/`sprint_id`/`team_id` from the
  request body without scoping; the row was stamped with the caller's
  first team's workspace. Replaced with `_resolve_tracking_workspace`
  which derives the workspace from the supplied refs (in
  task → sprint → team priority), rejects bodies that mix refs across
  workspaces, and asserts the caller is an active member of the
  resolved workspace.
- **`api/developer_insights.py` — non-admins received `author_email`
  PII** (WS-085). `list_developer_commits` returned the raw email
  field for every active workspace member. Added `_is_workspace_admin`
  helper that gates the field on owner/admin role; non-admins receive
  `null`.
- **`mailagent/main.py` — empty `internal_secret` failed open in prod**
  (WS-086). When the shared secret was missing, the middleware silently
  passed every request through to handlers. Mailagent now raises
  `RuntimeError` at boot when `environment in {production, staging}`
  and the secret is empty; dev/test continue to pass through with the
  existing warning.
- **`auth/callback/page.tsx` — JWT lingered in URL bar and Referer**.
  The OAuth callback hung onto `?token=…` in the address bar until the
  next navigation. Now scrubbed via `history.replaceState` before any
  token use, mirroring the `/p/[publicSlug]` flow.
- **`/p/[publicSlug]/page.tsx` — public-slug login didn't sync the
  presence cookie**. The page wrote `token` to localStorage but skipped
  `setAuthPresenceCookie()`, reintroducing the redirect-loop class that
  `5895c1da` had fixed for the landing page. Cookie now set inline.

### Security (Low)

- **`lib/authCookie.ts` — presence cookie missing `Secure`**. Added
  `Secure` attribute on HTTPS so the flag isn't sent in cleartext if a
  proxy ever downgrades the connection.
- **`AnalyticsDetailsModal.tsx` — external commit links missing
  `noopener`**. `rel="noreferrer"` only; added `noopener` for explicit
  tabnabbing defense (modern browsers imply it, but the codebase
  convention is to set both).

### Frontend

- **i18n compliance on `AnalyticsDetailsModal.tsx`**. Per CLAUDE.md's
  rule that all user-facing strings in new components must use
  `useTranslations()`, the modal's ~30 hardcoded English strings (tab
  labels, table headers, loading/empty states, etc.) are now driven
  by the new `insights.details` namespace in `messages/en` +
  `messages/hi`. The same pass i18n'd three new strings in
  `insights/page.tsx` (Sources / Profile / Show inactive / "still
  loading" toast).

### Tests

- **`tests/unit/test_dependency_authz.py` (new)** — six cases pinning
  the story- and task-dependency loader helpers: active member passes,
  cross-workspace caller gets 404, missing id gets 404, removed-status
  member is rejected.
- **`tests/unit/test_email_webhook_verify.py`** — four SNS signature
  tests (attacker cert URL rejected, valid sig accepted, tampered
  payload rejected, dev-mode short-circuit) plus replay-window tests
  for SendGrid and Mailgun. Refreshed the Mailgun happy-path fixtures
  to use current timestamps.
- **`tests/unit/test_github_issue_auto_link.py`** — `_adopt_repo`
  fixture that wires `Repository` + `WorkspaceRepository` for the test
  workspace; new `test_cross_workspace_slug_injection_is_blocked`
  exercising the WS-083 fix, plus `test_shared_adoption_still_links`
  pinning that shared-repo adoption still resolves correctly to the
  workspace whose slug was used.

## [0.8.0] - 2026-05-19

Code review cleanup of work that originated on the long-running
`agent-upgrade` branch (compliance/tracking/automation/assessment
modules). Three reviewers audited the code as it currently sits on
`main`; this release fixes the verified Critical and High findings.

### Security (workspace-scope authz)

- **`api/tracking.py` — Slack channel-config endpoints**. `GET /channels`,
  `POST /channels`, `PATCH /channels/{config_id}`, `DELETE /channels/{config_id}`
  now verify the caller is a member of the target workspace (`viewer` for
  read, `member` for write). Without it, an authenticated user in
  workspace A could enumerate, create, edit, or delete channel configs
  in workspace B.
- **`api/tracking.py` — team/sprint standup reads**.
  `GET /standups/team/{team_id}` now fetches the team and asserts
  workspace membership; `GET /standups/summary/{sprint_id}` does the
  same via the sprint's team. Previously any authed user could read any
  team or sprint's standup aggregate by guessing IDs.
- **`api/tracking.py` — task-scoped reads**. `GET /logs/task/{task_id}`
  and `GET /time/task/{task_id}` now fetch the task and verify the
  caller is a member of the task's workspace before returning logs or
  time entries.
- **`api/tracking.py` — blocker mutations**. `PATCH /blockers/{id}/resolve`
  and `PATCH /blockers/{id}/escalate` now require workspace
  membership (`member` role) before allowing state transitions.
  Previously any authed user could resolve or escalate any blocker by
  guessing its UUID.
- **`api/tracking.py` — `GET /blockers/active`**. Without an explicit
  `team_id`, the endpoint was returning blockers across all
  workspaces. It now scopes the query to workspaces the caller is a
  member of (`WorkspaceService.list_user_workspaces`); if `team_id`
  is supplied, it verifies workspace membership for that team first.
- **`api/assessments.py` — workspace-scope authz across all authed
  endpoints**. Added two helpers:
  - `_assert_workspace_access(db, organization_id, developer_id, role)`
    for endpoints that take an `organization_id` directly
    (`POST /`, `GET /`, `GET /organization/{id}/metrics`).
  - `_assert_assessment_access(db, assessment_id, developer_id, role)`
    that fetches the assessment and asserts workspace membership,
    returning the loaded `Assessment`.
  Applied to: `create_assessment`, `list_assessments`, `get_assessment`,
  `update_assessment`, `delete_assessment`, `clone_assessment`,
  `get_wizard_status`, all five `step/N` endpoints, `list_topics`,
  `suggest_topics`, `list_questions`, `create_question`, `update_question`,
  `delete_question`, `generate_questions`, `list_candidates`,
  `add_candidate`, `import_candidates`, `remove_candidate`,
  `resend_candidate_invite`, `get_email_template`, `update_email_template`,
  `pre_publish_check`, `publish_assessment`, `get_assessment_metrics`,
  `get_organization_metrics`, `reevaluate_candidate`,
  `get_candidate_details`. Public-token endpoints
  (`/public/{public_token}/*`) are out of scope (intentionally
  unauthenticated). Previously any authed developer could read or mutate
  assessments in any organization by guessing UUIDs.

### Fixed

- **N+1 query in `get_team_tracking_dashboard`**
  (`backend/src/aexy/api/tracking.py`). The per-member developer fetch
  loop was issuing one `SELECT Developer WHERE id = ?` per team member;
  it now batch-loads all developers in a single `IN` query and indexes
  by id.
- **11 automation activities silently using the 5-minute default
  timeout**. `temporal/dispatch.py` `ACTIVITY_CONFIG` now declares:
  `check_missed_standups`, `check_time_entry_thresholds`,
  `check_stale_blockers`, `detect_blocker_patterns`,
  `check_time_anomalies`, `check_standup_participation`,
  `check_approaching_due_assignments`, `check_overdue_assignments`,
  `check_expiring_certifications`, `check_expired_certifications`,
  `check_bulk_compliance_rates` — each with `STANDARD_RETRY` and a
  10-minute timeout to accommodate scheduled detection activities that
  loop over active workspaces.

### Removed

- Unused imports in `backend/src/aexy/api/tracking.py`:
  `from typing import Any` and
  `from aexy.services.automation_service import dispatch_automation_event`
  (dispatch is routed through `services/tracking_events.py` helpers).
  `WorkspaceService` is now imported at module scope.

### Not in scope (filed as follow-up work)

- Stub trigger handler implementations for `standup.streak` and
  `training.bulk_overdue` — need product/design input on thresholds
  before implementing.
- i18n migration for `NodePalette.tsx` and the reminder/tracking
  pages — separate, larger effort that needs translator coordination.
- Test coverage for `tracking_events.py`,
  `tracking_compliance_config.py`, `compliance_service.py`,
  `hiring_intelligence.py`, `assessment_service.py`.

## [0.7.91] - 2026-05-19

Replace manual GitHub issue/PR linking with mention-based auto-linking
via `[workspace-slug:task-key]` in PR or issue title/body.

### Added

- **Issue webhook now auto-links tasks**. `api/webhooks.py` routes
  `issues` events (opened/reopened/edited/closed) through
  `GitHubTaskSyncService.process_issue`, which parses the issue title +
  body for `[slug:key]` mentions and upserts a `TaskGitHubLink` row per
  match with `is_auto_linked=True`. Works from any repo — the slug
  resolves against `Workspace.slug`, the number against the
  workspace-wide `task_key`.
- **Edit re-sync**. On `pull_request.edited`/`synchronize` and
  `issues.edited`, auto-links whose mention is no longer present in the
  fresh body are deleted. Manual edits to the GitHub source are now the
  way to add or remove links.
- **`link_issue_manually` is now upsert**. If a row already exists for
  `(task_id, repo, number)`, its cached `github_issue_title`/`state`/`url`
  refresh when fresher values arrive (issue renamed on GitHub →
  link metadata updates).
- **Copy-mention chip** in the task modal showing `[slug:task_key]`
  inline help so users know what to paste into a PR/issue body.

### Removed

- **Manual link POST endpoints** in both `api/sprint_tasks.py` and
  `api/project_tasks.py`:
  `POST /github-links/pull-requests` and `POST /github-links/issues`.
- **Orphan search endpoints** that only powered the manual dropdowns:
  `GET /github/pull-requests`, `GET /github/issues`,
  `GET /{task_id}/github-links/issue-repositories` (both scopes).
- **Manual linking UI** in `board/page.tsx` — the PR + issue
  search dropdowns, the manual `owner/repo#123` entry, and ~300 lines
  of supporting state/queries/mutations.
- **Client functions** `linkPullRequest`, `linkGitHubIssue`,
  `searchPullRequests`, `searchGitHubIssues`, and
  `getGitHubIssueRepositoryContext` from `lib/api.ts` (sprint and team
  scopes). `getTaskGitHubLinks` and `unlinkGitHubLink` retained.

### Tests

- `tests/unit/test_github_issue_auto_link.py` — process_issue creates
  one auto-linked row per mention, case-insensitive slug match,
  hyphens in slug, edit-then-remove drops the stale row, edit refreshes
  cached title/state, `closed`/`reopened` refresh state without
  pruning (only `edited` is allowed to remove mentions).

## [0.7.90] - 2026-05-19

Fix duplicate developer rows in team insights, plus auto-hide
zero-contribution members.

### Fixed

- **Ghost dedup**: `compute_team_distribution` now takes a `member_ids`
  list distinct from the activity-expanded `developer_ids`, so
  `_build_developer_alias_map` can actually map ghost ids onto their
  canonical workspace-member rows. The prior code passed the same
  list as both args, which made the `NOT IN` filter exclude the
  ghosts we wanted to bridge — producing two rows for "Ritesh
  Biswas" (active vs ghost-with-personal-email) on the team insights
  endpoint.
- **`identity_key` fallbacks** when a developer has no
  `GitHubConnection`:
  1. Pull `Commit.author_github_login` (most-frequent value per
     developer) and use it as the github login key.
  2. Parse `<id>+<login>@users.noreply.github.com` out of the
     developer's email. Together these collapse the two Mobashir
     ghost rows that shared the same GitHub login but were never
     linked to a Connection row.
- Aliased ghost ids are now removed from the display set so
  `_rollup_by_identity` never sees a ghost+canonical pair — fewer
  reliances on the identity_key tie-breaker.

### Added

- `compute_team_distribution(..., hide_zero_contribution=False)`
  optionally filters out members whose four counters (commits, PRs
  merged, lines changed, reviews given) are all zero in the window.
- `GET /workspaces/{id}/insights/team?include_inactive=false`
  (default) — applies the filter. `?include_inactive=true` restores
  the full roster.
- Frontend toggle "Show inactive" on the Team Insights page
  (`insights/page.tsx`) wired through `useTeamInsights` and the
  generated `getTeamInsights` client.
- Regression tests for: ghost-via-email collapse, ghost-via-commit-
  author-github-login collapse, and zero-contribution filter.

### Known limitation

- An active workspace member with neither a `GitHubConnection` nor
  any name/email overlap with their ghost rows cannot be linked
  automatically. The three "Mobashir" rows in the original example
  collapse from 3 → 2 (two ghosts merge), but the active member
  `mobashir.r@bimaplan.co` stays separate until either an admin
  links their GitHub login, or a manual "merge identities" action
  is added.

## [0.7.89] - 2026-05-19

Post-review hardening for the 0.7.82-0.7.88 workspace-scope leak audit.
The fixes were correct but a code review surfaced residual fail-open
edges and missing test coverage; this release closes those.

### Security

- **Webhook signature verification is now fail-closed by default**
  (`services/email_webhook_verify.py`). A new
  `webhooks_require_signing` setting (default `True`) replaces the
  prior behavior where each provider returned `True` when its env var
  was missing. SES, SendGrid, Mailgun, and Postmark all reject events
  outright when the required key isn't configured. Local development
  can flip the flag off to fall back to the old accept-with-warning
  behavior; production must keep the default.
- **Mailagent path-bypass closed** (`mailagent/middleware.py:44`).
  `_is_public_path` previously OR'd in `path.startswith(p)` (no
  trailing slash), so `/healthcheck-evil` could skip HMAC auth on the
  way to a route named with a public-prefix prefix. Tightened to
  exact-match OR `startswith(p + "/")`.
- **OAuth interceptor catches keyboard and programmatic navigation**
  (`frontend/src/lib/oauth.ts`). The 0.7.85 implementation only
  listened on `mousedown`, breaking OAuth login for keyboard users
  (Tab + Enter on a focused login link) and any JS-driven navigation
  (`window.location.assign("/auth/github/login")`). Now also installs
  a capture-phase `keydown` listener and patches
  `window.location.{assign,replace}` + the `href` setter so the
  inflight marker is set on every navigation vector.
- **Public booking enumeration rate-limit applied to every GET**
  (`api/booking/public.py`). The 0.7.86 fix only guarded the workspace
  lookup endpoint; the teams/team-by-id/event-type/slots endpoints
  inherit the same throttle now via router-level `Depends`.
- **Frame-ancestors regex tightened** (`frontend/next.config.js`).
  Negative-lookahead now anchored to `embed/` so `/embedded-*` paths
  still receive `X-Frame-Options: DENY` and
  `frame-ancestors 'none'` instead of falling through both rules.

### Added

- `core/workspace_auth.py` — centralizes the
  `assert_active_member(db, workspace_id, developer_id)` and
  `assert_resource_in_workspace(db, model, id, workspace_id)`
  helpers used across the 0.7.82-0.7.88 fixes. Call sites in
  `app_access.py` and `manager_learning.py` switched to the helpers;
  remaining inline copies will migrate opportunistically.
- Regression tests:
  - `backend/tests/unit/test_email_webhook_verify.py` — pins the
    fail-closed default for all four providers and the SubscribeURL
    SSRF guard.
  - `backend/tests/unit/test_workspace_auth.py` — pins membership
    checks (active vs pending/suspended/removed) and the
    resource-in-workspace mismatch case.
  - `mailagent/tests/test_internal_auth_middleware.py` — pins the
    public-path matcher against prefix-bypass paths and the HMAC
    sign/verify wire-format round-trip between backend and mailagent.
  - `frontend/src/test/oauth.test.ts` — pins `safeInternalPath`
    against open-redirect inputs and round-trips
    `stashPostLoginRedirect`.

### Changed

- Middleware redirect to `/?next=...` is now consumed.
  `frontend/src/app/page.tsx` stashes the (validated) `next` path in
  `sessionStorage` for the OAuth flow, and `useSetToken` honours it
  after onboarding completes. Open-redirect protection enforced by
  `safeInternalPath`.

## [0.7.88] - 2026-05-19

Closes the last 9 `suspect` rows in the workspace-scope leak tracker.
Five close as fixed with concrete patches; four close as verified-`ok`
or covered by prior fixes. Tracker is now zero open across every
severity.

### Security

- **App access** (WS-053) — `update_member_access` and
  `apply_template_to_member` (`api/app_access.py`) now verify the
  target `developer_id` is an active `WorkspaceMember` of the route's
  workspace, and that the `applied_template_id` belongs to that
  workspace (or is a system template with `workspace_id` NULL).
- **Manager learning** (WS-055) — `create_learning_goal`
  (`api/manager_learning.py`) verifies `data.developer_id` is an
  active `WorkspaceMember` of `current_workspace_id` before stamping
  a goal. Approval/budget routes follow the existing-goal chain so
  they inherit the same scope.
- **Custom reports** (WS-049) — `ReportBuilderService.list_reports`
  no longer surfaces `is_public=True` reports cross-tenant in the
  default listing. Public reports now require an explicit matching
  `organization_id` filter to appear. The reports route doesn't
  pass `organization_id` today, so the default listing returns the
  caller's own reports only.
- **Tracking helper** (WS-020) — `get_developer_team`
  (`api/tracking.py`) now accepts an optional `workspace_id` and
  constrains the team join via `Team.workspace_id`. Existing call
  sites keep historical "first team found" semantics; workspace-
  prefixed routes can opt in.

### Documentation

- Tracker rows WS-015 (exports), WS-016 (code insights), WS-017
  (sprint analytics), WS-018 (public renderers), WS-019 (learning
  services) closed as verified-`ok` or covered by prior fixes
  (WS-009, WS-039, WS-041, WS-051, WS-055, WS-060, WS-061, WS-066,
  WS-067, WS-068, WS-074). Each row now records the evidence used to
  close it.

## [0.7.87] - 2026-05-19

Closes the seven `Medium`/`Low` confirmed rows in the workspace-scope
leak tracker (WS-013, WS-065, WS-069, WS-070, WS-075, WS-082, WS-083).

### Security

- **Leave approver lookup** (WS-013) —
  `LeaveRequestService._find_approver` now joins `Team` and constrains
  `Team.workspace_id == workspace_id`, so a developer's team lead in
  another workspace can no longer become the approver on this
  workspace's leave requests.
- **Roadmap requests** (WS-065) — added `_check_roadmap_rate_limit`
  (Redis sliding window: 10 creates / 50 votes per developer per
  hour) on `public_projects.create_roadmap_request` and
  `vote_roadmap_request`. Caps the spam vector while keeping the
  public roadmap open to any authenticated developer.
- **One-click unsubscribe** (WS-069) — `/u/{token}` now serves a
  confirmation page on GET and only mutates subscriber state on POST.
  Email prefetchers and link-checkers no longer trigger unsubscribes
  while mail clients implementing RFC 8058's `List-Unsubscribe-Post`
  still work.
- **Email click tracker** (WS-070) — `_record_click_event` resolves
  the `?r=<recipient_id>` query parameter and drops the attribution
  if `recipient.campaign_id != link.campaign_id`. The click is still
  recorded at the link level; only the forged per-recipient
  attribution is rejected.
- **Webhook rate limits** (WS-082) — `_enforce_webhook_rate_limit`
  (Redis sliding window) applied to `/webhooks/github` (600 per IP
  per minute) and `/webhooks/automations/{id}/trigger` (60 per
  automation per minute). Caps Temporal workflow / LLM token spam.
- **Webhook source-IP capture** (WS-083) —
  `/webhooks/automations/{id}/trigger` now records `source_ip` via
  the shared `get_client_ip` helper instead of `request.client.host`,
  so the captured IP honours `X-Forwarded-For` behind a load
  balancer.
- **`(app)/layout.tsx`** (WS-075) — adds `queryClient.clear()` before
  the `isResolved && !isAuthenticated` redirect fires, eliminating
  the brief window during a cross-tab logout where ghost-cached
  React Query workspace data could be visible. The workspace-scoped
  providers (`ChatWebSocketProvider`, `WorkspaceSearchPalette`,
  `FloatingChatWidget`) were already gated on
  `isResolved && isAuthenticated`.

## [0.7.86] - 2026-05-19

Closes the remaining `High` rows in the workspace-scope leak tracker
(WS-060, WS-061, WS-067, WS-068) plus seven related Medium/Low rows on
the public/embed surface. Tracker now has zero open `Critical` or `High`
items.

### Security

- **Public booking surface** (`booking/public.py`) —
  `get_workspace_teams`, `get_team_info`, and the booking confirmation
  response no longer leak member emails. Only `id`/`name`/`avatar_url`
  is exposed. A new Redis-backed per-IP rate limit (30/min) gates
  `GET /public/book/{workspace_slug}` to make slug enumeration costly.
  Closes WS-060, WS-064.
- **Public project surface** (`public_projects.py`) — added
  `_project_team_ids` helper. Backlog, board, stories, goals, roadmap,
  sprints, and timeline endpoints now intersect with `ProjectTeam` /
  `GoalProject` so a public project never leaks data from the other
  projects in the same workspace. `_fetch_sprints_with_stats` accepts
  a `team_ids` parameter; all callers now pass it. No schema migration
  required. Closes WS-061.
- **Calendar OAuth** (`booking/calendars.py`) — `start_oauth` signs
  `settings.frontend_url` into state instead of the request `Origin`
  header. Callback always redirects to `settings.frontend_url`,
  ignoring any legacy signed value. Open-redirect via OAuth state is
  closed. Closes WS-063.
- **Booking webhook admin CRUD** (`booking/webhooks.py`) — added
  `_require_workspace_admin` helper applied to every route
  (list/create/get/secret/update/delete/test). An authenticated user
  from workspace A can no longer read/modify webhooks (or their HMAC
  secrets) for workspace B. Closes WS-062.
- **Public table share links** (`public_tables.py`,
  `models/crm.py`) — added `TableShareLink.allowed_origins` column
  (migration `backend/scripts/migrate_table_share_link_allowed_origins.
  sql`) plus `_origin_matches` helper. Every `/public/tables/{token}*`
  route now rejects requests whose `Origin` header isn't in the link's
  allowlist (NULL/empty preserves legacy behaviour). Closes WS-066,
  WS-074.
- **Assessment public-take** (`assessment_take.py`) —
  `get_assessment_by_public_token_or_id` no longer accepts the
  assessment UUID as a fallback for the public token; only
  `public_token` matches. Candidate creation in `start_assessment`
  goes through a Redis sliding-window rate limit
  (`_check_candidate_create_rate_limit`): 5 candidates per IP per hour
  and 50 per assessment per hour. Email-verification flow remains
  backlog. Closes WS-067 fully and WS-068 partial.
- **RSVP** (`booking/booking_service.py`) — `respond_to_rsvp` is now
  single-shot: refuses to process an attendee that already has
  `responded_at` set, and rotates `response_token` after the first
  use. A leaked email link can no longer be replayed to flip the
  response later. Closes WS-076.

## [0.7.85] - 2026-05-19

Closes the remaining four `Critical` and most of the `High` rows in the
workspace-scope leak tracker: frontend OAuth + framing hardening,
mailagent isolation, automation webhook signing, and per-provider email
webhook signature verification.

### Security

- **Automation webhook HMAC** (WS-056) — `POST /webhooks/automations/
  {id}/trigger` now requires `X-Aexy-Signature: sha256=<hex>` over the
  raw body, verified with a per-automation HMAC secret derived as
  `HMAC(settings.secret_key, "automation:" + automation_id)`. Lets us
  ship signature verification without a `webhook_secret` column
  migration on `CRMAutomation`; the UI surfaces this derived value as
  the automation's webhook secret. `record_id` is now constrained to
  `CRMRecord.workspace_id == automation.workspace_id` before loading.
- **Email provider webhooks** (WS-057, WS-058, WS-081) — new
  `services/email_webhook_verify.py` implements:
  - SendGrid: ECDSA over `timestamp + body` against the configured
    public key (`X-Twilio-Email-Event-Webhook-Signature`).
  - Mailgun: HMAC over `timestamp + token` with the signing key.
  - Postmark: HTTP Basic Auth against the configured `user:pass`.
  - SES (via SNS): topic-ARN allowlist plus a hostname check on the
    SNS `SubscribeURL` that restricts auto-confirmation to
    `sns.<region>.amazonaws.com` (fixes the prior blind-SSRF).
  Each provider handler now resolves the workspace from the
  signature-verified sender via `SendingDomain.domain` lookup first,
  and only falls back to the legacy `message_id` lookup when no
  matching sending domain exists. New settings:
  `sendgrid_webhook_public_key`, `mailgun_webhook_signing_key`,
  `postmark_webhook_basic_auth`, `ses_sns_topic_arn_allowlist`.
- **Mailagent zero-auth** (WS-077, WS-078, WS-079, WS-080) — new
  `mailagent/middleware.py` `InternalAuthMiddleware` requires
  `X-Mailagent-Signature: HMAC-SHA256(internal_secret, timestamp + "." +
  body)` on every non-public route with a ±5min replay window. The
  Aexy backend's `mailagent_client._request` signs every outbound call
  when `settings.mailagent_signing_secret` is configured. CORS now
  only mounts when `cors_allowed_origins` is set (default empty —
  server-to-server only), and `allow_credentials` is False. `/send/
  email` validates `from_address.domain` against the verified
  `mailagent_domains` catalog and strips arbitrary headers down to a
  whitelist of threading/unsubscribe ones. Per-workspace
  `EmailProvider` isolation (full WS-079) is parked as a backlog
  item — the unauthenticated-access vector is now closed.
- **Frontend OAuth callback** (WS-071b) — `/auth/callback` now calls
  `consumeOAuthInflight()` and rejects the URL token (redirects to
  `/?error=oauth_state_missing`) when the marker isn't present. A new
  document-level `OAuthInflightTagger` (mounted in `providers.tsx`)
  watches mousedown events for any `<a href>` matching
  `/auth/<provider>/(login|connect|connect-crm)` and sets the marker
  just before navigation. Catches the inline anchor login buttons in
  `app/page.tsx` and `LandingHeader.tsx` without modifying every
  callsite. The matching `/p/[publicSlug]` handler (WS-071) is
  refactored to use the same shared `lib/oauth.ts` helper.
- **Frontend middleware auth gate** (WS-072) — `middleware.ts` now
  redirects auth-required path prefixes to `/?next=<path>` when the
  `aexy_authed` presence cookie is absent. The cookie is mirrored from
  `localStorage["token"]` by `useAuth` on mount and at
  `setToken`/`logout`. The JWT itself remains in localStorage and is
  still validated by the API; the cookie just prevents the SSR app
  shell from leaking placeholders to logged-out users.
- **Frame-ancestors / clickjacking** (WS-073) — `next.config.js` now
  configures `headers()`: `X-Frame-Options: DENY` + CSP
  `frame-ancestors 'none'` everywhere except `/embed/*` (which gets
  `frame-ancestors *` until per-link origin allowlisting moves to the
  API side under WS-074). Also adds `Referrer-Policy:
  strict-origin-when-cross-origin` and `X-Content-Type-Options:
  nosniff` site-wide.

## [0.7.84] - 2026-05-19

Closes 24 `High` and `Medium` ID-forgery rows in the workspace-scope leak
tracker (WS-010..014, WS-027..041, WS-044..047, WS-050..052, WS-054).
Each fix follows the same shape: load the referenced resource by id and
assert its `workspace_id` matches the route's workspace before delegating
to the service.

### Security

- **CRM notes & activities** (`crm.py`) — note CRUD and per-record
  activity list now verify `CRMRecord.workspace_id == workspace_id`
  before exposing sub-resources. Stops `POST /workspaces/A/crm/records/
  <B_record_id>/notes`. Closes WS-027, WS-028.
- **Data tables / forms** (`tables.py`, `forms.py`) — `list_fields`
  now 404s on cross-workspace tables; `delete_field` and
  `reorder_fields` verify form-in-workspace and field-in-form before
  mutating. Closes WS-029, WS-030.
- **AI agents** (`agents.py`, `agent_policies.py`,
  `automation_agents.py`) — added `_assert_agent_in_workspace` helper
  applied to all inbox actions (get/reply/escalate/archive/process),
  routing-rule delete, agent-policy create, and automation-agent
  trigger config. Routing-rule delete additionally verifies the rule
  belongs to the agent. Closes WS-031..034.
- **Goals / Epics / Stories / Releases / Sprint Tasks** — every
  cross-resource link operation now verifies the target shares the
  workspace: `link_project`, `link_epic`, `add_tasks_to_epic`,
  `add_tasks_to_story`, `add_sprint_to_release`,
  `add_stories_to_release`, and sprint-task bulk_assign/status/move.
  Sprint-task `bulk_move` also requires the target sprint to share
  the workspace. The `get_sprint_and_check_permission` helper now
  returns the sprint object so call-sites can scope queries to it.
  Closes WS-035..039.
- **On-call** (`oncall.py`) — `verify_workspace_access` now accepts
  `team_id` and asserts `Team.workspace_id == workspace_id`. All call
  sites updated. Closes WS-040.
- **Sprints by team** (`sprints.py`) — `list_sprints` and
  `get_active_sprint` verify `Team.workspace_id == workspace_id`.
  Closes WS-041.
- **Team calendar** (`team_calendar.py`) — three GET endpoints now
  require workspace viewer-role membership and (when `team_id` is
  supplied) verify the team's workspace. Closes WS-010.
- **Tracking team dashboard** (`tracking.py`) —
  `get_team_tracking_dashboard` now resolves the team's workspace and
  requires caller viewer-role before reading standups/blockers/time
  logs. Closes WS-011.
- **Dependency APIs** (`dependencies.py`) — added `_require_member_of`
  helper. Caller must be a member of the dependent story/task's
  workspace before creating or listing dependencies. Also fixed a
  pre-existing `session.add(...)` NameError on both `create_story_
  dependency` and `create_task_dependency`. Closes WS-012.
- **Chat** (`chat_service.py`, `chat.py`) — `update_message` and
  `delete_message` now accept `workspace_id` and constrain the lookup
  via a `ChatChannel.workspace_id` join. A sender who is a member of
  multiple workspaces can no longer edit a message in workspace B by
  hitting workspace A's route. Closes WS-014.
- **Leave management** (`leave.py`) — added generic
  `_assert_resource_in_workspace` helper. Applied to update/delete of
  `LeaveType` (admin-only), `LeavePolicy` (admin-only), `Holiday`
  (admin-only), and leave-request approve/reject/cancel/withdraw.
  `get_developer_balance` requires admin and verifies target is a
  workspace member; `get_team_balances` verifies `Team.workspace_id`.
  Closes WS-044..047.
- **Google email-to-record link** (`google_integration.py`) —
  `link_email_to_record` now verifies the CRM record belongs to the
  caller's workspace before inserting the link. Closes WS-050.
- **Entity activity / comments** (`entity_activity.py`) — added
  `_entity_model` mapping plus `_assert_entity_in_workspace` helper
  applied to both `create_activity` and `add_comment`. Validates the
  10 most common workspace-scoped entity types (task/story/epic/
  release/goal/crm_record/project/sprint/form/leave_request);
  remaining types continue to be stamped pending follow-up. Closes
  WS-051 (partial — see helper note).
- **Reminders** (`reminders.py`) — control-owner update/delete and
  domain-team-mapping delete now verify the target's `workspace_id`
  matches the route. Closes WS-052.
- **Planning poker** (`planning_poker.py`) —
  `get_poker_session_state` and the WebSocket entrypoint now resolve
  the sprint and require viewer-role membership of
  `sprint.workspace_id`. WebSocket rejects with 4003/4004 on miss.
  Closes WS-054.

## [0.7.83] - 2026-05-19

Continues the workspace-scope leak audit by closing four more `Critical`
rows from the tracker: three legacy unauthenticated APIs and the GitHub
webhook fail-open.

### Security

- Legacy analytics API (`/analytics/*`) — every endpoint now binds
  `current_user_id` (was discarded as `_`) and runs each request's
  `developer_ids` (or path `developer_id`) through a
  `_require_developers_visible` check that requires every target to
  share an active workspace with the caller. Rejects (403) the whole
  request rather than silently dropping invisible developers. Closes
  WS-007.
- Hiring intelligence API (`/hiring/*` section 1) — added
  `get_current_developer` to every route in the unauth section
  (team-gaps, bus-factor, roadmap-skills, requirements list/create/get
  /jd/rubric/scorecard/status). Helpers `_resolve_team_workspace_or_403`,
  `_require_developers_visible`, `_require_requirement_workspace_member`
  enforce workspace membership for the supplied `team_id` /
  `organization_id` / `requirement_id`. JD generation, rubric
  generation, requirement create/status update now require workspace
  admin role. Closes WS-008.
- Learning paths API (`/learning/*`) — all 16 endpoints require
  authentication. Personal endpoints (list paths, generate path,
  stretch tasks) require the caller to be the target developer or
  hold admin role in a workspace the developer is a member of.
  Path-scoped endpoints (get/regenerate/progress/milestones/activities
  /recommended courses) use `_require_path_access` to resolve owner
  via the path itself. Pause/resume/abandon are owner-only.
  Team-scoped overview and recommendations require active membership
  in the team's workspace. Closes WS-009.
- GitHub webhook (`/webhooks/github`) — fail-closed when a webhook
  secret is configured: the `X-Hub-Signature-256` header is now
  mandatory (401 if missing) and verified. When no secret is
  configured the route returns 503 unless `settings.debug` is True;
  prevents an empty/typoed env-var from turning ingestion into an
  open endpoint. Closes WS-059.

## [0.7.82] - 2026-05-19

This release closes nine `Critical` authentication-bypass issues uncovered
by a platform-wide workspace-scope leak audit. A third pass added 28 new
tracker rows (WS-056..WS-083) covering the frontend, public/embed
surfaces, mailagent, and webhook ingress, with one same-day fix applied
to a frontend session-hijack vector.

### Security

- Notifications API (`/notifications/*`) now binds the developer
  identity to the JWT via `Depends(get_current_developer_id)` on every
  one of its 19 endpoints. The previous `developer_id: str = Query(...)`
  parameter (used as authentication by every list/preference/push/admin
  route) is removed. Closes WS-042.
- Slack integration (`/slack/*`) — every admin-surface route now
  requires authentication and verifies the caller is an active
  owner/admin of the integration's workspace via a shared
  `require_integration_admin` helper. OAuth `/install` and `/connect`
  derive the installer id from the current user, not a query
  parameter. The signed webhook routes (`/commands`, `/events`,
  `/interactions`) and the OAuth `/callback` remain public as
  intended. Closes WS-043.
- Reviews API (`/reviews/*`) — the entire surface (~28 endpoints
  covering cycles, individual reviews, work goals, peer requests,
  contribution summaries) now requires `Depends(get_current_developer)`
  and enforces resource-appropriate authorization: cycle CRUD requires
  workspace admin; individual-review reads require reviewee / manager
  / peer-reviewer / workspace-admin; goal edits require ownership; peer
  request actions require the actual party. Closes WS-021 through
  WS-026.
- Predictive analytics (`/predictions/*`) now binds `current_user_id`
  (was discarded as `_`) and requires the caller to share an
  active workspace with the target developer at admin role for
  attrition / burnout / trajectory / insights endpoints. Team-health
  POST verifies admin permission in the supplied `team_id`'s
  workspace, or falls back to per-developer visibility. Closes WS-048.
- Frontend public project page (`/p/[publicSlug]`) no longer silently
  writes a URL `?token=` query parameter into `localStorage["token"]`.
  Token consumption now requires a one-shot `oauthInflight`
  sessionStorage marker set by the page's own OAuth login button
  immediately before navigating to the provider. Without that marker
  the token is stripped from the URL and discarded. Closes WS-071; the
  residual `/auth/callback` variant is tracked as WS-071b.

### Documentation

- Updated `docs/workspace-scope-leak-tracker.md` with 28 new findings
  (WS-056..WS-083) covering: cross-workspace CRMRecord pumping through
  the unauthenticated automation webhook (WS-056), every email
  provider webhook lacking signature verification (WS-057), an SSRF
  in the SES `SubscribeURL` auto-confirm flow (WS-058), GitHub
  webhook fail-open when no secret configured (WS-059), public
  project endpoints returning entire workspace's data rather than
  project-scoped data (WS-061), assessment public-token bypass
  (WS-067), Candidate fan-out without verification (WS-068),
  mailagent's zero-auth admin surface (WS-077), and cross-tenant
  event injection through `message_id` lookup (WS-081). Each existing
  fixed row was relabelled with file:line evidence pointing at the
  patch.

## [0.7.81] - 2026-05-19

This release hardens analytics authorization, scopes repository insights
strictly to adopted workspace repos, and adds an evidence drill-down on
the team insights page.

### Added

- Added an `AnalyticsDetailsModal` on the team insights page with
  Summary / Sources / Commits tabs surfacing the rows behind each
  aggregate. A workspace-admin-only Raw tab exposes the underlying
  JSON for debugging.
- Added `commits_synced`, `prs_synced`, `reviews_synced` to the
  workspace repository response, overlayed from the adopter's
  `DeveloperRepository` row so the catalog and analytics agree on sync
  state during the sync-pipeline migration.

### Changed

- Repository insights now intersect a workspace member's commits and PRs
  against the workspace's adopted-repo allow-list, so a member's
  personal or open-source contributions no longer leak into team-level
  insights.
- Team insights now refuse requests from non-active workspace members.
  Removed and suspended members keep their historical attribution but
  cannot keep calling analytics endpoints.
- Project and sprint PR search and the GitHub task sync explicitly scope
  by `WorkspaceRepository.workspace_id`, making the cross-workspace
  guarantee a query invariant instead of relying on data invariants.

### Security

- Closed six unauthenticated reads in `/intelligence/team/{workspace_id}`
  endpoints (burnout, expertise, collaboration, collaboration graph,
  complexity, technology) that previously returned data when the caller
  was not a workspace member.
- Gated the analytics modal Raw tab behind workspace admin so commit
  author emails are not exposed to non-admin viewers.
- Workspace-member-based authorization now uniformly requires active
  membership. A teammate marked as "left" keeps their historical
  attribution but can no longer read workspace notification settings,
  AI code insights, role-gated resources via `is_owner`, billing
  fallback workspaces, or per-app permission paths. Affects
  `notifications.py`, `code_insights.py`, `workspace_service.is_owner`,
  `billing.py` workspace selection, and `app_access_service` member
  lookup (which protects four downstream config callsites).

### Fixed

- Fixed a `NameError` in the project PR search endpoint where the team
  variable was bound in the wrong function.

## [0.7.80] - 2026-05-19

This release improves developer identity handling in insights and adds
soft member offboarding for workspaces.

### Added

- Added a developer ghost dedupe utility for merging name-variant ghost
  contributors into canonical workspace members after safe dry-run review.
- Added workspace member status toggles so admins can mark teammates as
  left and restore them later without deleting membership history.
- Added member identity metadata to team insights responses, including
  email, GitHub login, avatar, identity key, and membership status.

### Changed

- Team insights now roll up duplicate contributor rows by identity and
  compute per-member averages from the rolled-up contributor set.
- The compare page now deduplicates remaining identity twins, supports
  search across identity fields, and hides past or external contributors
  behind explicit toggles.
- Organization settings can show past members and sorts removed members
  below active teammates.

## [0.7.79] - 2026-05-18

This release improves the employee-facing review experience and reuses
the peer-reviewer invitation flow across manager and self-nomination
surfaces.

### Added

- Added `/reviews/my-reviews/[reviewId]` so employees can open their own
  review, submit self-review notes, nominate peer reviewers when allowed,
  track peer-review request status, and acknowledge completed manager
  reviews.
- Added a shared `InvitePeerReviewersModal` that supports both manager
  assignment and employee self-nomination modes while preventing duplicate
  active reviewer invites.
- Added direct “Open your review” CTAs from the reviews dashboard and
  review cycle detail page when the current user is enrolled in the
  active cycle.

### Changed

- Replaced the route-local peer reviewer assignment modal with the shared
  review component.
- Refined review page copy and routing so participants land on their own
  actionable review surface instead of the admin-oriented cycle view.

## [0.7.78] - 2026-05-18

This release resolves frontend TypeScript drift across app surfaces and
centralizes repeated marketing-page icon tuple types.

### Added

- Added shared landing-page marketing types for icon rows and capability
  cards so AI Company OS, AI Agents, CRM, and GTM Intelligence pages can
  reuse one typed tuple shape.

### Changed

- Updated frontend API types to match current backend response shapes for
  workspaces, plans, reviews, OKRs, campaigns, tables, agents, GTM,
  planning poker, chat, and analytics payloads.
- Adjusted React 19 ref and JSX namespace usage, Recharts formatter
  signatures, cloneElement icon typing, and fixture annotations so
  TypeScript can validate without local casts.
- Removed stale onboarding use of the removed repository-enable API and
  aligned sprint backlog deletion with the existing archive task action.

### Fixed

- Fixed TypeScript errors across chat, reminders, docs, CRM/tables,
  onboarding, sprint, GTM, insights, e2e fixtures, and marketing pages.

## [0.7.77] - 2026-05-18

This release improves performance review workflows with peer-review
detail pages, manager assignment tools, phase controls, and automated
deadline reminders.

### Added

- Added peer-review request detail pages where reviewers can accept,
  decline, and submit focused feedback from a notification link.
- Added manager peer-reviewer assignment UI on individual review pages.
- Added review-cycle activation and deadline-reminder notification types
  with templates and delivery helpers.
- Added a daily Temporal deadline sweep for T-7, T-3, and T-1 review
  reminders, plus a migration to track sent reminders per cycle.

### Changed

- Review cycle list and detail pages now expose activate and advance-phase
  actions with refreshed table/menu behavior.
- Review cycle activation now notifies enrolled participants when the
  cycle opens.

## [0.7.76] - 2026-05-18

This release makes AI token usage visible and billable at the workspace
level, and adds raw commit detail behind developer insights.

### Added

- Added workspace-level month-to-date LLM counters, provider breakdowns,
  overage cost tracking, and an idempotent migration for the new workspace
  usage columns.
- Added `GET /workspaces/{workspace_id}/llm-usage` so any workspace
  member can inspect current AI token consumption and reset timing.
- Added workspace AI usage cards to billing and insights settings.
- Added a developer commits endpoint and table so developer insights can
  show the underlying synced commits behind aggregate metrics.

### Changed

- AI analysis activities now roll commit, PR, and review token usage into
  every workspace that has adopted the analyzed repository.
- Billing usage now reads workspace token counters when the caller belongs
  to a workspace, while preserving legacy developer counters as fallback.

## [0.7.75] - 2026-05-17

This release tightens the AI insights experience after the initial
code-insights rollout, with better contributor-claim flows, more resilient
LLM execution, and clearer loading states.

### Added

- Added an auto-detecting claim banner on insights pages so developers can
  reclaim orphaned GitHub commit, PR, and review activity without leaving
  the context where missing activity is visible.
- Added shared code-insight card skeletons to keep digest and repository
  health panels stable while AI snapshots load.
- Added identity-page success messaging and richer claim metrics for
  commits, PRs, and reviews.

### Changed

- Expanded ghost contributor matching to include GitHub no-reply email
  attribution, not only email-null contributor rows.
- Wrapped commit, PR, and review AI analysis calls with inline
  rate-limit waits so Temporal activities are less likely to burn retries
  during LLM concurrency spikes.
- Increased DeepSeek read timeouts for long-tail completions while keeping
  connection failures fast.
- Refined AI digest cards and insights pages with improved empty/loading
  states and contributor-claim entry points.

## [0.7.74] - 2026-05-17

AI code insights now run across GitHub commits, pull requests, reviews,
and sprint task links, with workspace controls for enabling analysis and
new UI surfaces for reading the results.

### Added

#### AI code insights
- Added code-insight API endpoints for commit, pull request, review,
  similar-PR, reviewer-suggestion, task-PR alignment, and snapshot
  retrieval workflows.
- Added Temporal activities and schedules for artifact analysis, weekly
  developer digests, repository health summaries, active PR refreshes,
  task-to-PR alignment, and performance-review summaries.
- Added LLM analysis cache, deterministic security scanning, PR
  embeddings, AI settings, and migration scripts for the new storage
  columns and snapshot tables.

#### Product surfaces
- Added frontend code-insight hooks, API client helpers, localized
  messages, and cards/panels for AI summaries in developer, repository,
  review, sprint board, and settings pages.
- Added identity settings messaging and navigation surfaces for the
  organization/settings area.

### Changed

- GitHub sync now enriches commits and PRs with deterministic metadata,
  supports branch-aware commit collection, and fans out AI analysis after
  repository sync.
- Developer identity handling can claim and merge ghost contributor
  activity into the authenticated GitHub developer profile.
- Coverage artifacts are ignored so regenerated test output stays out of
  normal commits.

## [0.7.73] - 2026-05-12

Tasks now have a copyable per-workspace identifier and a short
shareable link. Format is `[{workspace_slug}:{task_key}]` (e.g.
`[aexy:42]`); the bracketed form doubles as an auto-link token in
GitHub PR/issue titles. The kanban task card surfaces two icon-only
copy actions on hover — full link / full identifier shown on hover,
copied on click.

### Added

#### Shareable task identifiers
A new monotonic per-workspace counter assigns a `task_key` to every
new task. Combined with `workspace.slug` it forms the displayed
identifier `[slug:N]`, rendered as a subtle monospace prefix on the
kanban card title and used as the body of two new copy actions in
the card's hover quick-actions bar. Existing tasks are backfilled
in `created_at` order per workspace.

- New columns: `sprint_tasks.task_key` (int, unique per workspace)
  and `workspaces.next_task_key` (counter). Migration
  `migrate_task_keys.sql` adds them, backfills existing tasks, and
  seeds each workspace counter to `MAX(task_key) + 1`.
- Atomic assignment via a SQLAlchemy `before_insert` event on
  `SprintTask` — one `UPDATE ... RETURNING` consumes the next key
  and serializes concurrent inserts. Covers all task-creation paths
  (manual, GitHub import, Jira, Linear, workflows, templates,
  planning poker) without touching their call sites.
- `SprintTaskResponse` exposes `task_key`, `workspace_slug`,
  `identifier`, and `public_url` so the frontend can render and
  copy without recomposing the string.

#### Public short-link route
A short URL at `/t/{workspace_slug}/{task_key}` resolves to the
sprint kanban for the task, with the task drawer auto-opened.

- New backend endpoint `GET /api/v1/tasks/by-key/{slug}/{key}`
  returns the task UUID plus the sprint and project IDs needed to
  build the redirect. Auth-gated on workspace membership.
- New frontend route `frontend/src/app/(app)/t/[workspaceSlug]/[taskKey]/page.tsx`
  calls the resolver and `router.replace`s to
  `/sprints/{project_id}/{sprint_id}?task={uuid}` (or the project
  backlog when the task has no sprint).
- The sprint kanban page reads `?task=<uuid>` on mount, opens the
  task drawer for that task, and strips the param so refresh
  doesn't re-open it.

#### GitHub PR/issue title auto-linking
The task reference parser learns a new pattern for the native
`[workspace-slug:N]` form. When a PR or issue is ingested with that
bracket in its title, `GitHubTaskSyncService` resolves the matching
task by `(workspace.slug, task_key)` and creates a `TaskGitHubLink`
with `is_auto_linked=True`.

- New `AEXY_BRACKETED_PATTERN` regex
  `\[([a-z0-9][a-z0-9-]*):(\d+)\]` in `task_reference_parser.py`,
  exposed as `TaskReferenceSource.AEXY`. Distinct from the existing
  `[PROJ-123]` Jira/Linear pattern (the colon separator avoids the
  collision).
- Already wired into the runtime webhook path
  (`/webhooks/github`) for both PRs and commits — no behavior change
  for past PRs that didn't use this format, future ones link
  automatically.

#### Card UI
- Two icon-only buttons in `TaskCardPremium`'s hover quick-actions
  bar: `Link2` copies the public URL, `Hash` copies the identifier.
  Full string in the `title=` tooltip; Sonner toast on click.
- Persistent monospace `[slug:N]` prefix on the card title so the
  identifier is visible at a glance without hovering.

## [0.7.72] - 2026-05-07

Project-level (sprint-less) tasks reach feature parity with sprint
tasks. Backlog tasks can now carry attachments, attach GitHub PRs and
issues, accept comments, and surface a full activity history; several
silently-dropped fields on create/update across both routes are
plugged; the History tab now logs every meaningful task mutation
including archives, sprint moves, and planning-poker estimates; and
repository connection moves from per-developer to workspace-scoped.

### Added

#### Workspace + project repository connection
Repositories are connected at the **workspace** level now, with
projects picking subsets. New tables `workspace_repositories` (the
workspace's adopted catalog) and `team_repositories` (the project's
selection) replace `DeveloperRepository.is_enabled` as the source of
truth for "which repos are tracked here." Migration
`migrate_workspace_team_repositories.sql` backfills both from
existing per-developer enables so nothing in scope today disappears.

- New endpoints: `GET/POST/DELETE /workspaces/{id}/repositories`
  (admin), `GET/POST/DELETE /teams/{id}/repositories`, plus
  `POST /workspaces/{id}/repositories/{wr_id}/reclaim` for the
  former-member adoption flow.
- `WorkspaceRepositoryService` exposes the adopt / unadopt /
  reclaim / link-team / unlink-team / pick_installation_developer
  surface; the canonical sync state (sync_status, last_sync_at,
  webhook bookkeeping, incremental cursors) lives on
  `workspace_repositories` since sync is workspace-owned now.
- Free-plan repo cap is now per-workspace.
  `LimitsService.can_adopt_repository(workspace_id)` counts active
  rows against the workspace's effective plan and gates the adopt
  endpoint. Removes the per-developer counter from the gating path
  (still used as a display-only roll-up on the limits widget).
- Consumers swapped: PR search (sprint + project), GitHub issue
  search/import, the auto-sync Temporal scheduler, developer
  insights, sync-status. Per-developer enable/disable endpoints
  are removed; the column `DeveloperRepository.is_enabled` stays
  as a discovery cache and gets cleaned up in a follow-up.
- New project settings tab at
  `/settings/projects/{projectId}/repositories` for picking which
  workspace repos a project tracks.
- Former-member adoption UX: a "Reclaim" banner on
  `/settings/repositories` lists `workspace_repositories` whose
  adopter is no longer an active workspace member, with a one-click
  "Reclaim" action that re-binds the row to the active member who
  clicked it (or any active member with reach as a fallback).
  `WorkspaceRepository.sync_status='no_credentials'` is set
  automatically when the auto-sync scheduler can't get a token,
  surfacing the same banner.
- Frontend rewires `handleRepoToggle` on `/settings/repositories`
  to call `workspaceRepositoriesApi.adopt` / `unadopt` instead of
  the removed per-developer endpoints; existing UI keeps working,
  the toggle now adopts into the current workspace.



#### Backlog tasks can carry attachments
Sprint-less project tasks had attachment upload gated behind a "Move
this task into a sprint to upload attachments" banner because the
only attachment routes lived under `/sprints/{sprint_id}/tasks/...`.
Added parallel endpoints under `/teams/{team_id}/tasks/{task_id}/attachments`
(POST / GET / DELETE) authorised via team membership. Both routers now
share the same upload, list, and delete logic via a new
`backend/src/aexy/services/task_attachment_service.py` (S3 put,
storage-quota assertion, AI metadata pipeline dispatch, S3 delete,
quota-cache invalidation — all in one place). The frontend picks the
right endpoint based on `task.sprint_id`; the gate banner is gone.

#### Backlog tasks can attach pull requests and GitHub issues
The PR linking section in the task modal now works for project-level
tasks — new endpoints `GET /teams/{team_id}/tasks/github/pull-requests`
and `POST /teams/{team_id}/tasks/{task_id}/github-links/pull-requests`
mirror the sprint-scoped equivalents (workspace-membership check on
the PR author preserved). The list endpoint at
`/teams/{team_id}/tasks/{task_id}/github-links` now returns both issue
and PR links (previously filtered to `github_issue` only). The
`EditTaskModal` dispatches search and link mutations to either endpoint
based on whether the task has a `sprint_id`.

#### Project-level GitHub issue import
New `POST /teams/{team_id}/tasks/import` (with
`projectTasksApi.importTasks` on the frontend) imports GitHub issues
into the team's backlog without requiring a sprint, populating the
"Select issue" dropdown across every task in the team. New service
helpers `add_project_task` and `_import_project_task_items` keep the
import dedup keyed on `(team_id, source_type, source_id)`.

#### Backlog tasks show activity history and accept comments
The History tab previously rendered "Move this task into a sprint to
view its full activity history" for sprint-less tasks because the only
activities + comments routes were sprint-scoped. Added the matching
team-scoped routes (`GET /teams/{team_id}/tasks/{task_id}/activities`
and `POST /teams/{team_id}/tasks/{task_id}/comments`) and updated
`AssignmentHistoryPanel` to dispatch by `task.sprint_id` vs
`task.team_id`. Activity rows are keyed on `task_id` only on the model
side, so existing per-task creation / status / assignment / field-change
events surface for backlog tasks without any data backfill.

#### History tab now logs every meaningful task mutation
Audit pass on every place that mutates a `SprintTask`. Previously
silent paths now write per-task `TaskActivity` rows:

- **Project-task PATCH** delegates to `SprintTaskService.update_task`
  instead of duplicating field assignments, so backlog edits get the
  same per-field timeline (`title_changed`, `priority_changed`, etc.)
  that sprint tasks have.
- **Project-task status PATCH** writes a per-task `status_changed` row
  in addition to the workspace `EntityActivity` it already emitted.
- **Attachment upload + delete** write `attachment_added` /
  `attachment_removed` rows attributed to the actor; affects sprint
  AND project tasks (this was missing for both).
- **Archive / unarchive / remove** write `archived` / `unarchived`
  rows; `actor_id` threaded through `archive_task`, `unarchive_task`,
  and `remove_task` on the service.
- **Sprint moves** (project PATCH inline `sprint_id`, the dedicated
  `move-to-sprint` endpoint, and `bulk_move_to_sprint`) write
  `sprint_changed` with prior and new sprint IDs.
- **Planning-poker finalize** writes a `points_changed` row when the
  estimate it stamps onto each task differs from the prior value.
- **Project-task creation** writes a `created` row so backlog
  timelines start with "X created this task" instead of empty.

`TaskActivityAction` extended with `attachment_added`,
`attachment_removed`, `archived`, `unarchived`, and `sprint_changed`,
with renderer cases in both task modals.

### Fixed

#### Project-task creation silently dropped dates and estimated hours
`POST /teams/{team_id}/tasks` accepted `start_date`, `end_date`, and
`estimated_hours` in `ProjectTaskCreate` but the handler instantiated
`SprintTask(...)` without passing them through, so a fresh task always
saved with NULL dates and NULL hours regardless of the form. The
frontend create path mirrored the drop —
`useProjectBoard.addTaskMutation` explicitly listed each forwarded
field and the dates/hours weren't in the list. Wired all three fields
through every layer (SprintTask kwargs in the backend, mutationFn type
and forwarding, and the `create` and `addTask` API client signatures).

#### Project-task PATCH silently dropped four fields
The same route accepted `start_date`, `end_date`, `estimated_hours`,
and `contributes_to_goal` in `SprintTaskUpdate` but the inline
update in `project_tasks.py:update_task` only handled
title/description/story_points/priority/status/labels/epic_id/sprint_id/
assignee_id/mentions. Editing dates or hours on a backlog task looked
successful but nothing persisted. Added the four missing assignments
with `model_fields_set` semantics on the date and hours fields so
callers can clear them by sending explicit null; `contributes_to_goal`
is non-nullable on the model and stays "set when explicitly provided."

#### Project-task responses omitted attachments and seven other fields
`task_to_response` was duplicated across `sprint_tasks.py` and
`project_tasks.py` and the project-tasks copy was missing
`attachments`, `work_started_at`, `cycle_time_hours`,
`lead_time_hours`, `contributes_to_goal`, `start_date`, `end_date`,
and `estimated_hours`. Result: uploading an attachment to a backlog
task succeeded server-side, but when the UI re-fetched the task via
the project-task list/get/update endpoints, the response serialized
`attachments: []` and stale nulls for dates/hours. Extracted the
canonical builder into a new
`backend/src/aexy/services/sprint_task_response.py` and pointed both
routers at it, so the response shape stays in lockstep going forward.

#### Sprint-task PATCH silently dropped `description_json`
The mirror bug on the sprint-scoped route: `data.description_json`
came in via Pydantic but `task_service.update_task` had no parameter
for it, so the rich-text representation never updated even when the
plain `description` did. Added a sentinel-typed `description_json`
parameter to `SprintTaskService.update_task` (with no activity-log
entry — `description_changed` already covers that), and pass it
through from the sprint-tasks PATCH handler.

#### Aligned frontend update types with the backend schema
`sprintApi.updateTask`, `projectTasksApi.update`, and
`useProjectBoard.updateTaskMutation` had TypeScript signatures that
omitted `start_date`, `end_date`, `estimated_hours`, and
`contributes_to_goal`. The runtime axios call still sent them
(JavaScript is permissive), but the types misled callers. Added the
missing fields so the contract matches the backend.

## [0.7.71] - 2026-05-07

Patch release on top of 0.7.7. Fixes a production-only file-upload
outage, light-mode contrast on the task-create form, and brings the
deployment docs in line with the real stack.

### Fixed

#### Object storage missing from production compose
`docker-compose.prod.yml` had no rustfs (or any S3-compatible) service
and no `S3_ENDPOINT_URL` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
env vars on `backend` or `temporal-worker`, even though the dev compose
ships rustfs and points the backend at it. Result: in production
`StorageService.is_configured()` returned False and every file upload —
task attachments, recording uploads, compliance docs — returned `503
File storage is not configured on this deployment`. Added a `rustfs`
service to the prod compose (internal-network only, with healthcheck),
wired the S3 env vars on backend and temporal-worker, added
`rustfs_data` and `rustfs_logs` volumes, added an `/storage/` proxy
location to `nginx/nginx.conf` so uploaded URLs are reachable from the
browser, and seeded `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD` /
`S3_PUBLIC_ENDPOINT_URL` in `.env.prod.example`. Existing operators
need to set those three values in `.env.prod` and re-run
`docker compose -f docker-compose.prod.yml up -d`.

#### Light-mode contrast on task-create attachment & GitHub-issue buttons
The native `<input type="file">` "Choose files" button on the new-task
form and the secondary "Link issue" button on the GitHub Issues panel
both used `bg-primary-*/10` + `text-primary-200/300` — both very light
blue, which collapses to barely-visible against the form background in
light mode. Reskinned all three controls (two file inputs + the link
button) to the solid `bg-primary-600` + `text-white` style already used
by the primary "+ Link" button, so they pass contrast in both light
and dark mode.

### Documentation

#### New Database Operations guide and stale-reference cleanup
A new `docs/guides/database-operations.md` is now the canonical
reference for everything that touches PostgreSQL: the custom SQL
migration system at `backend/scripts/migrate_*.sql`, manual and
automated backups (the production `aexy-backup` sidecar at 02:00 UTC),
restore from sql dump, restore from volume snapshot, the safe
postgres image-rebuild flow (data on the `postgres_data` named
volume is independent of the image — `down -v` is what kills it),
the major-version upgrade dump-and-reload procedure, and pgvector
specifics. Linked from `docs/README.md`, `DEPLOY.md`, and the
deployment guide.

`DEPLOY.md` and `docs/guides/deployment.md` were brought in line with
the actual stack: the `alembic upgrade head` references became
`python scripts/run_migrations.py`, the Celery / Celery beat /
Flower references became Temporal worker / Temporal UI / Temporal
schedules, the postgres prerequisite is now PG 18 with pgvector
(the bundled `aexy-postgres:18-alpine-pgvector` image) instead of
PG 14/16, and the deployment example compose now includes the
`temporal`, `temporal-ui`, and `temporal-worker` services. The
backup/restore quick-references in both docs now point at the new
Database Operations guide for full procedures.

## [0.7.7] - 2026-05-07

### Added

#### Admin billing breakdown — line-item view of charges, usage, and rates
Workspace owners/admins now have a dedicated breakdown page at
`/settings/billing/breakdown` answering "what am I being charged this
period and why." Platform admins get the same view across every
workspace at `/admin/billing` with a margin column and a click-to-drill
drawer. Both reuse a single `BillingBreakdownView` component so the
shape and behavior stay consistent.

- New `BillingBreakdownService` (`backend/src/aexy/services/billing_breakdown_service.py`)
  composes `LimitsService`, `UsageService`, `PostpaidBillingService`,
  and `StorageQuotaService` into one typed `BillingBreakdown`. Line
  items: base subscription fee, active seats (with included vs
  billable split), LLM usage per provider (tokens, request count,
  rate display), storage usage (informational), plus info counters
  for plan-included free tokens and postpaid accruals. The service
  reads period bounds from `WorkspaceSubscription.current_period_*`
  and falls back to the current calendar month.
- Workspace endpoints `GET /api/v1/billing/breakdown?workspace_id=…&period=current|previous|YYYY-MM`
  and `GET /api/v1/billing/breakdown/history?workspace_id=…&months=6`,
  gated by `verify_workspace_admin`. Margin information is never
  exposed via these routes.
- Platform-admin endpoints under `/api/v1/platform-admin/billing/*`:
  `breakdown`, `breakdown/history`, `summary` (paginated, filterable
  workspace table), and `totals` (revenue, margin, top workspaces,
  plan-tier and billing-model splits). Margin (`base_cost_cents`
  vs `charged_cents` from the snapshotted `UsageRecord` rows) is
  exposed only here.
- `BillingBreakdownView` renders the period header, total/delta cards,
  a category-grouped line-item table with per-item drilldown (provider,
  request counts, base cost when admin), info counters, invoices for
  the period, and a 6-period sparkline. The `delta_cents` /
  `delta_pct` are computed against the prior month's
  `usage_aggregates` row, falling back to live SQL over
  `usage_records` when the aggregate is missing.
- Sidebar entries: `Billing Breakdown` (adminOnly) under Account in
  `settingsNavigation.ts`, and `Billing` in the platform-admin sidebar
  in `(admin)/layout.tsx`.

#### Daily Temporal job to populate billing aggregates
New `aggregate_billing_usage` activity (analysis.py) wired into
`worker.py` and scheduled in `schedules.py` to run every 24h. It
calls `UsageService.update_usage_aggregate` for every active
customer subscription's current period, plus the current and prior
calendar month for every workspace that has any usage. Without this
job the historical breakdown view stays empty in production —
nothing else writes to `usage_aggregates`.

#### Internationalization for the breakdown views
Added `settings.billing.breakdownPage` and `settings.platformBilling`
translation namespaces in `messages/en/settings.json` and
`messages/hi/settings.json`. Every user-facing string in the new
pages and the shared `BillingBreakdownView` component goes through
`useTranslations()`. Plan tier and billing-model labels stay in
English in the Hindi translations per project convention.

### Fixed

#### Plan-included free tokens no longer reduce the breakdown total
The breakdown previously emitted a synthetic `free_credit` line item
with a negative subtotal, dropping `total_cents` by an estimated
allowance. The Stripe billing pipeline
(`UsageService.report_workspace_usage_to_stripe`) reports the raw
sum of `UsageRecord.total_cost_cents` with no such deduction —
per-member free quotas live on `Developer.llm_overage_cost_cents`
and never reduce the workspace invoice. The result was that the UI
showed a lower bill than what Stripe charged. The synthetic credit
is now surfaced as `free_tokens_per_member_per_month` and
`llm_tokens_used` info counters plus a computation note explaining
the per-developer scope, so `total_cents` always equals what the
billing pipeline reports.

#### Platform billing summary filters now apply before pagination
`GET /platform-admin/billing/summary` was paginating on the workspace
query first, then dropping rows whose computed `plan_tier` or
`billing_model` didn't match. A filtered request could return an
empty first page even when matches existed on later pages, and the
`total` count reflected only the search filter. The filters are now
pushed into SQL: `plan_tier` joins `Workspace.plan_id → Plan.tier`,
`billing_model` joins `WorkspaceSubscription.workspace_id →
WorkspaceSubscription.billing_model`. `total` reflects the filtered
set, and pagination operates on the filtered query. Workspaces with
no active subscription row are excluded when `billing_model` is set
(they have no canonical workspace-level billing model to filter on);
plan-tier filtering uses the source plan tier and does not consider
workspace plan overrides.

## [0.7.6] - 2026-05-07

### Added

#### Full task activity history
The History tab on the task modal now shows every change to a task —
not just assignment and status — and every change is attributed to the
user who made it. A reviewer can see who created the task, who renamed
it, who shifted the dates, who edited the description, who reassigned
it, and who dragged it across the board, top-to-bottom in the order
events actually happened.

- `SprintTaskService.update_task` now snapshots each field before
  mutation and writes a per-task `TaskActivity` row (`title_changed`,
  `description_changed`, `points_changed`, `priority_changed`,
  `status_changed`, `labels_changed`, `epic_changed`,
  `start_date_changed`, `end_date_changed`,
  `estimated_hours_changed`) for every value that actually changed.
  Description bodies are not stringified into `old_value`/`new_value`
  — only the fact that the description changed is recorded — to keep
  the activity row small for rich-text edits.
- `update_task_status` and `bulk_update_status` now accept an
  `actor_id` and write a per-task activity row attributing the status
  change to the user who dragged the card or clicked the pill.
  Previously the workspace-wide `EntityActivity` feed had this but
  the modal's History tab did not.
- `create_task` records the creator on the `created` activity row, so
  the History tab opens with a "X created this task" line instead of
  silently starting at the first edit.
- `TaskActivityAction` union extended in `frontend/src/lib/api.ts`
  with the six new field-change actions, and the renderer in
  `AssignmentHistoryPanel` (board page) and `ActivityItem` (single
  sprint page) now switches on every action with human-readable
  copy: "renamed to X", "set due date to Y", "cleared estimate", etc.
- The History panel no longer filters out non-assignment events —
  it shows everything, with the actor name on every line.

### Changed

#### Optimistic drag-and-drop on the kanban board
Dropping a task into a new column updates the cache before the
network round-trip, so the card stays where the user dropped it
instead of snapping back to its original column for ~100 ms before
re-rendering. Both `useSprintTasks` (sprint board) and
`useProjectBoard` (workspace tasks) gained `onMutate` /
`onError` / `onSettled` handlers that snapshot the prior cache,
apply the new status optimistically, roll back on failure, and
invalidate on settle. The "snap back, then move" flicker that
made dnd-kit feel laggy is gone.

#### Editable links in task descriptions
TipTap's `Link` extension was switched to `openOnClick: false` in
edit mode (when `readOnly` is false), so single-clicking a link
inside the editor now lands the cursor on it for editing instead
of opening it in a new tab. Cmd/Ctrl+click still opens the link.
In read-only renders (description preview, comment view) plain
clicks open the link as before.

### Fixed

#### Storage object orphaned on task attachment delete
`DELETE /sprints/{sprint_id}/tasks/{task_id}/attachments/{id}` was
removing the `task_attachments` row but leaving the underlying S3
object in RustFS forever, so deleted files kept counting against
the workspace's storage quota. The endpoint now derives the storage
key from the attachment URL via the new
`StorageService.key_from_url` (handles both path-style and the R2
virtual-hosted style), calls `delete_object`, and invalidates the
workspace usage cache via `StorageQuotaService` so the quota meter
catches up immediately.

#### `task.assigned` automation didn't fire on PATCH-based reassignment
Reassigning a task by sending `PATCH /sprint-tasks/{id}` with a new
`assignee_id` updated the row and wrote the assignment activity, but
never dispatched the `task.assigned` automation trigger — only the
dedicated `/assign` endpoint did. So workspace automations subscribed
to `task.assigned` (Slack DMs, Linear sync, etc.) silently missed
every reassignment performed through the task modal's edit flow.
`update_task` now mirrors `assign_task`'s `dispatch_automation_event`
call when the assignee changes.

### Internal

- New helper `_stringify_field` in `sprint_task_service` renders
  TaskActivity field values consistently — `None` stays `None` (so
  the History tab can render "—"), datetimes go through `.isoformat()`,
  and lists join with `, `. Avoids the `"None"` string showing up
  in old/new value cells.
- Removed a vestigial `hasattr(task, "attachments")` guard in
  `task_to_response` — the `attachments` relationship is always
  present on `SprintTask` since the v0.7.4 schema migration.

## [0.7.5] - 2026-05-07

### Added

#### Drive — collaborative file storage with AI tagging
A workspace-wide Drive backed by S3-compatible storage (RustFS in dev),
enriched by an AI metadata pipeline that captions images, tags documents,
and annotates videos with timecoded events from a vision-language model.

- New `drive_files` table with folder hierarchy, soft delete, and per-kind
  rendering hints (file / folder / image / video / audio / pdf / doc).
  Smart Views are filter overlays — they don't move files, they translate
  a JSONB filter to a `file_metadata` join. Migration
  `migrate_drive_v1.sql` is idempotent and adds covering partial indexes.
- New `/workspaces/{ws}/drive/files`, `/folders`, `/files`, `/files/{id}`,
  `/smart-views`, `/files/{id}/annotations`, `/files/{id}/reannotate`,
  and `/usage` endpoints. Multipart upload caps at 500 MB per file and
  2 GB per batch before the plan-level quota check, protecting worker
  memory.
- Drive UI under `/docs/drive`: file grid, smart-view sidebar, hybrid
  search bar, multi-file dropzone, quota banner, and a video player that
  overlays Qwen-VL annotations on the timeline.
- Storage quotas: per-plan `max_storage_gb` (with `-1` for unlimited),
  workspace-level overrides, and a Redis-cached usage rollup spanning
  drive_files, task_attachments, and compliance_documents. Concurrent
  uploads are serialised per-workspace via a Postgres advisory lock so
  two simultaneous uploads can't overshoot the cap.

#### Polymorphic file AI metadata
A single `file_metadata` row per file regardless of where the file lives.
`(source_type, source_id)` is unique across `drive_file`,
`task_attachment`, and `compliance_document`. `file_embeddings` and
`video_annotations` foreign-key to `file_metadata.id`, so a non-Drive
video (e.g. a task attachment) can carry annotations through the same
machinery. Adding a fourth source type is one resolver registration —
no schema change.

- Migration `migrate_file_metadata_v1.sql` creates the schema in a single
  transaction with a GIN index on `ai_tags`/`ai_categories` and an
  ivfflat cosine index on the 1024-dim `embedding` column.
- New `/workspaces/{ws}/files/{source_type}/{source_id}/metadata` and
  `.../reannotate` endpoints — the frontend's universal "Reannotate"
  button posts here regardless of source.
- New `/workspaces/{ws}/search/files?q=…&kinds=…` workspace-wide hybrid
  search: pgvector cosine over `file_embeddings` plus an ILIKE pass over
  `ai_summary` and per-source file names. Cmd+K palette
  (`WorkspaceSearchPalette`) is the user-facing surface.
- New `/workspaces/{ws}/source-files?source_type=…` browse endpoint
  returns a unified file row for any source. The Drive sidebar uses it
  to render virtual cross-source views ("Task attachments",
  "Compliance documents") in the same grid as drive files.

#### Qwen vision + embeddings via the LLM gateway
The gateway grows lazy `vision` and `embeddings` properties selected via
`settings.llm.vision_provider` / `embeddings_provider`. Provider keys
are tracked separately from chat-LLM usage so vision + embedding spend
shows up distinctly in the rate limiter.

- Vision providers: OpenRouter (`qwen/qwen2.5-vl-72b-instruct` by default)
  and local Ollama (any Qwen-VL tag). Both implement `analyze_image` and
  `analyze_video_frames`.
- Embedding providers: OpenRouter (`text-embedding-3-large@1024`) and
  Ollama (`bge-m3`). Both produce pgvector-compatible 1024-dim vectors
  so the two backends are interchangeable.
- New `gateway.embed_batch_limited`, `vision_image_limited`, and
  `vision_video_frames_limited` helpers gate every call through the
  Redis rate limiter. Provider keys: `qwen-openrouter`, `qwen-ollama`,
  `embeddings-openrouter`, `embeddings-ollama`.
- ffmpeg frame sampling for video annotation runs in
  `asyncio.to_thread`, so a multi-minute video doesn't block the worker
  event loop.

#### Admin Plans & Overrides editor
A super-admin UI under `/admin/plans` to inspect plans, edit
per-workspace overrides, and kick off the AI metadata backfill for
existing rows.

- Backfill endpoint enqueues a Temporal workflow per workspace that
  scans uncovered drive_files, task_attachments, and compliance_docs
  and dispatches the AI pipeline at the configured rate. The button
  is idempotent — re-clicking finds the running workflow rather than
  starting a parallel one.

### Changed

#### LLM gateway settings moved under `settings.llm.*`
`vision_provider`, `vision_model`, `embeddings_provider`,
`embeddings_model`, and `embeddings_dim` now live under the `LLMSettings`
group instead of the root `Settings`. Existing `VISION_PROVIDER` /
`EMBEDDINGS_*` env vars continue to work.

#### Drive registered in the app catalogue
Added to both `frontend/src/config/appDefinitions.ts` and
`backend/src/aexy/models/app_definitions.py` so it shows up in app-bundle
permission templates and the sidebar layout filter.

#### `DriveFile` is no longer the home of AI metadata
`ai_status`, `ai_summary`, `ai_tags`, `ai_categories`, and
`ai_processed_at` were removed from `drive_files` and the `DriveFile`
TypeScript interface. AI metadata is now read from `file_metadata` via
the polymorphic endpoint or the `useFileMetadata` hook. `FileCard` fetches
its own AI metadata per row, which means task_attachment and
compliance_document files render with the same AI badges in the Drive
grid.

#### Drive-specific search dropped
`GET /workspaces/{ws}/drive/search` and `driveApi.search` are gone.
Callers use the workspace-wide `/search/files?kinds=drive_file` endpoint
(via `useDriveSearch`, which adapts the response to the legacy hit
shape so the UI didn't have to change).

### Fixed

- **Server boot crash from stale module references.** Several legacy
  imports survived the polymorphic-metadata refactor — `DriveFileEmbedding`
  in `drive_search_service`, `VideoAnnotation.file_id` in `drive_service`,
  and a `max_storage_gb` default placed before required dataclass fields
  in `EffectivePlan`. Each one raised at module-import time, taking down
  the entire FastAPI app on startup. All cleaned up; `drive_search_service`
  was removed entirely (replaced by the cross-source `file_search_service`).
- **Gateway vision/embedding settings raised AttributeError.** The
  gateway was reading `settings.vision_provider` etc. off the root
  `Settings`, but those fields had been moved to `LLMSettings`. First
  call to `gateway.vision` or `gateway.embeddings` crashed.
- **Workspace-wide file_name search produced wrong rows.** The `_scan`
  helper's `select(FileMetadata).join(FileMetadata, …)` re-joined
  `FileMetadata` onto itself; the source table was never in the FROM
  clause. Now starts from the source table and joins `file_metadata`
  correctly.
- **Folder cycle detection only caught direct self-parenting.** Moving
  folder A under one of its own descendants (A → … → D → A) silently
  succeeded and corrupted the tree. Now walks the parent ancestry and
  rejects on collision.
- **None-gateway 500.** When `get_llm_gateway()` returned `None`
  (misconfigured or no API keys), `FileSearchService` and the Drive
  search route called `gateway.embeddings` and crashed. Both now accept
  `Optional[LLMGateway]` and degrade to keyword-only search.
- **Mutable default `BackfillStartRequest()`** in the admin backfill
  route replaced with `Body(default_factory=BackfillStartRequest)`.

### Security

- **SSRF guard on the file AI pipeline's `_download_bytes`.** URLs must
  match an allowlisted host suffix (`.amazonaws.com`, `.cloudfront.net`,
  `.r2.cloudflarestorage.com`, `.aexy.io`) or the configured
  `s3_endpoint_url`. After DNS resolution, every returned IP is checked
  against private / loopback / link-local / multicast / reserved /
  unspecified ranges, defending against DNS rebinding attacks where a
  "public" hostname resolves to `169.254.169.254` or RFC1918. Storage
  endpoints matched verbatim skip the IP check by design (ops controls
  those names; they often resolve privately). `follow_redirects=False`
  prevents 30x bypass.
- **IDOR fix on cross-source reannotate.** The
  `/workspaces/{ws}/files/{source_type}/{source_id}/reannotate` endpoint
  used to dispatch the LLM pipeline without verifying that `source_id`
  belonged to `workspace_id`. Any workspace member could trigger
  reprocessing of any file in any workspace by guessing a UUID, charging
  the LLM bill to the wrong tenant. Now resolves the source row and
  rejects with 404 when the workspace doesn't match.
- **Storage quota TOCTOU race.** Two concurrent uploads from the same
  workspace could both pass the cached usage check and overshoot the
  cap by ~2× the incoming bytes. `assert_storage_available` now wraps
  the check in `pg_advisory_xact_lock(hashtextextended(workspace_id, 0))`
  and reads the used-bytes total fresh from the DB inside the lock.

### Performance

- **Source-files browse covering indexes** (migration
  `migrate_source_files_idx_v1.sql`):
  - `idx_drive_files_workspace_uploaded` on
    `(workspace_id, uploaded_at DESC)` partial
    `WHERE deleted_at IS NULL AND kind <> 'folder'` — covers the exact
    scan the endpoint runs and skips the sort step.
  - `idx_task_attachments_task_uploaded` on `(task_id, uploaded_at DESC)`
    — speeds the join-then-sort pattern when listing all task
    attachments in a workspace.
  - `compliance_documents` already had `(workspace_id, created_at DESC)`
    from `migrate_compliance_documents.sql` — no new index needed.

### i18n

- New `messages/en/drive.json` and `messages/hi/drive.json` cover the
  Drive UI: ~65 keys across `drive.page`, `drive.fileCard`,
  `drive.upload`, `drive.quota`, `drive.smartView`, `drive.video`,
  `drive.aiBadges`, `drive.metadataPopover`, `drive.metadataSidecar`,
  and `drive.search`. ICU placeholders ({count}, {percent}, {used},
  {limit}, {incoming}) match across both locales.

### Tests

- New Playwright e2e specs: `drive-quota.spec.ts`,
  `drive-smart-views.spec.ts`, `drive-upload.spec.ts`,
  `compliance-doc-ai-sidecar.spec.ts`, `task-attachment-ai-tags.spec.ts`,
  `workspace-search-palette.spec.ts`, `admin-backfill.spec.ts`,
  `admin-plans-edit.spec.ts`. Shared `e2e/fixtures/drive-mock-data.ts`
  fixture seeds files, smart views, AI metadata, and quota state.

### Internal

- `.gitignore` extended for `frontend/playwright-report/`,
  `frontend/test-results/`, `frontend/e2e/debug-screenshot*.png`, and
  `REVIEW_*.md`. The previously-tracked `playwright-report/index.html`
  was removed from the index.

## [0.7.4] - 2026-05-06

### Added

#### Task attachments, schedule, and over-estimate detection
Sprint tasks now carry a scheduled timeline and uploaded files, and the
board surfaces when work has slipped.

- Added `start_date`, `end_date`, and `estimated_hours` columns to
  `sprint_tasks`, plus a new `task_attachments` table with cascade delete.
  Migration `migrate_sprint_tasks_v3.sql` is idempotent and indexes
  `end_date` and `task_id`.
- Added `POST/GET/DELETE /sprints/{sprint_id}/tasks/{task_id}/attachments`
  endpoints. Multipart uploads stream through the existing S3-compatible
  storage service (RustFS).
- AddTaskModal gains datetime-local inputs for start/end, an estimated
  hours field, and a multi-file uploader. Files are uploaded after the
  task is created so cascade delete cleans up cancelled flows.
- EditTaskModal mirrors the new fields and renders an attachment list
  with download links and delete actions.
- Kanban cards render an `Overdue` badge when `end_date` has passed and
  the task is not done, and an `Over estimate` badge when actual cycle
  time exceeds `estimated_hours`. Both are pure-frontend computations.

#### Assignment history visible in the task modal
The EditTaskModal grows a History tab showing the full reassignment
chain so reviewers can see who originally assigned a task and every
hand-off in between.

- `assign_task`, `unassign_task`, and the assignee branch of
  `update_task` now write both old and new assignee IDs into the
  per-task `TaskActivity` stream and the workspace-wide
  `EntityActivity` feed.
- The History panel filters activities to assignment and status events,
  resolves participant names from workspace members, and renders them
  oldest-first so the chain reads in the order it actually happened.

### Changed

#### Whole task card is draggable on the kanban board
Drag-and-drop listeners moved from the small `GripVertical` handle onto
the `TaskCardPremium` root, so the entire card body initiates a drag.
The grip icon remains as a visual affordance. Interactive children
(menu, checkbox, quick-status, archive, quick-edit) stop pointer-down
propagation so clicks on them no longer initiate a drag.

### Fixed

#### Links in task descriptions are clickable after saving
The TipTap `Link` extension now uses `openOnClick: true` with
`target="_blank"` and `rel="noopener noreferrer nofollow"`, so URLs
typed into a task description open in a new tab on click instead of
being inert.

### Tests

- Added six Playwright e2e specs covering: attachment upload during
  task creation with start/end dates and estimated hours; the Overdue
  badge; the Over estimate badge; the assignment history chain; the
  whole-card drag affordance; and clickable links in saved
  descriptions. A shared `task-test-helpers.ts` fixture sets up the
  board mocks for all of them.

## [0.7.3] - 2026-04-27

### Added

#### Task modal GitHub PR linking
Task modals now link to real synced GitHub pull requests instead of the
old placeholder `pr_references` field.

- Added sprint task API endpoints to search workspace pull requests, list
  task GitHub links, manually link a PR, and unlink an existing PR.
- The task modal now shows linked PRs with repository, number, title,
  state, and outbound GitHub links.
- Added a searchable PR picker with explicit link/unlink actions and
  loading/error feedback through React Query mutations.
- Added Playwright coverage for opening a task modal from a board deep
  link, displaying existing PR links, linking a synced PR, and unlinking
  an existing PR.

#### Task modal GitHub issue linking
Tasks can now connect to GitHub issues from the project board.

- Added GitHub issue link metadata to `task_github_links` with repository,
  issue number, title, state, and URL.
- Added issue search/link/unlink APIs for both sprint tasks and project
  backlog tasks.
- Added GitHub issue repository context APIs so task modals can explain
  which repo will be used for bare `#123` references.
- Added task title/description auto-linking for explicit `owner/repo#123`
  references and GitHub issue URLs. Bare `#123` links only when the
  project has a single imported GitHub issue repository.
- The task modal now shows linked GitHub issues separately from PRs and
  supports manual issue linking from imported GitHub issues.
- The task modal now supports manual repo override for cross-repo issue
  links using `owner/repo`, `#123`, `owner/repo#123`, or full GitHub
  issue URLs.
- Extended Playwright coverage to verify auto-linked issues, manual issue
  linking, cross-repo issue override, and issue unlinking.

### Fixed

#### Task modal close behaviour on deep links
Closing a task modal opened from `/sprints/{projectId}/board?task=...`
now removes only the `task` query parameter and prevents the modal from
immediately reopening while the route updates. The same modal path is
used from the board and deep-link entry points.

### Changed

#### Task modal polish
Refined the task modal into a wider, more deliberate editing surface:
status changes are saved explicitly, unsaved edits prompt before closing,
dialog accessibility metadata was added, and the GitHub PR section now
lives in the main task content area.

---

## [0.7.2] - 2026-04-14

### Added

#### Microsoft (Entra ID) login — parallel to Google sign-in
Added direct Microsoft 365 / Entra ID sign-in alongside the existing
Google flow. Tenant defaults to `common` so both personal (`@outlook.com`,
`@hotmail.com`) and work/school accounts can sign in.

- Three endpoints: `GET /api/v1/auth/microsoft/login` (basic profile + email),
  `/auth/microsoft/connect-crm` (adds Mail + Calendar via Graph), and
  `/auth/microsoft/callback`. Two-scope split mirrors Google.
- New `MicrosoftConnection` SQLAlchemy model and migration
  (`migrate_2026_04_14_microsoft_connections.sql`), parallel to
  `GoogleConnection`.
- `DeveloperService.get_or_create_by_microsoft` with scope-merge rule:
  a subsequent basic login never clobbers tokens that already hold
  `Mail.Read` / `Calendars.ReadWrite`.
- Graph `/me` user info uses `mail` with `userPrincipalName` fallback
  (personal accounts return `mail: null`).
- Profile fields (email / display name / avatar) resync every time the
  user signs in, so Azure AD changes propagate.
- Frontend: "Continue with Microsoft" button + MS lockup icon in the
  two CTA blocks on the landing page.
- 16 integration tests covering service scope-merge, redirect URL shape,
  state validation, happy-path callback with mocked Graph responses,
  and the personal-account `userPrincipalName` fallback.

#### Refresh-token rotation for Google + Microsoft OAuth
New `aexy.services.oauth_token_service` centralises refresh-token
behaviour for every OAuth-holding row type (developer connections,
workspace Google integrations, booking calendar connections). Three
ad-hoc copies of the refresh flow (`gmail_sync_service`,
`calendar_sync_service`, `booking/calendar_sync_service`, and
`api/chat.py`) have been retired — they each had the same two bugs:
rotated refresh tokens were silently dropped, and every non-200
response was treated as "please reconnect" without distinguishing
`invalid_grant` from a transient 5xx.

- `ensure_valid_google_token(db, GoogleConnection)`,
  `ensure_valid_microsoft_token(db, MicrosoftConnection)`,
  `ensure_valid_google_integration_token(db, GoogleIntegration)`, and
  `ensure_valid_calendar_connection_token(db, CalendarConnection)` all
  share two primitives (`_refresh_google`, `_refresh_microsoft`).
- Revocation signalling per model:
  - Nullable `refresh_token` columns are cleared (raises
    `RefreshTokenRevokedError`).
  - `GoogleIntegration.refresh_token` is NOT NULL, so it's marked
    `is_active=False` + `last_error="refresh_token_revoked"`.
  - Booking `CalendarConnection` additionally flips `sync_enabled=False`.
- Microsoft refresh re-requests stored scopes for developer connections
  and the narrow `Calendars.ReadWrite offline_access` pair for booking
  calendars.
- 16 new tests cover rotation, no-op-when-fresh, `invalid_grant`
  clearing, transient 5xx preserving state, scope propagation, and
  the CalendarConnection dispatch-by-provider behaviour.

#### Surface workspace-view picker on the Appearance settings page
The persona/preset selector that filters sidebar sections and chooses
dashboard widgets was previously reachable only via the Dashboard
"Customize" modal. It now also lives at `/settings/appearance`, wired
to the same `useDashboardPreferences` hook so Dashboard and Settings
stay in sync.

#### Create projects inline from /sprints
The `/sprints` empty-state and top action bar now open an inline
project creation modal instead of redirecting to
`/settings/projects`. On create, the user lands directly on
`/sprints/{newProjectId}/board`. The shared
`CreateProjectModal` component is used by both pages.

### Fixed

#### Next.js 16 async dynamic route params
Next 16 made `params` in `[projectId]/board/page.tsx` (and siblings) an
async Promise. Fixed across 12 dynamic routes under `/sprints` and
`/crm/agents`: client components use `React.use(params)`, server
components `await params`.

#### Onboarding: workspace switcher post-onboarding
"Create workspace" link in the sidebar (`WorkspaceSwitcher`) routed to
`/onboarding/workspace`, which the `OnboardingGuard` redirected back to
`/dashboard` for already-onboarded users — making workspace creation
impossible. The guard now lets `/onboarding/workspace` through, stale
`localStorage` state is cleared on visit, and the newly created
workspace is auto-selected via `switchWorkspace()` so the sidebar
updates immediately.

#### Hydration mismatch from the Redeviation browser extension
Added `suppressHydrationWarning` on `<html>` in the root layout — the
Redeviation DevTools extension injects `data-redeviation-bs-uid` onto
the tag before React hydrates.

#### `create project` / `New project` flow no longer bounces through
`/settings/projects`; it creates the project in-place and jumps to
the new board.

### Changed

#### docker-compose no longer hardcodes LLM env vars
`docker-compose.yml` and `docker-compose.dev.yml` no longer set
`LLM_PROVIDER`, `LLM_MODEL`, or any `*_API_KEY` — pydantic reads them
from `backend/.env` by itself. Previously compose set empty strings
that silently shadowed `.env`, so switching providers required editing
compose instead of `.env`. Production compose keeps the injected-via-
shell pattern it was designed for.

#### npm audit vulnerabilities (15 → 0)
`npm audit fix` cleared the 8 non-breaking advisories (critical axios,
high next/rollup/picomatch, moderate brace-expansion/follow-redirects/
markdown-it/next-intl open-redirect). Upgraded vitest 1.2.1 → 4.1.4
to clear the remaining vite path-traversal + esbuild dev-server
issues; tightened `vitest.config.ts` include/exclude so vitest 4's
stricter scanner doesn't pull in Playwright e2e specs from
`.next/standalone/`. Pinned `node-fetch ^2.7.0` via `overrides`
rather than downgrading face-api.js (which `npm audit fix --force`
wanted to do to no actual security benefit).

---

## [0.7.1] - 2026-04-14

### Added

#### DeepSeek as a first-class LLM provider
Added direct DeepSeek API support alongside Claude, Gemini, Ollama, and OpenRouter. DeepSeek uses an OpenAI-compatible endpoint (`https://api.deepseek.com/chat/completions`) with models `deepseek-chat` (non-thinking DeepSeek-V3.2) and `deepseek-reasoner` (thinking DeepSeek-V3.2).

- New `DeepSeekProvider` with model fallback, 429 `retry-after` handling, usage extraction
- Wired into `LLMGateway` factory + `get_llm_gateway()` bootstrap
- Added `DEEPSEEK_API_KEY` and `DEEPSEEK_FALLBACK_MODELS` env vars (defaults to `deepseek-reasoner`)
- Rate-limit knobs: `DEEPSEEK_REQUESTS_PER_MINUTE`, `DEEPSEEK_REQUESTS_PER_DAY`, `DEEPSEEK_TOKENS_PER_MINUTE`
- Billing: 28¢/M input, 42¢/M output (cache-miss rate; same for both models)
- Plan tiers updated to include `deepseek` in `llm_provider_access`
- Unit tests: `tests/unit/test_deepseek_provider.py` (12 tests, mocked HTTP)
- Live compatibility harness: `scripts/check_llm_provider.py` — provider-agnostic; runs `health_check` → `call_llm` → `analyze(CODE)` → `extract_task_signals` and reports pass/fail. Use any time a provider or model is swapped.

#### Onboarding: create additional workspaces after initial setup
The sidebar "Create workspace" link routes to `/onboarding/workspace`, but the `OnboardingGuard` was redirecting already-onboarded users back to `/dashboard` — making workspace creation impossible post-onboarding.

- `OnboardingGuard` now allows `/onboarding/workspace` (and `/onboarding/complete`) through for existing users
- Workspace step clears stale localStorage-cached workspace state for already-onboarded users, so they see the "Create / Join" choice instead of "Workspace Ready"
- After create / accept-invite, existing users route to `/dashboard` (instead of `/onboarding/connect`) and the new workspace is auto-selected via `useWorkspace.switchWorkspace()` so the sidebar updates immediately

### Fixed

- Hydration mismatch on `<html>` caused by the Redeviation browser extension injecting `data-redeviation-bs-uid` — added `suppressHydrationWarning` to the root layout

### Changed

- `docker-compose.yml` and `docker-compose.dev.yml` no longer hardcode `LLM_PROVIDER`, `LLM_MODEL`, or any `*_API_KEY`. LLM config is read from `backend/.env` by pydantic settings — single source of truth. Previously empty-string values in compose silently shadowed `.env`, breaking provider selection. Prod compose (`docker-compose.prod.yml`) continues to inject secrets from the host shell env as designed.

---

### Added

#### Reviews UX/UI Audit & Fixes (20 issues fixed, 30 Playwright E2E tests)
Comprehensive UX/UI audit of the Performance Reviews feature with screenshot-driven TDD fixes.

- **P0 Fixes**: "Active Unknown" bug, date validation on cycle creation, disabled button tooltips, AI preview empty states, success toasts on create/delete
- **P1 Fixes**: Styled delete confirmation modal (replaces browser `confirm()`), ARIA tab attributes (`role=tablist/tab/tabpanel`), breadcrumb navigation consistency, mobile card view for cycles DataTable, user-facing error toasts on API failures
- **P2 Fixes**: Filter count badges on goals tabs, form label accessibility (`htmlFor`/`id`), live goal card preview on create form, `aria-label` on icon-only buttons, cycle timeline preview with phase markers, `aria-live` regions for screen readers, unified loading spinners to `primary-500`
- **Contributions & Feedback tabs**: Wired up with real data (metrics grid, skills, AI summary, self-review responses, full COIN peer feedback)
- **Onboarding**: Fixed checklist href, added "Create a SMART goal" item to developer/manager presets
- **Audit doc**: `review-screenshots/REVIEW_AI_UX_AUDIT.md` with before/after screenshots

#### Next.js 16 + React 19 Upgrade
- Upgraded `next` from 14.1.0 to 16.2.1, `react`/`react-dom` to 19.x
- Fixed JSX parse error in `CustomFieldTypeManager.tsx` (stricter parser)
- Installed missing `@tiptap/suggestion` dependency
- Defensive null check in `useAppAccess.ts`

#### Internationalization (i18n) with next-intl
Full i18n infrastructure with English + Hindi support across all modules.

- **next-intl**: Cookie-based locale system with middleware, Zustand locale store, and language selector in sidebar
- **20 module message files** per locale (EN + Hindi): common, reviews, sidebar, dashboard, tracking, settings, sprints, insights, crm, hiring, agents, booking, email-marketing, learning, uptime, compliance, admin, marketing, products, pages
- **Per-module JSON files** merged at build time via `npm run i18n:merge` (auto-runs on `prebuild`)
- **~1800+ translation keys** per locale covering all feature modules + homepage + product pages + pricing
- **7 review pages** fully converted to `useTranslations()` — remaining pages can adopt incrementally
- **CLAUDE.md** updated with i18n architecture docs, conventions, and how-to guides

### Changed
- `docker-compose.dev.yml` added with non-conflicting ports for parallel development
- CORS origin added for dev port 3003
- JSONB `server_default` syntax fix in dashboard and CRM models

## [0.7.0] - 2026-03-25

### Added

#### OpenRouter AI Provider
OpenRouter is now available as a first-class LLM provider, giving access to 100+ models (Claude, GPT-4o, Llama, Gemini, DeepSeek, etc.) through a single API key.

- **OpenRouterProvider**: Full `LLMProvider` implementation using the OpenAI-compatible chat completions API (`POST /chat/completions`) with Bearer auth, rate limit handling (429 with `retry-after`), and health checks via `/models`
- **Automatic model fallback**: When the primary model is rate-limited or unavailable (429/503), automatically tries the next model in a configurable fallback list — set `OPENROUTER_FALLBACK_MODELS` (comma-separated) to customize the fallback order
- **Configuration**: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default: `anthropic/claude-sonnet-4`), `OPENROUTER_FALLBACK_MODELS` (default: `google/gemini-2.0-flash,openai/gpt-4o,deepseek/deepseek-chat-v3,meta-llama/llama-3.1-70b-instruct`) env vars
- **Rate limiting**: Per-provider Redis-backed rate limits (`OPENROUTER_REQUESTS_PER_MINUTE`, `OPENROUTER_REQUESTS_PER_DAY`, `OPENROUTER_TOKENS_PER_MINUTE`)
- **Usage billing**: Configurable token pricing (`OPENROUTER_INPUT_PRICE_PER_MILLION`, `OPENROUTER_OUTPUT_PRICE_PER_MILLION`)
- **Frontend**: OpenRouter added to provider selector with Globe icon, indigo theme, and 5 default models; usage page shows OpenRouter breakdown
- **Docker**: `OPENROUTER_API_KEY` passed through in both `docker-compose.yml` and `docker-compose.prod.yml`

#### Platform Organization
Auto-CRM contact creation and onboarding drip email sequences triggered on user signup.

- **PlatformService**: Creates CRM contacts and enrolls new signups into onboarding drip email workflows when `PLATFORM_ORG_ID` is configured
- **Temporal activity**: `platform_on_signup` activity dispatched from the signup flow for async processing
- **Configuration**: `PLATFORM_ORG_ID` env var — set to a workspace UUID to enable

## [0.6.8] - 2026-03-21

### Added

#### Postmark Email Provider
Postmark is now available as an email provider across all three sending paths — notification emails, campaign/workflow emails, and mailagent domain-aware sending.

- **Backend EmailService**: Added `_send_via_postmark()` method, `is_postmark_configured` property, and Postmark routing in `_send_email()` — set `EMAIL_PROVIDER=postmark` to use for all notification emails
- **Mailagent PostmarkProvider**: Full `EmailProvider` implementation with `send()`, `verify_credentials()`, and native `send_batch()` (up to 500 per call via `/email/batch`)
- **PostmarkAccountService**: Account API client for managing sender signatures (`create`, `delete`, `list`) and domains (`verify`, `get`) using the Account API token
- **Agent email integration**: Automatic Postmark sender signature creation when allocating agent email addresses, and cleanup on disable
- **Message streams**: Separate transactional (`POSTMARK_TRANSACTIONAL_STREAM`, default `outbound`) and broadcast (`POSTMARK_BROADCAST_STREAM`, default `broadcast`) stream support — notification emails use transactional, campaigns use broadcast
- **Configuration**: `POSTMARK_SERVER_TOKEN`, `POSTMARK_ACCOUNT_TOKEN`, `POSTMARK_SENDER_EMAIL`, `POSTMARK_SENDER_NAME`, `POSTMARK_TRANSACTIONAL_STREAM`, `POSTMARK_BROADCAST_STREAM` env vars in backend; `POSTMARK_SERVER_TOKEN` in mailagent

## [0.6.7] - 2026-03-01

### Added

#### Team Chat System
Zulip-inspired real-time team chat with channels, topics, and threaded messages, accessible from a dedicated `/chat` page and a floating widget on every page.

- **Channels and topics**: Create and browse channels with topic-based threading; topic list with unread counts, last message preview, and participant count
- **Real-time messaging**: WebSocket-powered message delivery with typing indicators, presence status, and per-channel relay filtering
- **Floating chat widget**: FAB-accessible widget with Threads, Notifications, and Activity tabs; shared WebSocket connection via `ChatWebSocketProvider` (no duplicate connections)
- **Unified inbox**: Aggregated unread threads across all channels with click-through navigation
- **Google Meet integration**: Create Meet links directly from the message composer via Google Calendar API
- **Thread persistence**: Both widget and full page remember last opened channel/topic across sessions via Zustand store
- **Message composer**: Emoji picker, file attachments (drag-and-drop upload to RustFS), typing indicators, and responsive toolbar layout
- **Sprint task import**: Import tasks from external sources into sprint boards

#### Ask AI — Agentic Chat
Integrated AI chat assistant with multi-provider LLM support, server-side tool execution, and streaming responses.

- **Ask AI in chat page**: AI tab in the channel sidebar with conversation list (own + shared), date-grouped history, search, and inline delete
- **Agentic tool loop**: Server-side tool calling with workspace-scoped tools (sprints, tasks, tickets); tool calls streamed to client with status indicators
- **Multi-provider streaming**: SSE streaming via Anthropic, OpenAI, and Gemini providers through the unified LLM gateway
- **Ask AI in floating widget**: Compact AI chat view in the floating widget with conversation history browsing, share button, and participant avatar stack
- **Conversation sharing**: Share AI conversations with workspace members via direct add (with permission levels: read/write/owner) or share links (token-based, optional password, expiry, max uses)
- **Real-time collaboration**: Redis pub/sub for participant presence, AI lock to prevent concurrent responses, message queue for collaborative conversations
- **Share notifications**: In-app notifications when added as participant or when someone joins via share link, with click-through navigation to the conversation
- **Notification settings**: Chat category added to notification preferences page with `chat_mention` and `ai_conversation_shared` event types

#### AI Feedback & Benchmarking
- **Feedback collection**: Thumbs up/down on AI outputs across Ask AI, Agents, and Automations
- **Latency tracking**: Per-response latency measurement across all three LLM streaming providers
- **Admin benchmarking dashboard**: Volume trends, token usage breakdown, tool success rates, and negative feedback review queue

#### API Token Auth & MCP Integration
- **API token system**: `ApiToken` model with `aexy_` prefixed tokens, CRUD endpoints, create/validate/revoke service methods
- **Dual auth support**: API tokens accepted alongside JWT in auth middleware for external integrations
- **MCP setup page**: Frontend configuration page for Model Context Protocol integration with connection instructions
- **API tokens settings page**: Token management UI with copy-to-clipboard, delete confirmation, and last-used tracking (debounced to 5-min intervals)

### Fixed

#### Chat Security & Performance
- **Workspace authorization on all chat endpoints**: Added `_check_workspace` membership guard to every chat API endpoint (channels, topics, messages, presence, file upload)
- **Private channel access control**: Added `_check_channel_access` helper enforcing membership checks on topic listing, creation, message listing, and message sending for private channels
- **WebSocket workspace validation**: Reject WebSocket connections from non-workspace-members with close code 4003
- **WebSocket channel isolation**: Relay messages only to subscribers of the target channel
- **Input validation**: `max_length` constraints on all chat message and channel inputs
- **File upload content-type bypass**: Validate actual file content type, not just the declared MIME type
- **File upload extension validation**: Whitelist allowed file extensions; reject SVG uploads to prevent stored XSS
- **Channel update authorization**: Enforce ownership/admin checks on channel mutations
- **Presence status validation**: Reject invalid presence status values (only `online`, `away`, `offline` allowed)
- **Topic listing limit**: Added `LIMIT 200` to prevent unbounded topic queries
- **Service/API commit boundary**: Replaced all `db.commit()` in `ChatService` with `db.flush()`; explicit `await db.commit()` in all mutating API endpoints
- **N+1 query elimination**: Batch methods for inbox and topic queries; atomic `message_count` updates; correlated subqueries for `list_conversations` in Ask AI
- **TOCTOU race conditions**: `IntegrityError` handling for concurrent topic/message creation
- **Auto-scroll fix**: Only auto-scroll when user is already at the bottom of the message list
- **Memory leak fixes**: Clean up Object URLs, typing timeout intervals, and flash-success timeouts on component unmount
- **Stale WebSocket reconnect**: Fix reconnection using fresh token after re-auth
- **React performance**: `React.memo` on `MessageItem`, memoized WebSocket context value, deduplicated `markTopicRead` calls

#### Auth & API Security
- **Dual-session bug**: `get_current_developer_id` now uses the injected DB session instead of creating a separate one via `get_async_session()`
- **Seed migration removed**: Removed insecure seed migration containing hardcoded token hash
- **Hardcoded URLs removed**: MCP page uses `NEXT_PUBLIC_API_URL` env var instead of hardcoded localhost
- **Sanitized platform admin errors**: Internal exception details no longer exposed in error responses

#### AI Chat Security
- **Conversation ownership enforcement**: Cross-user conversation access blocked at service layer
- **Delete authorization**: Ownership check enforced before conversation deletion
- **Share link revocation authorization**: Ownership verification before revoking share links
- **bcrypt password hashing**: Share link passwords hashed with bcrypt instead of SHA-256
- **Cross-workspace data isolation**: Tools scoped to the requesting user's workspace
- **Sanitized error messages**: Internal error details stripped from SSE error events
- **API key protection**: LLM provider keys never exposed in client-facing responses
- **Pydantic literal validation**: `permission` fields in share schemas use `Literal["read", "write"]` instead of `str`

#### Frontend Security & Stability
- **Duplicate WebSocket eliminated**: `AskAIChatPanel` now uses `useChatWebSocketContext()` instead of creating a second `useChatWebSocket()` connection
- **Open redirect prevention**: Notification click-through validates `action_url` is a relative path (starts with `/`, not `//`)
- **XSS prevention in chat messages**: URL scheme validation (`http:`/`https:` only) before rendering user-provided URLs as `<img>` or `<a>` elements
- **Race condition fix**: `useStreamMessage` accepts override `conversationId` parameter, eliminating unreliable `setTimeout` in widget first-message flow
- **Store subscription optimization**: `useStreamMessage` uses `useAskStore.getState()` for mutations during streaming, preventing cascading re-renders
- **Memoized participant IDs**: `AskShareDialog` wraps `participantIds` Set in `useMemo` for stable dependency tracking
- **Stable effect dependencies**: `MessageThread` queue-flush effect uses ref for `sendMessage` to prevent infinite re-render loops
- **Floating widget hook optimization**: Split into wrapper + inner component so hooks don't run on `/chat` pages
- **Clipboard error handling**: Share link copy wrapped in try/catch with user-facing error toast
- **Delete confirmation**: AI conversation delete requires `window.confirm()` before proceeding

### Changed
- **MCP sidebar placement**: Moved under AI Agents as a sub-item instead of standalone sidebar entry
- **CopyButton extraction**: Duplicated copy-to-clipboard logic extracted to shared `components/ui/copy-button`
- **Delete confirmation UX**: API token delete uses inline Delete/Cancel step instead of browser `confirm()`

### Database Migrations
- `migrate_ask_collaborative.sql` — `ask_conversation_participants` and `ask_share_links` tables for collaborative AI conversations

---

## [0.6.6] - 2026-02-28

### Added

#### Notification System
Full multi-channel notification infrastructure with 4 delivery channels (in-app, email, Slack, web push) and workspace-wide event coverage.

- **22 new notification event types** covering leave, uptime, learning, forms, campaigns, automations, hiring, GTM, and documents modules
- **Email and Slack delivery**: Replace stubbed dispatch with actual Temporal activity-based delivery via EmailService (SES/SMTP) and Slack DMs; add `slack_sent`/`slack_sent_at` tracking columns
- **Web push notifications**: VAPID key configuration, service worker registration, push subscription management, and `send_notification_web_push` Temporal activity
- **Mention notifications**: Parse TipTap `mention:user:{uuid}` links from ticket comments, CRM notes, and sprint task comments; deliver in-app notifications respecting preferences (self-mentions skipped)
- **Category-based preferences**: 10 notification categories (sprints, reviews, agents, uptime, etc.) with per-channel toggles in frontend settings page
- **Notification sidebar**: Notification bell with unread count and dropdown panel in the main navigation
- **Graceful VAPID handling**: Web push hook skips silently when VAPID key is not configured

#### Agent Policy Engine (APE)
Governance layer that evaluates agent tool calls before execution, with audit trail and billing integration.

- **5 policy types**: `tool_block`, `tool_require_approval`, `field_restriction`, `rate_limit`, `token_budget` — workspace-scoped, priority-ordered, per-agent or global
- **Policy evaluation in LangGraph**: Per-tool-call gating in `BaseAgent._process_tools` — blocked calls return `[BLOCKED] reason` as `ToolMessage` so the LLM can adjust
- **Decision audit log**: Every tool call evaluation (allow, block, require_approval, rate_limited) recorded in `agent_policy_decisions` table with confidence context
- **Config change audit**: Append-only `agent_config_audits` table tracks agent create/update/delete/toggle with old/new field diffs
- **Token usage billing**: Agent execution token counts flow through `UsageService.record_usage()` with `analysis_type="agent_execution"`
- **Policy notifications**: Blocked and approval-required events notify workspace admins/owners via all 4 notification channels
- **CRUD API**: Full REST endpoints at `/workspaces/{ws}/crm/agent-policies` with admin-only mutations and workspace permission checks
- **Backward compatible**: No policy engine = no behavior change; fail-open on evaluation errors

#### Unified Activity Feed
Cross-module activity logging surfaced in a dedicated `/activity` page with filtering and infinite scroll.

- **Activity logger**: `log_activity()` helper using `begin_nested()` savepoints so logging failures never roll back parent transactions
- **22 entity types tracked**: Tasks, sprints, bugs, tickets, CRM records, documents, epics, releases, reviews, assessments, compliance, forms, goals, leave, agents, email campaigns, roles, stories, and workflows
- **UnifiedActivityFeed component**: Date-grouped timeline with entity type filter chips, entity-specific icons/colors, and click-through navigation to source entities
- **Infinite scroll**: `useActivityFeed` hook with `useInfiniteQuery` and `IntersectionObserver`-based pagination
- **Backend URL mapping**: `ActivityFeedService.get_entity_url()` resolves entity-specific deep links
- **Sidebar integration**: Activity feed added to main navigation

#### Sprint Module Upgrade
- **Planning poker**: Real-time estimation sessions with WebSocket-based voting, card flip animations, keyboard shortcuts (1-7 vote, R reveal, Enter accept), consensus celebration, and online participant indicators
- **Planning poker chat**: Real-time team chat within poker sessions via WebSocket broadcast
- **Sprint analytics**: Velocity tracking, burndown data, and sprint comparison endpoints
- **Task archival**: Soft delete (`is_archived`) replaces hard delete for sprint tasks
- **App access requests**: Request/approve/reject workflow for module access with notification integration
- **Improved task view**: Enhanced task detail display with richer metadata
- **Onboarding redesign**: Upgraded onboarding flow with improved UX across connect, repos, invite, and completion pages

### Fixed

#### Planning Poker Security & Reliability
- **WebSocket JWT authentication**: Replace unauthenticated `user_id`/`user_name` query params with JWT token verification
- **Thread-safe connections**: `asyncio.Lock` for WebSocket connect/disconnect to prevent race conditions
- **Chat rate limiting**: 5 messages per 10-second window per user
- **Exponential backoff reconnect**: 1s–30s delays with max 10 attempts
- **SQLAlchemy boolean comparison**: `is_(False)` instead of `== False`
- **Frontend modals**: Replace browser `confirm()`/`alert()` with proper modal dialogs and toast notifications
- **Schema cleanup**: Remove unused Pydantic schemas (`PlanningPokerVote`, `PlanningPokerState`, etc.)

#### Unified Activity Feed Quality
- **`assessment.workspace_id` AttributeError**: Fixed to use `organization_id` (Assessment model doesn't have `workspace_id`)
- **Duplicate ticket comment logging**: Removed copy-pasted `log_activity` block that created 2 entries per comment
- **Internal ticket comment leak**: Skip activity logging for internal notes to prevent existence leak in feed
- **Double-logging in sprints**: Removed API-layer `log_activity` calls where service layer already logs the same operations
- **Missing actor_id in reviews**: Added `current_user` dependency and `actor_id` to `submit_self_review`, `submit_manager_review`, `finalize_review`
- **Extra DB queries in reviews**: Replaced 2-query workspace_id lookups with single JOIN query

#### Notification System Fixes
- **3 broken integrations fixed**: Insights, tracking tasks, and agent mentions now route through `NotificationService` instead of bypassing it
- **Leave type resolution**: Resolve leave type names from DB instead of passing raw UUIDs in notification bodies
- **Template variable formatting**: Format notification titles with template variables (not just body text)

### Changed
- **Notification preferences seeded**: Migration seeds default preferences for all existing users
- **Sprint goals migration**: Added `sprint_goals` table for sprint goal tracking

### Database Migrations
- `migrate_notification_slack_sent.sql` — slack_sent tracking columns on notifications
- `migrate_notification_events.sql` — 22 new event types and category preferences
- `migrate_notification_providers.sql` — web push subscription storage and VAPID config
- `migrate_agent_policies.sql` — agent_policies, agent_policy_decisions, agent_config_audits tables with `updated_at` trigger
- `migrate_app_access_requests.sql` — app access request/approval workflow
- `migrate_sprint_goals.sql` — sprint goals table

---

## [0.6.5] - 2026-02-27

### Added

#### GTM (Go-To-Market) Module — Phase 2A–2D
Full AI-powered go-to-market automation system for outreach, lead scoring, visitor tracking, competitor intelligence, and account-based marketing.

**Phase 2A — Scoring Feedback Loop & Foundation**
- **Scoring feedback loop**: Email open/click events from campaign recipients auto-dispatch Temporal `score_lead` activities, linking engagement to CRM records
- **Provider slots UI**: Frontend fetches registered provider slots from `/providers/available`, displays configured providers with "Coming Soon" for unimplemented ones
- **Reply signal correction**: Properly emit `reply_received` when routing replies to sales; Temporal workflows finalize with `exit_reason="replied"`

**Phase 2B — Outreach Excellence & Warmup**
- **Timezone-aware send windows**: Skip weekends, enforce per-recipient timezone from CRM records
- **A/B variant selection**: Weighted random assignment with `variant_index` tracking on step executions
- **Reply threading**: `thread_id` forwarding for conversation continuity across outreach steps
- **Warmup bug fixes**: Fixed `increment_send_count` naming, `can_send()` missing workspace_id, warming metrics field mismatch

**Phase 2C — Intelligence Layer & LLM Integration**
- **Competitor intelligence**: Smart content extraction (strips nav/footer/scripts), LLM-powered change classification (pricing, feature, positioning, hiring, cosmetic), auto-skip cosmetic changes
- **Battle card generation**: LLM produces structured battle cards with strengths, weaknesses, advantages, objection handling, and talk tracks
- **Competitor changes UI**: Full change history tab with severity badges
- **Intent signals**: Job posting scraping from /careers pages with keyword matching and confidence scores; tech change detection from homepage scanning
- **ABM account scoring**: Real engagement calculation wired to outreach executions, campaign opens/clicks, visitor sessions, and intent signals with weighted scoring

**Phase 2D — Scale & Ops**
- **Outbound webhooks**: HMAC-SHA256 signed deliveries, secret rotation, delivery logging, test endpoint, and alert hub integration with automatic fan-out
- **Provider health tracking**: Hourly-bucketed API metrics (request counts, latency percentiles, error tracking) via GTMProviderHealthService
- **Pipeline dashboard**: Aggregated scoring, visitor, outreach, provider health, and webhook stats
- **Performance indexes**: Added indexes on behavioral_events, outreach executions, and visitor sessions
- **Connection pool tuning**: Optimized pool_size=10, max_overflow=20, recycle=1800s

#### Progressive Sidebar
- **Persona-based sidebar filtering**: Sidebar sections/items filtered by active persona (Developer, Manager, HR, Sales, etc.) via `useSidebarPersona` hook with server-persisted preferences
- **Favorites section**: Pinned items + auto-detected frequently visited pages shown at top of sidebar
- **Categorized Discover section**: Hidden modules grouped by category (Engineering, People, Business, Productivity) with reason tags — "Available in [persona] view" for persona-hidden items, "Not enabled" for access-gated items
- **Direct navigation for persona-hidden items**: Arrow button navigates directly to pages the user has access to but aren't shown in current persona
- **Admin quick-enable toggle**: Admins can enable disabled apps directly from Discover section via `+` button
- **Page visit tracker**: `usePageVisitTracker` hook records page visits for smart favorites
- **Label constants**: Added `CATEGORY_LABELS` and `PERSONA_LABELS` to `appDefinitions.ts`

#### Dashboard Enhancements
- **Persona-specific getting started checklist**: Onboarding checklist tailored to active persona with server-side persistence
- **Engineering Manager preset**: Added growth trajectory and soft skill tabs

### Fixed

#### GTM Security (44+ issues across all phases)
- **SSRF protection**: Blocks private IPs, cloud metadata, non-HTTP schemes in SEO audit crawler, competitor page checker, webhooks, email tracking, and intent collection
- **Prompt injection mitigation**: `sanitize_for_llm()` strips injection patterns from external content before LLM prompts
- **Rate limiting**: Redis-backed sliding-window rate limiter on public event ingestion (60 req/min per IP, 300 req/min per workspace)
- **Consent-gated tracking**: Rewrote `aexy-track.js` with data-consent attribute, GPC signal support, and blocked `identify()` without consent
- **Workspace authorization**: Added workspace_id filter to step execution, status update, and sequence stats endpoints
- **Mass assignment prevention**: Replaced unconstrained `setattr` with explicit allowlists in update_provider, update_template, update_competitor
- **GDPR erasure**: Extended to find record_ids from CRM records and outreach enrollments; anonymize CRM records
- **Format string injection**: Replaced `str.format(**event_data)` with `string.Template.safe_substitute()` in alert templating
- **CSV payload limits**: 1.5MB size check on async import endpoint
- **Suppression list dedup**: UniqueConstraint on (workspace_id, email), idempotent add
- **Required admin role**: Added `required_role="admin"` to 44 write/delete GTM endpoints

#### GTM Code Quality
- **API monolith split**: Split `api/gtm.py` (2844 lines) into 20 focused sub-modules under `api/gtm/` package
- **Activity monolith split**: Split `temporal/activities/gtm.py` (1616 lines) into 9 domain modules under `activities/gtm/`
- **Data retention**: Added `purge_behavioral_events` activity with 365-day configurable retention
- **Referential integrity**: Added ForeignKey to record_id on 8 GTM models with CASCADE/SET NULL
- **TypeScript types**: Added 30+ interfaces and typed 64 GTM API function return types
- **Frontend field mismatches**: Fixed INET serialization, Docker env passthrough, 6 missing GTM sidebar nav pages

#### Dashboard & Sidebar
- **Widget layout spacing**: Fixed dashboard widget spacing, icon sizes, and card header consistency
- **Layout spacing**: Fixed layout spacing issues across dashboard cards

### Changed
- **No-downtime deployments**: Updated ready endpoint to support rolling deployments
- **Sidebar rendering**: Main nav now renders from persona-filtered layout; Discover section uses full unfiltered layout
- **Auth hydration**: Resolved race condition in app layout that caused unwanted redirects during initial render

### Database Migrations
- GTM Phase 2B — outreach_step_executions and outreach_enrollments columns
- GTM Phase 2D — webhooks, provider health, behavioral event indexes, triggers
- `migrate_sidebar_preferences.sql` — sidebar_pinned_items and sidebar_page_visits preferences

---

## [0.6.4] - 2026-02-25

### Added

#### Standalone Data Tables
- **Data Tables module**: New first-class `/tables` route for creating and managing standalone data tables, independent of CRM objects
- **Table detail page**: Full table view with search, filtering, column visibility, view switching (table/kanban), and breadcrumb navigation
- **DataTableService**: New service layer (~1000 lines) abstracting table operations away from the CRM service
- **Tables API**: Complete REST API (`/api/v1/workspaces/{id}/tables`) with listing, detail, field CRUD, record CRUD, and bulk operations
- **React hooks**: `useTables`, `useTableFields`, `useTableRecords`, `useTableAccess` hooks for frontend data fetching

#### Field Type System
- **Pluggable field type registry**: Extensible registry pattern for registering and rendering field types
- **14 built-in field renderers**: Text, Number, Date, Email, Phone, URL, Currency, Rating, Checkbox, Select, Multi-Select, Textarea, Computed, Reference
- **FieldRenderer component**: Unified component that resolves and renders fields by type from the registry
- **InlineCell component**: Click-to-edit cells with Tab/Enter/Escape keyboard navigation
- **Column add/edit UI**: Dedicated panel for adding new columns with type picker and configuring existing columns

#### Document Integration
- **InlineDatabase TipTap extension**: Embed live, interactive data tables inside documents with full CRUD support

#### Sharing & Access Control
- **Public share links**: Generate shareable table links with token-based auth, configurable hidden columns, and row filters
- **Public tables API**: Dedicated `/api/v1/public/tables` endpoints for unauthenticated shared access
- **7-layer authorization**: JWT, workspace, app, RBAC, table, row, and column-level access checks
- **`owner_only` row access mode**: Restrict row visibility to the creating user, with admin bypass
- **TableCollaborator visibility**: Private tables now visible to explicitly added collaborators

#### Audit & Observability
- **Table audit trail**: `table_audit_log` table and `TableAuditService` for tracking all table mutations
- **Multi-entity shared views**: Extended `crm_lists` with `entity_type` for shared views across entity types

### Fixed

#### Security
- Escape LIKE wildcards (`%`, `_`) in filter inputs to prevent filter injection
- Switch share link passwords from SHA-256 to bcrypt
- Validate record-to-table ownership before update/delete operations
- Move share link password from query parameter to `X-Share-Password` header

#### Performance
- Replace N+1 bulk delete queries with batch validation and 100-record limit
- Deduplicate 3 redundant `WorkspaceMember` queries into 1 in `resolve_access`

#### Bug Fixes
- Fix `__import__` hack, return type annotations, and `ip_address` type mismatches in backend
- Allow clearing nullable table fields via update
- Remove no-op `_strip_hidden_columns` method
- Remove noisy chat toast notification
- Fix `useMemo` unstable dependency array in frontend components
- TypeScript type fixes across table components

### Changed
- Added Pydantic request models for `update_table` and `create_share_link` endpoints
- Refactored CRM service to delegate table operations to new `DataTableService`

### Database Migrations
- `migrate_data_tables.sql` — Core tables for data table support
- `migrate_data_tables_phase3_7.sql` — Audit log and share link tables

---

## [0.6.3] - 2026-02-25

### Added

#### Platform Features
- **Exports page**: Full data export UI with format selection (PDF, CSV, JSON, XLSX), live status polling, and download management
- **Webhooks settings page**: Webhook endpoint management with secret rotation, event selection, test delivery, and HMAC signature documentation
- **SSO settings page**: SAML/OIDC configuration with provider setup, connection testing, and activation controls
- **Usage dashboard**: Workspace-level usage stats, provider breakdown, plan limits overview, and usage alerts
- **Notification center**: Unified notification page with date grouping, read/unread filtering, and load-more pagination
- **Notification settings**: Per-channel preferences (email, in-app, Slack) for all event types
- **Templates gallery**: Browsable catalog of 21 pre-built automation, form, and assessment templates with category filtering

#### Shared UI Components
- **DataTable**: Generic sortable data table with pagination, skeleton loading, empty states, and accessible keyboard navigation
- **SearchInput**: Reusable search input with clear button, replacing 33 inline implementations
- **Breadcrumb**: Navigation breadcrumb component with `aria-current="page"` support
- **EmptyState**: Shared empty state component with icons, steps, and action buttons, deployed across 15 module pages
- **ErrorBoundary**: Class-based error boundary with retry and error details toggle
- **ModuleError**: Per-module Next.js error.tsx boundary component
- **UpgradeBanner**: Contextual upgrade prompts at key monetization touchpoints with persistent dismissal
- **WorkspaceChecklist**: Getting-started checklist with progress ring for new workspaces
- **DashboardWelcome**: First-visit persona picker for personalized dashboard widget layout

#### Keyboard Shortcuts & Command Palette
- **Global shortcuts**: `g then X` navigation pattern (like GitHub/Linear) for 19 modules
- **Keyboard shortcuts help overlay**: `?` key opens categorized shortcut reference
- **Command palette enhancements**: Added navigation entries for exports, webhooks, templates, and all new pages

#### Automation Triggers
- **Ticket triggers**: `ticket.reopened`, `ticket.priority_changed`, `ticket.escalated`, `response.sent`, `response.received`, `sla.breached`
- **Hiring triggers**: `candidate.rejected`, `candidate.hired`, `assessment.score_above`, `assessment.score_below`
- **Sprint triggers**: `sprint.velocity_calculated`, `sprint.burndown_off_track`
- **Uptime triggers**: `monitor.ssl_expiring`, `monitor.repeated_failures`
- **Campaign trigger**: `campaign.sent`
- **Module automation panels**: Inline automation management UI embeddable in any module page

#### UX Improvements
- **Skeleton loading migration**: Replaced spinner loading states with skeleton placeholders across 20+ pages in 5 batches
- **DataTable migration**: Migrated 17 pages from custom table markup to shared DataTable component in 3 batches
- **Status color tokens**: Centralized status color definitions in `statusColors.ts`, migrated 34 files
- **Toast notifications**: Added success/error toasts to all mutation hooks across 14 hook files
- **Mobile responsiveness**: Improved layout and tracking page responsiveness
- **Contextual upgrade banners**: Added to 7 major modules for free-tier users

### Fixed

#### Critical Bugs
- **Assessment score triggers used wrong ID**: `assessment.workspace_id` did not exist on the Assessment model — changed to `assessment.organization_id` so `score_above`/`score_below` triggers actually fire
- **Ticket reopen detection crashed**: `TicketStatus.OPEN` did not exist in the enum — changed to `TicketStatus.ACKNOWLEDGED`
- **Command palette duplicate ID**: Two entries shared `id: "nav-templates"` causing React key collision — renamed second to `nav-automation-templates`

#### Medium Bugs
- **Burndown off-track trigger skipped on existing metrics**: Early return on updated rows bypassed the deviation check — restructured to always evaluate
- **Uptime triggers fired on every check**: SSL expiring and repeated failures had no debounce — SSL now fires at day thresholds (30/14/7/3/1), repeated failures fires at exactly 3 consecutive
- **Webhook test toast misleading**: `onSuccess` always showed success even when `WebhookTestResult.success` was false — now checks the result
- **useAutomations registry hooks caused re-renders**: Normalization created new object references on every render — wrapped in `useMemo`
- **SSO page silent errors**: `loadConfig`, `handleToggle`, `handleDelete` used `try/finally` with no catch — added error handling with toast notifications
- **SSO page stale closure**: `useEffect` missing `loadConfig` in dependency array — wrapped in `useCallback`
- **SSO API swallowed all errors**: `getConfiguration` caught everything and returned null — now only catches 404
- **Exports page bypassed type safety**: `createExport(data as any)` — replaced with proper type assertion
- **Webhooks page null workspace**: `currentWorkspaceId!` non-null assertion could produce `/workspaces/null/` API calls — added guard

#### Code Quality
- **Hiring dispatch error handling**: Wrapped `candidate.rejected`/`candidate.hired` dispatch calls in try/except for consistency
- **CRM `between` operator**: Added ValueError/TypeError handling for non-numeric values
- **GlobalShortcuts cleanup**: Dynamic event listener and timeout now properly cleaned up on unmount
- **UpgradeBanner dismiss persistence**: Dismiss state now saved to localStorage, survives navigation
- **WorkspaceChecklist JSON.parse safety**: Wrapped in try/catch to handle corrupted localStorage
- **ModuleAutomationsPanel confirm dialog**: Replaced native `confirm()` with styled confirmation modal
- **Dead code removal**: Removed unused `workspaceId` prop from CommandPalette, unused `useAuth` import from SSO page

#### Accessibility
- **CommandPalette**: Added `role="dialog"`, `aria-modal`, `role="combobox"` on search input, `role="listbox"` on results
- **DataTable**: Added `aria-sort` on sortable headers, `tabIndex` and keyboard handlers (Enter/Space) for sortable headers and clickable rows
- **KeyboardShortcutsHelp**: Added `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-label="Close"` on close button
- **DashboardWelcome**: Added `role="dialog"`, `aria-modal`, `aria-label`
- **ErrorBoundary & ModuleError**: Added `role="alert"` on error container
- **SearchInput**: Added `aria-label="Clear search"` on clear button
- **Breadcrumb**: Added `aria-current="page"` on last breadcrumb item
- **UpgradeBanner**: Added `aria-label="Dismiss banner"` on dismiss buttons

---

## [0.6.2] - 2026-02-24

### Added

#### Automation Module Enterprise Improvements
Comprehensive improvements to the automation workflow builder across all 10 modules.

- **Trigger & action descriptions**: All 105 triggers and 66 actions now have human-readable descriptions displayed in the node palette and config panel
- **Backend registry upgrade**: `TRIGGER_REGISTRY` and `ACTION_REGISTRY` now return `{id, description}` objects instead of plain strings, with backward-compatible helper functions (`get_trigger_ids`, `get_action_ids`)
- **Module-aware trigger icons**: TriggerNode now displays context-specific icons for all 10 modules (tracking: ClipboardCheck/Timer/ShieldAlert, compliance: GraduationCap/BookOpen/Award, tickets: Ticket, hiring: UserPlus, etc.) instead of generic Zap
- **Tracking & compliance objects in config panel**: Added object type selectors for tracking (Standup, Time Entry, Blocker, Work Log) and compliance (Training, Assignment, Certification, Audit Log) modules
- **Trigger description in config panel**: Clicking a trigger node now shows the full description in italic below the label field
- **Complete trigger/action label coverage**: Added labels for all missing triggers (`standup.streak`, `time_entry.anomaly`, `blocker.pattern_detected`, `training.bulk_overdue`, `certification.prerequisite_unmet`, etc.) and actions across all modules
- **Pydantic `RegistryEntry` model**: New schema for typed API responses with `id` and `description` fields

### Fixed
- **Missing condition operators**: Implemented `starts_with`, `ends_with`, `not_contains`, and `between` operators in `CRMAutomationService._check_condition()` which previously fell through to `return True`
- **Logging**: Replaced all `print()` calls in `AutomationService.process_module_trigger()` with proper `logger.info/debug/error` calls

---

## [0.6.1] - 2026-02-24

### Added

#### 29 Dashboard Widgets Implemented
Replaced all "Coming Soon" placeholder widgets with full implementations using live data from existing hooks.

- **Goals & Growth** (5): `MyGoalsWidget`, `GrowthTrajectoryWidget`, `PeerBenchmarkWidget`, `LearningPathWidget`, `SkillGapsWidget`
- **Tracking** (3): `StandupStatusWidget`, `TimeTrackingWidget`, `UpcomingDeadlinesWidget`
- **Tickets & Forms** (5): `SLAOverviewWidget`, `RecentTicketsWidget`, `TicketsByPriorityWidget`, `FormSubmissionsWidget`, `RecentFormsWidget`
- **Docs** (2): `RecentDocsWidget`, `DocActivityWidget`
- **Reviews** (3): `PerformanceReviewsWidget`, `PendingReviewsWidget`, `ReviewCycleWidget`
- **Hiring** (4): `HiringPipelineWidget`, `CandidateStatsWidget`, `OpenPositionsWidget`, `InterviewScheduleWidget`
- **CRM** (3): `DealStatsWidget`, `RecentDealsWidget`, `CRMQuickViewWidget`
- **Team & Admin** (4): `TeamOverviewWidget`, `TeamActivityWidget`, `OrgMetricsWidget`, `SystemHealthWidget`

### Fixed
- Fixed `TeamStatsSummaryWidget` to use correct nested `aggregate` property paths
- Fixed `TicketChartWidget` to use theme-aware colors instead of hardcoded dark-mode hex values
- Fixed `TicketPipelineWidget` to remove unnecessary `as any` cast
- Fixed `PeerBenchmarkWidget` ordinal suffixes (1st, 2nd, 3rd instead of always "th")
- Removed dead code from `TicketsByPriorityWidget` (unreachable priority breakdown branch)
- Fixed `UpcomingDeadlinesWidget` to use sprint end date and incomplete tasks instead of nonexistent `due_date` field

---

## [0.6.0] - 2026-02-24

### Added

#### Leave Management Module
Full leave management system with request/approval workflows, balance tracking, and holiday calendar management.
- Backend API with five service layers: `LeaveTypeService`, `LeavePolicyService`, `LeaveRequestService`, `LeaveBalanceService`, `HolidayService`
- Frontend with `LeaveRequestForm`, `LeaveRequestCard`, `LeaveApprovalCard`, `LeaveBalanceCard`, `LeavePolicySettings`, `LeaveTypeSettings`, `HolidaySettings`, `TeamLeaveTable`
- Database migration for leave tables and relationships
- Playwright E2E test suite (749-line spec with fixtures)

#### Team Calendar
Unified calendar view showing leave, holidays, and team availability.
- Backend API and service with Pydantic schemas
- Frontend components: `TeamCalendar`, `CalendarFilters`, `EventDetailModal`, `WhoIsOutPanel`

#### Compliance & Tracking Automation
Temporal-powered automation for compliance monitoring and developer activity tracking.
- Compliance automation activities (396 lines): standup compliance checks, time entry audits, auto-escalation
- Tracking automation activities (492 lines): standup streak tracking, time entry anomaly detection, blocker pattern analysis
- Compliance service (260 lines) with status change detection
- Tracking events helper (163 lines), tracking compliance config, CRM automation service, Slack tracking service
- New automation trigger types: `standup.streak`, `time_entry.anomaly`, `blocker.pattern_detected`, `training.bulk_overdue`, `certification.prerequisite_unmet`
- Periodic Temporal schedules for compliance and tracking jobs

#### 13 New Dashboard Widgets
- Engineering manager widgets: `BacklogOverviewWidget`, `BlockersOverviewWidget`, `SprintBurndownWidget`, `TasksCompletedChartWidget`, `TeamStatsSummaryWidget`, `TicketChartWidget`, `TicketPipelineWidget`, `VelocityTrendWidget`, `WorkloadDistributionWidget`
- Leave-integrated widgets: `LeaveBalanceWidget`, `PendingLeaveApprovalsWidget`, `TeamAvailabilityWidget`, `TeamCalendarWidget`
- Widget registry expanded from 23 to 36+ widget IDs

#### Email Tracking API
Campaign open/click tracking endpoints for email marketing analytics.

#### Reminders Module Expansion
- Dedicated "All Reminders" and "My Reminders" pages
- Compliance sub-routes for reminders and training

#### App Definitions System
Dynamic app/module registration via `AppDefinitions` model and frontend config.

#### AI Insights Automation
Temporal activity for periodic AI-powered insights generation with scheduled execution.

### Improved

#### GitHub Sync Reliability
- Auto-refresh expired GitHub App tokens (`ghu_`) using stored refresh tokens — tokens no longer silently expire after 8 hours
- Proper 404 handling: detects GitHub App installation permission issues vs genuinely missing repos, with actionable error messages including direct settings links
- `GitHubNotFoundError` exception with non-retryable Temporal retry policy
- Auto-sync skips developers with broken auth (`auth_status="error"`) instead of flooding Temporal with failing workflows
- Sync logs now include `@github_username` and repo full name instead of opaque UUIDs

#### Settings Module Revamp
- Complete redesign with `SettingsShell`, `SettingsSidebar`, and `SettingsSearch` components
- Searchable navigation config (214 lines) with fuzzy-matching
- GitHub sync job interval configurable from repository settings

#### Full Light Mode Support
- Theme-aware styling across 380+ frontend components
- Badge readability improvements across 138 components
- Fixed docs sidebar, theme toggle, and app access for light mode

#### Stripe Billing & Subscriptions
- Revamped plan upgrade/downgrade flow with proper subscription state handling
- Enhanced Stripe setup with expanded plan configuration
- Plan-based feature gating via limits service
- `fix_subscription_plans.py` script for correcting plan data

#### Hiring & Assessment Module
- Assessment evaluation and question generation service improvements
- Candidate detail page redesign with richer reporting
- Assessment wizard topic distribution UI improvements

#### Onboarding Flow
- Improved onboarding for already-invited users with workspace join flow
- Invitation-aware workspace creation page

#### Gmail & Temporal Sync
- Gmail sync activity with better error handling
- Temporal dispatch improvements with new workflow patterns

#### Automation UI
- Workflow builder `NodePalette` expanded with compliance and tracking trigger/action nodes
- Automation pages updated for new trigger types

### Fixed
- Assessment async context manager misuse causing evaluation failures
- Backend startup import/initialization error
- GitHub sync race conditions and error handling in Temporal activities
- Email marketing campaign visibility toggle not persisting
- Hiring module: missing API fields, candidate page errors, evaluation scoring
- Dashboard and stats count mismatches across assessment and tracking modules
- Compliance and tracking page rendering, reminder instance cards, compliance sub-routes
- Automation trigger registration and booking activity errors
- Deduplicated logic in sync service, optimized developer insights queries
- Widget rendering order, sidebar page links, compliance page layout
- Stale data in `useNotifications` and `useReminders` hooks

### Infrastructure
- Updated `docker-compose.prod.yml` with additional service configuration
- Playwright E2E infrastructure: config, mock data fixtures, `test:e2e` / `test:e2e:ui` npm scripts
- 4 new database migrations: `migrate_leave_management.sql`, `migrate_github_auth_status.sql`, `migrate_developer_email_nullable.sql`, `migrate_repo_sync_settings.sql`
- Temporal worker: registered compliance, tracking, insights, and booking activities; expanded periodic schedules

---

## [0.5.6] - 2026-02-14

### Added

#### Dynamic Dashboard Widget System

Replaced the hardcoded dashboard layout with a fully dynamic, preference-driven widget rendering system. Widgets now render from `widget_order` and `visible_widgets` stored in user preferences, with drag-and-drop reordering support.

**Widget Extraction (9 new components):**
- `WelcomeWidget` — greeting, GitHub connection status, quick action links
- `QuickStatsWidget` — language count, framework count, avg PR size, work style
- `LanguageProficiencyWidget` — language bars with proficiency scores, commit counts, trends
- `WorkPatternsWidget` — complexity preference, peak hours, review turnaround
- `DomainExpertiseWidget` — domain tags with confidence scores
- `FrameworksToolsWidget` — framework/tool tags with proficiency scores
- `AIInsightsWidget` — composite widget wrapping InsightsCard, SoftSkillsCard, GrowthTrajectory, PeerBenchmark
- `SoftSkillsWidget` — Reviews & Goals section with My Goals and Performance Reviews
- `ComingSoonWidget` — placeholder for unimplemented widget IDs

**Widget Registry (`widgetRegistry.tsx`):**
- Maps 23 widget IDs to React components (developer, engineering manager, and product manager widgets)
- `getWidgetComponent()` helper with ComingSoonWidget fallback
- `isWidgetImplemented()` check for registry membership

**Dashboard Page Rewrite (`page.tsx`):**
- Dynamic rendering from `orderedVisibleWidgets` computed via `widget_order` intersected with `visible_widgets`
- `getWidgetProps()` switch maps widget IDs to their specific data props
- `getWidgetGridClass()` maps widget sizes to CSS grid column spans
- `renderWidget()` skips composite children and renders from registry or ComingSoonWidget
- Edit Layout toggle button (Pencil/Check icons) for entering/exiting drag mode

**SortableWidgetGrid Updates:**
- Changed layout from `space-y-6` vertical stack to CSS grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Added `renderableWidgets` filter to skip null renders from composite children
- Drag handle repositioned to `top-2 right-2`

**Customize Modal — Reorder Tab:**
- Added third tab "Reorder" to `DashboardCustomizeModal`
- New `WidgetReorderList` component — dnd-kit vertical list showing widget icon, name, size badge, and drag handle
- Tabs now rendered from data array; description updated

**Enriched Non-Developer Presets:**
- Manager: added `aiAgents`, `upcomingDeadlines`, `recentDocs`
- Product: added `aiInsights`, `aiAgents`
- HR: added `quickStats`, `aiAgents`, `upcomingDeadlines`, `myGoals`
- Support: added `quickStats`, `aiAgents`, `teamOverview`, `myGoals`
- Sales: added `quickStats`, `aiAgents`, `teamOverview`, `upcomingDeadlines`
- Admin: added `quickStats`, `aiAgents`, `myGoals`, `upcomingDeadlines`, `recentDocs`

#### Playwright E2E Test Suite

Added end-to-end testing infrastructure for the dashboard.

- `playwright.config.ts` — Chromium project, baseURL localhost:3000, auto-start dev server
- `e2e/fixtures/mock-data.ts` — mock user, preferences, insights, soft skills fixtures
- `e2e/dashboard.spec.ts` — 18 tests across 6 describe blocks:
  - Widget Rendering (7 tests): welcome, quickStats, languageProficiency, workPatterns, domainExpertise, frameworksTools, ComingSoon
  - Widget Ordering (2 tests): order from preferences, only visible widgets rendered
  - Edit Layout Toggle (2 tests): button toggle, drag handles in edit mode
  - Customize Modal (4 tests): three tabs, tab switching, reorder tab content, close
  - Manager Preset (1 test): cross-cutting widgets present
  - Grid Layout (2 tests): CSS grid container, full-span widgets

### Changed

- Bumped frontend version from `0.5.5` to `0.5.6`
- Added `@playwright/test` dev dependency
- Added `test:e2e` and `test:e2e:ui` npm scripts

## [0.5.5] - 2026-02-13

### Added

#### All-Contributors Sync

Extended GitHub sync to capture all contributors' commits, PRs, and reviews — not just the connecting user. External contributors are auto-created as "ghost" Developer records.

**Backend:**
- New model fields: `author_github_login` and `author_email` on `Commit` for preserving original author identity
- New helpers: `_resolve_developer_for_commit()` and `_resolve_developer_for_pr()` in `SyncService` to match or auto-create Developer records by GitHub ID or email
- In-memory developer lookup cache within each sync session to avoid N+1 queries
- Removed `author=github_username` filter from `_sync_commits_with_session()` — now fetches all commits
- Removed `login != github_username` filter from `_sync_pull_requests_with_session()` and `_sync_reviews_with_session()`
- Migration: `migrate_commit_author_fields.sql` — adds `author_github_login`, `author_email` columns with indexes

**Ghost Developer Support Across Insights:**
- New helper: `_get_all_contributor_ids()` in `developer_insights.py` — discovers external contributors by querying commits/PRs/reviews in workspace repos
- Leaderboard, team insights, executive summary, and all 6 AI insight endpoints (team narrative, sprint retro, trajectory, root cause, composition, hiring forecast) now include ghost developers
- Ghost developers appear in all rankings, comparisons, and AI-generated narratives alongside workspace members

#### Metric Explanation Tooltips

Added hover tooltips with explanations across all insights pages.

**Compare Page (`/insights/compare`):**
- Info icon + CSS hover popover on each row in the Side-by-Side Metrics table (commits, PRs merged, merge rate, cycle time, lines added, review rate, health score, focus time)
- Radar chart axis labels show native browser tooltips via SVG `<title>` element
- Extended `RadarDataPoint` interface with optional `desc` field
- New `CustomAngleTick` component in `MetricsRadar.tsx` for tooltip-enabled axis labels
- `RADAR_METRICS` config includes `desc` for each metric

**Executive Dashboard (`/insights/executive`):**
- Org Health metrics: Gini Coefficient, Workload Balance, Avg Commits/Dev, Avg PRs/Dev
- Burnout Risks: WE (weekend commit %) and LN (late night commit %) with explanations
- Bottlenecks: explanation of the 2x average threshold

### Fixed

#### Developer Names Instead of UUID Hashes

Multiple insights pages displayed truncated UUIDs (e.g., `8f983e00-386...`) instead of developer names.

- **Compare page** — dropdown items, selected pills, radar chart legends, heatmap labels, and table headers now show developer names via `devNameMap` lookup
- **Executive dashboard** — top contributors table, burnout risks, and bottlenecks now show `developer_name` from API
- **Sprint capacity** — per-developer breakdown table now shows `developer_name` from API
- Added `developer_name` field to backend responses: `compute_executive_summary()`, `estimate_sprint_capacity()`
- Updated TypeScript interfaces: `ExecutiveSummaryResponse`, `SprintCapacityDeveloper`

#### Developer Detail Page Crash

Fixed `/insights/developers/[id]` crashing on gaming flags section due to API schema mismatch.

- Backend returns `{type, severity, description, evidence(object)}` but frontend expected `{pattern, severity: "low"|"medium"|"high", evidence: string}`
- Fixed with `Record<string, unknown>` type and proper field fallbacks (`flag.type || flag.pattern`, severity includes "warning")
- Added optional chaining for `flag.pattern?.replace()` to prevent `TypeError`

#### Analytics Dashboard Broken Joins

Fixed `analytics_dashboard.py` using stale `CodeReview.pull_request_id` column (renamed to `pull_request_github_id`).

- Updated two join clauses to use `CodeReview.pull_request_github_id == PullRequest.github_id`
- Fixed `conftest.py` test fixture using the same stale field name

#### Ghost Developer Creation for PRs/Reviews

`_resolve_developer_for_pr()` now auto-creates ghost Developer records (by GitHub login) when no existing developer matches, consistent with `_resolve_developer_for_commit()` behavior.

### Changed

- Bumped frontend version from `0.5.4` to `0.5.5`
- Moved inline `from sqlalchemy import or_` to top-level import in `developer_insights.py`

---

## [0.5.4] - 2026-02-09

### Added

#### Developer Insights (Enterprise Analytics)

Comprehensive developer productivity analytics platform with AI-powered insights, alerting, and forecasting.

**Backend:**
- New models: `DeveloperMetricsSnapshot`, `TeamMetricsSnapshot`, `InsightSettings`, `DeveloperWorkingSchedule`, `InsightAlertRule`, `InsightAlertHistory`, `InsightReportSchedule`, `SavedInsightDashboard`
- New API: `api/developer_insights.py` - 25+ endpoints for individual developer metrics, team insights, leaderboard, executive summary, sprint capacity, bus factor, rotation impact, project insights, alert rules, and AI narratives
- New service: `services/developer_insights_service.py` - Metric computation across 6 dimensions (velocity, efficiency, quality, sustainability, collaboration, sprint productivity), forecasting, gaming detection, health scoring, percentile rankings, role benchmarking, and executive summaries
- New service: `services/insights_ai_service.py` - LLM-powered narrative generation for team/developer performance, anomaly detection, root cause analysis, 1:1 prep notes, sprint retro insights, trajectory forecasting, team composition recommendations, and hiring timeline estimation
- New cache: `cache/insights_cache.py` - Redis caching with 5-min TTL, deterministic key generation, and pattern-based invalidation
- New schemas: `schemas/developer_insights.py` - Complete Pydantic schemas for all metrics, responses, settings, and alerts
- Migrations: `migrate_developer_insights.sql`, `migrate_developer_insights_v2.sql`, `migrate_developer_insights_v3.sql`
- Integration tests: `tests/integration/test_developer_insights_api.py`
- Unit tests: `tests/unit/test_developer_insights_service.py`

**Metrics Computed:**
- Velocity: commits, PRs merged, lines added/removed, commit frequency, PR throughput, average commit size
- Efficiency: PR cycle time, time to first review, PR merge rate, rework ratio
- Quality: review participation rate, review depth, review turnaround, self-merge rate
- Sustainability: weekend/late-night commit ratios, work streaks, active hours, focus score
- Collaboration: unique collaborators, cross-team PR ratio, knowledge sharing score
- Sprint: task completion rate, story points, cycle/lead time, carry-over tasks

**Advanced Features:**
- Velocity forecasting via weighted moving average
- Metric gaming detection (suspicious patterns)
- Code churn/rework analysis
- PR size distribution analysis
- Composite health scores with configurable weights
- Percentile rankings within peer group
- Role-based benchmarking (by engineering level)
- Gini coefficient for workload distribution analysis
- Bus factor per repository
- Rotation impact simulation (velocity loss prediction)
- Sprint capacity estimation
- GDPR-compliant data export

**Alert System:**
- Configurable alert rules with conditions (gt, lt, gte, lte, eq, change_pct)
- Scope: workspace, team, or individual developer
- Severity levels: info, warning, critical
- Multi-channel notifications (in-app, email, Slack)
- Alert history with acknowledge/resolve workflow
- Seed templates for common alerts
- New notification event types: `INSIGHT_ALERT_WARNING`, `INSIGHT_ALERT_CRITICAL`

**Frontend:**
- New routes:
  - `/insights` - Team overview with stat cards and workload distribution chart
  - `/insights/leaderboard` - Ranked developer metrics
  - `/insights/developers/[developerId]` - Individual developer drill-down
  - `/insights/compare` - Side-by-side developer comparison
  - `/insights/allocations` - Resource allocation view
  - `/insights/alerts` - Alert management
  - `/insights/executive` - Executive dashboard
  - `/insights/sprint-capacity` - Sprint planning with capacity estimation
  - `/insights/ai` - AI-powered insights (narratives, anomalies, recommendations)
  - `/insights/me` - Personal insights
  - `/settings/insights` - Insights configuration (working hours, metric weights, snapshot frequency)
- `useInsights` hook - React Query integration with 10+ hooks for metrics, trends, leaderboard, alerts, and AI narratives
- Components: `ActivityHeatmap`, `MetricsRadar`

#### Permissions & Navigation

- New permission category: `INSIGHTS` with `can_view_insights` and `can_manage_insights`
- New app definition: `insights` in app catalog with `team_overview`, `leaderboard`, and `developer_drilldown` modules
- Insights enabled in `full_access` bundle
- Insights section added to sidebar in both grouped and flat layouts
- New widget permissions: `teamInsights`, `developerInsights`, `insightsLeaderboard`, `workloadDistribution`

### Changed

- Deprecated Celery app configuration (`celery_app.py`) - all background processing now uses Temporal; `celery_app` set to `None` with deprecation warning
- Updated admin API references from Celery to Temporal (renamed `get_celery_stats` to `get_temporal_stats`)
- Updated repository sync API parameter from `use_celery` to `use_background`
- Renamed `developer` to `user` in auth hook (`useAuth`) - updated `AppAccessGuard` and `Sidebar`
- Changed `GoogleIcon` export from named to local function in landing page (moved to dedicated `components/icons/GoogleIcon.tsx`)
- Added `formatRelativeTime` utility function to `lib/utils.ts`
- Bumped frontend version from `0.5.3` to `0.5.4`

### Fixed

- Fixed mock implementations and minor bugs across test suite

---

## [0.5.3] - 2026-02-09

### Added

#### Compliance Center

New top-level Compliance module for managing regulatory compliance, documents, reminders, training, and certifications.

**New Routes:**
- `/compliance` - Compliance dashboard with overview stats, upcoming reminders, and category breakdown
- `/compliance/reminders` - Recurring compliance reminder management with list and calendar views
- `/compliance/reminders/new` - Multi-step reminder creation wizard (basic info, schedule, assignment, review)
- `/compliance/reminders/[reminderId]` - Reminder detail and instance history
- `/compliance/reminders/calendar` - Calendar view of upcoming reminder instances
- `/compliance/reminders/compliance` - Questionnaire import and analysis
- `/compliance/documents` - Document Center with folder tree, search, filtering, and upload
- `/compliance/documents/[documentId]` - Document detail with metadata, tags, and entity linking
- `/compliance/training` - Mandatory training management with assignment tracking
- `/compliance/certifications` - Certification tracking with developer enrollment and progress
- `/compliance/calendar` - Unified compliance calendar

---

#### Recurring Reminders System

Full-featured recurring reminder engine for compliance tasks with escalation, assignment, and scheduling.

**Backend:**
- New models: `Reminder`, `ReminderInstance`, `ReminderEscalation`, `ControlOwner`, `DomainTeamMapping`, `AssignmentRule`, `ReminderSuggestion`
- New API: `api/reminders.py` - 30+ endpoints for reminders, instances, control owners, assignment rules, domain mappings, suggestions, dashboard stats, calendar, and bulk operations
- New service: `services/reminder_service.py` - Reminder CRUD, instance generation, acknowledgment, completion, skip, reassignment, escalation, and dashboard statistics
- New schemas: `schemas/reminder.py` - Complete Pydantic schemas for all reminder operations
- Migration: `migrate_reminders.sql` - 7 tables with proper indexes, triggers, and constraints

**Temporal Activities** (`temporal/activities/reminders.py`):
- `generate_reminder_instances` - Daily task to generate upcoming instances from recurrence rules
- `check_overdue_reminders` - Hourly check for overdue instances with automatic escalation
- `send_reminder_notifications` - Sends due/upcoming reminder notifications
- `send_weekly_slack_summary` - Weekly compliance status summary (logging only for now)
- `check_evidence_freshness` - Daily check for stale evidence on completed instances

**Features:**
- Recurrence: daily, weekly, biweekly, monthly, quarterly, semi-annual, annual frequencies
- Priority levels: low, medium, high, critical
- Categories: regulatory, security, financial, hr, operational, it, legal, environmental, quality, data_privacy, health_safety, custom
- Auto-assignment via control owners, domain-team mappings, and configurable assignment rules
- 3-level escalation: manager, director, VP with configurable timeframes
- Evidence collection with link attachments on instance completion
- Bulk operations: assign and complete multiple instances at once

**Frontend:**
- `useReminders` hook - React Query integration with 10+ hooks for all reminder operations
- Shared components: `ReminderCard`, `ReminderInstanceCard`, `ReminderStatusBadge`, `ReminderPriorityBadge`, `ReminderCategoryBadge`, `InstanceStatusBadge`, `RecurrenceDisplay`
- `ReminderCreationWizard` - 4-step wizard with validation and team/owner assignment

---

#### Questionnaire Import & Analysis

Import compliance questionnaires from Excel/CSV with AI-powered column detection and automatic reminder generation.

**Backend:**
- New models: `QuestionnaireResponse`, `QuestionnaireQuestion` with status tracking
- New API: `api/questionnaires.py` - Upload, analyze, accept/reject suggestions, list responses
- New service: `services/questionnaire_service.py` - 3-tier column detection (exact alias match, fuzzy substring, LLM fallback), cross-questionnaire deduplication, and automatic reminder suggestion generation
- Migration: `migrate_questionnaire.sql` - Questionnaire tables with proper indexing

**Frontend:**
- `useQuestionnaires` hook - Upload, analysis, and suggestion management
- Compliance questionnaire import page with file upload and analysis results

---

#### Compliance Document Center

Upload, organize, and manage compliance documents with folder hierarchy, tagging, and entity linking.

**Backend:**
- New models: `ComplianceFolder`, `ComplianceDocument`, `ComplianceDocumentTag`, `ComplianceDocumentLink`
- New API: `api/compliance_documents.py` - Document CRUD, folder management, tag operations, entity linking, search with filtering
- New service: `services/compliance_document_service.py` - Document upload, folder tree management, tag operations, entity linking
- Migration: `migrate_compliance_documents.sql` - Document and folder tables with S3 key storage

**Frontend:**
- `useComplianceDocuments` hook - React Query integration for documents, folders, tags, and entity links
- Components: `DocumentCard`, `FolderTree`, `CreateFolderModal`, `UploadModal`, `DocumentFilters`, `DocumentLinkPanel`
- File type detection with appropriate icons (PDF, spreadsheet, image, generic)
- Folder nesting up to 3 levels deep

---

#### S3-Compatible Storage Service

Replaced R2-specific storage with a generic S3-compatible `StorageService` supporting RustFS (dev) and any S3-compatible provider (production).

**Backend:**
- New service: `services/storage_service.py` - Generic S3 client with presigned URL generation, direct upload, multipart upload, and download
- Backward-compatible shim: `r2_upload_service.py` re-exports `StorageService` as `R2UploadService`
- New config fields: `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`, `S3_PUBLIC_ENDPOINT_URL`, `S3_RECORDINGS_PREFIX`, `S3_COMPLIANCE_PREFIX`, `COMPLIANCE_MAX_FILE_SIZE_MB`
- Deprecated R2-specific config fields (still functional for backward compatibility)

**Docker:**
- Added RustFS service (S3-compatible object storage) for local development
- Auto-creates `aexy-storage` bucket on startup via `rustfs-init` helper container
- Environment variables wired for backend container

---

#### Permissions & Navigation

- New permission category: `COMPLIANCE` with `can_view_compliance` and `can_manage_compliance`
- New app definition: `compliance` in app catalog with `reminders`, `document_center`, `training`, and `certifications` modules
- Updated system app bundles: compliance enabled in `people` and `full_access` bundles, disabled in `engineering` and `sales_marketing`
- New notification event types: `REMINDER_DUE`, `REMINDER_ACKNOWLEDGED`, `REMINDER_COMPLETED`, `REMINDER_ESCALATED`, `REMINDER_OVERDUE`, `REMINDER_ASSIGNED`
- Compliance section added to sidebar in both grouped and flat layouts
- Compliance widget permissions: `complianceOverview`, `complianceDocuments`

### Changed

- Refactored `R2UploadService` into generic `StorageService` with S3-compatible backend support
- Storage configuration moved from R2-specific to S3-generic fields with backward compatibility

### Fixed

- Fixed reminder creation bug (commit `f4e79d9`)
- Fixed miscellaneous TypeScript errors across frontend (commit `73e7641`)

### Dependencies

- Added `croniter>=2.0.0` for cron expression parsing
- Added RustFS Docker service for local S3-compatible storage

---

## [0.5.2] - 2026-02-09

### Fixed

- Set default `github_app_install_url` to production GitHub App URL in `config.py` instead of empty string
- Added `GITHUB_APP_INSTALL_URL` environment variable to `docker-compose.prod.yml` backend service

---

## [0.5.1] - 2026-02-08

### Changed

#### Temporal Workflow Engine (Celery Replacement)

Replaced Celery 5.3+ task queue with Temporal Python SDK for all background processing, workflow orchestration, and scheduled tasks.

**Infrastructure:**
- Temporal server (auto-setup) with PostgreSQL persistence on port 7233
- Temporal Web UI for workflow monitoring on port 8080
- Dedicated Temporal worker service with 6 task queues
- Removed Celery worker, Celery Beat, and Flower monitoring services

**Activities & Workflows:**
- 13 activity modules with 77+ Temporal activities
- 7 workflow modules including CRMAutomationWorkflow (replaced 652-line SyncWorkflowExecutor)
- 25 Temporal schedules replacing 28 Celery Beat entries (3 polling tasks eliminated)
- `dispatch()` function replacing Celery `.delay()` for fire-and-forget execution
- `SingleActivityWorkflow` wrapper for dispatching individual activities
- CRM automation events use Temporal signals for instant resume (replaced 60s polling)

**Task Queues:**
- `analysis` - Developer profiling, code analysis, LLM tasks
- `sync` - GitHub sync, Google sync, external data
- `workflows` - CRM automations, workflow execution
- `email` - Campaigns, onboarding, transactional email
- `integrations` - Webhooks, Slack, external services
- `operations` - Stats aggregation, cleanup, maintenance

**Retry Policies:**
- `STANDARD_RETRY` - General tasks with exponential backoff
- `LLM_RETRY` - AI/LLM calls with longer timeouts
- `WEBHOOK_RETRY` - External webhook delivery

### Added

- `EmailCampaignService` - 9 async methods for email campaign management, extracted from Celery tasks
- `OnboardingService.check_due_steps()` - Checks and dispatches due onboarding step processing

### Fixed

- Onboarding activity input dataclasses now match `OnboardingService` API signatures
- Warming metrics dispatch uses proper `UpdateWarmingMetricsInput` dataclass instead of raw dict
- Workflow action callers updated to pass correct field names to Temporal activities

---

## [0.5.0] - 2026-02-02

### Added

#### Platform-Wide Automations

Migrated automations from CRM-specific to a platform-wide automation framework accessible from `/automations`.

**New Routes:**
- `/automations` - List all automations with module filtering (CRM, Tickets, Hiring, Email, etc.)
- `/automations/new` - Create new automation with module selector
- `/automations/[automationId]` - Edit automation with workflow builder

**Module Support:**
- CRM: `record.created`, `record.updated`, `field.changed`, `stage.changed`
- Tickets: `ticket.created`, `ticket.status_changed`, `sla.breached`, `ticket.assigned`
- Hiring: `candidate.created`, `candidate.stage_changed`, `interview.scheduled`
- Email Marketing: `campaign.sent`, `email.opened`, `email.bounced`
- Uptime: `monitor.down`, `incident.created`
- Sprints: `task.status_changed`, `sprint.completed`
- Forms: `form.submitted`
- Booking: `booking.confirmed`, `booking.cancelled`

**Backend:**
- New API router: `api/automations.py` at `/workspaces/{id}/automations/*`
- New schemas: `schemas/automation.py` with `AutomationModule` enum
- New service: `services/automation_service.py` for generic automation handling
- Trigger/Action registry pattern for extensible module support
- Migration: `migrate_platform_automations.sql` adds `module` column to automations

**CRM Routes Redirected:**
- `/crm/automations` → `/automations?module=crm`
- `/crm/automations/new` → `/automations/new?module=crm`
- `/crm/automations/[id]` → `/automations/[id]`

---

#### Agent Email Integration

Agents can now have dedicated email addresses and manage their own inboxes.

**Email Address Allocation:**
- Agents can be assigned email addresses like `support@workspace.aexy.email`
- Email address allocation via mailagent microservice integration
- Enable/disable email per agent
- Auto-reply configuration with confidence threshold

**Agent Inbox:** `frontend/src/app/(app)/agents/[agentId]/inbox/page.tsx`
- View incoming emails assigned to the agent
- Email status tracking: `pending`, `processing`, `responded`, `escalated`, `archived`
- AI classification results with confidence scores
- Suggested responses from agent processing
- Manual reply and escalation actions

**Backend:**
- New model: `models/agent_inbox.py` - `AgentInboxMessage` for storing received emails
- New service: `services/agent_email_service.py` - Email allocation, routing, and processing
- New API: `api/email_webhooks.py` - Inbound email webhook handlers
- Migration: `migrate_agent_email.sql` - Agent email fields and inbox table

**Agent Model Extensions:**
- `email_address` - Unique email address for the agent
- `email_enabled` - Toggle email processing
- `auto_reply_enabled` - Enable automatic responses
- `email_signature` - Custom signature for outgoing emails

---

#### Agent Chat Interface

New conversational interface for interacting with AI agents.

**New Routes:**
- `/agents/[agentId]/chat` - Start new conversation with agent
- `/agents/[agentId]/chat/[conversationId]` - Continue existing conversation

**Features:**
- Real-time chat interface with message streaming
- Conversation history and context preservation
- Agent tool execution display (CRM lookups, email sends, etc.)
- Confidence indicators for agent responses
- Conversation list with search and filtering

**Backend:**
- Migration: `migrate_agent_conversations.sql` - Conversation and message tables
- Extended `api/agents.py` with conversation endpoints
- Message types: `user`, `assistant`, `system`, `tool_call`, `tool_result`

---

#### Automation Agents Integration

Connect AI agents to workflow automations for intelligent task handling.

**New Model:** `models/automation_agent.py`
- `AutomationAgent` - Links agents to automation workflows
- `AutomationAgentExecution` - Tracks agent executions within workflows
- `AutomationAgentConfig` - Stores agent-specific workflow configuration

**New API:** `api/automation_agents.py`
- `POST /automations/{id}/agents` - Add agent to automation
- `DELETE /automations/{id}/agents/{agent_id}` - Remove agent
- `GET /automations/{id}/agents` - List agents in automation
- `POST /automations/{id}/agents/{agent_id}/execute` - Manually trigger agent

**Workflow Actions:** `services/workflow_actions.py`
- `run_agent` action type for workflow nodes
- Agent execution with context from trigger data
- Result handling and error propagation

**Migration:** `migrate_automation_agents.sql`

---

#### Mailagent Integration Client

Client for communicating with the mailagent microservice.

**New Integration:** `integrations/mailagent_client.py`
- Async HTTP client for mailagent API
- Domain management (create, verify, list)
- Agent email provisioning
- Inbound email processing delegation
- Email sending via mailagent infrastructure

**Configuration:**
- `MAILAGENT_URL` environment variable (default: `http://mailagent:8001`)
- Automatic retry with exponential backoff
- Health check integration

---

#### Agent Management Improvements

**Agent Detail Page:** `/agents/[agentId]`
- Comprehensive agent overview with metrics
- Execution history with status and duration
- Performance charts (success rate, response time)
- Quick actions (test, enable/disable, edit)

**Agent Edit Page:** `/agents/[agentId]/edit`
- Tabbed configuration editor
- Email configuration section
- Tool selection with categories
- Behavior settings (confidence, approval thresholds)
- Working hours configuration

**Agents List Page:** `/agents`
- Grid view with agent cards
- Status badges (active, inactive, error)
- Filtering by type and status
- Search functionality
- Quick stats (total agents, active, executions)

### Changed

- CRM Agents routes now redirect to platform-wide `/agents` routes
- CRM Automations routes now redirect to platform-wide `/automations` routes
- Sidebar navigation updated with Automations in dedicated section
- Agent tools now include email tools: `send_email`, `create_draft`, `get_email_history`, `get_writing_style`

### Fixed

- Domain creation now returns HTTP 409 Conflict for duplicates instead of 500 with SQL error
- `SendingDomainResponse.provider_id` is now optional (nullable)
- SQLAlchemy reserved word error in mailagent (`metadata` → `decision_metadata`)
- Missing `LLMConfig` export in mailagent LLM module
- Email marketing domain creation toast notifications for success/error feedback

### Removed

- Alembic migration files (using raw SQL migrations via `run_migrations.py`)
- `roadmap_voting` model and related code
- `public_projects` API (consolidated into projects API)
- Some Google sync tasks (moved to separate service)

#### Mailagent Microservice

A new standalone microservice for email administration, AI agent processing, and domain management.

**Core Service:** `mailagent/`
- FastAPI service running on port 8001
- SQLAlchemy async models with PostgreSQL
- Redis for caching and rate limiting
- Docker Compose integration

**Email Provider Support:** `mailagent/src/mailagent/providers/`
- AWS SES integration with IAM credentials
- SendGrid API integration
- Mailgun (planned)
- Postmark (planned)
- Custom SMTP support

**Domain Management:** `mailagent/src/mailagent/api/domains.py`
- Domain registration and health scoring
- DNS verification (SPF, DKIM, DMARC)
- Automated DNS record generation
- Domain warming schedules (conservative, moderate, aggressive)

**Agent System:** `mailagent/src/mailagent/agents/`
- Base agent class with confidence-based decisions
- Agent types: `support`, `sales`, `scheduling`, `onboarding`, `recruiting`, `newsletter`, `custom`
- Agent actions: `reply`, `forward`, `escalate`, `schedule`, `create_task`, `update_crm`, `wait`, `request_approval`
- Specialized agents with pre-configured behaviors

**LLM Integration:** `mailagent/src/mailagent/llm/`
- Claude (Anthropic) provider
- Gemini (Google) provider
- Factory pattern for provider selection
- Configurable temperature and max tokens

**API Endpoints:**
- `/api/v1/admin/*` - Provider CRUD and dashboard
- `/api/v1/domains/*` - Domain management and verification
- `/api/v1/onboarding/*` - Inbox creation and verification
- `/api/v1/agents/*` - Agent CRUD and configuration
- `/api/v1/agents/{id}/process` - Process email with agent
- `/api/v1/invocations/*` - Execution history and metrics
- `/api/v1/webhooks/*` - Inbound email processing
- `/api/v1/send/*` - Outbound email sending

**Email Processing Pipeline:**
- Inbound webhook handlers for SES/SendGrid
- Thread detection and conversation context
- Knowledge base search integration
- Contact enrichment from CRM
- Response generation with approval workflow

---

#### AI Agents Management UI

A comprehensive interface for creating and managing custom AI agents with configurable tool access and behavior settings.

**New Routes:**
- `/agents` - Agent list page with grid view, stats, filtering, and search
- `/agents/new` - Multi-step agent creation wizard
- `/agents/[agentId]` - Agent detail page with execution history and metrics
- `/agents/[agentId]/edit` - Tabbed configuration editor

**Frontend Components:** `frontend/src/components/agents/`
- `AgentCreationWizard` - 7-step wizard (type, basic info, LLM, tools, behavior, prompts, review)
- `AgentTypeBadge` - Type indicator with icon and color
- `AgentStatusBadge` - Active/inactive status
- `ToolSelector` - Multi-select tool picker with categories
- `LLMProviderSelector` - Provider and model selection (Claude, Gemini, Ollama)
- `ConfidenceSlider` - 0-1 range slider for thresholds
- `WorkingHoursConfigPanel` - Hours, timezone, and days configuration
- `PromptEditor` - System prompt editor with variable hints

**Dashboard Widget:**
- `AIAgentsWidget` - Shows active agents, total runs, success rate
- Added to dashboard widget registry and default visible widgets

**Sidebar Navigation:**
- AI Agents added as top-level navigation item with own "AI" section
- Sub-items: All Agents, Create Agent

**Product Page:**
- `/products/ai-agents` - Marketing page for AI Agents feature

**Backend API Extensions:**
- `GET /agents/check-handle` - Verify mention handle availability
- `GET /agents/{id}/metrics` - Agent performance metrics (runs, success rate, avg duration)

**Database Migration:** `backend/scripts/migrate_agent_extended_config.sql`
- Extended CRMAgent model with: `mention_handle`, `llm_provider`, `temperature`, `max_tokens`, `confidence_threshold`, `require_approval_below`, `max_daily_responses`, `response_delay_minutes`, `working_hours`, `custom_instructions`, `escalation_email`, `escalation_slack_channel`

**Documentation:**
- `/docs/ai-agents.md` - Comprehensive guide covering agent types, configuration, tools, and API
- Updated `/docs/README.md` with AI Agents in guides and products
- Updated `/CLAUDE.md` with AI Agents key files and API testing commands

### Changed

- AI Agents now appears in dedicated "AI" section in grouped sidebar layout

---

## [0.4.6] - 2026-01-30

### Added

#### Auto-Sync for Gmail and Calendar
- Configurable auto-sync intervals for Gmail and Calendar integrations
- New periodic Celery task (`check_auto_sync_integrations`) runs every minute to check which integrations need syncing
- Preset interval buttons (Off, 5m, 15m, 30m, 1h, 24h) and custom input in settings UI
- Minimum interval enforced at 5 minutes to prevent aggressive API usage
- Tracks `gmail_last_sync_at` and `calendar_last_sync_at` for accurate scheduling
- Duplicate job detection prevents overlapping sync operations

**Database Migrations:**
- `migrate_auto_sync_interval.sql` - Adds `auto_sync_interval_minutes` column
- `migrate_auto_sync_calendar_interval.sql` - Adds `auto_sync_calendar_interval_minutes` column

#### Markdown Editor Mode
- Toggle between Rich Text and Markdown editing modes in document editor
- `tiptap-markdown` integration for seamless markdown parsing/serialization
- Markdown content persists when switching between modes
- Error handling prevents data loss if markdown parsing fails

#### Document Editor UI Improvements
- Redesigned toolbar with grouped buttons and keyboard shortcut tooltips
- Unified header layout with breadcrumb integration
- Enhanced visual styling with backdrop blur, shadows, and animations
- Re-enabled home navigation link in document breadcrumb

#### CRM Inbox Enhancements
- Email HTML content rendered in isolated iframe to prevent style leakage
- Lazy loading of full email body (fetches on selection, not on list load)
- Loading state indicator while email content is being fetched

### Fixed

- **Workspace Selection Race Condition**: Fixed issue where auto-selection could override user's stored workspace preference by adding `isInitialized` state guard in `useWorkspace` hook
- **Auto-sync Task Counter**: Fixed incorrect `dir()` check that always returned 0 for total integrations checked
- **Email Display**: Fixed `to_emails` field to properly extract email addresses from recipient objects
- **Markdown Mode Stability**: Added try-catch error handling to prevent crashes when parsing malformed markdown

### Changed

- Production Dockerfile now uses `--legacy-peer-deps` for dependency compatibility
- AppShell main content wrapper no longer uses `container` class for full-width layouts

### Dependencies

- Added `tiptap-markdown@^0.8.10`
- Added `y-prosemirror@^1.3.7`

## [0.4.5] - 2026-01-30

#### Public Project Pages
- **Project visibility toggle** - Projects can now be made public or private via settings
- **Public project URLs** - Each public project gets a unique public slug (e.g., `/p/my-project-k3f9x2`)
- **Customizable public tabs** - Admins can configure which tabs are visible on the public page:
  - Overview, Backlog, Board, Stories, Bugs, Goals, Releases, Timeline, Roadmap, Sprints

#### Roadmap Voting System
- **Feature request submissions** - Authenticated users can submit feature requests with title, description, and category
- **Voting** - Users can upvote/downvote feature requests (toggle vote)
- **Comments** - Threaded comments on feature requests with admin badge support
- **Request categories** - Feature, Improvement, Integration, Bug Fix, Other
- **Status tracking** - Under Review, Planned, In Progress, Completed, Declined
- **Admin responses** - Project admins can respond to requests and update status
- **Pagination** - Paginated list of roadmap requests with filtering and sorting

#### New UI Components
- `Pagination` component with ellipsis support and accessibility labels
- Public project page tab components (Overview, Backlog, Board, Stories, Bugs, Goals, Releases, Sprints, Timeline, Roadmap)

#### New Backend Services
- **Models**: `RoadmapRequest`, `RoadmapVote`, `RoadmapComment` for voting system
- **API Router**: `/api/v1/public/projects/{public_slug}/...` for unauthenticated access
- **Sanitization**: Input sanitization module for user-generated content (`backend/src/aexy/core/sanitize.py`)

#### New API Endpoints
- `POST /workspaces/{id}/projects/{id}/toggle-visibility` - Toggle project public/private
- `GET/PUT /workspaces/{id}/projects/{id}/public-tabs` - Configure visible tabs
- `GET /public/projects/{slug}` - Get public project info
- `GET /public/projects/{slug}/backlog|board|stories|bugs|goals|releases|roadmap|sprints|timeline` - Public data endpoints
- `GET/POST /public/projects/{slug}/roadmap-requests` - List/create feature requests
- `POST /public/projects/{slug}/roadmap-requests/{id}/vote` - Vote on requests
- `GET/POST /public/projects/{slug}/roadmap-requests/{id}/comments` - Comments

### Changed
- `Project` model includes `is_public` (boolean) and `public_slug` (unique string) fields
- Sprint/roadmap/timeline endpoints use optimized SQL aggregation queries (N+1 fix)
- Vote counting uses atomic SQL UPDATE to prevent race conditions
- Project list and detail responses include visibility fields

### Security
- HTML tag stripping and entity escaping for user-submitted content
- Input length validation: title (150 chars), description (1000 chars), comments (2000 chars)
- Tab access control - public endpoints verify tab is enabled before returning data
- Permission checks on admin endpoints require workspace owner/admin role

### Database Migrations
- `alembic/versions/61fd11a7e0ea_add_public_project_visibility.py` - Adds visibility columns
- `scripts/migrate_roadmap_voting.sql` - Creates roadmap voting tables with indexes

### Files Changed Summary
```
47 files changed, ~5,900 insertions(+), ~500 deletions(-)
```

**Backend:**
- `api/public_projects.py` (new - 903 lines)
- `api/projects.py` (+186 lines)
- `models/roadmap_voting.py` (new - 205 lines)
- `models/project.py` (+37 lines)
- `schemas/project.py` (+265 lines)
- `core/sanitize.py` (new - 107 lines)

**Frontend:**
- `app/p/[publicSlug]/page.tsx` (new - 265 lines)
- `components/public-project-page/*` (new - 12 components)
- `components/ui/pagination.tsx` (new - 136 lines)
- `app/(app)/settings/projects/[projectId]/page.tsx` (+254 lines)
- `lib/api.ts` (+351 lines)

---

## [0.4.4] - 2026-01-29

### Added

#### GitHub Intelligence System

A comprehensive intelligence analysis system that extracts insights from GitHub activity to provide developer profiling, burnout detection, expertise tracking, and team collaboration analysis.

**Semantic Commit Analysis:**
- Conventional commit parsing (feat, fix, refactor, chore, docs, test, style, perf, build, ci)
- Scope and component extraction from commit messages
- Breaking change detection from `!` suffix and `BREAKING CHANGE:` footer
- Commit message quality scoring (0-100)
- Semantic tag extraction for categorization
- Optional LLM-enhanced analysis for complex messages

**New Service:** `backend/src/aexy/services/commit_analyzer.py`
- API: `POST /api/v1/intelligence/commits/analyze`
- API: `GET /api/v1/intelligence/commits/distribution`

**PR Review Quality Analysis:**
- Review depth scoring (1-5 scale based on comment length and complexity)
- Thoroughness classification: cursory, standard, detailed, exhaustive
- Mentoring behavior detection (explains_why, provides_examples, suggests_alternatives, asks_questions, shares_resources)
- Review response time calculation
- Mentoring score aggregation

**New Service:** `backend/src/aexy/services/review_quality_analyzer.py`
- API: `GET /api/v1/intelligence/reviews/quality`
- API: `POST /api/v1/intelligence/reviews/analyze`
- API: `GET /api/v1/intelligence/reviews/response-time`

**Expertise Confidence Intervals:**
- Logarithmic proficiency scoring based on commit count and lines of code
- Confidence intervals (0-1) based on data quantity and repo diversity
- Recency factor with exponential decay (180-day half-life)
- Depth levels: novice, intermediate, advanced, expert
- Context classification: production, personal, learning, unknown
- Repository diversity scoring

**New Service:** `backend/src/aexy/services/expertise_confidence.py`
- API: `GET /api/v1/intelligence/expertise`
- API: `POST /api/v1/intelligence/expertise/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/expertise/{skill_name}`

**Burnout Risk Indicators:**
- After-hours commit percentage tracking (before 9am / after 6pm)
- Weekend work frequency analysis
- Consecutive high-activity days detection
- Days since last break calculation
- Review quality trend analysis
- Risk levels: low, moderate, high, critical
- Risk score (0-1) with weighted indicators
- Trend detection (improving, stable, worsening)
- Configurable thresholds

**New Service:** `backend/src/aexy/services/burnout_detector.py`
- API: `GET /api/v1/intelligence/burnout`
- API: `POST /api/v1/intelligence/burnout/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/burnout`

**Collaboration Network Analysis:**
- Graph-based collaboration mapping from PR reviews
- Collaboration strength scoring (frequency + recency weighted)
- Knowledge silo detection for isolated developers
- Team cohesion scoring with graph density metrics
- Central connector identification
- Collaboration diversity scoring

**New Service:** `backend/src/aexy/services/collaboration_network.py`
- API: `GET /api/v1/intelligence/collaborators`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration/graph`

**Project Complexity Classification:**
- PR complexity levels: trivial, simple, moderate, complex, critical
- Complexity scoring (0-100) based on files, layers, and components
- Change categories: feature, bugfix, refactor, documentation, infrastructure, configuration, dependency, test, security, performance
- Architectural layer detection (api, service, model, repository, ui, infrastructure, config, test)
- Component extraction from file paths
- Cross-cutting change detection
- Infrastructure and migration flagging
- Security-sensitive file identification
- Review effort estimation (low, medium, high, very_high)
- Risk indicator generation

**New Service:** `backend/src/aexy/services/complexity_classifier.py`
- API: `GET /api/v1/intelligence/complexity`
- API: `POST /api/v1/intelligence/complexity/analyze`
- API: `POST /api/v1/intelligence/complexity/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/complexity`

**Technology Evolution Tracking:**
- Framework/library version detection from dependency files
- Version status classification: current, recent, outdated, deprecated
- Technology adoption score (0-1)
- Automated upgrade suggestions with priority
- Support for 30+ popular technologies (React, Vue, Angular, FastAPI, Django, etc.)
- Team-wide technology health scoring
- Critical upgrade identification

**New Service:** `backend/src/aexy/services/technology_tracker.py`
- API: `GET /api/v1/intelligence/technology`
- API: `POST /api/v1/intelligence/technology/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/technology`

**Full Analysis Endpoint:**
- API: `POST /api/v1/intelligence/analyze-all` - Runs all analysis types in one call

**Database Migration:**
- New migration: `backend/scripts/migrate_github_intelligence.sql`
- Added `semantic_analysis` JSONB column to commits table
- Added `quality_metrics` JSONB column to code_reviews table
- Added `expertise_confidence` JSONB column to developers table
- Added `burnout_indicators` JSONB column to developers table
- Added `last_intelligence_analysis_at` timestamp to developers table
- Added `complexity_analysis` JSONB column to pull_requests table
- Created `developer_collaborations` table for collaboration graph storage

**New API Router:**
- `backend/src/aexy/api/intelligence.py` with 22 endpoints

## [0.4.4] - 2026-01-29

### Fixed

#### Slack Notification Bug for Uptime Monitors

Fixed an issue where Slack notifications were not being sent for uptime monitor incidents when the monitor didn't have a specific `slack_channel_id` configured.

**Root Cause:**
- Notifications required `monitor.slack_channel_id` to be set, but most monitors relied on the workspace's default Slack channel configuration
- The code didn't fall back to looking up the workspace's configured Slack channel from `slack_channel_configs`

**Changes:**
- Added fallback logic to look up workspace notification channel when monitor-specific channel is not set
- Auto-add `slack` to `notification_channels` when creating new monitors if Slack is configured for the workspace
- Auto-add `slack` to existing monitors when a Slack channel is first configured for a workspace

### Improved

#### Code Quality & Maintainability

**Centralized Slack Integration Helpers:**
- Created new `backend/src/aexy/services/slack_helpers.py` module with shared functions:
  - `get_slack_integration_for_workspace()` - finds integration by workspace/org ID
  - `get_slack_channel_config()` - gets channel config for an integration
  - `get_workspace_notification_channel()` - combines both to get channel ID
  - `check_slack_channel_configured()` - boolean check for Slack setup
- Removed duplicated Slack lookup logic from `uptime_service.py` and `uptime_tasks.py`

**Added Constants for Notification Channels:**
- `NOTIFICATION_CHANNEL_SLACK = "slack"`
- `NOTIFICATION_CHANNEL_WEBHOOK = "webhook"`
- `NOTIFICATION_CHANNEL_TICKET = "ticket"`
- Replaced magic strings throughout the codebase

**Improved Type Safety:**
- Added proper type hints (`db: AsyncSession`) to notification helper functions
- Added return type annotations to `_send_slack_notification()`

**Better Exception Handling:**
- Changed broad `Exception` catches to specific `SQLAlchemyError` for database operations
- Added specific `HTTPError` handling for Slack API calls
- Added explicit timeout (30s) to HTTP client for Slack notifications

**Graceful Error Handling:**
- Wrapped `add_slack_to_monitors()` call in try/except to prevent channel configuration failures if monitor update fails
- Logs warning but doesn't fail the primary operation

**Files Changed:**
- `backend/src/aexy/services/slack_helpers.py` (new)
- `backend/src/aexy/services/uptime_service.py`
- `backend/src/aexy/processing/uptime_tasks.py`
- `backend/src/aexy/api/slack.py`

---

## [0.4.2] - 2026-01-25

### Added

#### Email Provider Configuration UI

**Provider Edit Modal:**
- Added comprehensive provider configuration modal with provider-specific credential fields
- SES credentials: Access Key ID, Secret Access Key, Region, Configuration Set
- SendGrid credentials: API Key
- Mailgun credentials: API Key, Domain, Region (US/EU selector)
- Postmark credentials: Server Token
- SMTP credentials: Host, Port, Username, Password, TLS toggle

**Provider Card Improvements:**
- Added "Configure" button to edit provider settings and credentials
- Added "Setup Required" badge for providers without credentials configured
- Test connection button now disabled until credentials are configured
- Display provider description when available

**Provider Test Feedback:**
- Added toast notifications for provider connection test results
- Success toast shows "Connection successful" with provider message
- Error toast shows "Connection failed" with detailed error message (e.g., invalid credentials)
- Added Toaster component to root layout for app-wide notifications

**Credential Encryption (Security):**
- Added Fernet-based encryption for provider credentials at rest
- Credentials are encrypted before storing in database using AES-128-CBC
- Encryption key derived from application `secret_key` via SHA256
- Backward compatible with existing unencrypted credentials (auto-detected)
- New encryption utility module at `core/encryption.py`

### Changed

- Updated `EmailProvider` TypeScript interface with `credentials`, `description`, `settings`, and status fields
- Updated provider update API to accept `credentials` and `description` parameters
- Added `has_credentials` boolean field to provider API responses for secure credential status indication
- Credentials are no longer returned in API responses (security improvement) - only `has_credentials` flag indicates if configured

### Fixed

- Fixed migration runner `--force` flag not re-running changed migrations
- Fixed TypeScript type errors in provider credential handling
- Fixed provider test not showing results to user (toast notifications now display success/error)
- Fixed "Setup Required" badge not updating after credentials are saved (now uses `has_credentials` from API)

---

## [0.4.1] - 2026-01-25

### Added

#### Email Marketing Infrastructure Improvements

**DNS Records UI:**
- Enhanced DNS records display with collapsible section in domain cards
- Copy-to-clipboard functionality for DNS record names and values
- Visual indicators for verified/pending DNS records
- "Action Required" badge for unverified domains
- Documentation link to GitHub for DNS setup guidance
- Support for Verification, SPF, DKIM, and DMARC record types

**Provider Management:**
- Providers can now be created without credentials (configurable later)
- Credentials field now accepts empty dict as default

### Fixed

#### Provider Connection Testing
- Fixed provider test connection hanging when credentials are not configured
- Added credential validation before attempting API connections for all providers:
  - SES: checks for `access_key_id` and `secret_access_key`
  - SendGrid: checks for `api_key`
  - Mailgun: checks for `api_key` and `domain`
  - Postmark: checks for `server_token`
  - SMTP: checks for `host`
- Returns helpful error message indicating which credentials are missing

#### Sending Domain Model
- Made `provider_id` nullable in SendingDomain model
- Added `SET NULL` on delete for provider foreign key relationship
- Added `dns_records`, `verification_token`, and `verified_at` fields to SendingDomainListResponse schema

---

## [0.4.0] - 2026-01-25

### Added

#### Assessment Proctoring System

A comprehensive real-time proctoring system for assessment integrity with AI-powered face detection, violation tracking, and chunked video recording with cloud storage.

**Face Detection & Monitoring:**
- Real-time face detection using face-api.js with TinyFaceDetector
- No face detected alerts with configurable cooldown (10 seconds)
- Multiple faces detection with count reporting
- Face landmark and recognition model support
- Live webcam preview during assessment

**Violation Tracking:**
- Configurable maximum violation count before auto-submission
- Violation types: no face, multiple faces, tab switch, window blur, fullscreen exit, copy/paste attempt
- Real-time violation counter with visual warnings
- Warning modal with violation details and remaining attempts
- Automatic assessment submission on max violations exceeded

**Screen & Webcam Recording:**
- Chunked recording with configurable duration (10 second chunks)
- Cloudflare R2 upload integration for video storage
- Separate webcam and screen recording streams
- Progress tracking for uploads
- Graceful recording stop and finalization on submission

**Proctoring Settings:**
- Enable/disable proctoring per assessment
- Webcam requirement toggle
- Screen recording toggle
- Fullscreen enforcement toggle
- Face detection toggle
- Tab/window tracking toggle
- Copy/paste prevention toggle

**Security Features:**
- Fullscreen mode enforcement with exit detection
- Tab switch detection via visibility API
- Window blur detection
- Copy/cut/paste prevention with event blocking
- Right-click context menu prevention
- Re-enable prompts for fullscreen and screen sharing after violations

**Backend Proctoring Service:**
- `ProctoringService` for event logging and analysis
- Proctoring event types with severity levels (info, warning, critical)
- Event summary generation for attempt review
- Trust score calculation based on violations
- Integration with assessment attempt model

**R2 Upload Service:**
- Chunked upload support for large video files
- Multipart upload with progress tracking
- Signed URL generation for secure uploads
- Recording type tagging (webcam/screen)

**Assessment Settings UI (Step 3):**
- Proctoring settings section with toggles
- `enable_webcam`, `enable_screen_recording`, `enable_fullscreen_enforcement`
- `enable_face_detection`, `enable_tab_tracking`, `enable_copy_paste_detection`
- Additional options: `allow_calculator`, `allow_ide`

**Assessment Review UI (Step 5):**
- Proctoring status display in review summary
- Settings verification before publish

**New Files:**
- `frontend/src/hooks/useChunkedRecording.ts` - Chunked recording hook
- `frontend/src/services/recordingUploadService.ts` - R2 upload service
- `frontend/src/constants/index.ts` - MAX_VIOLATION_COUNT constant
- `frontend/public/models/` - Face-api.js model files
- `backend/src/aexy/services/proctoring_service.py` - Proctoring event service
- `backend/src/aexy/services/r2_upload_service.py` - Cloudflare R2 integration

**Dependencies Added:**
- `face-api.js` - Browser-based face detection

---

## [0.3.1] - 2026-01-24

### Fixed

#### Uptime Module - Nullability & Visibility Fixes

**Monitor Visibility Bug:**
- Fixed monitors not appearing in the UI after creation
- Backend returns array directly for `/monitors` endpoint, but frontend expected `{ monitors: [], total }` format
- Updated API client to normalize response formats across all uptime endpoints

**API Response Format Alignment:**
- `monitors.list()` - Now correctly handles array response from backend
- `incidents.list()` - Now correctly handles `{ items: [] }` response format
- `monitors.getChecks()` - Now correctly handles `{ items: [] }` response format

**Unknown Status Handling:**
- Added `unknown` status support for newly created monitors (before first check runs)
- Added `unknown` to `STATUS_COLORS` in all uptime pages to prevent render crashes
- Added `DEFAULT_STATUS_STYLE` fallback for unrecognized status values

**Null-Safe Data Handling:**
- Added optional chaining (`?.`) when accessing API response properties
- Added fallback to empty arrays (`|| []`) for all list data
- Added error state resets in catch blocks to prevent stale data display
- Fixed `TypeError: Cannot read properties of undefined (reading 'length')` errors

**Files Updated:**
- `frontend/src/lib/uptime-api.ts` - API response normalization
- `frontend/src/app/(app)/uptime/page.tsx` - Dashboard null safety
- `frontend/src/app/(app)/uptime/monitors/page.tsx` - Monitors list null safety
- `frontend/src/app/(app)/uptime/monitors/[monitorId]/page.tsx` - Monitor detail null safety
- `frontend/src/app/(app)/uptime/incidents/page.tsx` - Incidents list null safety
- `frontend/src/app/(app)/uptime/incidents/[incidentId]/page.tsx` - Incident detail null safety
- `frontend/src/app/(app)/uptime/history/page.tsx` - Check history null safety

---

## [0.3.0] - 2026-01-24

### Added

#### Uptime Monitoring Module

A comprehensive uptime monitoring system for tracking HTTP endpoints, TCP ports, and WebSocket connections with automatic incident management and ticket creation.

**Core Features:**
- **Multi-Protocol Monitoring**: Support for HTTP, TCP, and WebSocket endpoint checks
- **Configurable Check Intervals**: 1 minute, 5 minutes, 15 minutes, 30 minutes, or 1 hour
- **SSL Certificate Monitoring**: Track SSL expiry days and alert on upcoming expirations
- **Consecutive Failure Thresholds**: Configure how many failures before alerting (default: 3)
- **Auto-Ticketing**: Automatically create support tickets when services go down
- **Auto-Close on Recovery**: Tickets are automatically closed when services recover with full timeline

**Incident Management:**
- Incident status tracking: `ongoing`, `acknowledged`, `resolved`
- Incident timeline with start, acknowledgment, and resolution timestamps
- Failed checks count and total checks during incident
- Root cause and resolution notes for post-mortems
- Automatic linking to support tickets

**HTTP Check Features:**
- Configurable HTTP methods (GET, POST, HEAD, PUT, PATCH)
- Expected status codes validation (e.g., [200, 201, 204])
- Custom request headers
- Request body support
- SSL verification toggle
- Follow redirects option
- Response time tracking

**TCP Check Features:**
- Host and port configuration
- Connection timeout handling
- Response time measurement

**WebSocket Check Features:**
- WebSocket URL monitoring
- Optional message sending on connect
- Expected response pattern validation
- Connection health verification

**Notification Channels:**
- Slack notifications via channel ID
- Custom webhook delivery
- Email alerts (via existing infrastructure)
- Recovery notifications (configurable)

**Database Tables:**
- `uptime_monitors` - Monitor configurations
- `uptime_checks` - Individual check results (time-series)
- `uptime_incidents` - Incident tracking with ticket integration

**API Endpoints:**
- `GET /workspaces/{id}/uptime/monitors` - List monitors
- `POST /workspaces/{id}/uptime/monitors` - Create monitor
- `GET /workspaces/{id}/uptime/monitors/{id}` - Get monitor details
- `PATCH /workspaces/{id}/uptime/monitors/{id}` - Update monitor
- `DELETE /workspaces/{id}/uptime/monitors/{id}` - Delete monitor
- `POST /workspaces/{id}/uptime/monitors/{id}/pause` - Pause monitoring
- `POST /workspaces/{id}/uptime/monitors/{id}/resume` - Resume monitoring
- `POST /workspaces/{id}/uptime/monitors/{id}/test` - Run immediate test
- `GET /workspaces/{id}/uptime/monitors/{id}/checks` - Check history
- `GET /workspaces/{id}/uptime/monitors/{id}/stats` - Monitor statistics
- `GET /workspaces/{id}/uptime/incidents` - List incidents
- `GET /workspaces/{id}/uptime/incidents/{id}` - Get incident details
- `PATCH /workspaces/{id}/uptime/incidents/{id}` - Update incident notes
- `POST /workspaces/{id}/uptime/incidents/{id}/resolve` - Manually resolve
- `POST /workspaces/{id}/uptime/incidents/{id}/acknowledge` - Acknowledge incident
- `GET /workspaces/{id}/uptime/stats` - Workspace-level statistics

**Frontend Pages:**
- `/uptime` - Uptime dashboard with stats and overview
- `/uptime/monitors` - Monitors list with create modal
- `/uptime/monitors/[id]` - Monitor detail with stats, checks, and configuration
- `/uptime/incidents` - Incidents list with filtering
- `/uptime/incidents/[id]` - Incident detail with timeline and post-mortem notes
- `/uptime/history` - Check history viewer

**Product Page:**
- `/products/uptime` - Marketing landing page for uptime monitoring

**Celery Background Tasks:**
- `process_due_checks` - Runs every minute, dispatches checks for due monitors
- `execute_check` - Performs individual HTTP/TCP/WebSocket checks
- `send_uptime_notification` - Sends Slack and webhook notifications
- `cleanup_old_checks` - Daily cleanup of check history (keeps 30 days)

**Access Control Integration:**
- Added to sidebar under "Engineering" section
- Sub-navigation: Monitors, Incidents, History
- App bundle configuration:
  - Engineering bundle: Uptime enabled
  - People bundle: Uptime disabled
  - Business bundle: Uptime disabled
  - Full Access bundle: Uptime enabled
- Permission: `can_view_uptime`

**Statistics & Metrics:**
- Uptime percentage (24h, 7d, 30d)
- Average response time
- Total and failed checks
- Incident counts
- Current and longest streak up

---

## [0.2.1] - 2026-01-23

### Added

#### Team Booking Features

Extended the booking module with team scheduling capabilities.

**All Hands Mode:**
- New `ALL_HANDS` assignment type for team event types
- Book meetings where all team members attend (not just rotating hosts)
- All members added as attendees with individual RSVP tracking

**RSVP System:**
- Team attendees receive unique `response_token` for accepting/declining
- Public RSVP page at `/rsvp/{token}` for viewing booking details and responding
- Attendee status tracking: `pending`, `confirmed`, `declined`
- Email notifications for RSVP invitations

**Team Calendar View:**
- New page at `/booking/team-calendar`
- Visual overview of team availability across the week
- Overlapping available slots highlighted
- Filter by team event type or workspace team
- Copy booking link functionality

**Custom Booking Links:**
- Workspace landing page: `/book/{workspace}` - Lists all public event types
- Team-specific booking: `/book/{workspace}/{event}/team/{team}`
- Custom member selection via query params: `?members=id1,id2,id3`
- Clean URL structure with workspace and event slugs

**New Database Table:**
- `booking_attendees` - Stores team meeting attendees with RSVP status and response tokens

**New API Endpoints:**
- `GET /booking/rsvp/{token}` - Get booking details for RSVP
- `POST /booking/rsvp/{token}/respond` - Submit RSVP response (accept/decline)
- `GET /public/book/{workspace}/teams` - List workspace teams for booking
- `GET /public/book/{workspace}/team/{team_id}` - Get team info for booking page
- `GET /booking/calendars/callback/{provider}` - OAuth callback endpoint

**New Frontend Pages:**
- `/booking/team-calendar` - Team availability calendar view
- `/book/{workspace}` - Public workspace landing page
- `/book/{workspace}/{event}/team/{team}` - Team-specific booking page
- `/rsvp/{token}` - Public RSVP response page

#### Documentation & Website

- Added comprehensive booking module documentation at `/docs/booking.md`
- Added booking product page at `/products/booking`
- Updated `/docs/README.md` to include booking in documentation index
- Updated `/docs/google.md` with booking calendar callback URLs

### Fixed

**Calendar OAuth Flow:**
- Fixed "Method Not Allowed" error when connecting Google/Microsoft calendars
- Refactored to use standard OAuth callback pattern (backend receives redirect)
- OAuth state now signed with HMAC for security
- Proper error handling with user-friendly redirect messages

**Callback URL Change:**
- Old: Frontend received OAuth redirect, then POST to backend
- New: Backend receives OAuth redirect directly at `/api/v1/booking/calendars/callback/{provider}`
- Backend exchanges code for tokens and redirects user to frontend with success/error params

### Changed

- Calendar OAuth redirect URIs now point to backend callback endpoints
- Frontend calendars page handles `?success=true` and `?error=...` query params

---

## [0.2.0] - 2026-01-22

### Added

#### Knowledge Graph for Docs (Enterprise)

An intelligent knowledge graph feature that automatically extracts entities from documentation and visualizes relationships in an interactive force-directed graph.

**Core Features:**
- **LLM-powered Entity Extraction**: Automatically identifies people, concepts, technologies, projects, organizations, and code references from markdown documents
- **Interactive Graph Visualization**: Force-directed layout using @xyflow/react and d3-force with zoom, pan, and drag capabilities
- **Relationship Mapping**: Tracks connections between entities and documents with strength-based edge visualization
- **Discovery Tools**: Entity search, path finding between nodes, and neighborhood exploration

**Entity Types:**
- Person (team members, authors, stakeholders)
- Concept (technical/business concepts)
- Technology (languages, frameworks, tools)
- Project (product/project names)
- Organization (teams, companies)
- Code (functions, classes, APIs)
- External (URLs, external references)

**Relationship Types:**
- `mentions`, `related_to`, `depends_on`, `authored_by`, `implements`, `references`, `links_to`, `shares_entity`

**Backend Components:**
- Database tables: `knowledge_entities`, `knowledge_entity_mentions`, `knowledge_relationships`, `knowledge_document_relationships`, `knowledge_extraction_jobs`
- SQLAlchemy models with full type annotations
- RESTful API endpoints under `/workspaces/{id}/knowledge-graph/`
- Services: `KnowledgeExtractionService`, `KnowledgeGraphService`
- Celery tasks for async extraction processing

**API Endpoints:**
- `GET /graph` - Full graph data with filters
- `GET /graph/document/{id}` - Document-centric view
- `GET /graph/entity/{id}` - Entity neighborhood
- `GET /entities` - List/search entities
- `GET /path` - Find path between nodes
- `GET /statistics` - Graph statistics
- `GET /temporal` - Timeline data
- `POST /extract` - Trigger extraction
- `GET /jobs` - Extraction job status

**Frontend Components:**
- Knowledge Graph page at `/docs/knowledge-graph`
- Interactive canvas with custom document and entity nodes
- Toolbar with search, filters, and view controls
- Sidebar panel for node details
- Timeline slider for temporal filtering
- Enterprise gate with upgrade prompt for non-Enterprise users

**Temporal Features:**
- Timeline filtering by date range
- Activity tracking with node color intensity
- First seen / last seen timestamps for entities

**Quality Metrics:**
- Confidence scoring for extracted entities
- Occurrence counting across documents
- Relationship strength calculation

#### Calendar Booking Module

A comprehensive calendar booking system similar to Calendly, fully integrated into the Aexy ecosystem.

**Core Features:**
- **Event Types**: Create and manage bookable event types with customizable durations (15, 30, 45, 60+ minutes)
- **Public Booking Pages**: Shareable booking links for external users to schedule meetings
- **Availability Management**: Set weekly availability schedules with timezone support
- **Date Overrides**: Configure vacation days, holidays, and special hours
- **Calendar Integrations**: Connect Google Calendar and Microsoft Outlook for conflict detection

**Backend Components:**
- Database models: `EventType`, `Booking`, `UserAvailability`, `AvailabilityOverride`, `CalendarConnection`, `TeamEventMember`, `BookingWebhook`
- RESTful API endpoints for event types, bookings, availability, and calendar management
- Services: `BookingService`, `AvailabilityService`, `CalendarSyncService`, `BookingPaymentService`, `BookingNotificationService`
- Celery background tasks for reminders, calendar sync, and cleanup

**Frontend Pages:**
- `/booking` - Booking dashboard with stats, event types overview, and upcoming bookings
- `/booking/event-types` - List and manage event types
- `/booking/event-types/new` - Create new event type
- `/booking/event-types/[id]` - Edit existing event type
- `/booking/availability` - Weekly availability schedule editor
- `/booking/calendars` - Calendar connections management

**Public Booking Pages:**
- `/public/book/[workspace]/[event]` - Public event booking page with calendar picker
- `/public/book/confirmation/[bookingId]` - Booking confirmation page
- `/public/book/cancel/[bookingId]` - Booking cancellation page
- `/public/book/reschedule/[bookingId]` - Booking reschedule page

**Event Type Configuration:**
- Custom name, slug, and description
- Duration options (15-120 minutes)
- Location types: Zoom, Google Meet, Phone, In-Person, Custom
- Buffer times before and after meetings
- Minimum notice and maximum future booking windows
- Custom intake questions for invitees
- Color coding for visual organization

**Availability Features:**
- Weekly recurring availability slots
- Multiple time slots per day
- Timezone-aware scheduling (UTC, ET, CT, MT, PT, GMT, CET, JST)
- Date-specific overrides for vacations and holidays

**Calendar Integration:**
- Google Calendar OAuth connection
- Microsoft Outlook OAuth connection
- Automatic conflict detection from connected calendars
- Event creation in primary calendar on booking
- Manual and automatic sync (every 5 minutes)
- Primary calendar designation

**Booking Management:**
- Booking status tracking (pending, confirmed, cancelled, completed, no-show)
- Cancellation with reason tracking
- Reschedule functionality
- Booking statistics and metrics

**Access Control Integration:**
- Added to sidebar under "Business" section
- Sub-navigation: Event Types, Availability, Calendars
- App bundle configuration:
  - Engineering bundle: Booking disabled
  - People bundle: Booking disabled
  - Business bundle: Booking enabled with all modules
  - Full Access bundle: Booking enabled with all modules
- Permission: `can_view_booking`

**Background Tasks (Celery):**
- `send_booking_reminders` - Send reminder emails 24h and 1h before meetings
- `sync_all_calendars` - Periodic calendar synchronization
- `process_booking_webhooks` - Dispatch webhooks to registered endpoints
- `cleanup_expired_pending_bookings` - Cancel stale pending bookings
- `mark_completed_bookings` - Auto-mark past bookings as completed
- `generate_booking_analytics` - Generate booking statistics

**Enterprise Features (Planned):**
- Payment collection via Stripe
- Custom branding
- Webhooks for external integrations
- Advanced analytics

#### Developer Tools

**Migration Runner Script:**
- New `backend/scripts/run_migrations.py` for running SQL migrations
- Tracks applied migrations in `schema_migrations` table with checksums
- Supports `--list`, `--dry-run`, `--file`, `--force`, `--database-url` options
- Detects changed migrations via MD5 checksum comparison
- Works both locally and on production servers

**Test Token Generator:**
- New `backend/scripts/generate_test_token.py` for API testing
- Lists available developers and generates JWT tokens
- Configurable token expiration

### Changed

- Updated sidebar layouts to include Booking module
- Extended app definitions catalog with booking app and modules

### Fixed

- Calendar list API response handling in frontend

---

## [0.1.1] - Initial Release

The foundational release of Aexy - a comprehensive Engineering OS platform for team management, performance tracking, hiring, and business operations.

### Added

#### Dashboard & Analytics

**Customizable Dashboards:**
- Role-based preset layouts (developer, manager, product, HR, support, sales, admin)
- Widget management with visibility toggles and size customization
- Grid-based layout configuration with drag-and-drop
- Dashboard preferences persistence per user

#### Tracking Module

**Daily Standups:**
- Standup records with yesterday summary, today plans, and blockers
- Slack integration for submission via commands and channels
- LLM-powered parsing for task references and blocker extraction
- Sentiment scoring and productivity signal detection
- Team mood analysis and participation metrics

**Work Logs:**
- Multiple entry types (progress, note, question, decision, update)
- Manual and inferred time tracking with confidence scoring
- External task reference support
- Slack and web submission sources

**Time Tracking:**
- Duration-based time entries with optional start/end timestamps
- Inferred time from activity patterns
- Confidence scoring for automated entries

**Blockers:**
- Severity levels (low, medium, high, critical)
- Categories (technical, dependency, resource, external, process)
- Status workflow (active, resolved, escalated)
- Resolution tracking with time metrics

**Activity Patterns:**
- Per-developer activity aggregation
- Standup consistency scoring and streaks
- Work log frequency analysis
- Active hours and days detection
- Slack activity signals and response times

#### Sprint Planning & Task Management

**Sprint Management:**
- Sprint lifecycle (planning, active, review, retrospective, completed)
- Capacity and velocity tracking
- Sprint goals with JSONB configuration
- Planning sessions with participant and decision logging

**Task Management:**
- Task hierarchies with parent/child relationships
- External sources (GitHub, Jira, Linear, manual)
- Rich descriptions with TipTap editor
- Story point estimation and priority levels
- Custom workspace statuses with colors and icons
- Cycle time and lead time metrics
- AI-based assignment suggestions
- Carry-over tracking across sprints

**Task Types:**
- Task, bug, subtask, spike, chore, feature
- Custom fields (text, number, select, multiselect, date, URL)
- Field validation and ordering

**Sprint Metrics:**
- Daily snapshots with burndown tracking
- Task completion metrics
- Team velocity with focus factor
- Completion rates and carry-over analysis

**Retrospectives:**
- Went-well, to-improve, action items structure
- Team mood scoring (1-5 scale)
- Voting on retrospective items
- Action item assignment and tracking

**Task Templates:**
- Reusable templates with variables
- Default priority, story points, and labels
- Subtask and checklist templates
- Usage tracking

**GitHub Integration:**
- Task links to commits and pull requests
- Auto-link detection via patterns (Fixes, Closes, Refs)
- Reference metadata tracking

#### Performance Reviews & Goals

**Review Cycles:**
- Configurable periods (annual, semi-annual, quarterly, custom)
- Phase workflow (self-review, peer-review, manager-review, completed)
- Anonymous peer review support
- Customizable questions and rating scales
- GitHub metrics integration

**Individual Reviews:**
- Manager assignment with source tracking
- Contribution summary caching
- Overall ratings with criteria breakdown
- AI-generated review summaries

**Review Submissions:**
- COIN framework (Context, Observation, Impact, Next Steps)
- Self, peer, and manager submission types
- Anonymous tokens for peer reviews
- Linked goals and contributions as evidence

**Peer Review Requests:**
- Employee-initiated and manager-assigned modes
- Request status tracking
- Deadline management

**Work Goals (SMART Framework):**
- Goal types (performance, skill, project, leadership, team contribution)
- Key results with target tracking (OKR-style)
- Progress percentage and status tracking
- Auto-linked GitHub activity
- Learning path integration
- Review cycle association

**Contribution Summaries:**
- GitHub metrics (commits, PRs, code reviews)
- Skills demonstrated tracking
- Repository breakdown
- Notable PR identification
- AI-generated insights

#### Hiring & Assessments

**Assessment Platform:**
- Multi-step wizard for creation
- Job designation and experience targeting
- Skill-based assessments with weighting
- Status lifecycle (draft, active, completed, archived)

**Question Types:**
- Code questions with test cases and starter code
- Multiple choice (single/multiple correct)
- Subjective questions with sample answers
- Pseudo-code questions
- Audio questions (repeat, transcribe, spoken answer, read-speak)

**Question Configuration:**
- Topic and subtopic organization
- Difficulty levels (easy, medium, hard)
- Time estimates and max marks
- Constraints and hints
- AI generation with metadata
- Reusable question bank

**Assessment Settings:**
- Schedule and timezone support
- Access window configuration
- Custom candidate fields
- Email template customization
- Proctoring (webcam, screen recording, face detection, tab tracking)
- Security (shuffle, copy-paste prevention)

**Candidates:**
- Profiles with resume, LinkedIn, GitHub, portfolio
- Custom fields and source tracking
- Invitation management with tokens
- Email open and click tracking
- Deadline management

**Attempts & Proctoring:**
- Multiple attempts with limiting
- Trust score calculation
- Proctoring event tracking with severity
- Video recording (webcam and screen)
- IP address and device tracking

**Evaluation:**
- AI-powered scoring with percentages
- Test case results for code
- Code quality analysis (complexity, readability, security)
- Rubric-based scoring
- Strong/weak areas identification
- Recommendations (strong_yes, yes, maybe, no)

**Question Analytics:**
- Score distribution and percentiles
- Time-to-completion metrics
- Difficulty calibration
- Skip and completion rates

#### CRM Module

**Objects & Attributes:**
- Standard objects (Company, Person, Deal, Project)
- Custom object support
- 20+ field types (text, currency, date, select, record references)
- AI-computed fields for enrichment

**Records:**
- Flexible JSONB storage
- Ownership and creator tracking
- Soft delete with archive
- Source tracking (manual, email sync, API, import)
- Record relationships (one-to-many, many-to-many)

**Record Lists:**
- View types (table, kanban, calendar, timeline, gallery)
- Advanced filtering and sorting
- Kanban with group-by and WIP limits
- Calendar view with date attributes
- Manual ordering

**Activities:**
- 25+ activity types
- Communication tracking (email, call, meeting)
- Record change history
- Note and task management
- External engagement tracking

**Automations:**
- Triggers (record created/updated/deleted, field changed, scheduled, webhook, form)
- Condition-based filtering
- Multi-action sequences
- Error handling modes
- Rate limiting and execution tracking

**Sequences & Campaigns:**
- Multi-step sequences
- Step types (email, task, wait, condition, action)
- Configurable delays
- Exit conditions (reply, meeting booked, deal created)
- Send window configuration
- Enrollment tracking

**Webhooks:**
- Outgoing subscriptions
- Event filtering
- HMAC signature verification
- Custom headers
- Retry with backoff

#### Email Marketing

**Templates:**
- Code-based with Jinja2
- Visual builder with drag-drop
- Categories (marketing, onboarding, release, transactional, newsletter)
- Variable support with types
- Template versioning

**Campaigns:**
- Types (one-time, recurring, triggered)
- Audience targeting via CRM lists
- Status lifecycle (draft, scheduled, sending, sent, paused, cancelled)
- Optimal send window scheduling
- Multi-domain sending infrastructure
- Template context overrides
- Statistics (sent, delivered, opened, clicked, bounced, unsubscribed)

**Recipient Tracking:**
- Individual status tracking
- Engagement metrics (opens, clicks)
- Bounce classification (hard, soft)
- Multi-domain sending tracking
- Personalization context

**Email Tracking:**
- Open tracking via pixel
- Device and client detection
- Link click tracking
- User agent and IP logging

**Analytics:**
- Time-series (daily, hourly)
- Rate calculations (open, click, click-to-open)
- Workspace aggregates (daily, weekly, monthly)
- Health metrics (bounce rate, complaint rate)

**Subscriber Management:**
- Global status (active, unsubscribed, bounced, complained)
- Verification tracking
- Subscription categories with frequency
- Unsubscribe event logging

#### Documentation Module

**Document Management:**
- Notion-like spaces with team organization
- Templates with AI generation
- Rich content editing with code blocks
- Version history and change tracking
- Collaborative editing with mentions

**Sharing & Permissions:**
- Granular permissions (view, comment, edit, admin)
- Privacy levels (private, workspace, public)
- Code file linking for references

**Collaboration:**
- Comments and discussions
- Notifications (comment, mention, share, edit)
- Search and filtering

#### Forms Module

**Form Builder:**
- Standalone forms with multi-destination routing
- Templates (bug report, feature request, support, contact, lead capture, feedback)
- Field types (text, textarea, email, phone, number, URL, select, checkbox, radio, file, date, hidden)

**Form Features:**
- Public sharing (anonymous/verified modes)
- Multi-destination support (CRM, ticketing, email)
- Ticket creation from submissions
- CRM record creation/linking
- Email notification routing
- Conditional logic and field dependencies

**Analytics:**
- Submission tracking
- Status tracking (pending, processing, completed, failed)

#### Learning Management

**Learning Goals:**
- Manager-set goals for team members
- Types (course, hours, skill, certification, path, custom)
- Status tracking (pending, in progress, completed, cancelled, overdue)
- Due date and progress tracking

**Approvals:**
- Request system for courses, certifications, conferences
- Multi-level workflows
- Budget impact assessment

**Budget Management:**
- Team and individual budgets
- Transaction tracking (allocation, adjustment, expense, refund)
- Utilization metrics
- Department-level management

#### Ticketing System

**Ticket Management:**
- Ticket creation from forms and manual entry
- Status and priority tracking
- Assignment workflows
- SLA management

#### Core Platform

**Multi-Workspace:**
- Workspace isolation
- Team management
- Organization structure
- Role-based access control
- App-wise member access

**Integrations:**
- **Slack**: Standups, work logs, blockers via commands and channels
- **GitHub**: Repository sync, commits, PRs, contribution metrics
- **LLM Providers**: Claude, Gemini, Ollama with rate limiting
- **Email**: Multi-domain sending, SES, SendGrid, SMTP

**Security & Compliance:**
- Soft delete for data recovery
- Audit trails
- User permissions
- Activity logging
