# GTM Module — v2 Strategy

**Date:** 2026-02-26
**Branch:** `gtm`
**Previous:** [GTM Branch Review Tracker](./GTM_BRANCH_REVIEW_TRACKER.md) — 44/46 issues fixed

---

## Where We Are

The GTM module shipped as a single branch adding ~31k lines across 98 files. After the v1 review pass, the core pipeline works end-to-end:

```
Tracking pixel → BehavioralEvent → VisitorSession → Snitcher ID
  → Identity Resolution → Lead Scoring (time-decay + negative signals)
    → Routing Rules → Assignment + Slack Alert
```

Outreach runs independently:

```
Enrollment → Temporal Workflow → Compliance Gate → Email/LinkedIn/SMS
  → Reply Classification (LLM) → Auto-action (route/exit/unsubscribe)
```

**What's live and connected:** 25 models, 18 API route groups, 10 activity files, 22 frontend pages, 5 provider integrations (Snitcher, MillionVerifier, Apollo, PhantomBuster, Twilio).

**What's scaffolded but hollow:** 5 provider slots (intent_data, seo_tracking, ad_platform, analytics, data_warehouse), 2 LLM stubs (battle cards, content gap), ABM without intent aggregation, competitor intel without meaningful change filtering.

---

## Principles for v2

1. **Depth over breadth.** Stop adding surfaces. Make the 8 shipped sidebar items excellent.
2. **Close feedback loops.** Email opens/clicks should feed scoring. Routing outcomes should tune rules. Reply sentiment should adjust sequences.
3. **Measure before you optimize.** Ship analytics for what exists before building new features.
4. **Data quality gates.** Every enrichment step should validate and degrade gracefully, not silently pass nulls downstream.
5. **Earn the right to automate.** Features start as manual/approval-required, graduate to semi-auto, then fully autonomous.

---

## Architecture Assessment

### Strengths

| Area | Detail |
|---|---|
| **Temporal adoption** | Activities are well-structured with heartbeats, retry policies, and per-workspace isolation. The dispatch abstraction is clean. |
| **Compliance-first** | Consent management, suppression lists, GDPR erasure, and compliance gates are built into the pipeline — not bolted on. |
| **Provider abstraction** | `ProviderRegistry` + `GTMProviderConfig` per-workspace slots make it easy to swap Snitcher for Clearbit, Apollo for ZoomInfo, etc. |
| **LLM gateway** | Rate-limited, provider-agnostic gateway with graceful fallbacks. Reply classification and personalization both degrade cleanly. |

### Weaknesses

| Area | Detail | Impact |
|---|---|---|
| **No feedback loops** | Email open/click events don't update lead scores. Routing outcomes don't inform future routing. | Scoring and routing are static snapshots. |
| **CRM data gap in scoring** | `score_lead` only reads visitor/event data. CRM fields (title, revenue, industry) from the record itself are ignored. | Firmographic score is 0 for any lead that hasn't visited the site. |
| **5 empty provider slots** | UI lets users attempt to configure `intent_data`, `seo_tracking`, `ad_platform`, `analytics`, `data_warehouse` — but nothing happens. | User confusion. Dead configuration UI. |
| **Outreach workflow scheduling** | `execute_outreach_step` activity exists but the Temporal workflow that sequences steps with delays isn't visible in the GTM workflows directory. | Unclear if multi-step timing actually works. |
| **Auth hydration race** | Some GTM pages redirect to root on cold navigation due to Next.js `(app)` layout checking `isAuthenticated` before the token is hydrated. Affects `/gtm/routing`, `/gtm/sequences`, `/gtm/scoring`. | Pages only accessible via in-app navigation, not direct URL. |

---

## v2 Phases

### Phase 2A — "Close the Loops" (2-3 weeks)

Make existing features production-grade. No new surfaces.

#### 2A.1 — Scoring Feedback Loop

**Problem:** Lead scores are computed once and never updated. Email engagement, routing outcomes, and sequence progression don't flow back.

**Changes:**
- Add `update_score_from_event` activity that recalculates engagement subscore when email open/click/reply events arrive
- Wire `OutreachStepExecution` status changes (opened, clicked, replied, bounced) to `BehavioralEvent` creation — one new event type per status
- Add `last_engagement_at` to `LeadScore` for time-decay accuracy
- Pull CRM record fields (industry, employee_count, revenue) into firmographic scoring when record is matched — currently scoring only uses `VisitorIdentification.company_*` fields

**Files:**
- `temporal/activities/gtm/lead_scoring.py` — add `update_score_from_event`, enrich `score_lead` with CRM data
- `services/email_campaign_service.py` — emit behavioral events on open/click callbacks
- `temporal/activities/gtm/outreach.py` — emit behavioral events on reply classification result
- `models/gtm.py` — add `last_engagement_at` to `LeadScore`

#### 2A.2 — Fix Auth Hydration Race

**Problem:** Direct URL navigation to GTM pages fails intermittently. The `(app)` layout's `useEffect` calls `redirect("/")` before localStorage token is read.

**Changes:**
- Add loading state to auth check — show skeleton instead of redirecting during hydration
- Only redirect after `mounted && !isLoading && !isAuthenticated` is confirmed stable (debounce or use `useLayoutEffect`)

**Files:**
- `frontend/src/app/(app)/layout.tsx` — fix redirect timing
- `frontend/src/hooks/useAuth.ts` — ensure hydration-safe state

#### 2A.3 — Hide Unconfigured Provider Slots

**Problem:** 5 provider slots show in the UI but have no implementations.

**Changes:**
- Filter provider slots in the Providers page to only show slots that have at least one registered provider class in `ProviderRegistry`
- Add "Coming Soon" badge for slots that are defined in the enum but have no implementation
- Backend: add `GET /gtm/providers/available-slots` endpoint that returns slots with registered providers

**Files:**
- `frontend/src/app/(app)/gtm/providers/page.tsx`
- `backend/src/aexy/api/gtm/providers.py`
- `backend/src/aexy/integrations/providers/registry.py`

#### 2A.4 — Outreach Workflow Verification

**Problem:** Unclear if multi-step sequence timing (wait steps, send windows, timezone awareness) actually executes correctly via Temporal.

**Changes:**
- Audit `temporal/workflows/` for the outreach workflow definition — verify step scheduling with delays
- Add integration test: create 3-step sequence (email → wait 1 day → email), enroll a test contact, verify step execution timeline
- If workflow is missing, implement `OutreachSequenceWorkflow` that iterates steps, sleeps for wait durations, and dispatches `execute_outreach_step` per step

**Files:**
- `temporal/workflows/` — audit/create outreach workflow
- `tests/` — integration test for sequence execution

---

### Phase 2B — "Outreach Excellence" (3-4 weeks)

Make sequences the best-in-class feature. This is the revenue driver.

#### 2B.1 — A/B Testing

**Problem:** No ability to test subject lines, body variants, or send times.

**Design:**
- Add `variants` JSONB column to outreach step model (array of `{subject, body, weight}`)
- Enrollment randomly selects variant at execution time (weighted random)
- Track open/click/reply rates per variant
- After N sends, auto-promote winning variant (optional)

**Models:** `OutreachStepExecution.variant_index`
**UI:** Variant editor in sequence builder, per-variant metrics in analytics

#### 2B.2 — Smart Send Windows

**Problem:** Emails sent immediately when step fires, regardless of recipient timezone or optimal send time.

**Design:**
- Infer timezone from: (1) CRM record field, (2) company HQ location from enrichment, (3) IP geolocation from last visit
- Define per-sequence send window (e.g., Mon-Fri 8am-6pm recipient local time)
- If step fires outside window, Temporal timer sleeps until next window open
- Track deliverability/open rates by send hour to refine windows

**Models:** Add `send_window` JSONB to `OutreachSequence`, `recipient_timezone` to `OutreachEnrollment`

#### 2B.3 — Inbox Warmup & Rotation

**Problem:** `sending_pool_id` and inbox rotation exist but warmup volume ramping isn't enforced.

**Design:**
- Track daily send count per inbox in Redis
- Warmup schedule: Day 1-7: 20/day, Day 8-14: 50/day, Day 15-30: 100/day, Day 31+: full volume
- If inbox hits daily cap, rotate to next available inbox in pool
- Alert if all inboxes in pool are capped (pause enrollment, notify user)

**Services:** `routing_service.py` warmup enforcement, `email_campaign_service.py` inbox selection

#### 2B.4 — Reply Threading

**Problem:** Reply classification is one-shot. Multi-turn conversations aren't tracked.

**Design:**
- Add `thread_id` to `OutreachStepExecution` (In-Reply-To / References header matching)
- Group replies into threads per enrollment
- Show full conversation thread in enrollment detail view
- Auto-pause sequence if any reply in thread is "interested" or "question"

---

### Phase 2C — "Intelligence Layer" (4-6 weeks)

Turn scaffolded features into real capabilities.

#### 2C.1 — Competitor Intelligence (M13 fix)

**Current state:** Tracks competitor pages, detects HTML diffs, generates placeholder battle cards.
**Problem:** Fires on CSS/footer/copyright changes. No real LLM analysis.

**Changes:**
- Add content extraction before diffing — strip nav, footer, sidebar, scripts. Diff only `<main>` or `<article>` content
- Classify changes: `pricing`, `feature`, `positioning`, `hiring`, `cosmetic` using LLM
- Only alert on `pricing`, `feature`, `positioning` changes
- Wire `generate_battle_card` to actual LLM call with structured output
- Battle card sections: positioning diff, feature comparison, objection handling, win themes

**Effort:** 1-2 weeks. Mostly service logic + LLM prompt engineering.

#### 2C.2 — Intent Signals

**Current state:** Model + API + UI exist. `collect_intent_signals` activity is implemented but the `intent_data` provider slot has no registered provider.

**Options (pick one):**
1. **Bombora** — Company surge intent data. API integration, ~$2k/mo minimum.
2. **G2 Buyer Intent** — G2 category page visit data. Requires G2 partnership.
3. **LinkedIn Sales Navigator** — Job posting + hiring signals via API or scraping.
4. **DIY: Job board scraping** — Already partially built. Scrape job postings for technology/tool mentions that signal buying intent.

**Recommendation:** Start with DIY job board signals (cheapest, already scaffolded). Add Bombora integration as an optional paid provider.

#### 2C.3 — ABM Account Scoring (M12 fix)

**Current state:** Static account lists with tier/stage. No engagement aggregation across touchpoints.

**Changes:**
- `recalculate_abm_engagement` already exists — wire it to pull from: visitor sessions (company match), email engagement (open/click per account domain), intent signals, outreach enrollments
- Add account-level pipeline view: "Company X has 3 identified visitors, 2 in active sequences, 1 replied interested, intent score 72"
- Dynamic lists auto-refresh based on engagement threshold

**Effort:** 1-2 weeks. Most code exists, needs wiring.

---

### Phase 2D — "Scale & Ops" (ongoing)

#### 2D.1 — Observability

- Add OpenTelemetry traces to the full pipeline (event → score → route → alert)
- Temporal workflow dashboards: active sequences, step failure rates, average cycle time
- Provider health monitoring: API error rates, latency p50/p95, cost tracking per workspace

#### 2D.2 — Multi-tenant Performance

- Partition `behavioral_events` by `(workspace_id, created_at)` — currently single table, will be the first table to hit scale issues
- Add read replicas for dashboard/analytics queries
- Redis cluster for rate limiting at scale

#### 2D.3 — Webhook Integrations

- Inbound webhooks for: Stripe (payment events → health scoring), Intercom/Zendesk (support tickets → health scoring), Segment (product usage → behavioral events)
- Outbound webhooks for: lead scored, lead routed, SLA breached, sequence completed

---

## Priority Matrix

| Initiative | Impact | Effort | Phase | Dependencies |
|---|---|---|---|---|
| Scoring feedback loop | High | Medium | 2A | None |
| Auth hydration fix | Medium | Low | 2A | None |
| Hide empty provider slots | Low | Low | 2A | None |
| Outreach workflow audit | High | Low-Med | 2A | None |
| A/B testing | High | Medium | 2B | Outreach workflow verified |
| Smart send windows | Medium | Medium | 2B | Timezone enrichment |
| Inbox warmup enforcement | Medium | Low | 2B | None |
| Reply threading | Medium | Medium | 2B | None |
| Competitor intel (real) | Medium | Medium | 2C | LLM gateway working |
| Intent signals (DIY) | Medium | Medium | 2C | Job board scraping |
| ABM account scoring | Medium | Low | 2C | Scoring feedback loop |
| Observability | High | Medium | 2D | None |
| Partitioning | Medium | High | 2D | Scale threshold reached |
| Webhook integrations | High | Medium | 2D | None |

---

## Success Metrics

### Phase 2A (Foundation)
- Zero pages fail on direct URL navigation
- Lead scores update within 5 minutes of email open/click event
- All provider config UI states map to real capabilities

### Phase 2B (Outreach)
- A/B test deployed on >= 1 sequence per workspace
- Average open rate improves 15%+ with send window optimization
- Zero inbox blacklisting incidents (warmup enforcement)

### Phase 2C (Intelligence)
- < 5% of competitor alerts are "cosmetic" changes (currently ~80%)
- Intent signals generate >= 1 qualified lead/week per workspace
- ABM account scores correlate with pipeline movement (r > 0.3)

### Phase 2D (Scale)
- p95 dashboard load < 500ms at 100k events/day
- Full pipeline trace visible in observability tool
- Webhook delivery success rate > 99.5%

---

## What We're NOT Building

| Feature | Reason |
|---|---|
| Built-in email sending (SMTP) | Use existing email providers (SendGrid, Postmark). We route through them. |
| Ad platform bidding | Too far from core. ABM engagement tracking is sufficient. |
| Full CRM replacement | GTM enriches and acts on CRM data. CRM module owns the record lifecycle. |
| Marketing automation (nurture campaigns) | Focus on sales-led outreach. Marketing nurture is a different product. |
| Real-time chat/chatbot | Different UX paradigm. Separate module if ever. |

---

## Appendix: Current Inventory

### Models (25)
GTMProviderConfig, BehavioralEvent, VisitorSession, VisitorIdentification, ICPTemplate, LeadScore, OutreachSequence, OutreachEnrollment, OutreachStepExecution, ContactConsent, SuppressionList, ComplianceAuditLog, GTMRoutingRule, GTMLeadAssignment, GTMAlertConfig, GTMAlertLog, GTMHealthScore, GTMExpansionPlaybook, GTMExpansionEnrollment, GTMHandoff, IntentSignal, IntentSignalConfig, CompetitorProfile, CompetitorChange, BattleCard, SEOAudit, SEOAuditPage, ContentAnalysis, ABMTargetList, ABMAccount

### Provider Integrations (5 active / 5 empty)
Active: Snitcher (visitor ID), MillionVerifier (email verify), Apollo (enrichment), PhantomBuster (LinkedIn), Twilio (SMS)
Empty slots: intent_data, seo_tracking, ad_platform, analytics, data_warehouse

### LLM Touchpoints (2 active / 2 stub)
Active: Reply classification, Outreach personalization
Stub: Battle card generation, Content gap summary

### Sidebar Items (8 shipped / 10 hidden)
Shipped: Dashboard, Visitors, Scoring & ICP, Routing, Sequences, Alerts, Compliance, Providers
Hidden: Health, Expansion, Handoffs, Intent, Competitors, ABM, SEO, Content Gaps, Analytics, Import
