# GTM (Go-To-Market)

Aexy's GTM module is a full sales-and-marketing stack: lead scoring, account-based marketing, outreach sequences, intent signals, routing & SLAs, customer-health monitoring, expansion playbooks, competitor intelligence, SEO/content analysis, compliance, alerts, webhooks. **19 sub-routers** aggregated under one parent prefix; **15 dedicated services**; **13 model files**; **24+ Temporal activities**.

Most everything sits at `/api/v1/workspaces/{workspace_id}/gtm/...`, aggregated via `backend/src/aexy/api/gtm/__init__.py:28-51`. Tag: `GTM`.

## Sub-router quick reference

| # | Sub-router | Purpose |
|---|---|---|
| 1 | [providers](#1-providers) | Configure data/enrichment providers (Apollo, ZoomInfo, etc.) |
| 2 | [dashboard](#2-dashboard) | KPI overview, funnel, recent visitors, pipeline metrics |
| 3 | [icp](#3-icp-templates) | Ideal Customer Profile templates |
| 4 | [visitors](#4-visitors) | Visitor session tracking + identification |
| 5 | [compliance](#5-compliance) | Consent, suppression, audit |
| 6 | [scoring](#6-lead-scoring) | Lead score CRUD + rescoring |
| 7 | [dedup](#7-deduplication) | Duplicate detection + merge |
| 8 | [sequences](#8-outreach-sequences) | Multi-step outreach campaigns |
| 9 | [analytics](#9-analytics) | Pipeline, channels, attribution, trends |
| 10 | [alerts](#10-alerts) | Event-driven alert configs + logs |
| 11 | [routing](#11-routing--sla) | Lead routing rules + SLA tracking |
| 12 | [health](#12-customer-health) | Customer-health scoring |
| 13 | [expansion](#13-expansion-playbooks) | Upsell/cross-sell playbooks |
| 14 | [handoffs](#14-handoffs) | CS → Sales handoffs |
| 15 | [intent](#15-intent-signals) | Buying-signal monitoring |
| 16 | [competitors](#16-competitors) | Competitive intel + battle cards |
| 17 | [seo](#17-seo--content-gap) | SEO audits + content-gap analysis |
| 18 | [abm](#18-abm-account-based-marketing) | Target lists, tiering, stage progression |
| 19 | [webhooks](#19-outbound-webhooks) | Subscribe external systems to GTM events |

Throughout: **path snippets are relative** to `/workspaces/{workspace_id}/gtm`. Admin-marked endpoints require `can_manage_gtm` or equivalent permission.

---

## 1. Providers

**File**: `api/gtm/providers.py`. **Service**: `GTMProviderService`.

Configures data/enrichment providers (slot-based — one provider per slot at a time).

```
GET    /providers/available                       all registered providers
GET    /providers                                 configured providers for this workspace
POST   /providers                                 configure a new provider
GET    /providers/{slot}/{provider_name}
PUT    /providers/{slot}/{provider_name}
DELETE /providers/{slot}/{provider_name}
```

Schemas: `GTMProviderConfigCreate`, `GTMProviderConfigResponse`, `GTMAvailableProvider` (`schemas/gtm`).

## 2. Dashboard

**File**: `api/gtm/dashboard.py`. **Service**: `GTMDashboardService`.

```
GET /dashboard/overview?days=30                   KPI overview
GET /dashboard/funnel                             stage-by-stage funnel data
GET /dashboard/recent-visitors?limit=10           recently identified visitors
GET /dashboard/pipeline-metrics                   scoring / routing / outreach / provider-health rollup
```

Returns aggregated metrics for the home page — read-only, no LLM.

## 3. ICP Templates

**File**: `api/gtm/icp.py`. **Service**: `ICPTemplateService`.

```
GET    /icp-templates
POST   /icp-templates                             admin
GET    /icp-templates/{template_id}
PUT    /icp-templates/{template_id}               admin
DELETE /icp-templates/{template_id}               admin
```

Templates define the workspace's notion of a "good fit" account — industry, employee range, revenue, tech stack signals. Used by scoring and ABM.

## 4. Visitors

**File**: `api/gtm/visitors.py`. **Service**: `VisitorService`.

```
GET  /visitors?page=...&status=...&utm_source=...&search=...
GET  /visitors/{session_id}                       detail with behavioral events
POST /visitors/{session_id}/identify              manual identify or link
POST /visitors/{session_id}/link                  link to existing record
```

Sessions arrive via the public event-ingestion SDK; `identify_visitor_session` (Temporal, 2m timeout) matches them to known accounts. Behavioral events (page views, form fills, CTAs) live alongside.

## 5. Compliance

**File**: `api/gtm/compliance.py`. **Service**: `GTMComplianceService`.

```
GET    /compliance/check?email=...                "am I allowed to send to this address?"
POST   /compliance/consent                        record consent
GET    /compliance/consent/{email}
DELETE /compliance/consent/{email}                revoke
POST   /compliance/suppression                    add to suppression list
GET    /compliance/audit                          consent + suppression audit log
```

The single source of truth for "can we email this person?" — every outreach send queries `/compliance/check` first. GDPR-aligned: consent records carry timestamp, source, version.

## 6. Lead scoring

**File**: `api/gtm/scoring.py`. **Service**: `GTMScoringService`.

```
GET  /scoring/overview
GET  /scoring/leads?min_score=...&max_score=...&lifecycle_stage=...&sort=...
GET  /scoring/leads/{record_id}                   score detail with factor breakdown
POST /scoring/rescore/{record_id}                 manual rescore
```

Scoring runs as the `score_lead` activity (5m timeout) for individual records; bulk re-score uses `batch_score_leads` (30m + 5m heartbeat). Scores attach to CRM records as JSONB and feed routing, alerts, and the dashboard funnel.

## 7. Deduplication

**File**: `api/gtm/dedup.py`. **Service**: `DedupService`.

```
GET  /dedup/scan?limit=...&record_id=...          find duplicates
POST /dedup/merge                                 merge two records (admin)
GET  /dedup/stats                                 dedup statistics
```

Match candidates returned with `confidence` + reason. Merge is destructive — the source row is archived, references rewritten.

## 8. Outreach sequences

**File**: `api/gtm/sequences.py`. **Service**: `OutreachSequenceService`.

```
POST   /sequences                                 admin
GET    /sequences?status=...                      paginated
GET    /sequences/{sequence_id}
PUT    /sequences/{sequence_id}                   admin
DELETE /sequences/{sequence_id}                   admin
POST   /sequences/{sequence_id}/enroll            single contact
POST   /sequences/{sequence_id}/bulk-enroll
POST   /sequences/{sequence_id}/reply-classify    LLM reply classification
```

Sequence steps are typed (`SequenceAction` enum): `send_email`, `linkedin_view`, `linkedin_connect`, `linkedin_message`, `send_sms`, `wait`. Each step execution is `execute_outreach_step` (5m). Reply classification runs `classify_outreach_reply` (LLM_RETRY, 2m).

`SequenceStatus`: `draft`/`active`/`paused`/`archived`. `EnrollmentStatus`: `active`/`paused`/`completed`/`replied`/`bounced`/`unsubscribed`/`exited`/`failed`. `StepExecutionStatus`: `pending`/`sent`/`delivered`/`opened`/`clicked`/`replied`/`bounced`/`failed`/`skipped`.

For the distinction between this and `CRMSequence`, see [crm.md](./crm.md#sequences).

## 9. Analytics

**File**: `api/gtm/analytics.py`. **Service**: `GTMAnalyticsService`.

```
GET /analytics/pipeline                           lifecycle stage distribution + conversions
GET /analytics/channels                           email / LinkedIn / SMS metrics
GET /analytics/attribution?model=...              first_touch / last_touch / linear / u_shaped / time_decay
GET /analytics/sequences                          sequence performance comparison
GET /analytics/trends?period=...                  time-series
```

All five attribution models supported. No LLM.

## 10. Alerts

**File**: `api/gtm/alerts.py`. **Service**: `GTMAlertService`.

```
GET    /alerts/configs
POST   /alerts/configs                            admin
PUT    /alerts/configs/{alert_id}                 admin
DELETE /alerts/configs/{alert_id}                 admin
GET    /alerts/logs                               delivery history
```

Alerts trigger on events (visitor identified, score crossed threshold, deal stage changed, …) with optional `conditions` (JSONB AND/OR). Channel: `slack` / `email` / `webhook`. Delivery dispatches `send_gtm_alert` (2m).

## 11. Routing & SLA

**File**: `api/gtm/routing.py`. **Service**: `LeadRoutingService`.

```
GET    /routing/rules
POST   /routing/rules                             admin
PUT    /routing/rules/{rule_id}                   admin
DELETE /routing/rules/{rule_id}                   admin
POST   /routing/route/{record_id}                 apply rules → assign
GET    /routing/assignments?status=...
POST   /routing/assignments/{assignment_id}/reassign
GET    /routing/sla-dashboard                     breach overview
```

Strategies: `round_robin`, `availability`, `custom`. SLA tracked per assignment via `sla_first_response_minutes` and `sla_follow_up_minutes`. `check_sla_breaches` (5m, scheduled) flags violations.

## 12. Customer health

**File**: `api/gtm/health.py`. **Service**: `HealthScoringService`.

```
GET  /health/dashboard                            tier distribution + at-risk
GET  /health/scores?health_status=...
GET  /health/scores/{record_id}
POST /health/scores/{record_id}/rescore
POST /health/batch-score                          batch
```

Score is a weighted sum of five sub-scores: engagement (default 25%), usage (30%), support (20%), NPS (15%), payment (10%). Thresholds: `healthy ≥70`, `at_risk 40-69`, `critical <20`. Trend is derived from `score_history` JSONB.

Individual scoring: `score_customer_health` (5m). Bulk: `batch_score_customer_health` (30m + 5m heartbeat). Drops: `detect_health_drops` (5m, scheduled).

## 13. Expansion playbooks

**File**: `api/gtm/expansion.py`. **Service**: `ExpansionPlaybookService`.

```
GET    /expansion/playbooks
POST   /expansion/playbooks                       admin
GET    /expansion/playbooks/{playbook_id}
PUT    /expansion/playbooks/{playbook_id}         admin
DELETE /expansion/playbooks/{playbook_id}         admin
POST   /expansion/playbooks/{playbook_id}/enroll  enroll an account
GET    /expansion/enrollments?status=...
POST   /expansion/enrollments/{enrollment_id}/outcome   converted/lost
GET    /expansion/analytics
```

Playbooks are step graphs — eligibility check, multi-channel touches, outcome reporting. Triggered by `evaluate_expansion_triggers` (5m); steps advance via `advance_expansion_step` (2m).

## 14. Handoffs

**File**: `api/gtm/handoffs.py`. **Service**: `HandoffService`.

```
POST /handoffs                                    create CS → Sales handoff
GET  /handoffs?status=...&assigned_to=...
GET  /handoffs/{handoff_id}
POST /handoffs/{handoff_id}/accept
POST /handoffs/{handoff_id}/decline
POST /handoffs/{handoff_id}/convert               → deal
GET  /handoffs/analytics                          acceptance + conversion rates
```

`handoff_type`: `expansion` / `upsell` / `cross_sell`. Status flow: `pending → accepted/declined → in_progress → converted/lost`. SLA on acceptance: `sla_accept_minutes` with `sla_breached` boolean.

## 15. Intent signals

**File**: `api/gtm/intent.py`. **Service**: `IntentSignalService`.

```
GET    /intent/signals?signal_type=...&intent_strength=...
GET    /intent/signals/{signal_id}
POST   /intent/signals                            admin (manual insert)
POST   /intent/signals/{signal_id}/dismiss        admin
GET    /intent/config
PUT    /intent/config                             admin
GET    /intent/summary
```

Config holds `monitored_domains`, `job_title_keywords`, `tech_keywords`, `competitor_names`, plus per-signal-type `signal_weights` (JSONB). Strengths: `weak`/`medium`/`strong`.

Collection: `collect_intent_signals` (30m + 5m heartbeat, scheduled) pulls third-party data; `match_intent_signals_to_records` (10m) joins signals to known accounts.

## 16. Competitors

**File**: `api/gtm/competitors.py`. **Service**: `CompetitorIntelService`.

```
GET    /competitors
POST   /competitors                                          admin
GET    /competitors/{competitor_id}
PUT    /competitors/{competitor_id}                          admin
DELETE /competitors/{competitor_id}                          admin
GET    /competitors/changes
POST   /competitors/changes/{change_id}/acknowledge          admin
GET    /competitors/{competitor_id}/battle-card              get or generate
PUT    /competitors/{competitor_id}/battle-card              admin
```

`check_competitor_changes` (30m + 5m heartbeat, scheduled) scrapes competitor pages for pricing/feature/messaging changes. `generate_battle_card` (LLM_RETRY, 10m) synthesizes a one-pager comparing your product vs the competitor.

## 17. SEO & content gap

**File**: `api/gtm/seo.py`. **Service**: `SEOAuditService` / `ContentAnalysisService`.

```
# SEO audits
POST /seo/audits                                  admin → Temporal dispatch
GET  /seo/audits
GET  /seo/audits/{audit_id}
GET  /seo/audits/{audit_id}/pages
GET  /seo/audits/{audit_id}/history

# Content gap analysis
POST /content/analysis                            admin → Temporal dispatch
GET  /content/analysis
GET  /content/analysis/{analysis_id}
```

`run_seo_audit` (15m + 30s heartbeat) runs the audit. `run_content_gap_analysis` (LLM_RETRY, 30m + 5m heartbeat) compares your content footprint to keyword gaps vs competitors.

## 18. ABM (Account-Based Marketing)

**File**: `api/gtm/abm.py`. **Service**: `ABMService`.

```
GET    /abm/lists
POST   /abm/lists                                            admin
GET    /abm/lists/{list_id}
PUT    /abm/lists/{list_id}                                  admin
DELETE /abm/lists/{list_id}                                  admin
GET    /abm/overview                                         total accounts + tier distribution + engagement
GET    /abm/accounts?target_list_id=...&tier=...&stage=...
GET    /abm/accounts/{account_id}                            contact + engagement metrics
POST   /abm/accounts/{account_id}/stage                      admin
POST   /abm/accounts/{account_id}/assign-campaign            admin
```

Lists can be `is_dynamic=true` — criteria-based, re-evaluated by `refresh_dynamic_abm_lists` (10m, scheduled). Account tiers: `tier_1`/`tier_2`/`tier_3`. Stages: `unaware`/`aware`/`engaged`/...

Engagement recompute: `recalculate_abm_engagement` (30m + 5m heartbeat).

## 19. Outbound webhooks

**File**: `api/gtm/webhooks.py`. **Service**: `GTMWebhookService`.

```
GET    /webhooks?is_active=...
POST   /webhooks                                  with event subscriptions
GET    /webhooks/{webhook_id}
PUT    /webhooks/{webhook_id}
DELETE /webhooks/{webhook_id}
GET    /webhooks/{webhook_id}/deliveries
POST   /webhooks/{webhook_id}/test                send sample payload
```

Delivery uses the shared `deliver_webhook` activity with `WEBHOOK_RETRY` (6 attempts, 1m → 1h backoff). See [webhooks.md](./guides/webhooks.md) for HMAC signing protocol.

---

## Models (13 files)

All under `backend/src/aexy/models/gtm_*.py`. Key shapes:

### `gtm_outreach.py`

| Model | Highlights |
|---|---|
| `OutreachSequence` | `status`, `steps` JSONB array, `settings` (send window) |
| `OutreachEnrollment` | `record_id`, `sequence_id`, `status`, lifecycle timestamps |
| `OutreachStepExecution` | `step_index`, `status`, per-step metadata |

Enums above ([Sequences](#8-outreach-sequences)).

### `gtm_intent.py`

| Model | Highlights |
|---|---|
| `IntentSignal` | `signal_type`, `intent_strength`, `confidence_score`, `signal_data` JSONB, `is_dismissed` |
| `IntentSignalConfig` | `monitored_domains`, `job_title_keywords`, `tech_keywords`, `competitor_names`, `signal_weights` JSONB |

### `gtm_alerts.py`

| Model | Highlights |
|---|---|
| `GTMAlertConfig` | `event_type`, `conditions` JSONB, `channel_type`, `channel_config`, `message_template`, `is_active` |
| `GTMAlertLog` | `delivery_status`, `error_message`, `sent_at` |

### `gtm_routing.py`

| Model | Highlights |
|---|---|
| `GTMRoutingRule` | `priority`, `is_active`, `conditions` JSONB, `strategy`, `assignee_pool`, `sla_first_response_minutes`, `sla_follow_up_minutes` |
| `GTMLeadAssignment` | `record_id`, `assignee_id`, `assigned_at`, `first_response_at`, `sla_breached`, `sla_breach_at` |

### `gtm_health.py`

| Model | Highlights |
|---|---|
| `GTMHealthScore` | `total_score`, five sub-scores (0-100), `health_status`, `trend`, `scoring_factors` JSONB, `score_history` JSONB |
| `GTMHealthConfig` | `weights` (defaults engagement 25, usage 30, support 20, NPS 15, payment 10), `thresholds` |

### `gtm_abm.py`

| Model | Highlights |
|---|---|
| `ABMTargetList` | `name`, `criteria` JSONB (industries, employee/revenue ranges), `is_dynamic`, `is_active`, `account_count` |
| `ABMAccount` | `tier`, `stage`, `engagement_score`, contact counts, activity metrics (emails, meetings, deals) |

### `gtm_handoff.py`

| Model | Highlights |
|---|---|
| `GTMHandoff` | `handoff_type`, `title`, `context`, `estimated_value`, `products` JSONB, `signals` JSONB, `status`, `sla_accept_minutes`, `sla_breached` |

### Plus

- `gtm_webhook.py` — webhook configs + deliveries
- `gtm_seo.py` — audit results + per-page scores
- `gtm_competitor.py` — competitor records + tracked changes
- `gtm_compliance.py` — consent records + suppression lists
- `gtm_expansion.py` — playbook templates + enrollments
- `gtm_content.py` — content-gap analysis records

## Services (15 files)

Under `backend/src/aexy/services/`:

| Service | Domain |
|---|---|
| `gtm_service.py` | Provider config, dashboard aggregation, ICP CRUD |
| `gtm_analytics_service.py` | Pipeline/channel/attribution/trends |
| `gtm_alert_service.py` | Alert configs, event matching, dispatch |
| `gtm_compliance_service.py` | Consent, suppression |
| `gtm_webhook_service.py` | Webhook CRUD + event publishing |
| `lead_routing_service.py` | Routing rules, assignment, SLA |
| `health_scoring_service.py` | Score computation, trend detection |
| `intent_signal_service.py` | Intent CRUD, signal-to-record matching |
| `competitor_intel_service.py` | Competitor CRUD, change detection, battle cards |
| `seo_audit_service.py` | SEO lifecycle, per-page scoring |
| `outreach_sequence_service.py` | Sequence CRUD, enrollment, step execution, reply classification |
| `outreach_personalization_service.py` | LLM personalization for outreach content |
| `expansion_playbook_service.py` | Playbook CRUD, enrollment, stage advance |
| `handoff_service.py` | Handoff lifecycle |
| `abm_service.py` | Target lists + account engagement |

## Temporal activities

All registered in `dispatch.py:109-164`:

| Activity | Retry | Timeout | What |
|---|---|---|---|
| `identify_visitor_session` | STANDARD | 2m | Match visitor to known account |
| `process_visitor_events` | STANDARD | 5m | Batch event ingestion |
| `verify_email_address` | STANDARD | 2m | Email validation |
| `score_lead` | STANDARD | 5m | Single lead score |
| `batch_score_leads` | STANDARD | 30m, 5m heartbeat | Bulk |
| `execute_outreach_step` | STANDARD | 5m | One step |
| `finalize_enrollment` | STANDARD | 2m | Wrap up enrollment |
| `generate_weekly_gtm_report` | STANDARD | 10m | Weekly digest |
| `classify_outreach_reply` | LLM | 2m | LLM reply triage |
| `personalize_outreach_batch` | LLM | 30m, 5m heartbeat | LLM personalization |
| `run_bulk_import` | STANDARD | 30m, 5m heartbeat | Lead/account import |
| `send_gtm_alert` | STANDARD | 2m | Alert delivery |
| `route_new_lead` | STANDARD | 2m | Apply routing rules |
| `check_sla_breaches` | STANDARD | 5m | SLA monitoring (scheduled) |
| `score_customer_health` | STANDARD | 5m | Single account |
| `batch_score_customer_health` | STANDARD | 30m, 5m heartbeat | Bulk |
| `detect_health_drops` | STANDARD | 5m | At-risk detection |
| `evaluate_expansion_triggers` | STANDARD | 5m | Playbook eligibility |
| `advance_expansion_step` | STANDARD | 2m | Step execution |
| `collect_intent_signals` | STANDARD | 30m, 5m heartbeat | Pull third-party intent |
| `match_intent_signals_to_records` | STANDARD | 10m | Join signals |
| `check_competitor_changes` | STANDARD | 30m, 5m heartbeat | Competitor scrape |
| `generate_battle_card` | LLM | 10m | LLM battle card |
| `run_seo_audit` | STANDARD | 15m, 30s heartbeat | SEO audit |
| `run_content_gap_analysis` | LLM | 30m, 5m heartbeat | Content gap |
| `recalculate_abm_engagement` | STANDARD | 30m, 5m heartbeat | ABM engagement refresh |
| `refresh_dynamic_abm_lists` | STANDARD | 10m | Dynamic list eval |

Periodic schedules in `temporal/schedules.py` drive the scheduled ones (compete-changes, intent collect, SLA checks, health drops, expansion triggers, ABM refresh, etc.).

## Frontend

19 pages under `frontend/src/app/(app)/gtm/`:

| Route | Purpose |
|---|---|
| `/gtm` | Dashboard / overview |
| `/gtm/abm` | Account-Based Marketing |
| `/gtm/visitors` | Visitor tracking & identification |
| `/gtm/providers` | Data provider config |
| `/gtm/health` | Customer health scoring |
| `/gtm/content-gap` | SEO + content gap |
| `/gtm/compliance` | Consent + suppression management |
| `/gtm/alerts` | Alert configs + logs |
| `/gtm/expansion` | Expansion playbooks |
| `/gtm/intent` | Intent signal monitoring |
| `/gtm/sequences` | Outreach sequence builder |
| `/gtm/scoring` | Lead scoring dashboard |
| `/gtm/routing` | Routing rules + SLA dashboard |
| `/gtm/seo` | SEO audit results |
| `/gtm/import` | Bulk import |
| `/gtm/handoffs` | CS-to-Sales handoffs |
| `/gtm/competitors` | Competitor intel + battle cards |
| `/gtm/analytics` | Multi-view analytics |

## Common pitfalls

- **Two sequence systems** (again — covered in [crm.md](./crm.md) but worth repeating): `CRMSequence` for internal nurture, GTM outreach sequence for outbound sales. Don't enroll a record in both — they'll race on email sends.
- **Compliance check is per-call, not cached.** Every outreach send queries `/compliance/check`. If you're dispatching tens of thousands of sends, the compliance service is on the hot path — keep its DB queries indexed (`consent_records.email`, `suppression_list.email`).
- **Health-score weights vs thresholds.** Weights sum to 100 across the five sub-scores; thresholds partition 0-100 into health tiers. Changing weights doesn't auto-rescore — kick off `batch_score_customer_health` after weight changes.
- **Dynamic ABM lists drift.** Criteria-based lists are re-evaluated only when `refresh_dynamic_abm_lists` runs. If the user just added a tag to an account, it won't appear in the list until the next refresh.
- **Reply classifier failure mode**: when LLM rate-limit kicks in, classification falls back to keyword heuristics with a higher false-positive rate. Watch the `gtm.outreach.misclassified` count if reply triage looks off.
- **Visitor identification confidence**: `identify_visitor_session` returns `confidence` ∈ [0, 1]. Acting on low-confidence matches creates duplicate accounts; set a workspace-wide threshold and respect it.
- **Routing rule priority is honored in order — first match wins.** Don't add a catch-all rule at priority 1; it'll mask everything else.
- **`run_seo_audit` heartbeats every 30s** because third-party SERP APIs throttle aggressively. Don't loop audits or fan them out without coordinating with the rate limiter.
- **Intent signals are 6-24h stale.** `collect_intent_signals` is batched — don't gate real-time routing on intent freshness; gate on score + visitor data instead.
- **Handoff conversion creates a deal.** Calling `/handoffs/{id}/convert` mutates the CRM — you can't undo it via the handoff endpoints. Use deal-level operations after the fact.
- **Webhook secret rotation is destructive.** No overlap window — the next delivery signs with the new secret. Coordinate with consumers.
