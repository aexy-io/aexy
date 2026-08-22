# Missing pages — app, handbook and marketing

Status: **done** — every section below has been actioned. Kept as the record of
what was found and what was decided, and because the guards named throughout are
what stop it happening again.
Companion to: the post-login UX programme (Open Ledger in the product)

Internal. `frontend/scripts/generate-docs.mjs` holds back `plans/**`, and
`frontend/src/test/docsCoverage.test.ts` fails if that stops being true.

Every number below was measured against the working tree by resolving declared
routes to `page.tsx` files and by grepping every link in `src/`. Nothing here is
an estimate.

---

## 1. Declared but not built — four dead destinations

Routes the product advertises and does not have. These are worse than a missing
feature: the app offers the user a door.

| Route | Declared in | What is actually there |
|---|---|---|
| `/oncall` | `APP_CATALOG.oncall`, enabled in 2 of the shipped bundles, gated by `can_view_oncall` | Nothing. The only on-call UI in the product is `/settings/projects/[id]/oncall` — a *configuration* page for a feature with no destination. |
| `/community` | `APP_CATALOG.community`, **and two sidebar layouts** (`sidebarLayouts.ts:257,434`) | A page exists at `src/app/community/` but it is **outside the `(app)` group**. Clicking "Community" in the sidebar throws the user out of the app shell into the marketing layout — no sidebar, no topbar, no way back except the browser. |
| `/email-marketing/settings` | `APP_CATALOG.email_marketing.modules` | 404. Email settings live under `/settings/email-delivery`. |
| `/insights/developers` | `APP_CATALOG.insights.modules` (`developer_drilldown`) | 404. |

**Decide, then act — three of these are deletions, not builds.**

- **`/oncall`** — either build the incident-rotation page the settings page
  configures, or drop the app from `APP_CATALOG` and fold on-call under Uptime,
  which already owns incidents. Building it is the larger honest option;
  deleting it is a 20-line change. Do not leave it declared.
- **`/community`** — the fastest correct fix is an `(app)/community` route that
  renders the same community surface inside the shell, with the public route
  kept for logged-out visitors. One page, reusing the existing components.
- **`/email-marketing/settings`** and **`/insights/developers`** — retarget the
  module `route` to the page that exists. Both are one-line edits.

Note for whoever does this: `APP_CATALOG` is mirrored in
`backend/src/aexy/models/app_definitions.py` and checked by a generated
fixture. Any change here needs `python scripts/dump_app_catalog.py` re-run, or
`test_app_catalog_fixture.py` and `appCatalogParity.test.ts` both fail.

---

## 2. Built but unreachable — 14 orphan pages

Pages that compile and ship, that no nav config exposes, and that **nothing in
the entire source tree links to**. Verified by grepping every string literal in
`src/` for each path.

| Pages | Route |
|---|---|
| 5 | `/reminders/all`, `/reminders/calendar`, `/reminders/compliance`, `/reminders/import`, `/reminders/my-reminders` |
| 4 | `/gtm/content-gap`, `/gtm/expansion`, `/gtm/handoffs`, `/gtm/seo` |
| 2 | `/learning/analytics`, `/learning/integrations` |
| 1 | `/docs/knowledge-graph` |
| 1 | `/crm/agents/new`, `/crm/automations/new` |

(`/booking/calendars/callback` is also unlinked and is *supposed* to be — it is
an OAuth redirect target.)

The `reminders/*` five are the clearest case: an entire seven-page module with
no sidebar entry, duplicated by `compliance/reminders/*`, which *is* navigable.
One of those two trees should go.

`/gtm/seo`, `/gtm/content-gap`, `/gtm/expansion` and `/gtm/handoffs` are four
built features nobody can find. GTM has 22 pages and the sidebar shows 8.

**Each one is a two-way decision — wire it into `sidebarLayouts.ts`, or delete
it.** What is not acceptable is the current state, where the code is
maintained, type-checked, built into every deployment, and unreachable.

---

## 3. Handbook — nine apps with no documentation

Recorded as data in `frontend/src/config/moduleHelp.ts`, enforced by
`docsCoverage.test.ts`: a new app cannot be added without either a handbook
slug or a written reason there is none.

| App | Why it matters |
|---|---|
| **Service Desk** | The largest module by settings surface — 10 of 39 settings pages — and undocumented. `tickets-and-projects.md` is about sprint tickets, a different system with a different model. |
| **Dashboard** | The first page every user sees. Nothing explains what a widget is or how to change one. |
| **Organization** | Teams, departments, directory, org chart. The nearest doc is `guides/authentication.md`, which is about RBAC internals. |
| **Reports** | `analytics.md` documents Insights. The custom report builder is a separate app with a separate model. |
| **Drive** | `documents-and-drive.md` covers Docs and the AI metadata pipeline. The file browser — uploads, folders, sharing, quotas — is not described. |
| On-Call, Community | Blocked on §1: no page, so nothing to document yet. |

### The bigger documentation problem

**All 24 existing module documents are written for people building Aexy, not
people using it.** `docs/crm.md` opens by explaining that records are "stored as
JSONB against per-attribute schemas" and then lists router files with line
numbers. Across the module docs the average is 14 code fences and 12 API paths
each.

This matters because the post-login plan's Phase D2 was going to make empty
states link into the handbook as the answer to "no training required". They
cannot. Sending a first-time user from an empty CRM to a page about JSONB
storage is worse than sending them nowhere — it tells them the product is not
for them.

So the handbook is a **developer reference and should stay one**. The topbar
help menu linking `/handbook` is correct and honest. What is missing is a
second, separate corpus:

**Proposed `/guide/*` — task-shaped, user-facing, one page per job.** Not one
per module: "Run your first sprint", "Import your contacts", "Set up a shared
inbox", "Publish a booking page". Each ~400 words, screenshot-led, ending in
the thing the user was trying to do. These are what empty states and
`PageHeader`'s `?` link to. Start with the eight highest-traffic jobs; the
`moduleHelp` registry already has the shape to hold a second slug.

---

## 4. Marketing — thirteen apps with no product page

`/products/*` has 16 pages. `APP_CATALOG` has 28 apps. The site sells a little
over half the product.

**Missing, ordered by how much of the product they represent:**

| Missing page | Note |
|---|---|
| `/products/service-desk` | The single largest omission. Shared inbox, SLAs, escalation, stakeholders, intake forms — and `/compare/servicenow` and `/compare/hubspot` both already exist, which is the comparison page for a product page that does not. |
| `/products/automations` | Workflow builder + agent policies. `/products/ai-agents` exists and links to a capability with no page of its own. |
| `/products/analytics` | Insights, snapshots, custom reports, predictions. |
| `/products/tables` | The Airtable-shaped surface. `/compare/notion` and `/compare/attio` both point at it. |
| `/products/compliance` | Mandatory training, certifications, audit. The only genuinely regulated-industry story the product has. |
| `/products/leave` | Time off, policies, approvals, balances. |
| `/products/organization` | Teams, departments, directory, org chart. |
| `/products/drive` | Files, sharing, the AI metadata pipeline. |
| `/products/chat`, `/products/oncall`, `/products/community`, `/products/dashboard`, `/products/reports` | Lower priority; `oncall` and `community` are blocked on §1. |

Three comparison pages currently argue against competitors on ground the site
does not describe. That is the strongest argument for doing Service Desk,
Tables and Automations first.

Anything added here needs four files in step — the route, `productSlugs` in
`sitemap.ts`, `productLinks` in `LandingHeader`, and the `LandingFooter` link.
`marketingRouteParity.test.ts` already enforces all four, so a half-wired page
fails CI rather than shipping uncrawled.

---

## What was done

| Section | Outcome |
|---|---|
| §1 Dead destinations | `/oncall` built (the API and components already existed, only the page was missing). `/insights/developers` given an index. `/email-marketing/settings` redirects to the page it meant. `/community` marked `external: true` in the sidebar — it is a public route and cannot have an in-app twin, so it now opens in a new tab instead of silently replacing the app. |
| §2 Orphans | Re-measured with redirect stubs excluded: 7 real orphans, not 14. All 7 wired into the sidebar — four GTM pages, two Learning pages, the Knowledge Graph. The duplicated `/reminders` tree was collapsed onto `/compliance/reminders`, with redirects left behind. |
| §3 Handbook | Six docs written — Service Desk, Dashboard, Organization, Reports, Drive, On-Call. One gap left (`community`), with a stated reason. |
| §4 Marketing | 13 product pages written on a new shared `ProductPageTemplate`, plus the `/products` index that never existed. |

Two things found while doing it that were not in the original survey:

- **`routeLabels.ts` had a dead loop.** The `startsWith(baseRoute)` guard added
  to fix the `/settings` breadcrumb collision is false for every module route —
  all 55 are relative — so the entire module-label loop never executed. It
  failed silently because `titleCase()` produces a plausible label for anything.
- **Three nav labels contradicted their catalog names**: `/dashboard` was
  "Home", `/sprints` was "Planning", `/automations` was "Workflows". Abbreviating
  in a nav rail is fine; renaming means learning two names for one destination.

### The guards

Every finding above is now a test, each mutation-verified:

| Test | Catches |
|---|---|
| `declaredRoutes.test.ts` | A catalog route, module route or gate-map entry with no page; a page nothing links to |
| `appMetadata.test.ts` | A redirect pointing at a route that does not exist |
| `routeLabels.test.ts` | Module labels resolving to the wrong place; a rail name contradicting its catalog name |
| `docsCoverage.test.ts` | An internal plan document reaching the public handbook; an app with neither a doc nor a stated reason |
| `marketingRouteParity.test.ts` | A product page linked from neither the footer nor the index |
| `canonicalCoverage.test.ts` | A helper-built page carrying the wrong slug, and so self-canonicalising to another page |

## Original suggested order

1. **§1, the four dead destinations.** Two are one-line retargets, one is a
   deletion decision, one (`/community` inside the shell) is a single page.
   Smallest work, and it removes doors that open onto nothing.
2. **§2, the 14 orphans.** Mostly a wiring decision per page. Do `reminders/*`
   first — resolving the duplicate tree deletes seven pages or adds one nav
   section.
3. **§4 top three** — Service Desk, Automations, Tables. Externally visible,
   independent of the app work, and unblocks three comparison pages already
   live.
4. **§3's `/guide/*` corpus**, alongside Phase D of the UX programme. This is
   the one that actually answers "no training required", and it is the largest.
