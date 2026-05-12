# Analytics, Insights & Reports

Aexy's observability surface — **6 distinct routers**, **71 endpoints**, a **5-category snapshot model**, **69 dashboard widgets** across 18 categories, **7 personas**, and **7 analyzer services** that power the deeper GitHub-derived intelligence.

## The six surfaces

| Router | File | Endpoint count | Primary service |
|---|---|---:|---|
| [Analytics](#1-analytics) | `api/analytics.py:22` | 5 | `AnalyticsDashboardService` |
| [Developer Insights](#2-developer-insights) | `api/developer_insights.py:71-74` | 50+ | `DeveloperInsightsService` |
| [Reports](#3-reports) | `api/reports.py:22` | 11 | `ReportBuilderService` |
| [Dashboards](#4-dashboards) | `api/dashboard.py:25` | 11 | n/a (preference CRUD) |
| [Predictions](#5-predictions) | `api/predictions.py:19` | 7 | `PredictiveAnalyticsService` |
| [Intelligence](#6-intelligence) | `api/intelligence.py:23` | 27 | seven `*Analyzer` services |

---

## 1. Analytics

`api/analytics.py:22` — prefix `/analytics`. Workspace-wide rollups.

```
POST /analytics/heatmap/skills                          team skill heatmap (analytics.py:25-47)
GET  /analytics/heatmap/activity/{developer_id}         daily/hourly contribution heatmap (50-72)
POST /analytics/productivity                            commits + PR + review trends (75-97)
POST /analytics/workload                                relative workload across devs (100-121)
POST /analytics/collaboration                           network nodes/edges (124-145)
```

Delegates to `AnalyticsDashboardService` (`analytics.py:20`). Reads raw `Commit`, `PullRequest`, `CodeReview` rows directly — no snapshot layer.

## 2. Developer Insights

`api/developer_insights.py:71-74` — prefix `/workspaces/{workspace_id}/insights`, tag `developer-insights`. The widest surface in the module: 50+ endpoints for individual + team views, comparisons, leaderboards, snapshot management, insight settings, alert rules, schedule sync.

Endpoint groups (all paths relative to the prefix):

```
# Individual developer insights
GET  /developers/{developer_id}/velocity
GET  /developers/{developer_id}/efficiency
GET  /developers/{developer_id}/quality
GET  /developers/{developer_id}/sustainability
GET  /developers/{developer_id}/collaboration
GET  /developers/{developer_id}                         5-category rollup

# Team & workspace
GET  /teams/{team_id}                                   team-wide rollup
GET  /teams/{team_id}/workload                          distribution
GET  /workspace/health                                  whole-workspace summary

# Comparison & leaderboards
GET  /developers/compare?developer_ids=...
GET  /leaderboards/velocity?period_type=...

# Snapshot management
POST /snapshots/generate                                manual trigger
GET  /snapshots/history?developer_id=...&period_type=...

# Settings & schedules
GET/PUT /settings                                       InsightSettings
GET/PUT /working-schedules/{developer_id}               working hours overrides
GET     /sync-status                                    snapshot freshness
GET/POST/PUT/DELETE /alert-rules                        threshold-based alerting
```

Service: `DeveloperInsightsService` (`services/developer_insights_service.py:240`). Reads from `DeveloperMetricsSnapshot`, `TeamMetricsSnapshot`, `InsightSettings`, `DeveloperWorkingSchedule`.

### `DeveloperMetricsSnapshot` — the shared substrate

Defined at `models/developer_insights.py:49-101`. Five JSONB categories, computed by the snapshot generator:

#### `velocity_metrics` (`developer_insights_service.py:40-60`)

| Key | Type | Meaning |
|---|---|---|
| `commits_count` | int | Commits in period |
| `prs_merged` | int | Merged PRs |
| `lines_added`, `lines_removed`, `net_lines` | int | Code volume |
| `commit_frequency` | float | Commits per working day |
| `pr_throughput` | float | PRs merged per week |
| `avg_commit_size` | float | Lines per commit |

#### `efficiency_metrics` (`developer_insights_service.py:64-80`)

| Key | Type | Meaning |
|---|---|---|
| `avg_pr_cycle_time_hours` | float | Open → merge |
| `avg_time_to_first_review_hours` | float | |
| `avg_pr_size` | float | |
| `pr_merge_rate` | float | % of PRs merged |
| `first_commit_to_merge_hours` | float | |
| `rework_ratio` | float | Rework frequency |

#### `quality_metrics` (`developer_insights_service.py:84-96`)

| Key | Type | Meaning |
|---|---|---|
| `review_participation_rate` | float | % of PRs reviewed |
| `avg_review_depth` | float | Comments per review |
| `review_turnaround_hours` | float | |
| `self_merge_rate` | float | Self-approved PRs |

#### `sustainability_metrics` (`developer_insights_service.py:100-114`)

| Key | Type | Meaning |
|---|---|---|
| `weekend_commit_ratio` | float | % weekend commits |
| `late_night_commit_ratio` | float | % after 10pm |
| `longest_streak_days` | int | Max consecutive active days |
| `avg_daily_active_hours` | float | |
| `focus_score` | float | 0-1, single-repo concentration |

#### `collaboration_metrics` (`developer_insights_service.py:118-132`)

| Key | Type | Meaning |
|---|---|---|
| `unique_collaborators` | int | Distinct co-workers |
| `cross_team_pr_ratio` | float | % PRs crossing teams |
| `review_given_count` | int | |
| `review_received_count` | int | |
| `knowledge_sharing_score` | float | Mentoring/contribution ratio |

The (developer_id, workspace_id, period_type, period_start) tuple is unique-indexed for fast trending. `period_type`: `daily` / `weekly` / `biweekly` / `monthly`.

## 3. Reports

`api/reports.py:22` — prefix `/reports`. Custom report builder + scheduled delivery.

```
GET    /reports?filter=public|template               (30-45)
POST   /reports                                       create (48-67)
GET    /reports/{report_id}                           (70-86)
PUT    /reports/{report_id}                           (89-111)
DELETE /reports/{report_id}                           (114-132)
POST   /reports/{report_id}/clone                     (135-157)
POST   /reports/{report_id}/data                      fetch widget data (165-192)
GET    /reports/templates/list                        (200-207)
POST   /reports/templates/{template_id}/create        from template (210-232)
GET    /reports/schedules/list                        (240-254)
POST   /reports/{report_id}/schedules                 create scheduled delivery (257-285)
PUT    /reports/schedules/{schedule_id}               (288-309)
DELETE /reports/schedules/{schedule_id}               (312-326)
```

Service: `ReportBuilderService`.

### `CustomReport` (`models/analytics.py:17-78`)

| Field | Note |
|---|---|
| `creator_id` | Owner developer |
| `organization_id` (nullable) | Scope to an org |
| `name`, `description` | |
| `widgets` (JSONB list) | `[{type, metric, config, position}, ...]` |
| `filters` (JSONB) | `{date_range, team_ids, developer_ids}` |
| `layout` (JSONB) | `{columns, rows, responsive}` |
| `is_template`, `is_public` | Sharing flags |

### `ScheduledReport` (`models/analytics.py:80-130`)

| Field | Note |
|---|---|
| `report_id` | Parent |
| `schedule` | `daily` / `weekly` / `monthly` |
| `day_of_week` (0-6), `day_of_month` (1-31) | For non-daily |
| `time_utc` | `"HH:MM"` |
| `recipients` (JSONB list) | Email addresses |
| `delivery_method` | `email` / `slack` / `both` |
| `export_format` | `pdf` / `csv` / `json` |
| `is_active`, `last_sent_at`, `next_run_at` | |

### `ExportJob` (`models/analytics.py:132-181`)

| Field | Note |
|---|---|
| `requested_by` | User |
| `export_type` | `report` / `developer_profile` / `team_analytics` |
| `format` | `pdf` / `csv` / `json` / `xlsx` |
| `config` (JSONB) | Export-specific |
| `status` | `pending` / `processing` / `completed` / `failed` |
| `file_path`, `file_size_bytes` | Output location |
| `error_message` | If failed |
| `expires_at` | Auto-cleanup |

## 4. Dashboards

`api/dashboard.py:25` — prefix `/dashboard`, tag `Dashboard`. User-configurable persona-based widget layouts.

```
POST /dashboard/track-visits                          batch-merge page visit counts (223-267)
GET  /dashboard/preferences                           current prefs (270-295)
PUT  /dashboard/preferences                           update (298-336)
POST /dashboard/preferences/reset                     reset to preset defaults (339-373)
GET  /dashboard/presets                               list available presets (376-392)
GET  /dashboard/widgets                               widget registry (395-421)
GET  /dashboard/accessible-widgets                    filtered by role + workspace (424-458)
GET  /dashboard/widgets-with-permissions              with accessibility metadata (461-507)
```

### `DashboardPreferences` (`models/dashboard.py:17-119`)

| Field | Note |
|---|---|
| `developer_id` | Unique per developer (one prefs row each) |
| `preset_type` | `developer` / `manager` / `product` / `hr` / `support` / `sales` / `admin` / `custom` |
| `layout` (JSONB) | Grid positions, sizes, responsive config |
| `visible_widgets` (JSONB list) | Widget IDs currently displayed |
| `widget_order` (JSONB list) | Display ordering |
| `widget_sizes` (JSONB dict) | Per-widget size override (`small`/`medium`/`large`/`full`) |
| `checklist_progress` (JSONB list) | Completed onboarding step IDs |
| `checklist_dismissed` | Bool — "getting started" hidden |
| `sidebar_page_visits` (JSONB dict) | Visit counts per route — drives recommendations |
| `sidebar_pinned_items` (JSONB list) | Pinned nav |

### Persona presets

Defined at `api/dashboard.py:30-104`. Each preset is a fixed widget set; switching presets overwrites `visible_widgets`/`widget_order`. Switching to `custom` unlocks manual reordering.

| Preset | Widgets |
|---|---|
| `developer` (13) | `welcome`, `quickStats`, `languageProficiency`, `workPatterns`, `domainExpertise`, `frameworksTools`, `aiInsights`, `softSkills`, `growthTrajectory`, `peerBenchmark`, `myGoals`, `performanceReviews`, `learningPath` |
| `manager` (10) | `welcome`, `quickStats`, `teamOverview`, `sprintOverview`, `trackingSummary`, `taskMatcher`, `peerBenchmark`, `aiInsights`, `performanceReviews`, `myGoals` |
| `product` (7) | `welcome`, `sprintOverview`, `trackingSummary`, `recentDocs`, `teamOverview`, `myGoals`, `upcomingDeadlines` |
| `hr` (7) | `welcome`, `hiringPipeline`, `candidateStats`, `softSkills`, `performanceReviews`, `teamOverview`, `pendingReviews` |
| `support` (6) | `welcome`, `ticketStats`, `slaOverview`, `recentTickets`, `formSubmissions`, `crmQuickView` |
| `sales` (6) | `welcome`, `crmPipeline`, `dealStats`, `recentDeals`, `formSubmissions`, `myGoals` |
| `admin` (6) | `welcome`, `orgMetrics`, `teamOverview`, `hiringPipeline`, `ticketStats`, `systemHealth` |

### Widget registry — all 69 widgets

Defined at `api/dashboard.py:109-181`. Sizes per widget below; categories shown for organization.

**Profile & goals**: `welcome` (full), `quickStats` (full), `myGoals` (medium).

**Skills**: `languageProficiency` (large), `domainExpertise` (medium), `frameworksTools` (medium).

**Analytics**: `workPatterns` (small), `peerBenchmark` (medium).

**AI insights**: `aiInsights` (medium), `softSkills` (medium), `growthTrajectory` (medium), `taskMatcher` (medium).

**Tracking**: `trackingSummary` (medium), `standupStatus` (small), `blockersOverview` (medium), `timeTracking` (small).

**Sprints**: `sprintOverview` (large), `sprintBurndown` (medium), `upcomingDeadlines` (small).

**Tickets**: `ticketStats` (medium), `slaOverview` (medium), `recentTickets` (large), `ticketsByPriority` (medium).

**Forms**: `formSubmissions` (medium), `recentForms` (medium).

**Documentation**: `recentDocs` (medium), `docActivity` (small).

**Reviews**: `performanceReviews` (medium), `pendingReviews` (medium), `reviewCycle` (medium).

**Learning**: `learningPath` (medium), `skillGaps` (medium).

**Hiring**: `hiringPipeline` (large), `candidateStats` (medium), `openPositions` (medium), `interviewSchedule` (medium).

**CRM**: `crmPipeline` (large), `dealStats` (medium), `recentDeals` (medium), `crmQuickView` (small).

**Team**: `teamOverview` (large), `teamActivity` (medium).

**Admin**: `orgMetrics` (full), `systemHealth` (medium).

(The registry has duplicates of a few slugs across categories — `taskMatcher`, `quickStats` — because the same widget can carry multiple category tags.)

## 5. Predictions

`api/predictions.py:19` — prefix `/predictions`. LLM-backed risk models.

```
GET  /predictions/attrition/{developer_id}            (28-64)
GET  /predictions/burnout/{developer_id}              (67-102)
GET  /predictions/trajectory/{developer_id}           performance trajectory (105-140)
POST /predictions/team-health                         team-level (143-183)
GET  /predictions/insights/{developer_id}             cached results (186-201)
POST /predictions/insights/refresh/{developer_id}     force recompute (204-250)
DELETE /predictions/insights/{developer_id}           clear cache (253-264)
```

### Service & prompts

`PredictiveAnalyticsService` (`services/predictive_analytics.py:41-45`) takes an `llm_gateway` in its constructor. Four LLM prompts imported from `llm/prompts.py:12-21`:

- `ATTRITION_RISK_SYSTEM_PROMPT` + `ATTRITION_RISK_PROMPT`
- `BURNOUT_RISK_SYSTEM_PROMPT` + `BURNOUT_RISK_PROMPT`
- `PERFORMANCE_TRAJECTORY_SYSTEM_PROMPT` + `PERFORMANCE_TRAJECTORY_PROMPT`
- `TEAM_HEALTH_SYSTEM_PROMPT` + `TEAM_HEALTH_PROMPT`

### `PredictiveInsight` cache (`models/analytics.py:183-241`)

| Field | Note |
|---|---|
| `developer_id`, `team_id` (nullable) | Scope |
| `insight_type` | `attrition_risk` / `performance_trajectory` / `burnout_risk` / `team_health` |
| `risk_score` | 0.0-1.0 |
| `confidence` | 0.0-1.0 |
| `risk_level` | `low` / `moderate` / `high` / `critical` |
| `factors` (JSONB list) | `[{factor, weight, evidence, trend}, ...]` |
| `recommendations` (JSONB list) | Action suggestions |
| `raw_analysis` (JSONB) | Full LLM response payload |
| `data_window_days` | Period analyzed |
| `generated_by_model` | Model version |
| `generated_at`, `expires_at` | Cache TTL |

`GET /predictions/insights/{id}` returns the cached row if non-expired; `POST .../refresh/{id}` forces a fresh LLM call.

## 6. Intelligence

`api/intelligence.py:23` — prefix `/intelligence`, tag `intelligence`. The deepest analytical surface, broken into five groups:

### Developer intelligence (11 endpoints)

```
POST /intelligence/commits/analyze                    semantic commit analysis (163-195)
GET  /intelligence/commits/distribution               type distribution (198-213)
GET  /intelligence/burnout                            risk assessment (216-245)
POST /intelligence/burnout/update                     persist indicators (248-271)
GET  /intelligence/expertise                          profile with confidence (274-300)
POST /intelligence/expertise/update                   store profile (303-323)
GET  /intelligence/reviews/quality                    review quality stats (326-350)
POST /intelligence/reviews/analyze                    batch review analysis (353-373)
GET  /intelligence/reviews/response-time              turnaround stats (376-391)
POST /intelligence/analyze-all                        full suite (399-456)
```

### Team intelligence (2 endpoints)

```
GET  /intelligence/team/{workspace_id}/burnout                       team overview (464-493)
GET  /intelligence/team/{workspace_id}/expertise/{skill_name}        cross-team comparison (496-525)
```

### Collaboration network (3 endpoints)

```
GET  /intelligence/collaborators                                     individual profile (533-563)
GET  /intelligence/team/{workspace_id}/collaboration                 team cohesion (566-607)
GET  /intelligence/team/{workspace_id}/collaboration/graph           full network (610-647)
```

### Complexity analysis (4 endpoints)

```
GET  /intelligence/complexity                                        per-developer (655-677)
POST /intelligence/complexity/update                                 (680-697)
POST /intelligence/complexity/analyze                                batch PRs (700-720)
GET  /intelligence/team/{workspace_id}/complexity                    team summary (723-754)
```

### Technology evolution (3 endpoints)

```
GET  /intelligence/technology                                        (762-784)
POST /intelligence/technology/update                                 (787-804)
GET  /intelligence/team/{workspace_id}/technology                    (807-839)
```

### Analyzer services

Each intelligence endpoint delegates to a focused service under `backend/src/aexy/services/`:

| Service | File | Output shape |
|---|---|---|
| **CommitAnalyzer** | `commit_analyzer.py:25-48` | `{commits_analyzed, type_distribution, top_tags, average_quality_score, breaking_changes_count}` — types: feat/fix/refactor/chore/docs/test/style/perf/build/ci/revert |
| **ReviewQualityAnalyzer** | `review_quality_analyzer.py:24-50` | `{total_reviews, average_depth_score, thoroughness_distribution, review_rate, reviews_per_week, top_mentoring_behaviors, mentoring_score}` |
| **ExpertiseConfidenceAnalyzer** | `expertise_confidence.py:38-55` | `SkillWithConfidence[]` — `{name, proficiency 0-100, confidence 0-1, recency_factor, depth: novice/intermediate/advanced/expert, context: production/personal/learning, commit_count, lines_of_code, last_activity_at}`. 180-day recency half-life. |
| **BurnoutDetector** | `burnout_detector.py:40-50` | `{risk_score, risk_level, indicators, alerts, trend}` from after-hours %, weekend %, consecutive active days, days since break, PR quality decline, daily commit volume |
| **CollaborationNetworkAnalyzer** | `collaboration_network.py:28-50` | `CollaborationEdge[]` — `{developer_a_id, developer_b_id, interaction_count, review_count, co_author_count, strength_score, interaction_types[], last_interaction_at}` |
| **ComplexityClassifier** | `complexity_classifier.py:26-47` | `{total_prs_analyzed, complexity_distribution, primary_categories[], common_components[], common_layers[], avg_files_per_pr, avg_complexity_score, cross_cutting_ratio, infrastructure_ratio, handles_critical_changes, avg_review_effort}`. Categories: feature/bugfix/refactor/documentation/infrastructure/configuration/dependency/test/security/performance. Levels: trivial/simple/moderate/complex/critical. |
| **TechnologyTracker** | `technology_tracker.py:25-50` | `{technologies[], current_count, outdated_count, deprecated_count, adoption_score, upgrade_suggestions[]}` — tracks framework/library versions, status (current/recent/outdated/deprecated) |

For the foundational ingestion side, see [GITHUB_INTELLIGENCE_SYSTEM.md](./GITHUB_INTELLIGENCE_SYSTEM.md).

## Snapshot generation

`auto_generate_snapshots` Temporal activity (`temporal/activities/insights.py:88-189`):

- **Cadence**: 24h schedule `auto-generate-snapshots` in `temporal/schedules.py:328-335`
- **Input**: `AutoGenerateSnapshotsInput` (empty)
- **Frequency mapping** (`insights.py:19-24`): `daily=1d`, `weekly=7d`, `biweekly=14d`, `monthly=30d`
- **Period boundaries** (`insights.py:27-68`):
  - `daily` — yesterday 00:00 to yesterday 23:59
  - `weekly` — last Monday → Sunday
  - `biweekly` — two weeks ago
  - `monthly` — first day of last month
- **Process** (`insights.py:108-167`):
  1. For each workspace with `InsightSettings.auto_generate_snapshots = True` — fetch member IDs
  2. Call `DeveloperInsightsService.save_developer_snapshot()` per developer (computes all five JSONB categories)
  3. Call `save_team_snapshot()` if team size > 1
  4. Commit
- **Output**: `{workspaces_processed, snapshots_generated}`

The same `DeveloperMetricsSnapshot` rows back every Developer Insights endpoint, every Analytics rollup, every Reports widget, and feed into Predictions as features.

## Reports rendering

Custom report export is dispatched as Temporal activities (PDF render, CSV/XLSX export, S3 upload). `ExportJob.status` tracks progress; the frontend polls `GET /reports/exports/{id}` until `completed`, then surfaces `file_path` for download.

`ScheduledReport.next_run_at` is consulted by a periodic Temporal schedule that fires at `time_utc` and runs the same export pipeline followed by the configured `delivery_method`.

## Frontend

| Route | Purpose |
|---|---|
| `/dashboard` | Persona-composed widgets |
| `/analytics/...` | Skill heatmaps, productivity trends, workload, collaboration |
| `/insights/...` | The 5-category developer view + leaderboards + comparisons |
| `/reports/...` | Report builder, templates, scheduled delivery |

## Common pitfalls

- **`DeveloperMetricsSnapshot` lag**. Daily snapshots are written by `auto-generate-snapshots`. Queries in the first hour of UTC may see yesterday's view. Don't surface "today" tiles unless you've taken on the freshness work.
- **Persona preset overwrites personalizations**. Switching from `manager` to `developer` clobbers `visible_widgets`/`widget_order`. Save off the user's `widget_sizes`/`widget_order` before swapping or warn them.
- **`PredictiveInsight` cache eats fresh data**. TTL is generous (multi-day). If the underlying activity shifted (return from PTO, sprint completion), force a refresh — don't just GET.
- **Two "burnout" endpoints**. `/predictions/burnout/{id}` is multi-signal + LLM; `/intelligence/burnout` is GitHub-only stats. They won't agree. Document which one the UI surfaces; don't expose both side-by-side.
- **Custom report `widgets` JSONB has no enforced schema**. Bad widget configs silently render nothing instead of erroring. Validate the shape in the service layer before persisting.
- **`ExportJob` doesn't expire S3 objects** — only the row. Large exports linger in storage. Add a bucket lifecycle policy on the export prefix or sweep on a Temporal schedule.
- **Stale team/developer references in scheduled reports**. `filters.team_ids` / `filters.developer_ids` can outlive the underlying rows. The report runs and silently drops missing IDs. Validate filter refs when loading the editor.
- **Snapshot generation is one-shot per period**. If you backfill data after the daily run, the snapshot won't auto-recompute. Trigger `POST /snapshots/generate` for the affected window.
- **Intelligence analyzers don't share a cache**. Re-calling `/intelligence/expertise` for the same developer hits the database every time. For dashboards, dispatch `POST /intelligence/analyze-all` once and read from the persisted profile.
- **`focus_score` semantics**. Higher = more concentrated on one repo, which can mean either "expert with deep focus" or "siloed." Pair it with `cross_team_pr_ratio` before drawing conclusions.
- **Recency half-life is 180 days** for `ExpertiseConfidenceAnalyzer`. Skills go from "expert" to "intermediate" in 6 months of dormancy. If your workspace tracks long-tail skills (e.g. yearly compliance work), expect surprises.
