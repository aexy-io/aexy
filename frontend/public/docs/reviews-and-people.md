# People: Reviews, Hiring & Learning

The three People modules — **Performance Reviews**, **Hiring**, **Learning & Development** — share a common substrate: they all use `Developer` as the subject, `LLMGateway` for AI summaries, and `WorkGoal`/`LearningPath` as the bridge between performance, growth, and headcount planning.

## Performance Reviews

A 360-degree review cycle: self → peer → manager → optional calibration, with LLM-synthesized summaries grounded in real GitHub activity.

### Router

`api/reviews.py:56` — prefix `/reviews`, tag `reviews`. Endpoints cover review cycles, individual reviews, submissions (self/peer/manager), peer requests, work goals, and contributions.

### Models (`models/review.py`)

**`ReviewCycle`** (`review.py:26`) — workspace-level cycle config.

| Field | Note |
|---|---|
| `workspace_id`, `name` | Scope |
| `phases` (JSONB) | `[{type: "self"/"peer"/"manager", start, end, deadline}]` |
| `settings` (JSONB) | `peer_selection_mode: "employee_choice"/"manager_assigned"/"both"`; anonymity defaults |
| `status` | Open / closed / archived |

**`IndividualReview`** (`review.py:110`) — one per developer per cycle.

| Field | Note |
|---|---|
| `cycle_id`, `developer_id` | Subject |
| `workflow_status` | `pending → peer_review_in_progress → manager_review_in_progress → completed → acknowledged` |
| `ai_summary` (line 183) | LLM-synthesized 3-4 paragraph summary written at `completed` |

**`ReviewSubmission`** (`review.py:230`) — one per reviewer per review.

| Field | Note |
|---|---|
| `review_id`, `submitter_id` | Subject |
| `submission_type` | `self` / `peer` / `manager` |
| Content uses the **COIN** framework | Context, Observation, Impact, Next Steps — structured JSONB |
| `anonymous_token` | Set for anonymous peer reviews |

**`ReviewRequest`** (`review.py:327`) — peer review assignments.

| Field | Note |
|---|---|
| `review_id`, `reviewer_id` | Who's being asked |
| `request_source` | `"employee"` (the subject chose them) or `"manager"` (manager assigned) |
| `assigned_by_id` | If manager-assigned, who |

**`WorkGoal`** (`review.py:423`) — SMART goals with OKR-style key results.

| Field | Note |
|---|---|
| `developer_id`, `cycle_id` | Subject |
| `key_results` (JSONB) | List of measurable outcomes |
| `tracking_keywords` (JSONB) | Used by the GitHub activity tracker to auto-link evidence |
| `learning_milestone_id` | Optional bridge into the Learning module |

**`ContributionSummary`** (`review.py:559`) — cached GitHub metrics that feed the AI summary.

| Field | Note |
|---|---|
| `developer_id`, `period_start`, `period_end` | Window |
| `commits`, `prs`, `code_reviews`, `languages` (JSONB), `skills_demonstrated` (JSONB) | The data |
| `ai_insights` | LLM commentary on the metrics |

### AI summary

`review_service.py:38` defines `REVIEW_SUMMARY_PROMPT`, which synthesizes self + peer + manager submissions + `ContributionSummary` into the final `IndividualReview.ai_summary`. Called via `self.llm_gateway.analyze()` when a review is marked `completed`. Output: 3-4 paragraph professional summary.

### Workflow

```
ReviewCycle.create
  ↓
For each developer:
    IndividualReview.pending
    ↓
    Self-review submitted   → workflow_status = "peer_review_in_progress"
    ↓
    Peer reviews collected  → workflow_status = "manager_review_in_progress"
    ↓
    Manager review submitted → workflow_status = "completed"
                            → ai_summary generated via LLM
    ↓
    Developer acknowledges  → workflow_status = "acknowledged"
```

Peer reviewers are assigned in one of three modes (`peer_selection_mode` in `ReviewCycle.settings`):

- `employee_choice` — subject picks; `ReviewRequest.request_source = "employee"`
- `manager_assigned` — manager assigns; `ReviewRequest.request_source = "manager"`, `assigned_by_id` recorded
- `both` — either path allowed

### Frontend

`/frontend/src/app/(app)/reviews/` — cycle management, goal tracking, progress dashboards.

## Hiring

End-to-end pipeline: gap analysis → JD generation → assessment → interview → offer.

### Router

`api/hiring.py:41` — prefix `/hiring`. Key endpoints:

```
GET  /team-gaps         analyze skill gaps in current team
GET  /bus-factor        identify single-point-of-failure risk
GET  /roadmap-skills    extract required skills from roadmap items
POST /generate-jd       LLM-generate a job description
POST /generate-rubric   LLM-generate an interview rubric
POST /score-candidate   LLM-score a candidate scorecard against requirements
```

`api/assessments.py`, `api/assessment_take.py`, `api/question_bank.py` cover the assessment platform.

### Models

**`HiringRequirement`** (`models/career.py:234`) — open role, auto-generated from team-gap analysis.

| Field | Note |
|---|---|
| `workspace_id`, `role_name` | Open role |
| `job_description` | LLM-generated |
| `interview_rubric` (JSONB) | `{skill: {questions: [], evaluation_criteria: []}}` |

**`HiringCandidate`** (`career.py:331`) — pipeline.

| Field | Note |
|---|---|
| `requirement_id` | The role |
| `stage` | `applied` → `screening` → `assessment` → `interview` → `offer` → `hired` |
| `assessment_invitation_id` | Links to the assessment they took |

**`Assessment`** (`models/assessment.py:87`) — the multi-step assessment platform.

| Field | Note |
|---|---|
| `workspace_id`, `name` | |
| `topics`, `questions` | Configuration |
| `proctoring_settings` (JSONB) | `{webcam, screen_recording, face_detection, tab_tracking}` |
| `security_settings` (JSONB) | `{shuffleQuestions, shuffleOptions, preventCopyPaste}` |

**`Question`** — `code`, `MCQ`, `subjective`, `pseudo_code`, `audio`. Stored in the question bank for re-use.

**`AssessmentInvitation`** — invites a candidate with a `public_token` for anonymous access. Status: `pending` → `sent` → `started` → `completed` → `expired`.

**`AssessmentAttempt`** — the take.

| Field | Note |
|---|---|
| `invitation_id` | |
| `status` | `started` → `in_progress` → `completed` → `terminated`/`evaluated` |
| `total_score`, `percentage_score`, `trust_score` | Outcomes |

**`ProctoringEvent`** — per-event log with `severity` (`info`/`warning`/`critical`). `trust_score` on the attempt is derived from these.

### AI usage

| Endpoint | What |
|---|---|
| `POST /generate-jd` (`hiring_intelligence.py:77-88`) | `GeneratedJDResult` from team gaps + roadmap context |
| `POST /generate-rubric` (line 92-99) | `InterviewQuestion` per skill — `{skill_assessed, difficulty, evaluation_criteria, red_flags, bonus_indicators}` |
| `POST /score-candidate` | LLM analysis of candidate vs `interview_rubric` |
| `extract_roadmap_skills` | Parses roadmap items for required skills with priority `critical`/`high`/`medium`/`low` |

Subjective assessment answers can be auto-graded via LLM or routed to manual review.

### Frontend

`/frontend/src/app/(app)/hiring/` — dashboard, candidate pipeline, assessment management.

## Learning & Development

Personalized, AI-generated learning paths tied to career roles and integrated with external content providers (Coursera, Udemy, Pluralsight, YouTube).

### Routers

| Router | Prefix |
|---|---|
| `api/learning.py` | `/learning` — paths, milestones |
| `api/learning_activities.py` | Activity logging |
| `api/learning_analytics.py` | Executive dashboards, completion rates |
| `api/learning_integrations.py` | External course platform connections |
| `api/manager_learning.py` | Manager view: assign goals, track team |

### Models

**`LearningPath`** (`models/career.py:84`) — personalized path.

| Field | Note |
|---|---|
| `developer_id`, `target_role_id` | Subject |
| `skill_gaps` (JSONB) | `[{skill, current_score, target_score, gap}]` — LLM-derived |
| `phases` (JSONB) | `[{name, duration, skills, activities}]` |
| `milestones_data` (JSONB) | Detailed per-milestone config |
| `status`, `trajectory_status` | Progress |
| `estimated_success_probability` | LLM estimate |
| `risk_factors`, `recommendations` (JSONB) | LLM commentary |

**`LearningMilestone`** (`career.py:176`):

| Field | Note |
|---|---|
| `path_id`, `skill_name` | |
| `current_score`, `target_score` | |
| `status` | `not_started` → `in_progress` → `completed`/`behind` |
| `recommended_activities` (JSONB) | LLM-recommended courses/projects with `estimated_hours`, `source` |

**`LearningActivityLog`** (`models/learning_activity.py:18`) — completions.

| Field | Note |
|---|---|
| `developer_id`, `activity_type` | `course`, `task`, `reading`, `project` |
| `source` | `youtube`, `coursera`, `udemy`, `pluralsight`, `internal`, `manual` |
| `external_id`, `external_url`, `thumbnail_url` | For external content |
| `progress`, `time_spent`, `points`, `rating` | Tracking + gamification |

**`LearningGoal`** (`models/learning_management.py:66`) — manager-set targets.

| Field | Note |
|---|---|
| `manager_id`, `developer_id` | Sub/owner |
| `goal_type` | `course_completion`, `hours_spent`, `skill_acquisition`, `certification`, `path_completion`, `custom` |
| `due_date`, `progress` | Tracking |

**`CareerRole`** (`career.py:18`) — role definition, used as the *target* for learning paths.

| Field | Note |
|---|---|
| `name`, `level` | |
| `required_skills`, `preferred_skills` (JSONB) | Skill weights |
| `soft_skill_requirements` (JSONB) | Communication, ownership, mentoring, etc. |
| `learning_paths`, `hiring_requirements` | Backlinks |

### AI usage

| Service | Method | Prompt |
|---|---|---|
| `LearningPathService` (`services/learning_path.py:1-20`) | path generation | `LEARNING_PATH_PROMPT` — gap analysis + phase generation + activity recommendation |
| Skill gap analysis | Internal | Compares developer's skills (from `ContributionSummary`) to `CareerRole.required_skills` |
| Milestone evaluation | Internal | `MILESTONE_EVALUATION_PROMPT` |
| Stretch assignment | Internal | `STRETCH_ASSIGNMENT_PROMPT` — suggests challenging projects aligned to the path |

### External content sources

Aexy doesn't host courses. Content sources tracked in `LearningActivityLog.source`:

- `youtube` — public videos
- `coursera`, `udemy`, `pluralsight` — paid platforms, integrated via `LearningIntegration`
- `internal` — internal projects/code as practical learning
- `manual` — anything the developer self-reports

`OrganizationSettings.external_sources` controls which platforms are enabled for the workspace.

### Cross-module bridges

- **WorkGoal.learning_milestone_id** (`review.py:519-524`) — a review goal can be backed by a learning milestone, so completing the milestone counts toward the review.
- **HiringRequirement** is generated from team-gap analysis that uses the same skill model the learning paths rely on.
- **CareerRole** is the central concept — it's the target for learning paths AND the source for hiring requirements.

### Frontend

| Route | Purpose |
|---|---|
| `/learning` | Active paths + milestones |
| `/learning/activities` | Activity log + gamification (badges, streaks, points) |
| `/profile` | Career progression view |

## Temporal activities

None of these modules have their own periodic schedules in `temporal/schedules.py` today. Reviews, hiring, and learning are user-triggered. The general workspace analysis schedules (skill rebuilds, snapshots) feed `ContributionSummary` which all three modules read from.

## Common pitfalls

- **`IndividualReview.ai_summary` is one-shot.** It's written when the review hits `completed`. If a manager edits their submission later, the summary doesn't regenerate automatically — you have to re-run the summary job or rebuild it manually.
- **Anonymous peer reviews leak via metadata.** The `anonymous_token` decouples submitter ID from the displayed review, but `submission_metadata` and timestamps can still narrow down to a small set of reviewers. If anonymity matters to the workspace, batch multiple reviews before showing them to the subject.
- **Assessment trust scores are advisory.** A low `trust_score` doesn't auto-terminate the attempt; it flags it for manual review. Don't gate offers on it without a human signing off.
- **External course integrations require workspace-level setup.** Just having `LearningActivityLog.source = "coursera"` doesn't fetch progress — you need a `LearningIntegration` row with creds. Without it, completions must be self-reported (`source = "manual"`).
- **CareerRole.required_skills is the canonical target.** If you re-weight skills in the role, every active `LearningPath` derived from it goes stale until re-generated. Consider regenerating affected paths after a role update.
