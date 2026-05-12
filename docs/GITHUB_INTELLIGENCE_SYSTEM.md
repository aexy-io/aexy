# GitHub Intelligence System

> Technical Documentation & Improvement Plan

## Overview

The GitHub Intelligence System is Aexy's core engine for understanding developer capabilities, tracking growth, and intelligently matching developers to tasks. It ingests GitHub activity via webhooks, builds comprehensive developer profiles, and uses both pattern-matching algorithms and LLM analysis for deep insights.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GitHub Repository                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GitHub Webhooks                                  │
│  Events: push, pull_request, pull_request_review, issues                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      POST /webhooks/github                               │
│  ├── Signature Verification (HMAC-SHA256)                               │
│  ├── Event Parsing (X-GitHub-Event header)                              │
│  └── Event Routing                                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌─────────┐    ┌─────────┐    ┌─────────┐
              │ Commits │    │   PRs   │    │ Reviews │
              └────┬────┘    └────┬────┘    └────┬────┘
                   │              │              │
                   └──────────────┼──────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Ingestion Service                                  │
│  ├── Language Detection (file extensions)                               │
│  ├── Skill Extraction (PR titles/descriptions)                          │
│  ├── Developer Creation/Lookup                                          │
│  └── Activity Storage (Commit, PullRequest, CodeReview models)          │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌───────────────────────────────┐  ┌───────────────────────────────────────┐
│    Task Reference Parser      │  │         Profile Sync Service          │
│  ├── #123 (GitHub Issues)     │  │  ├── Aggregate Languages             │
│  ├── PROJ-456 (Jira)          │  │  ├── Detect Frameworks               │
│  └── Linear: xyz              │  │  ├── Aggregate Domains               │
│           │                   │  │  ├── Analyze Work Patterns           │
│           ▼                   │  │  └── Calculate Growth Trajectory     │
│  Link to SprintTask           │  └───────────────────────────────────────┘
└───────────────────────────────┘                    │
                                                     ▼
                                  ┌───────────────────────────────────────┐
                                  │      LLM Enhancement (Optional)       │
                                  │  ├── Deep Code Analysis               │
                                  │  ├── Soft Skills Analysis             │
                                  │  └── Result Merging                   │
                                  └───────────────────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Developer Model                                   │
│  ├── skill_fingerprint (JSONB)                                          │
│  ├── work_patterns (JSONB)                                              │
│  ├── growth_trajectory (JSONB)                                          │
│  └── last_llm_analysis_at                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Task Matcher                                     │
│  ├── Extract Task Signals                                               │
│  ├── Score Developers                                                   │
│  ├── Rank Candidates                                                    │
│  └── Generate Recommendations                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Current Implementation

### 1. Webhook Reception

**File:** `backend/src/aexy/api/webhooks.py`

**Security:**
- HMAC-SHA256 signature verification
- Validates `X-Hub-Signature-256` header
- Dev mode fallback for testing

**Supported Events:**
| Event | Actions Processed |
|-------|------------------|
| `push` | All (commits) |
| `pull_request` | opened, closed, synchronize, reopened, edited |
| `pull_request_review` | submitted, edited, dismissed |
| `issues` | opened, closed, reopened, edited |

### 2. Data Ingestion

**File:** `backend/src/aexy/services/ingestion_service.py`

**Commit Processing:**
```python
# Data extracted per commit
{
    "sha": "abc123...",
    "message": "feat: add user auth",
    "repository": "org/repo",
    "additions": 150,
    "deletions": 30,
    "files_changed": 5,
    "languages": ["python", "typescript"],
    "file_types": [".py", ".ts", ".tsx"],
    "committed_at": "2024-01-15T10:30:00Z"
}
```

**PR Processing:**
```python
# Data extracted per PR
{
    "github_id": 12345,
    "title": "Add OAuth integration",
    "description": "Implements GitHub OAuth...",
    "state": "merged",
    "additions": 500,
    "deletions": 100,
    "commits_count": 8,
    "comments_count": 12,
    "detected_skills": ["oauth", "authentication", "security"],
    "created_at_github": "...",
    "merged_at": "..."
}
```

### 3. Language Detection

**File:** `backend/src/aexy/services/profile_analyzer.py`

**Supported Languages (28):**
```
Python, JavaScript, TypeScript, Go, Rust, Java, Kotlin, Ruby, PHP,
C#, C++, C, Swift, Scala, Elixir, Haskell, Clojure, R, Julia,
Dart, Lua, Shell, SQL, HTML, CSS, YAML, JSON, Markdown
```

**Detection Method:**
- File extension mapping (`.py` → Python, `.ts` → TypeScript)
- Counts occurrences across commits
- Calculates proficiency scores

### 4. Proficiency Scoring

**Algorithm:**
```
score = (commit_ratio × 0.6 + lines_ratio × 0.4) × 100 + bonus

Where:
  commit_ratio = commits_in_language / total_commits
  lines_ratio  = lines_in_language / total_lines
  bonus        = min(10, commits_in_language / 10)
  final_score  = min(100, score)
```

**Example:**
- Developer has 200 total commits
- 80 commits in Python (40% ratio)
- 15,000 lines in Python out of 30,000 total (50% ratio)
- Score = (0.4 × 0.6 + 0.5 × 0.4) × 100 + 8 = 52 proficiency

### 5. Framework Detection

**File:** `backend/src/aexy/services/profile_analyzer.py`

**Detection Methods:**
1. **File Type Mapping:**
   - `.tsx` → React
   - `.vue` → Vue
   - `.svelte` → Svelte

2. **Keyword Matching:**
   - Commit messages containing "fastapi", "django", "react", etc.

3. **Dependency Files:**
   - `requirements.txt`, `package.json`, `Cargo.toml`

**Categories:**
| Category | Frameworks |
|----------|------------|
| Web | React, Vue, Angular, Next.js, Svelte |
| API | FastAPI, Django, Express, NestJS, Spring |
| Data | Pandas, NumPy, TensorFlow, PyTorch |
| DevOps | Docker, Kubernetes, Terraform |
| Testing | Jest, Pytest, Cypress |

### 6. Domain Detection

**Domains Detected:**
- Frontend, Backend, Mobile
- Payments, Authentication, Security
- Data Pipeline, ML/Infrastructure
- DevOps, Testing

**Method:** Keyword matching in PR titles, descriptions, and commit messages.

### 7. Work Patterns Analysis

**Metrics Calculated:**
```python
work_patterns = {
    "preferred_complexity": "simple|medium|complex",  # Based on avg PR size
    "collaboration_style": "solo|balanced|collaborative",  # reviews/PRs ratio
    "peak_productivity_hours": [9, 10, 14],  # Top 3 hours
    "average_pr_size": 250,  # additions + deletions
    "average_review_turnaround_hours": 4.5
}
```

**Complexity Thresholds:**
- Simple: avg < 150 LOC
- Medium: 150-500 LOC
- Complex: > 500 LOC

### 8. Growth Trajectory

**Tracking:**
```python
growth_trajectory = {
    "skills_acquired_6m": ["rust", "kubernetes"],
    "skills_acquired_12m": ["go", "terraform"],
    "skills_declining": ["php"],
    "learning_velocity": 0.5  # skills per month
}
```

**Trend Detection:**
```
if recent > 0 and old == 0: "growing"
if recent == 0 and old > 0: "declining"
if recent > old: "growing"
if recent < old * 0.5: "declining"
else: "stable"
```

### 9. LLM Enhancement

**File:** `backend/src/aexy/services/profile_analyzer.py` (LLMEnhancedProfileAnalyzer)

**Capabilities:**
1. **Deep Code Analysis** - Understand code semantics beyond file extensions
2. **Soft Skills Analysis** - Analyze PR descriptions and review comments
3. **Result Merging** - Combine pattern matching with LLM insights

**Soft Skills Scoring:**
```python
soft_skills = {
    "communication_score": 0.85,     # 30% weight
    "collaboration_score": 0.78,     # 30% weight
    "mentorship_score": 0.65,        # 20% weight
    "leadership_score": 0.72         # 20% weight
}
```

### 10. Task Matching

**File:** `backend/src/aexy/services/task_matcher.py`

**Matching Weights:**
| Factor | Weight |
|--------|--------|
| Skill Fit | 35% |
| Experience Fit | 25% |
| Availability | 15% |
| Growth Opportunity | 15% |
| Team Dynamics | 10% |

**Process:**
1. Extract task signals (skills, complexity, domain) via LLM
2. Score each developer against signals
3. Rank by overall score
4. Generate recommendations

### 11. Task Reference Linking

**File:** `backend/src/aexy/services/github_task_sync_service.py`

**Supported Patterns:**
- `#123` - GitHub Issues
- `PROJ-456` - Jira format
- `Linear: xyz` - Linear references

**Auto Status Updates:**
- PR opened → Task `in_progress`
- PR merged → Task `done`
- Status progression only (no regression)

---

## Database Models

### Developer Model
```sql
developers:
  - id (UUID, PK)
  - email (unique)
  - name
  - skill_fingerprint (JSONB)
  - work_patterns (JSONB)
  - growth_trajectory (JSONB)
  - last_llm_analysis_at (timestamp)
```

### Activity Models
```sql
commits:
  - id, developer_id (FK)
  - sha (unique), repository, message
  - additions, deletions, files_changed
  - languages (JSON), file_types (JSON)
  - committed_at

pull_requests:
  - id, developer_id (FK)
  - github_id (unique), repository
  - title, description, state
  - additions, deletions, commits_count, comments_count
  - detected_skills (JSON)
  - created_at_github, merged_at, closed_at

code_reviews:
  - id, developer_id (FK)
  - github_id (unique), pull_request_github_id
  - state (approved/changes_requested/commented)
  - body, comments_count
  - submitted_at
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/github` | POST | Receive GitHub webhooks |
| `/webhooks/github/status` | GET | Webhook health status |
| `/developers/me` | GET | Current developer profile |
| `/developers/{id}` | GET | Developer by ID |
| `/developers/{id}/profile` | GET | Full profile with skills |
| `/developers/{id}/activity` | GET | Activity history |

---

## Improvement Plan

### Phase 1: Enhanced Data Collection

#### 1.1 Repository-Level Insights
**Priority:** High | **Effort:** Medium

**Current Gap:** We track commits but don't analyze repository context.

**Improvements:**
- [ ] Track repository metadata (stars, forks, contributors)
- [ ] Detect monorepo vs microservices patterns
- [ ] Identify owned vs contributed repositories
- [ ] Calculate repository complexity scores

**Implementation:**
```python
# New model
repository_insights:
  - id, developer_id
  - repository_name
  - ownership_level (owner/maintainer/contributor)
  - contribution_percentage
  - last_active_at
  - tech_stack (JSON)
```

#### 1.2 Issue & Discussion Tracking
**Priority:** Medium | **Effort:** Medium

**Current Gap:** Issues tracked but not deeply analyzed.

**Improvements:**
- [ ] Track issue creation, not just state changes
- [ ] Analyze issue quality (description completeness)
- [ ] Track issue resolution time
- [ ] Monitor discussion participation

#### 1.3 GitHub Actions & CI/CD
**Priority:** Medium | **Effort:** Low

**Current Gap:** No CI/CD activity tracking.

**Improvements:**
- [ ] Subscribe to `workflow_run` events
- [ ] Track pipeline success/failure rates
- [ ] Identify developers who fix CI issues
- [ ] Measure time-to-green metrics

---

### Phase 2: Improved Analysis Algorithms

#### 2.1 Code Quality Scoring
**Priority:** High | **Effort:** High

**Current Gap:** No code quality metrics beyond LOC.

**Improvements:**
- [ ] Integrate with CodeClimate/SonarQube APIs
- [ ] Track test coverage changes per PR
- [ ] Measure code complexity (cyclomatic)
- [ ] Detect code smell patterns

**New Metrics:**
```python
code_quality = {
    "test_coverage_avg": 78.5,
    "complexity_score": 15.2,
    "duplication_percentage": 3.4,
    "security_issues_introduced": 0,
    "technical_debt_hours": 12
}
```

#### 2.2 Semantic Commit Analysis ✅ IMPLEMENTED
**Priority:** High | **Effort:** Medium | **Status:** Complete (v0.5.0)

**Current Gap:** Commit messages analyzed for keywords only.

**Improvements:**
- [x] Use LLM to understand commit intent (feat/fix/refactor/chore)
- [x] Detect breaking changes from commit patterns
- [x] Identify documentation commits vs code commits
- [x] Score commit message quality

**Implementation:** `backend/src/aexy/services/commit_analyzer.py`
- `CommitAnalyzer` class with pattern matching + optional LLM analysis
- Conventional commit parsing with fallback to keyword detection
- Quality scoring based on message clarity and structure
- API: `POST /api/v1/intelligence/commits/analyze`

```python
commit_analysis = {
    "type": "feature",      # feat, fix, refactor, chore, docs, test
    "scope": "auth",        # Component affected
    "breaking": False,
    "quality_score": 85,    # Message clarity
    "semantic_tags": ["authentication", "security", "oauth"]
}
```

#### 2.3 PR Review Quality Analysis ✅ IMPLEMENTED
**Priority:** Medium | **Effort:** Medium | **Status:** Complete (v0.5.0)

**Current Gap:** Reviews counted but quality not measured.

**Improvements:**
- [x] Analyze review comment depth (superficial vs thorough)
- [ ] Track suggestion acceptance rate (requires PR comment tracking)
- [x] Measure review response time
- [x] Identify mentoring patterns in reviews

**Implementation:** `backend/src/aexy/services/review_quality_analyzer.py`
- `ReviewQualityAnalyzer` class with depth scoring (1-5 scale)
- Thoroughness classification: cursory, standard, detailed, exhaustive
- Mentoring pattern detection (explains_why, provides_examples, etc.)
- API: `GET /api/v1/intelligence/reviews/quality`
- API: `GET /api/v1/intelligence/reviews/response-time`

```python
review_quality = {
    "avg_comment_depth": 3.2,        # 1-5 scale
    "suggestion_acceptance_rate": 0.72,
    "avg_response_time_hours": 4.5,
    "mentoring_indicators": ["explains why", "provides examples"]
}
```

#### 2.4 Collaboration Network Analysis ✅ IMPLEMENTED
**Priority:** Medium | **Effort:** Medium | **Status:** Complete (v0.5.0)

**Current Gap:** No relationship mapping between developers.

**Improvements:**
- [x] Build collaboration graph from PR reviews
- [x] Identify key collaborators per developer
- [x] Detect knowledge silos (single points of failure)
- [x] Measure team cohesion scores

**Implementation:** `backend/src/aexy/services/collaboration_network.py`
- `CollaborationNetworkAnalyzer` class with graph-based analysis
- Collaboration strength scoring (frequency + recency weighted)
- Isolation detection for knowledge silos
- Team cohesion scoring with density metrics
- API: `GET /api/v1/intelligence/collaborators`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration/graph`

**Database:** `developer_collaborations` table created in migration
```python
collaboration_edge = {
    "source_developer_id": "...",
    "target_developer_id": "...",
    "interaction_count": 15,
    "collaboration_strength": 0.85,
    "last_interaction_at": "2026-01-15T10:30:00Z"
}
```

---

### Phase 3: Advanced Intelligence

#### 3.1 Expertise Confidence Intervals ✅ IMPLEMENTED
**Priority:** High | **Effort:** Medium | **Status:** Complete (v0.5.0)

**Current Gap:** Single proficiency score without confidence.

**Improvements:**
- [x] Add confidence intervals to skill scores
- [x] Factor in recency of activity
- [x] Weight production code higher than hobby projects
- [x] Distinguish between reading and writing proficiency (via context)

**Implementation:** `backend/src/aexy/services/expertise_confidence.py`
- `ExpertiseConfidenceAnalyzer` class with logarithmic proficiency scoring
- Confidence based on commit count, lines of code, and repo diversity
- Recency factor with exponential decay (180-day half-life)
- Context classification: production/personal/learning/unknown
- API: `GET /api/v1/intelligence/expertise`

```python
skill = {
    "name": "Python",
    "proficiency": 85,
    "confidence": 0.92,        # How sure we are
    "recency_factor": 0.95,    # Decay over time
    "depth": "expert",         # novice/intermediate/advanced/expert
    "context": "production"    # production/personal/learning
}
```

#### 3.2 Technology Evolution Tracking ✅ IMPLEMENTED
**Priority:** Medium | **Effort:** Low | **Status:** Complete (v0.5.0)

**Current Gap:** Skills detected but not version-aware.

**Improvements:**
- [x] Track framework versions (React 18 vs React 16)
- [x] Identify developers keeping up with updates
- [x] Flag deprecated technology usage
- [x] Suggest upgrade paths

**Implementation:** `backend/src/aexy/services/technology_tracker.py`
- `TechnologyTracker` class with version comparison
- Status levels: current, recent, outdated, deprecated
- Adoption score based on technology currency
- Automated upgrade suggestions with priority
- API: `GET /api/v1/intelligence/technology`
- API: `GET /api/v1/intelligence/team/{workspace_id}/technology`

```python
technology_profile = {
    "technologies": [
        {"name": "react", "version": "18.2", "status": "current"},
        {"name": "python", "version": "3.8", "status": "deprecated"}
    ],
    "adoption_score": 0.75,
    "upgrade_suggestions": [
        {"technology": "python", "current": "3.8", "suggested": "3.13", "priority": "high"}
    ]
}
```

#### 3.3 Project Complexity Classification ✅ IMPLEMENTED
**Priority:** Medium | **Effort:** Medium | **Status:** Complete (v0.5.0)

**Current Gap:** PR size used as complexity proxy.

**Improvements:**
- [x] Analyze file distribution (single file vs cross-cutting)
- [x] Detect architectural changes vs feature work
- [x] Identify infrastructure vs application changes
- [x] Score based on services/systems touched

**Implementation:** `backend/src/aexy/services/complexity_classifier.py`
- `ComplexityClassifier` class with layered architecture detection
- Complexity levels: trivial, simple, moderate, complex, critical
- Change categories: feature, bugfix, refactor, infrastructure, security, etc.
- Risk indicator identification (security files, migrations, cross-cutting)
- Review effort estimation based on complexity
- API: `GET /api/v1/intelligence/complexity`
- API: `POST /api/v1/intelligence/complexity/analyze`
- API: `GET /api/v1/intelligence/team/{workspace_id}/complexity`

```python
complexity_analysis = {
    "complexity_level": "moderate",
    "complexity_score": 45.0,
    "categories": ["feature", "infrastructure"],
    "is_cross_cutting": True,
    "touches_infrastructure": True,
    "risk_indicators": ["Database migrations (1)", "Cross-cutting changes (3 components)"],
    "estimated_review_effort": "high"
}
```

#### 3.4 Burnout Risk Indicators ✅ IMPLEMENTED
**Priority:** High | **Effort:** Medium | **Status:** Complete (v0.5.0)

**Current Gap:** Work patterns tracked but not analyzed for health.

**Improvements:**
- [x] Detect after-hours commit patterns
- [x] Track weekend work frequency
- [x] Measure PR review fatigue (declining quality over time)
- [x] Alert on sustained high activity

**Implementation:** `backend/src/aexy/services/burnout_detector.py`
- `BurnoutDetector` class with configurable thresholds
- Risk levels: low, moderate, high, critical
- Tracks: after-hours %, weekend %, consecutive high days, days since break
- Trend detection comparing current vs previous period
- API: `GET /api/v1/intelligence/burnout`
- API: `GET /api/v1/intelligence/team/{workspace_id}/burnout`

```python
burnout_risk = {
    "score": 0.65,            # 0-1 scale
    "indicators": [
        "50% commits outside business hours",
        "Review quality declined 20% this month",
        "No vacation detected in 6 months"
    ],
    "trend": "increasing"
}
```

---

### Phase 4: Integration Enhancements

#### 4.1 Multi-Platform Support
**Priority:** High | **Effort:** High

**Current Gap:** GitHub only.

**Improvements:**
- [ ] GitLab webhook support
- [ ] Bitbucket integration
- [ ] Azure DevOps support
- [ ] Unified activity model across platforms

#### 4.2 IDE Activity Integration
**Priority:** Medium | **Effort:** Medium

**Current Gap:** Only committed code tracked.

**Improvements:**
- [ ] VS Code extension sends coding activity
- [ ] Track time spent per file/project
- [ ] Measure debugging vs coding ratio
- [ ] Identify context-switching patterns

#### 4.3 Communication Platform Integration
**Priority:** Low | **Effort:** High

**Current Gap:** Soft skills from code only.

**Improvements:**
- [ ] Slack message analysis (with consent)
- [ ] Meeting participation metrics
- [ ] Documentation contribution tracking
- [ ] Support channel responsiveness

---

### Phase 5: Machine Learning Enhancements

#### 5.1 Skill Prediction Model
**Priority:** Medium | **Effort:** High

**Current Gap:** Skills detected from explicit evidence only.

**Improvements:**
- [ ] Train model to predict skills from related skills
- [ ] Infer skills from similar developer profiles
- [ ] Suggest likely skills to verify

#### 5.2 Task Success Prediction
**Priority:** High | **Effort:** High

**Current Gap:** Matching based on current skills only.

**Improvements:**
- [ ] Train on historical task assignments
- [ ] Predict completion time based on developer + task
- [ ] Identify risk factors before assignment
- [ ] Learn from successful/failed assignments

#### 5.3 Career Path Recommendation
**Priority:** Medium | **Effort:** Medium

**Current Gap:** Growth trajectory tracked but not guided.

**Improvements:**
- [ ] Analyze successful senior developers' paths
- [ ] Recommend next skills to learn
- [ ] Suggest stretch assignments for growth
- [ ] Personalized learning velocity predictions

---

## Implementation Priority Matrix

| Improvement | Priority | Effort | Impact | Phase |
|-------------|----------|--------|--------|-------|
| Code Quality Scoring | High | High | High | 2 |
| Semantic Commit Analysis | High | Medium | High | 2 |
| Expertise Confidence | High | Medium | High | 3 |
| Burnout Risk Indicators | High | Medium | High | 3 |
| Multi-Platform Support | High | High | High | 4 |
| Task Success Prediction | High | High | High | 5 |
| Repository Insights | High | Medium | Medium | 1 |
| PR Review Quality | Medium | Medium | Medium | 2 |
| Collaboration Network | Medium | Medium | Medium | 2 |
| Technology Evolution | Medium | Low | Medium | 3 |
| Project Complexity | Medium | Medium | Medium | 3 |
| IDE Activity | Medium | Medium | Medium | 4 |
| Issue Tracking | Medium | Medium | Low | 1 |
| GitHub Actions | Medium | Low | Low | 1 |
| Skill Prediction | Medium | High | Medium | 5 |
| Career Path | Medium | Medium | Medium | 5 |
| Communication Integration | Low | High | Medium | 4 |

---

## Technical Debt & Maintenance

### Current Issues
1. **Hardcoded Language List** - Add extensibility for new languages
2. **Synchronous Profile Sync** - Move to fully async Temporal activities
3. **No Incremental Analysis** - Re-analyzes all activity each time
4. **Limited Error Recovery** - Webhook failures not retried

### Recommended Fixes
- [ ] Create language/framework configuration file
- [ ] Implement delta analysis (only new activity)
- [ ] Add webhook retry queue with exponential backoff
- [ ] Implement analysis versioning for reproducibility

---

## Metrics & Monitoring

### KPIs to Track
| Metric | Current | Target |
|--------|---------|--------|
| Webhook processing time | ~200ms | <100ms |
| Profile sync time | ~2s | <500ms |
| LLM analysis accuracy | Unknown | >85% |
| Task match success rate | Unknown | >70% |
| Skill detection coverage | ~70% | >90% |

### Monitoring Additions
- [ ] Prometheus metrics for webhook latency
- [ ] Alert on high LLM error rates
- [ ] Dashboard for skill detection coverage
- [ ] Weekly analysis quality reports

---

## Appendix: File Locations

| Component | File Path |
|-----------|-----------|
| Webhook Handler | `backend/src/aexy/api/webhooks.py` |
| Ingestion Service | `backend/src/aexy/services/ingestion_service.py` |
| Profile Analyzer | `backend/src/aexy/services/profile_analyzer.py` |
| Profile Sync | `backend/src/aexy/services/profile_sync.py` |
| Task Matcher | `backend/src/aexy/services/task_matcher.py` |
| Code Analyzer | `backend/src/aexy/services/code_analyzer.py` |
| Soft Skills | `backend/src/aexy/services/soft_skills_analyzer.py` |
| GitHub Task Sync | `backend/src/aexy/services/github_task_sync_service.py` |
| LLM Gateway | `backend/src/aexy/llm/gateway.py` |
| Developer Model | `backend/src/aexy/models/developer.py` |
| Activity Models | `backend/src/aexy/models/activity.py` |
| Temporal Activities | `backend/src/aexy/temporal/activities/` |
| Temporal Workflows | `backend/src/aexy/temporal/workflows/` |
| Temporal Dispatch | `backend/src/aexy/temporal/dispatch.py` |
| **Intelligence API** | `backend/src/aexy/api/intelligence.py` |
| **Commit Analyzer** | `backend/src/aexy/services/commit_analyzer.py` |
| **Review Quality** | `backend/src/aexy/services/review_quality_analyzer.py` |
| **Expertise Confidence** | `backend/src/aexy/services/expertise_confidence.py` |
| **Burnout Detector** | `backend/src/aexy/services/burnout_detector.py` |
| **Collaboration Network** | `backend/src/aexy/services/collaboration_network.py` |
| **Complexity Classifier** | `backend/src/aexy/services/complexity_classifier.py` |
| **Technology Tracker** | `backend/src/aexy/services/technology_tracker.py` |
| **Intelligence Migration** | `backend/scripts/migrate_github_intelligence.sql` |

---

*Last Updated: January 29, 2026*
