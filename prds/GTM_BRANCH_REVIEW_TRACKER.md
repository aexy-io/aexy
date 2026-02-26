# GTM Branch Review Tracker

**Branch:** `gtm` vs `main`
**Reviewed:** 2026-02-26
**Scope:** 8 commits, 98 files, 30,806 lines added

---

## Summary

| Severity | Code Issues | GTM Strategy Issues | Total |
|----------|-------------|---------------------|-------|
| Critical | 7 | 2 | 9 |
| High | 9 | 3 | 12 |
| Medium | 10 | 3 | 13 |
| Low | 12 | — | 12 |
| **Total** | **38** | **8** | **46** |

---

## Critical — Fix Before Merge

### Code

- [x] **C1. SSRF in SEO audit service** — FIXED: Added `validate_url_for_fetch()` in new `core/url_validation.py`. Applied at audit creation and before each BFS crawl fetch.
- [x] **C2. SSRF in competitor intelligence** — FIXED: Applied `validate_url_for_fetch()` at competitor creation and before each tracked-page fetch.
- [x] **C3. Prompt injection in reply classification** — FIXED: Added `sanitize_for_llm()` to `core/sanitize.py`. Applied to reply text. Prompt now marks email content as untrusted with explicit instructions not to follow embedded instructions.
- [x] **C4. Prompt injection in outreach personalization** — FIXED: `_build_context()` now sanitizes all CRM field values via `sanitize_for_llm()`. Prompt marks prospect profile as untrusted data.
- [x] **C5. Public event ingestion has zero rate limiting** — FIXED: Added Redis-backed sliding-window rate limiting (60 req/min per IP, 300 req/min per workspace). Returns 429 with Retry-After header. Fails open if Redis unavailable.
- [x] **C6. Runtime crash — `create_handoff` missing required arg** — FIXED: Added `created_by=str(current_user.id)` to the `service.create_handoff()` call.
- [x] **C7. Tracking script drops 365-day cookie + collects PII with no consent** — FIXED: Complete rewrite of consent logic. Supports `data-consent="granted|denied"` attribute, respects `navigator.globalPrivacyControl`, persists consent in `_aexy_consent` cookie. Cookie only set after consent. `identify()` blocked if consent not granted. Added `window.aexy.consent()` API for CMP integration.

### GTM Strategy

- [x] **C8. Tracking script contradicts compliance module** — FIXED: C7 already made the script consent-aware (consent-gated cookies, GPC support, identify() blocked without consent). Bridged the remaining gap by adding a "Tracking Setup" tab to the compliance page showing: GDPR snippet (data-consent="denied" default), CAN-SPAM snippet, CMP integration code (window.aexy.consent()), and a data collection/retention table. The compliance page is now the single reference for both inbound tracking and outbound sending compliance.
- [x] **C9. Outreach sequences don't actually send anything** — RESOLVED: Investigation found the original assessment was incorrect. `execute_outreach_step` IS wired to `EmailCampaignService.send_workflow_email()` (email), `ProviderRegistry` (LinkedIn/SMS), and `GTMComplianceService` (compliance). Fixed a real bug: success check used `result.get("success")` but `send_workflow_email` returns `{"status": "sent"}` — every successful send was incorrectly marked FAILED. Also guarded inbox rotation to only attempt when `sending_pool_id` is configured.

---

## High — Fix Before GA

### Code

- [x] **H1. 25 API endpoints accept `data: dict` instead of Pydantic models** — FIXED: All 26 endpoints now use their proper Pydantic request models (e.g. `AlertConfigCreate`, `RoutingRuleCreate`). Manual `parsed = Model(**data)` lines removed. FastAPI now validates requests and returns 422 with structured errors.
- [x] **H2. Missing workspace authorization on step execution** — FIXED: Added optional `workspace_id` parameter to `record_step_execution`, `update_step_status`, `update_sequence_stats`. When provided, adds workspace_id to WHERE clause.
- [x] **H3. No `relationship()` on any GTM model** — FIXED: Added 24 relationship definitions across 8 model files. Parent→child (lazy="noload") and child→parent (lazy="selectin") following codebase convention. Covers VisitorSession↔Identification, Sequence↔Enrollment↔StepExecution, AlertConfig↔Log, Competitor↔Changes↔BattleCards, ABMList↔Accounts, Playbook↔Enrollments, RoutingRule↔Assignments, SEOAudit↔Pages.
- [x] **H4. Missing unique constraints** — FIXED: `GTMProviderConfig` and `LeadScore` already had unique constraints in migrations. Added `UniqueConstraint("workspace_id", "email")` to `SuppressionList` model. Made `add_to_suppression` idempotent (checks existing before insert).
- [x] **H5. Unconstrained `setattr` in update methods** — FIXED: Added explicit allowlists (`_PROVIDER_UPDATABLE`, `_TEMPLATE_UPDATABLE`, `_COMPETITOR_UPDATABLE`) to `update_provider`, `update_template`, and `update_competitor`.
- [x] **H6. GDPR erasure incomplete** — FIXED: `process_erasure_request` now finds record_ids from 3 sources (audit logs + CRM records by email in JSONB + outreach enrollment record_ids). Also anonymizes CRM records (sets values to `{_erased: true}`, display_name to `[erased]`).
- [x] **H7. `record_id` across 8+ tables lacks FK constraint** — FIXED: Added `ForeignKey("crm_records.id")` to 8 GTM models (routing, outreach, ABM, handoff, health, intent, expansion, SEO). Migration `migrate_gtm_record_id_fk.sql` adds constraints idempotently. NOT NULL columns use `ON DELETE CASCADE`, nullable use `ON DELETE SET NULL`.
- [x] **H8. Format string injection in alert templating** — FIXED: Replaced `str.format(**event_data)` with `string.Template.safe_substitute()` which only supports `$variable` syntax and cannot access object attributes.
- [x] **H9. CSV content passed as Temporal activity input** — FIXED: Added 1.5MB size check at the async import API endpoint. Returns 413 with guidance to use sync endpoint for larger files.

### GTM Strategy

- [x] **H10. ICP scoring model too simplistic** — FIXED: Added exponential time-decay (`exp(-λt)` with configurable half-life, default 30 days) to behavioral and engagement scores. Added negative signals: -10 for 90+ days inactivity, -10 for suppression list membership, -5/-10 for bounced/unsubscribed outreach enrollments. Weights (40/35/25) now configurable via `ICPTemplate.criteria` JSONB. Scoring factors output includes `decay_factor`, `days_since_activity`, and `negative` breakdown.
- [x] **H11. Visitor identification not wired to enrichment → routing → sequencing** — FIXED: `identify_visitor_session` now dispatches `score_lead` and `route_new_lead` activities automatically when a visitor is matched to a CRM record. Pipeline: event ingestion → session aggregation → Snitcher identification → identity resolution → lead scoring → routing rules → assignment + alert. Each stage runs as an independent Temporal activity with its own retry policy.
- [x] **H12. No email deliverability fundamentals** — FIXED: Added `ProviderService.send_email()` method (was missing — `email_campaign_service` called it but it didn't exist). Method automatically injects RFC 2369 `List-Unsubscribe` and RFC 8058 `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers on every email, satisfying Google/Yahoo Feb 2024 requirements. Campaign emails pass subscriber unsubscribe URLs. SPF/DKIM/DMARC infrastructure and warming existed already (domain_service.py, warming_service.py).

---

## Medium — Fix Before Beta

### Code

- [x] **M1. `api/gtm.py` is 2,829 lines (15 domains)** — FIXED: Split into 20 sub-modules under `api/gtm/` package (19 domain modules + `_shared.py`). Each module has its own router, imports only what it needs. `__init__.py` combines all sub-routers with shared prefix.
- [x] **M2. `temporal/activities/gtm.py` is 1,507 lines (28 activities)** — FIXED: Split into 9 domain modules under `activities/gtm/` package. `__init__.py` re-exports all activities and dataclasses for backward compatibility. Worker.py imports unchanged.
- [x] **M3. Dashboard runs 5-7 sequential COUNT queries** — FIXED: Collapsed 5 visitor/company queries into 1 using conditional aggregation (`func.count().filter()`). Funnel loop collapsed from 6 LeadScore queries into 1 `GROUP BY lifecycle_stage`.
- [x] **M4. Inconsistent transaction management** — FIXED: `GTMAlertService` changed from `commit()` to `flush()` in all 5 methods (create, update, delete, emit_event, mark_delivered). API layer now commits for alert endpoints, matching the convention used by all other GTM services.
- [x] **M5. `behavioral_events` table has no partitioning or retention** — FIXED: Added `purge_behavioral_events` Temporal activity with configurable retention (default 365 days). Deletes in batches of 10k to avoid lock contention. Heartbeats for Temporal visibility. IP cleanup activity (L3) handles GDPR separately.
- [x] **M6. Pagination params lack validation in second half of API** — FIXED: All 10 unvalidated endpoints now use `Query(default=..., ge=1, le=100)` for `page` and `per_page` parameters.
- [x] **M7. Bulk enroll has no batch size limit** — FIXED: Added `_MAX_BULK_ENROLL = 500` constant. Raises `ValueError` if exceeded, caught as 400 at API layer.
- [x] **M8. Dedup phone matching groups on raw strings** — FIXED: SQL now uses `regexp_replace(phone, '[^\d]', '', 'g')` for digits-only normalization before grouping. `+1-555-1234` and `15551234` now match.
- [x] **M9. `"most_complete"` merge strategy identical to `"primary_wins"`** — FIXED: `most_complete` now prefers the longer (more complete) value when both records have data for a field. `primary_wins` only fills empty fields.
- [x] **M10. Dashboard type mismatch** — FIXED: Frontend interface renamed to `visitors_change_pct`, `companies_change_pct`, `leads_change_pct`. Added `sequences_change_pct?: number` (optional, Phase 4). Backend schema and service now return `sequences_change_pct: 0.0`.

### GTM Strategy

- [x] **M11. 18 sidebar items** — FIXED: Cut sidebar from 18 to 8 items (Dashboard, Visitors, Scoring & ICP, Routing, Sequences, Alerts, Compliance, Providers). Focuses on core pipeline. Deferred items listed below.
- [ ] **M12. ABM is account lists, not real ABM** — Deferred (Phase 2+). No intent aggregation, no advertising integration, no multi-touch attribution.
- [ ] **M13. Competitor intelligence generates noise** — Deferred (Phase 2+). Page change detection triggers on CSS/footer changes.

---

## Low — Fix When Convenient

### Code

- [x] **L1. Credentials column says "encrypted" but no DB-level enforcement** — FIXED: Added `@validates("credentials")` hook to `GTMProviderConfig` that rejects raw API keys (e.g. `sk-` prefix). Ensures `encrypt_credentials()` is called before assignment.
- [x] **L2. `raw_response` stores unfiltered third-party API responses** — FIXED: Added `_sanitize_raw_response()` to `SnitcherProvider` that recursively strips PII keys (`contacts`, `people`, `employees`, `email`, `phones`, etc.) from API responses before storage.
- [x] **L3. IP addresses stored with no retention policy** — FIXED: Added `cleanup_ip_addresses` Temporal activity with configurable retention (default 90 days). Nulls IPs on behavioral_events and visitor_sessions; replaces with `0.0.0.0` on visitor_identifications (NOT NULL constraint).
- [x] **L4. Duplicate enum definitions between models and schemas** — FIXED: Schema Literal types now derived from model Enum classes via `Literal[tuple(e.value for e in Enum)]`. Single source of truth in `models/gtm.py`.
- [x] **L5. `extra_data` mapped to column named `metadata`** — FIXED: Added clarifying comment on both occurrences explaining the legacy column name aliasing.
- [x] **L6. Missing indexes on common query patterns** — FIXED: Added `ix_gtm_provider_configs_ws_slot(workspace_id, slot)`, `ix_visitor_sessions_ws_started(workspace_id, started_at DESC)`, `ix_behavioral_events_ws_type(workspace_id, event_type)`.
- [x] **L7. `score_history` as unbounded JSONB array** — Already capped: health scoring keeps last 90, lead scoring keeps last 50. No change needed.
- [x] **L8. Visitors page search input is decorative** — FIXED: Added `search` param to backend `list_sessions` (subquery join to `VisitorIdentification.company_name`), API endpoint, frontend hook, and wired `searchQuery` state to the API call.
- [x] **L9. `batch_score_leads` calls activities as functions with no heartbeat** — FIXED: Added `activity.heartbeat()` call every 10 records to prevent Temporal cancellation on large batches.
- [x] **L10. Scheduled activities iterate all workspaces in single DB session** — FIXED: `check_sla_breaches`, `batch_score_customer_health`, and `detect_health_drops` now use per-workspace sessions with try/except isolation. Added heartbeats.
- [x] **L11. Extensive `Record<string, unknown>` in frontend API types** — FIXED: Added 30+ TypeScript interfaces matching backend schemas. Replaced ~64 `Record<string, unknown>` return types with proper types across alerts, routing, health, expansion, handoffs, intent, competitors, SEO, content-gap, and ABM API functions.
- [x] **L12. No `response_model` on ~50 endpoints in second half of API** — FIXED: Added `response_model=` to 43 endpoints in the second half of `api/gtm.py`. Schema imports moved to module level. OpenAPI docs now fully generated for all GTM endpoints.

---

## GTM Strategy Recommendation

### What to Ship (Phase 1 — "Smart Visitor-to-Pipeline")

| Feature | Status | Needed Work |
|---------|--------|-------------|
| Visitor identification (Snitcher) | Built | Wire to enrichment + routing |
| Lead scoring / ICP templates | Built | Add behavioral signals, decay, negative signals |
| Lead routing | Built | Connect to visitor events |
| Basic compliance (suppression + consent) | Built | Fix tracking script consent, add List-Unsubscribe |
| Dashboard (visitor → scored → routed funnel) | Built | Fix type mismatch, reduce query count |

### What to Ship (Phase 2 — "Outreach")

| Feature | Status | Needed Work |
|---------|--------|-------------|
| Outreach sequences | Scaffolded | Actual email sending, A/B testing, timezone send, mailbox rotation |
| Reply classification | Built | Fix prompt injection, add validation layer |
| CRM integration | Partial | Ensure end-to-end record lifecycle |

### What to Cut / Defer

Sidebar cut from 18 → 8. These features are hidden from nav but code remains. Re-enable when prerequisites are met.

| Feature | Sidebar removed | Prerequisite to re-enable |
|---------|:-:|--------|
| Health Scores | Yes | Product usage data integration |
| Expansion | Yes | Product usage data + health scoring |
| Handoffs | Yes | Health scoring pipeline live |
| Intent Signals | Yes | Third-party intent sources (Bombora, G2) |
| ABM | Yes | Ad platform integration + intent data |
| Competitors | Yes | PMM-curated content workflow, not just HTML diffs |
| SEO Audit | Yes | Marketing team use case validated |
| Content Gaps | Yes | SEO audit shipping first |
| Analytics | No (accessible via URL) | Wire end-to-end pipeline first |
| Import | No (accessible via URL) | Available via sequences flow |

### The Winning Thesis

> Build the **one workflow** no existing tool does well inside a unified engineering OS: **anonymous visitor arrives → identified as company → enriched with contacts → scored against ICP → routed to the right rep → rep gets Slack/email alert with full context and suggested next steps.** That's a 10-minute integration that replaces a 6-tool stack. Ship that, prove it converts, then expand.
