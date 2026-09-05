# Community

A public forum built out of the workspace's own chat. A channel that already
exists internally can be published; its threads become ordinary web pages with
ordinary URLs, readable and indexable by anyone, administered from workspace
settings rather than a separate platform with its own logins.

![The public forum, as somebody without an account sees it](./images/community/public.png)

Everything here sits on top of the Team Chat model (`models/chat.py`). There is
no second messaging system: a community thread *is* a `ChatTopic`, a post *is* a
`ChatMessage`. What the community adds is a visibility contract and a small set
of forum affordances on top.

## Mental model

- **Community** — one `WorkspaceCommunity` row per workspace, keyed by
  `workspace_id`. Its absence means "no community". It carries the master switch
  (`enabled`), the public URL segment (`community_slug`, globally unique), the
  branding, and every participation and linking switch.
- **Channel** — a `ChatChannel`. `visibility = "web_public"` is what publishes
  it. `web_public_since` is a history cutoff: set it and only messages at or
  after that moment are ever served publicly, which is how a channel with years
  of internal chat can be published from today onward.
- **Topic** — a `ChatTopic`, addressed publicly as `{slug}-{public_short_id}`.
  The short id is immutable, so a permalink survives a rename. A topic's own
  `visibility` can only ever *narrow* the channel's, never widen it.
- **Answer** — `ChatTopic.accepted_message_id`. Set by the person who asked or a
  workspace admin. The public page badges it, hoists it under the question, and
  emits `QAPage`/`acceptedAnswer` structured data.
- **Participant** — a `Developer` who signed in to post. If they are not already
  a member of the host workspace they are joined with the lowest `community`
  role, `is_billable = False`, so they get a stable identity and display
  preferences without ever gaining internal access.

## The visibility contract

`services/chat_visibility.py` is the single source of truth, in prose and in
code. Every path that decides what is public goes through it, or through the SQL
predicates built from the same rules in
`services/public_community_service.py`:

- only regular, non-archived channels — never DMs;
- only topics that are web-public (explicitly, or by inheriting a web-public
  channel), never `private` or `restricted`;
- only messages that are not soft-deleted, not moderator-hidden, and at or after
  the channel's history cutoff.

The predicates live in SQL rather than in Python filtering so that forgetting to
filter in a new endpoint cannot leak anything. `_message_public_pred()` in
particular carries the cutoff, which is why search, the RSS feed and the profile
counts all respect it and not just the thread view.

Two identity rules matter as much as the row-level ones:

- **Public names** go through `CommunityService.public_name_for`, honouring each
  member's `ChatPublicMemberPref` (`name` / `alias` / `anonymous`) with the
  workspace default as the fallback.
- **Author handles** are derived, not stored: `sha256(workspace_id + ":" +
  developer_id)[:12]`. Salting with the workspace means one forum's handle
  cannot be used to find the same person in another. A member whose display mode
  is `anonymous` gets **no handle and no profile page** — the absence is the
  privacy, because a profile link is exactly how anonymity comes undone.

## Public API

`api/public_community.py`, mounted at `/api/v1/public/community`, no auth
required for reads. The `CommunityIsolationMiddleware` lets community-only
accounts reach `/api/v1/public/*` and almost nothing else, which is why the
authenticated write endpoints live on this router too.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Directory — `enabled AND listed` only |
| GET | `/{slug}` | Community + its public channels |
| GET | `/{slug}/channels/{channel}` | Paged topics |
| GET | `/{slug}/channels/{channel}/topics/{param}` | Paged messages |
| GET | `/{slug}/search?q=` | Threads matching a title or body |
| GET | `/{slug}/members/{handle}` | Public profile, 404 for anonymous members |
| GET | `/{slug}/feed` | Newest threads, for the RSS route |
| GET | `/{slug}/sitemap` | Machine-readable list of public paths |
| GET | `/{slug}/me` | *auth* — member context + internal threads |
| POST | `/{slug}/channels/{channel}/topics` | *auth* — open a thread |
| POST | `…/topics/{param}/replies` | *auth* — reply |
| POST | `…/messages/{id}/reactions` | *auth* — toggle one reaction |
| GET | `…/topics/{param}/my-reactions` | *auth* — the caller's own reactions |
| PUT | `…/topics/{param}/accepted-answer` | *auth* — author or admin |

Search matches with `ILIKE`, not `to_tsvector`. The test suite runs on SQLite
in-memory, and a query the tests cannot execute is a query nobody checks;
Postgres still gets an index scan via the trigram GIN indexes in
`migrate_2026_08_25_community_launch.sql`.

`my-reactions` is separate from the thread payload on purpose. The thread
response is cached and served to every anonymous reader, so it cannot carry
per-viewer state — the counts are shared, "did *I* react" is fetched after
hydration.

## Participation

`services/community_participation_service.py`. Three switches, each off by
default and each meaning something different:

- `allow_participation` — may outsiders post at all;
- `allow_new_topics` — may they *start* a thread, not merely answer in one.
  Answering in a thread you opened and opening one yourself are different
  amounts of trust;
- `post_moderation` — `post` (live immediately) or `pre` (held for approval).

Pre-moderation holds the **whole thread**, not just its first message: a held
topic is created `private` and flipped to `web_public` on approval. Holding only
the message would still publish the thread's title, which is the part a spammer
actually wants published. Approving the opener publishes the thread; rejecting it
deletes the thread — unless other live messages have since arrived, in which case
only the post goes.

Posting is rate-limited per developer per community through Redis, with a tighter
budget for new threads than for replies. Search gets its own budget keyed on the
caller's IP — it is the only anonymous endpoint that runs a query rather than
serving a cached page, and there is no identity to key on, which is also why that
budget is loose (an office behind one NAT is many readers sharing an address).
All of them **fail open** if Redis is unreachable: a public forum should not
hard-fail because the cache is down, and abuse is still bounded by moderation.

Reactions are an allow-list (`PUBLIC_REACTIONS`), not free text — the value is
rendered on a page anyone can read.

New posts notify the host team (`COMMUNITY_TOPIC`, `COMMUNITY_REPLY`,
`COMMUNITY_PENDING_REVIEW`, their own notification category). Recipients are the
channel's members, falling back to workspace admins. Without this the forum is a
room nobody is listening in.

## Starter templates

`services/community_templates.py` is a catalogue of shapes — product support,
open-source project, customer community, public knowledge base — each with
channels, seed threads, and participation defaults. No template contains
company-identifying data; the community's own name comes from the workspace.

`CommunityService.apply_template` creates the channels web-public and seeds their
threads, and is **idempotent by channel slug**: a channel that already exists is
left exactly as it is and reported as skipped, so a second click cannot produce
`help` and `help-a1b2c3`. Applying a template never publishes anything by itself
— `enabled` stays under the operator's finger unless they pass `publish`.

A template's participation settings are *defaults*, written only when the
community row does not exist yet. Re-applying one to add a channel must not
re-open replies on a forum whose owner deliberately closed them, so the result
carries `settings_applied` and the UI says which happened.

## Linking to other modules

`services/community_publishing_service.py`. Both links are per-workspace,
default **off** (`link_service_desk`, `link_docs`), because publishing moves text
somebody *else* wrote onto a page anyone can read.

- **Service Desk → community.** A ticket gains a "Publish as community answer"
  action. It opens a composer pre-filled with the ticket's subject and the desk's
  own last outgoing reply, and a person edits it before anything is posted. The
  service deliberately does not read a ticket's messages and publish them: a
  customer's email contains the customer, and no redaction heuristic is
  trustworthy enough to run that unattended. The resulting thread is recorded on
  the ticket (`field_values["community_topic"]`) so nobody writes the same answer
  twice.
- **Docs → community.** A published document gains "Discuss this page", opening
  one thread per document (`documents.community_topic_id`, idempotent). The
  thread's opening post is an intro somebody wrote, not a copy of the document —
  a document is edited after it is published, and a stale copy on a public page
  is worse than no copy.

A community that is switched off still accepts published threads; they simply are
not served yet. "Publish the answers, go live on Monday" is an ordinary way to
launch, so the API reports `live: false` rather than refusing.

## Public pages

`frontend/src/app/community/**`, outside the `(app)` auth group.

| Route | What it is |
| --- | --- |
| `/community` | Directory of listed communities |
| `/community/{slug}` | Channels, plus the member panel for signed-in members |
| `/community/{slug}/{channel}` | Threads, paged |
| `/community/{slug}/{channel}/{slug}-{shortId}` | One thread |
| `/community/{slug}/search?q=` | Search results (`noindex`) |
| `/community/{slug}/members/{handle}` | Public profile (`noindex, follow`) |
| `/community/{slug}/sitemap.xml` | Per-community sitemap |
| `/community/{slug}/rss.xml` | Feed; `?channel=` narrows it |

They are ISR (`revalidate = 300`) with tags, and a post also invalidates its
thread's tag through the `revalidateCommunityTopic` server action — so a reply
does not wait out the clock. That action validates the caller's token against the
backend first, because a server action is a public endpoint and "invalidate any
page in any community" should not be free.

The pages are built on the marketing brand's palette and typefaces
(`ledger-paper` / `ink` / `green`, `font-display`) rather than generic greys, so
following a link from the product to its forum does not feel like landing on a
different company's site — while the header still carries the *tenant's* logo,
title and accent, since most of these forums belong to somebody else. A theme's
accent is validated to a hex literal before it reaches a `style` attribute.

Paging is real `<a href>` with `?page=`, `rel="prev"/"next"` and a page-aware
canonical, so a crawler can reach thread 51. `parsePage` caps the value: `?page=1e9`
should not ask the database to count to a billion.

## Settings and moderation

`/settings/community` (`api/chat.py`, the `/community/*` endpoints under the
workspace chat router). Admin-only for anything that changes what is public.

A workspace with no community is shown the **template picker first** — an empty
forum with a perfect settings page is not a forum. Below it: the master switch,
branding, `noindex` and `listed`, the three participation switches, the
connections block, the moderation queue, and each member's own public-display
preference.

## Identity of a forum visitor

`/auth/{provider}/login?context=community&community={slug}` marks a *brand-new*
account as `account_type = "community"`. Those accounts are walled off from the
internal product by `middleware/community_isolation.py` (they may reach
`/auth/*`, `/public/*` and `/developers/me`, and nothing else), are non-billable,
and are returned to the forum rather than to `/dashboard`. They are upgraded to
`internal` only if somebody later invites them to a workspace.

The forum's sign-in links carry those markers, and `/login` forwards them to the
provider start URL. Without that forwarding — which is how it shipped
originally — every visitor who signed in to ask one question received a full
internal account instead.

## Seeding and testing

```bash
# Lay out a community, publish it, and print the e2e environment
docker exec aexy-backend python scripts/seed_community_demo.py --participation

# Backend
cd backend && pytest tests/unit -k community

# Frontend
cd frontend && npm run test

# Browser end-to-end (env-gated; the seed script prints these)
COMMUNITY_SLUG=… COMMUNITY_CHANNEL_SLUG=… COMMUNITY_TOPIC_PARAM=… \
  COMMUNITY_POSTER_TOKEN=$(docker exec aexy-backend python scripts/generate_test_token.py --first | tail -1) \
  npx playwright test e2e/community.spec.ts
```

## Gotchas

- `ChatTopic.accepted_message_id` and `last_message_id` carry **no** foreign key.
  Topics and messages already point at each other, and a real constraint in this
  direction closes a cycle that SQLAlchemy resolves with a post-hoc
  `ALTER TABLE` — which SQLite, the test backend, cannot execute. Both ids are
  validated against the topic in the service instead.
- `/community/{slug}/search` and `/members` are static segments and therefore win
  over `[channelSlug]`, so a channel slugged exactly `search` or `members` would
  be reachable internally and 404 publicly. `RESERVED_CHANNEL_SLUGS` in
  `services/chat_service.py` gives such a slug the same random suffix a duplicate
  gets, and `migrate_2026_08_25_community_reserved_slugs.sql` repairs any row
  that predates the rule. Keep that set in step with the directories under
  `frontend/src/app/community/[communitySlug]/`.
- The rate limiter fails open. That is deliberate (see above), but it means load
  tests against a Redis-less environment will not see limits.
- A channel with zero web-public topics 404s rather than rendering an empty page:
  a channel with nothing public in it is not itself public.
