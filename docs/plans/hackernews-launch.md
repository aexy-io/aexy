# Hacker News launch plan

**Target:** Show HN, Tuesday 8 September 2026, 08:00 ET (17:30 IST).
**Fallback:** Wednesday 9 September, same slot. Never Friday–Sunday.
**Go/no-go gate:** Friday 4 September. Every P0 below closed, or the date slips a week.

---

## 0. Closed since the audit

Items 1–5 and 7 below are done. What changed:

- **Licence**: `README.md` no longer says "Proprietary. All rights reserved." It states AGPL-3.0 for the code, explains what the commercial licence is actually for, and says plainly that nothing is withheld from the AGPL build.
- **Demo login**: `AEXY_DEMO_LOGIN` (off by default, on in `docker-compose.yml`) plus `POST /auth/demo/login`, a **Self-hosted demo** panel on the sign-in page, and `scripts/seed_demo_workspace.py`. A fresh clone is now `docker compose up -d`, one seed command, and you are inside a populated workspace with no OAuth app registered. Verified from a virgin database.
- **Email and AI are visible but inert in the demo.** Every module stays on screen — a demo that hides its two most interesting features has no point, and hiding protects nothing anyway. What actually refuses: the workspace **AI kill switch** (`WorkspaceAISettings.ai_enabled=False`), which the LLM gateway honours on every path including Temporal activities; **outbound email refused at both send paths** (`EmailService._send_email` and `ProviderService.send_via_provider`) while demo login is on, with `AEXY_DEMO_ALLOW_OUTBOUND_EMAIL` as the escape hatch for a Mailpit-backed box; and the **seeded automations left inactive** — one ran an agent on every lead created, so an enabled copy was a way to spend the operator's budget by filling in a form. A visitor can open an agent, read its tools and policy gates, build a campaign, and gets a plain "disabled for this workspace" only when they press the button.
  Two things hold the kill switch off rather than one: provisioning re-asserts it on every sign-in, *and* `WorkspaceAISettingsService.update` refuses a request to enable it for the demo workspace. The account is shared, so "reverted at the next sign-in" would still leave every session in between spending. (On a free-plan install the existing plan gate refuses first with a 402; the new guard is what catches a hosted demo on Pro or Enterprise.)
- **README**: rewritten as a landing page — what it is, how to run it, what's in it, how it's built. Billing internals and platform-admin endpoints moved to `docs/billing.md`. Next 14/React 18 corrected to Next 16/React 19.
- **Getting started**: `docs/guides/getting-started.md` leads with the two-command Docker path. Real clone URL, env names that match `core/config.py`, the OAuth callback path corrected to `/api/v1`, GitHub App demoted to optional.
- **CTA**: the homepage hero's second button is now **Self-host it** → the getting-started guide. "Book demo" stays on the closing block, where a buyer will look.
- **Repo hygiene**: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` added.

Still open: item 6 (the positioning answer — which modules you'd defend), plus the GitHub repo metadata, the capacity check, `demo.aexy.io`, merging the rebrand, and the Stripe/trial-CTA honesty fix.

Three real bugs surfaced while building the demo login, all of which would have shipped:

1. `AEXY_DEMO_EMAIL=demo@aexy.local` signed in fine and then 500'd the first call the app makes — `DeveloperResponse.email` is an `EmailStr` and pydantic rejects reserved TLDs. Default is now `demo@example.com`, with a test that the shipped default survives validation.
2. The demo workspace was assembled from hand-built rows and so had no default task statuses, no document space and no billable owner member. It now goes through `WorkspaceService.create_workspace`.
3. The demo account landed on the `developer` sidebar persona — no CRM, no GTM, no Service Desk — because persona falls back to `"developer"` for anyone with no department, even an owner the access resolver calls an admin. Provisioning now sets `sidebar_persona="admin"`. The sidebar went from 20 items to 28.

Two things worth knowing that are not bugs in this work:

- **Nothing in the product creates the standard CRM objects for a new workspace.** They arrive only when someone opens the CRM and it calls `POST /workspaces/{id}/crm/objects/seed-standard`. That is why `seed_marketing_demo.py`'s entire CRM section had been silently skipping itself — it requires company/person/deal/lead to exist. The demo seeder now calls the same service first. Whether a *real* new workspace should get them automatically is a product decision left alone here.
- **`useSetToken` does a soft `router.push`.** Every OAuth provider returns through a full page load, so demo login was the first sign-in to happen inside a live React tree, and it carried the previous session's query cache and workspace store into the new one. The demo path now navigates hard. Any future in-page sign-in will hit the same thing.

---

## 1. Where we actually stand (audited 23 August 2026)

### What is ready

| Surface | State |
|---|---|
| `aexy.io` | Live. Serving the **pre-rebrand** homepage ("AI company OS — now in ChatGPT and Claude") |
| `aexy.io/pricing` | Live. Free (self-host, $0) / Team ($29/user/mo) / Enterprise (custom) |
| `aexy.io/handbook` | Live. 53 pages, generated from the repo — architecture, deployment, per-module refs |
| `github.com/aexy-io/aexy` | **Public**, AGPL-3.0, 1,240 commits, 2 stars, 3 forks |
| Product depth | ~700k LOC, 98 apps in the registry, ~100 routers, 74 models, ~160 services |
| MCP server | Shipped, with OAuth consent + per-connector revocation |
| New marketing site | Built on `marketing/open-ledger-rebrand` — "Replace the stack. Keep the context.", 81 files vs `main`. **Unmerged, undeployed** |

### What will get us shredded

1. **The README says the project is proprietary.** `README.md` ends with "Proprietary. All rights reserved." while `LICENSE.md` is AGPL-3.0, GitHub's sidebar says AGPL-3.0, and the homepage badges say "AGPL-3.0 LICENSED / open source". A licence contradiction on the front page of the repo is the single highest-probability top comment, and it is the one that poisons the whole thread — "open source" claims get audited hard on HN. It is also a five-minute fix.

2. **A stranger who self-hosts cannot log in.** Auth is OAuth-only — `/auth/github/login`, `/auth/google/login`, `/auth/microsoft/login`. There is no email+password path, no `create_admin` script, no dev-login flag, no demo mode. So the homepage's own promise — `git clone … && docker-compose up -d` — lands the reader on a sign-in screen that requires them to first go register a GitHub App. HN judges a self-hostable product almost entirely on whether it comes up and lets you in. This is the launch.

3. **The getting-started guide does not work as written.** `docs/guides/getting-started.md` says `git clone https://github.com/your-org/aexy.git` (placeholder), and its env vars don't match the code: `JWT_SECRET_KEY` (code reads `SECRET_KEY`), `NEXT_PUBLIC_API_URL=http://localhost:8000/api` (needs `/api/v1`). Anyone following it hits an auth failure and a broken API client.

4. **The README is written for us, not for a visitor.** It opens with the tech-stack table, then spends its middle on billing models, `WorkspacePlanOverride`, platform-admin invoice endpoints and bank-transfer flows, then E2E test commands. It also claims Next.js 14 / React 18 when the repo is on Next 16 / React 19. Nothing in it answers "what is this, why would I run it, what does it look like."

5. **No demo, and "Book demo" is the secondary CTA.** There is no `/demo` link anywhere in the header. On HN, "Book demo" reads as enterprise-sales friction; a large share of the traffic will not sign in with Google to evaluate anything.

6. **98 modules is a liability as much as an asset.** "CRM + sprints + HR + email marketing + GTM + booking + uptime + on-call" invites the obvious response: forty half-products, none as good as the tool it replaces. We need to pre-empt this in the post itself rather than defend it in the comments.

7. **Repo hygiene is missing.** No repo topics, no `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md`, no homepage URL set, 0 open issues, Discussions off. Zero issues on a 1,240-commit repo reads as "nobody uses this."

---

## 2. Workstreams

### P0 — blocks the post (must be done by 4 September)

**A. Make the licence story unambiguous.** *~1 hour*
- Rewrite `README.md`'s licence section: AGPL-3.0 for the code, `COMMERCIAL_LICENSE.md` available for hosting/proprietary combination, link both. Say plainly what the commercial licence is for (offering Aexy as a managed service, shipping it inside closed software) so it doesn't read as a bait-and-switch.
- Add a one-paragraph "Why AGPL + commercial" note. HN respects an honest open-core statement and punishes a vague one.
- Grep for every other place that claims a licence (`aexy-mac/README.md`, docs, site badges) and make them agree.

**B. First-run login without an OAuth app.** *~1–2 days — the real work*
- Add a local-account path good enough to evaluate the product: either
  (i) an email+password sign-in enabled by an env flag (`AEXY_ALLOW_LOCAL_LOGIN=true`, default on in `docker-compose.yml`, default off in `docker-compose.prod.yml`), or
  (ii) a `scripts/create_admin.py` that mints the first developer + workspace and prints a sign-in link.
- (i) is better for the launch — a reader should not have to run a second command. Whichever we pick, `docker compose up` must end at a usable workspace.
- Seed the fresh workspace with demo data via the existing `backend/scripts/seed_marketing_demo.py` behind `AEXY_SEED_DEMO=true`, so the first screen isn't empty. An empty 98-module app looks worse than a small one.
- **Verify on a clean machine**: fresh clone, no `.env`, `docker compose up -d`, browser, logged in, data visible. Time it. If it is over ten minutes, keep cutting.

**C. Rewrite `README.md` as the landing page it is.** *~3 hours*
Order: one-sentence what-it-is → a screenshot or two (we already capture these via `frontend/e2e/tools/capture-marketing-shots.ts`) → `docker compose up` quick start → what's genuinely solid vs. what's early → licence → architecture → contributing. Move billing internals, platform-admin endpoints and E2E invocations into `docs/`. Fix the Next.js/React versions.

**D. Fix `docs/guides/getting-started.md`.** *~1 hour*
Real clone URL, env names that match `core/config.py` and `frontend/.env.example`, the new no-OAuth login path first and the GitHub App as an optional step for repo analytics.

**E. A public demo, or an honest absence of one.** *~1 day if we do it*
- Best: `demo.aexy.io`, seeded from `seed_marketing_demo.py`, one shared read-mostly workspace, nightly reset, no signup, rate-limited, no outbound email, no real integration credentials. Link it as the *primary* CTA in the HN post.
- If we can't stand one up safely in time, drop "Book demo" from the post entirely and lead with the self-host one-liner. Do **not** make an HN audience book a call.

**F. Ship the rebrand.** *~1 day including review*
Merge `marketing/open-ledger-rebrand` → `main` and deploy, at least 48 hours before the post so we're not debugging CSS during the thread. The new homepage is materially better than what's live and it is what the post will point at. If the merge looks risky on 4 September, launch against the current site rather than deploying the night before.

**G. Capacity.** *~half a day*
An HN front-page day is ~10–50k uniques over 12 hours, spiky. Check the frontend and backend containers survive it, put the marketing pages behind a CDN cache, confirm the DB connection pool and Postgres won't fall over, and have a "known-good" rollback tag. A hugged-to-death launch is unrecoverable.

### P1 — strongly wanted (by 4 September)

- **Repo hygiene:** description + homepage URL + topics (`open-source`, `crm`, `project-management`, `self-hosted`, `mcp`, `fastapi`, `nextjs`, `agpl`); `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`; enable Discussions; open 8–12 real issues including 3–4 labelled `good first issue`. Issues are the signal that the project is alive.
- **A `/self-hosting` page** on the site — resource requirements (the deploy guide says 4GB RAM), what needs API keys and what does not, what the free self-hosted build includes vs. cloud. Say explicitly that self-host is not crippled; the split is hosting, not features.
- **Screenshots in the README and the post.** HN scrolls; a wall of text with no picture underperforms badly for a product this visual.
- **A written answer to "isn't this 40 half-products?"** — one honest paragraph naming the three modules we'd stake our reputation on and the ones that are early. Put it in the post, not just in your pocket.
- **Stripe:** `NEXT_PUBLIC_STRIPE_ENABLED=false` today, so paid CTAs open a `mailto:`. Either turn on real self-serve checkout or make the Team tier's CTA honest ("Talk to us" rather than "Start 14-Day Free Trial"). A trial button that opens an email client is the kind of small dishonesty HN notices.

### P2 — nice to have

- `llms.txt` is already there; add a `SHOW-HN.md`-style architecture write-up worth reading on its own — the Temporal-instead-of-Celery decision, the 98-module access model, why AGPL. Technical write-ups outlive the thread.
- A short (60–90s) unnarrated screen recording of the MCP flow: ask Claude to move a ticket, watch the board change. That demo is the most novel thing we have.
- Changelog RSS + a "what shipped this month" page — the changelog is unusually good and it proves velocity.

---

## 3. The post

**Angle.** Lead with the concrete and unusual, not the category. "AI company OS" is a phrase HN discounts on sight. The three things that actually earn attention: it is genuinely one system rather than a suite of separate apps, it is AGPL and self-hostable with your data in your Postgres, and ChatGPT/Claude can *act* in it over MCP rather than just read it.

**Title candidates** (80 chars max, no ALL CAPS, no exclamation):
1. `Show HN: Aexy – open-source company OS (CRM, sprints, docs) with an MCP server`
2. `Show HN: Self-hostable alternative to Jira + HubSpot + Notion, AGPL-3.0`
3. `Show HN: I built a company OS so my AI assistant could act on all of it`

Prefer (1): it names the thing, the licence-adjacent hook, and the novel part. (2) picks three fights at once — it will get traffic and a hostile thread. (3) is the most human and the most likely to be dismissed as AI slop framing.

**Body draft** (first comment, posted by you immediately after submitting — HN convention, keep it under ~250 words):

> Aexy is one system where CRM, sprints, tickets, docs, workflows, people ops and AI agents share the same database, instead of six SaaS tools that each know a fifth of the story. It's AGPL-3.0 and self-hostable: `git clone && docker compose up -d` gets you the whole thing on one box, with your data in your own Postgres.
>
> I built it because every tool we bought was a silo. The CRM didn't know what engineering shipped for that customer. The tracker didn't know which deal was waiting on it. Every integration was a copy of a copy.
>
> The part I'd most like feedback on: Aexy ships an MCP server, so ChatGPT, Claude Desktop, Claude Code or Cursor can *do things* in your workspace — move a ticket and assign it, create a deal, query analytics — against real company context, through policy gates with an audit trail. That felt like the actual point of MCP and I haven't seen much of it built against a whole company's data.
>
> Honest scope: it's ~700k lines across ~40 modules and they are not all equally mature. [three strongest] are what we run our own company on. [the early ones] are thinner than the tool they'd replace. Cloud is $29/user/month; self-host is the same software, free, not a crippled edition. Commercial licence exists for people who want to host it for others.
>
> Repo: github.com/aexy-io/aexy · Docs: aexy.io/handbook · Demo: demo.aexy.io

Fill the bracketed module names in honestly before posting. Naming your own weak spots is the cheapest credibility available on HN, and the comments will find them anyway.

---

## 4. Launch day

**Timing.** 08:00 ET Tuesday is 17:30 IST. The thread's decisive window is the first 2–3 hours, and comments keep coming for ~12 — so 17:30 IST to roughly 02:00 IST. Block the evening and the night. Sleep beforehand, not during.

**Rules.**
- Do not ask anyone to upvote. Voting rings get flagged and de-ranked, and it is the one unrecoverable mistake.
- Post the submission, then immediately post the body as the first comment.
- Answer every substantive comment within 15 minutes for the first three hours. Speed and directness move a Show HN more than anything else you can control.
- When someone finds a real flaw, agree, say what you'll do, and where possible fix it during the thread and reply with the commit. That is the single most effective HN move there is.
- Never argue about whether the product should exist. Answer factual criticism with facts; let the rest go.
- If it gets flagged or buried, email hn@ycombinator.com once, politely, and move on.

**Watch during the thread.** Error rates and p95 on the API, signup completions, `docker compose up` failure reports (the most valuable feedback you will get all day), Postgres connections, GitHub traffic/clones.

**Pre-written answers to have ready:**
- *"AGPL but there's a commercial licence — so it's not really open source?"* — AGPL is OSI-approved; the commercial licence only exists so companies that want to host it for third parties or ship it inside closed software can. Nothing is held back from the AGPL build.
- *"This does everything, so it does nothing well."* — name the three modules you'd defend and the ones you wouldn't. Do not deflect.
- *"Who is this for?"* — 10–100 person software companies already paying for Jira + a CRM + Notion and reconciling them by hand.
- *"Why should I trust a solo/small team with my company's system of record?"* — self-host, AGPL, full export. The answer is that you don't have to trust us.
- *"Another AI wrapper."* — the OS is the product; the agents are governed access on top of it. Point at the policy gates and audit log.
- *"How is this different from ERPNext / Odoo / Twenty / Plane?"* — have a real, non-dismissive answer for each. Someone will ask.

---

## 5. After

- **Day +1:** ship the fixes surfaced in the thread and reply in-thread with the commits. Post a short "what HN found" changelog entry.
- **Day +2 to +7:** triage every issue opened. Reply to all of them, even the bad ones.
- **Week +2:** write up the launch honestly — traffic, signups, self-host attempts, what broke. That post is often worth more than the launch.
- **Do not relaunch soon.** One Show HN per product per major milestone; the next one is a specific capability ("Show HN: our MCP server, six months in"), not the same product again.

## 6. Success

Front page for a few hours and a thread where the top comments are about the product rather than the licence file. Concretely: 500+ GitHub stars, 100+ self-host attempts with reports back, and a handful of "I actually ran this and here's what broke" comments. Signups are the least interesting number on the list.
