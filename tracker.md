# Gitraki Implementation Tracker

**Project:** GitHub-Based Developer Profiling & Analytics Platform
**Last Updated:** December 2024
**Status:** Phase 2 Complete

---

## Overview

This document tracks the implementation progress of Gitraki across all four phases.

**Legend:**
- [ ] Not Started
- [~] In Progress
- [x] Completed
- [!] Blocked

**Tech Stack:**
- Backend: Python/FastAPI, SQLAlchemy, PostgreSQL
- Frontend: Next.js 14, React, TypeScript, TailwindCSS
- Testing: pytest (TDD), Vitest

---

## Phase 1: Foundation

### Milestone 1.1: Data Pipeline

| Task | Status | Notes |
|------|--------|-------|
| GitHub App registration | [x] | Config in `.env` with `repo`, `read:org`, `read:user` scopes |
| OAuth flow implementation | [x] | `api/auth.py` - Full OAuth2 flow with JWT |
| Webhook subscriptions setup | [x] | `api/webhooks.py` - push, pull_request, pull_request_review, issues |
| Event ingestion pipeline | [x] | `services/ingestion_service.py` - Commits, PRs, Reviews |
| Raw data storage (PostgreSQL) | [x] | `models/activity.py` - Commit, PullRequest, CodeReview models |
| Basic ETL pipeline | [x] | `services/profile_sync.py` - Transform events to profiles |

### Milestone 1.2: Profile MVP

| Task | Status | Notes |
|------|--------|-------|
| Language detection | [x] | `ProfileAnalyzer.detect_language_from_extension()` - 20+ languages |
| Framework detection | [x] | `ProfileAnalyzer.detect_frameworks()` - FastAPI, React, Django, etc. |
| Commit analysis | [x] | `ProfileAnalyzer.analyze_commits()` - language/line counting |
| PR metrics | [x] | `IngestionService.ingest_pull_request()` - Full PR storage |
| Code review activity tracking | [x] | `IngestionService.ingest_review()` - Full review storage |
| Basic developer profile UI | [x] | `frontend/src/app/dashboard/page.tsx` - Profile dashboard |
| Team profiles view (manager) | [x] | `api/teams.py` + `services/team_service.py` - Full team analytics |

### Phase 1 Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| GitHub accounts connected | 80% of target users | — |
| Profile accuracy rating | 3.5+/5 by developers | — |
| System uptime | > 99.5% | — |

---

## Phase 2: Intelligence

### Milestone 2.0: LLM Infrastructure (NEW)

| Task | Status | Notes |
|------|--------|-------|
| LLM abstraction layer | [x] | `llm/base.py`, `llm/gateway.py` - Provider-agnostic interface |
| Claude provider | [x] | `llm/claude_provider.py` - Anthropic API integration |
| Ollama provider (OSS) | [x] | `llm/ollama_provider.py` - Llama, Mistral, CodeLlama support |
| Analysis cache | [x] | `cache/analysis_cache.py` - Redis + in-memory fallback |
| LLM configuration | [x] | `core/config.py` - LLMSettings with provider switching |
| Prompt templates | [x] | `llm/prompts.py` - Code, PR, review, task analysis |

### Milestone 2.1: Skill Analysis

| Task | Status | Notes |
|------|--------|-------|
| NLP-based skill extraction | [x] | `services/code_analyzer.py` - LLM-powered code analysis |
| Proficiency scoring algorithm (v1) | [x] | `calculate_proficiency_score()` - 0-100 based on activity |
| Domain knowledge classification | [x] | `detect_domains()` + LLM enhancement |
| Soft skills indicators | [x] | `services/soft_skills_analyzer.py` - Communication, mentorship, collaboration, leadership |
| Peer benchmarking | [x] | `services/peer_benchmarking.py` + `PeerBenchmarkCard.tsx` |
| Growth trajectory analysis | [x] | `build_growth_trajectory()` - skills acquired/declining |

### Milestone 2.2: Task Matching

| Task | Status | Notes |
|------|--------|-------|
| Jira integration | [x] | `services/task_sources/jira.py` - REST API with JQL queries |
| Linear integration | [x] | `services/task_sources/linear.py` - GraphQL API |
| GitHub Issues integration | [x] | `services/task_sources/github_issues.py` - REST API |
| Task source abstraction | [x] | `services/task_sources/base.py` - Unified TaskItem model |
| Task signal extraction (NLP) | [x] | `services/task_matcher.py` - LLM-powered signal extraction |
| Match scoring algorithm (v1) | [x] | `services/task_matcher.py` - LLM-based matching with weights |
| Sprint planning interface | [x] | `frontend/src/app/sprint-planning/page.tsx` - Drag-and-drop UI |
| Bulk assignment feature | [x] | `TaskMatcher.bulk_match()` + `optimize_assignments()` |
| What-if analysis | [x] | `services/whatif_analyzer.py` + API endpoints |

### Milestone 2.3: Analysis APIs (NEW)

| Task | Status | Notes |
|------|--------|-------|
| Code analysis endpoint | [x] | `POST /analysis/code` |
| Developer insights endpoint | [x] | `GET /analysis/developers/{id}/insights` |
| Task matching endpoint | [x] | `POST /analysis/match/task` |
| Soft skills endpoint | [x] | `GET /analysis/developers/{id}/soft-skills` |
| Admin processing status | [x] | `GET /admin/processing/status` |
| Admin LLM usage stats | [x] | `GET /admin/llm/usage` |
| Cache management | [x] | `POST /admin/cache/clear` |

### Phase 2 Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| Task matching adoption | 50%+ of sprint assignments | — |
| Manager NPS | > 30 | — |
| Task reassignment reduction | 15% | — |

---

## Phase 3: Career

### Milestone 3.1: Learning Paths

| Task | Status | Notes |
|------|--------|-------|
| Individual dashboard | [x] | Basic profile view in `dashboard/page.tsx` |
| Target role definition | [ ] | Next level, lateral move, specialization |
| Gap analysis engine | [ ] | Current vs target role skills |
| Learning recommendation engine | [ ] | Personalized course/task suggestions |
| Progress tracking automation | [ ] | Auto-detect skill improvements |
| Milestone tracking | [ ] | On-track, ahead, behind indicators |
| Stretch assignment matching | [ ] | Surface growth opportunities |

### Milestone 3.2: Hiring Intelligence

| Task | Status | Notes |
|------|--------|-------|
| Team skill gap aggregation | [ ] | Identify underrepresented skills |
| Bus factor analysis | [ ] | Single-point-of-failure risks |
| Roadmap integration | [ ] | Map roadmap to required skills |
| Automated JD generation | [ ] | Must-have, nice-to-have skills |
| Interview rubric templates | [ ] | Skill-specific assessment |
| Candidate comparison scoring | [ ] | Standardized scoring |

### Phase 3 Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| Active learning paths | 40% of developers | — |
| Hires using generated requirements | 3+ | — |
| Developer NPS | > 25 | — |

---

## Phase 4: Scale

### Milestone 4.1: Advanced Analytics

| Task | Status | Notes |
|------|--------|-------|
| Custom report builder | [ ] | Drag-and-drop metrics |
| Team skill heatmap | [ ] | Depth indicators, gaps, redundancies |
| Organizational capability dashboard | [ ] | Org-wide skill inventory |
| Productivity insights | [ ] | Velocity trends, code quality metrics |
| Health indicators | [ ] | Workload equity, collaboration network |
| Attrition risk prediction | [ ] | Predictive analytics |
| Performance trajectory | [ ] | Predictive modeling |
| Scheduled reports | [ ] | Weekly, monthly, quarterly |

### Milestone 4.2: Ecosystem

| Task | Status | Notes |
|------|--------|-------|
| IDE extension | [ ] | In-context insights |
| Slack bot | [ ] | Recommendations via Slack |
| Public API | [~] | REST API in `backend/src/gitraki/api/` |
| Manager CLI tool | [ ] | Command-line interface |
| Export functionality | [ ] | PDF, CSV, API delivery |

### Phase 4 Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| Task completion time (matched) | 20% faster | — |
| Skill gap identification accuracy | 85% correlation | — |
| Developer satisfaction (NPS) | +15 points | — |
| Time to productive hire | -30% | — |
| Career plan adoption | 60% of developers | — |
| Enterprise customers | 2+ in production | — |

---

## Technical Infrastructure

### Core Services

| Component | Status | Notes |
|-----------|--------|-------|
| API Gateway | [x] | FastAPI app in `main.py` with CORS |
| Profile Engine | [x] | `ProfileAnalyzer` in `services/profile_analyzer.py` |
| LLM Enhanced Profile Engine | [x] | `LLMEnhancedProfileAnalyzer` with LLM integration |
| Task Matcher | [x] | `services/task_matcher.py` - Matching, scoring, allocation |
| Learning Recommender | [ ] | Path generation, progress tracking |

### Processing Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| Celery Queue | [x] | `processing/celery_app.py` - Background job processing |
| Processing Tasks | [x] | `processing/tasks.py` - Commit, PR, developer analysis |
| Batch Scheduler | [x] | `processing/scheduler.py` - APScheduler nightly batch at 2 AM UTC |
| Analysis Cache | [x] | `cache/analysis_cache.py` - Redis + in-memory fallback |

### Data Platform

| Component | Status | Notes |
|-----------|--------|-------|
| Raw Data Lake (S3/GCS) | [ ] | 90 days retention |
| Feature Store (Redis/Feast) | [ ] | Real-time features |
| Analytics Warehouse (Snowflake/BigQuery) | [ ] | 3 years retention |
| PostgreSQL Database | [x] | Models in `models/` with SQLAlchemy |

### Security & Compliance

| Task | Status | Notes |
|------|--------|-------|
| SSO integration (SAML/OIDC) | [~] | GitHub OAuth implemented |
| Role-based access control | [~] | JWT-based auth, team-level pending |
| Encryption at rest (AES-256) | [ ] | Required |
| Encryption in transit (TLS 1.3) | [ ] | Required |
| GDPR/CCPA compliance | [ ] | Export, deletion, consent |
| Privacy opt-out capability | [ ] | Individual developer control |
| Anonymization for comparisons | [ ] | Cross-team data |

### Performance Targets

| Operation | Target | Current |
|-----------|--------|---------|
| Profile fetch | < 200ms | — |
| Task-match query | < 500ms | — |
| Bulk assignment (50 tasks) | < 5s | — |
| Analytics query | < 2s | — |
| Profile rebuild | < 30 min | — |

---

## User Stories Tracking

### Engineering Manager Stories

| ID | Story | Status |
|----|-------|--------|
| EM-1 | See best-suited developers for tasks | [ ] |
| EM-2 | Understand team skill gaps | [ ] |
| EM-3 | Identify burnout/disengagement risk | [ ] |
| EM-4 | Generate data-backed job requirements | [ ] |

### Developer Stories

| ID | Story | Status |
|----|-------|--------|
| DEV-1 | View skill profile vs career goals | [~] | Basic profile view done |
| DEV-2 | Receive personalized learning recommendations | [ ] |
| DEV-3 | Opt out of analytics (privacy) | [ ] |
| DEV-4 | Discover stretch assignments | [ ] |

### Technical Lead Stories

| ID | Story | Status |
|----|-------|--------|
| TL-1 | Identify right reviewer for PRs | [ ] |
| TL-2 | Understand code ownership patterns | [ ] |

### HR/Talent Stories

| ID | Story | Status |
|----|-------|--------|
| HR-1 | Generate skill-specific interview rubrics | [ ] |
| HR-2 | Track org-wide skill development | [ ] |

---

## Test Coverage (TDD)

| Test Suite | Tests | Status |
|------------|-------|--------|
| `test_profile_analyzer.py` | 25+ tests | [x] Language, framework, domain detection |
| `test_developer_service.py` | 20+ tests | [x] CRUD, GitHub connection |
| `test_github_service.py` | 15+ tests | [x] OAuth, API calls (mocked) |
| `test_webhook_handler.py` | 20+ tests | [x] Signature verify, event parsing, handling |
| `test_ingestion_service.py` | 25+ tests | [x] Commit, PR, Review ingestion |
| `test_profile_sync.py` | 20+ tests | [x] Profile sync, language aggregation, growth |
| `test_team_service.py` | 15+ tests | [x] Team skills, bus factor, velocity |
| `test_api_health.py` | 2 tests | [x] Health/ready endpoints |
| `test_api_developers.py` | 10+ tests | [x] Developer API endpoints |

**Total: 150+ TDD tests**

---

## Project Structure

```
gitraki/
├── backend/
│   ├── src/gitraki/
│   │   ├── api/           # FastAPI routes (auth, developers, analysis, admin)
│   │   ├── cache/         # Analysis caching (Redis + in-memory)
│   │   ├── core/          # Config, database, settings
│   │   ├── llm/           # LLM abstraction layer (Claude, Ollama)
│   │   ├── models/        # SQLAlchemy models
│   │   ├── processing/    # Celery tasks, queue, scheduler
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   │   └── task_sources/  # Jira, Linear, GitHub Issues
│   │   └── main.py        # App entry point
│   ├── tests/
│   │   ├── unit/          # Unit tests
│   │   └── integration/   # API tests
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/           # Next.js pages
│   │   ├── components/    # React components (insights, soft skills, task matcher)
│   │   ├── hooks/         # Custom hooks
│   │   └── lib/           # API client
│   └── package.json
├── prds/                  # Product requirements
└── tracker.md             # This file
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Status |
|------|------------|--------|------------|--------|
| Developer privacy concerns | High | High | Opt-out, transparency, anonymization | [~] |
| Gaming behavior | Medium | Medium | Multi-signal triangulation, anomaly detection | [ ] |
| GitHub data access restrictions | Medium | High | Multi-SCM roadmap (GitLab, Bitbucket) | [ ] |
| Skill inference accuracy | Medium | Medium | Human-in-the-loop, confidence scores | [~] |
| Manager over-reliance | Low | Medium | Recommendations as suggestions | [ ] |
| Data freshness | Low | Medium | Real-time webhooks, staleness indicators | [ ] |

---

## Open Questions

- [ ] How to handle developers with limited public GitHub activity?
- [ ] Should we incorporate non-code signals (docs, Slack)?
- [ ] Balance between automation and human judgment?
- [ ] Skill assessment for emerging technologies?

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| Dec 2024 | Initial tracker created | — |
| Dec 2024 | Phase 1 implementation started: Backend (FastAPI), Frontend (Next.js), TDD tests | — |
| Dec 2024 | OAuth flow, ProfileAnalyzer, DeveloperService, API endpoints implemented | — |
| Dec 2024 | WebhookHandler, IngestionService, ProfileSyncService implemented (TDD) | — |
| Dec 2024 | TeamService with bus factor, velocity, skill aggregation (TDD) | — |
| Dec 2024 | **Phase 1 Complete**: 150+ TDD tests, full data pipeline, profile sync, team analytics | — |
| Dec 2024 | **Phase 2 LLM Integration**: Switchable provider architecture (Claude + Ollama OSS) | — |
| Dec 2024 | LLM abstraction layer, caching infrastructure, prompt templates | — |
| Dec 2024 | CodeAnalyzer, SoftSkillsAnalyzer, TaskMatcher services | — |
| Dec 2024 | Analysis and Admin API endpoints for LLM-powered insights | — |
| Dec 2024 | Celery processing infrastructure (queue, tasks, scheduler) | — |
| Dec 2024 | Task source integrations: Jira, Linear, GitHub Issues | — |
| Dec 2024 | Frontend: AI insights, soft skills, growth trajectory, task matching UI | — |
| Dec 2024 | Sprint Planning interface with drag-and-drop | — |
| Dec 2024 | What-if analysis service for simulating assignments | — |
| Dec 2024 | Peer benchmarking service and UI component | — |
| Dec 2024 | **Phase 2 Complete**: Full LLM integration with switchable providers | — |
