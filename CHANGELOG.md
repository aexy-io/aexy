# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-02-09

### Added

#### GitHub Work Stats Dashboard

Team-level GitHub analytics dashboard for workspace admins/owners to track team member work distribution, commits, and pull requests.

**New Route:**
- `/tracking/work-stats` - GitHub analytics dashboard with member filtering and repo-wise breakdown

**Frontend:**
- New page: `app/(app)/tracking/work-stats/page.tsx` - Full analytics dashboard
- New API client: `lib/work-stats-api.ts` - Types and API methods for work stats
- New hook: `hooks/useWorkStats.ts` - React Query hook for GitHub analytics
- Sidebar entry with `GitCommitHorizontal` icon under Tracking section
- Module config in `appDefinitions.ts` with route mapping and bundle support

**Dashboard Features:**
- Period selector (7/30/90 days)
- Member filter chips with avatar display (All Members + individual selection)
- Summary metric cards: Total Commits, Pull Requests, Code Reviews, Contributors/Lines Changed
- Interactive activity timeline bar chart with Y-axis labels, grid lines, and hover tooltips
- Team view: Members table with inline sparklines, top repositories panel, code impact stats
- Individual member view: Personal stats, repo-wise breakdown cards with commit/PR counts and additions/deletions bars
- Permission-gated: Only workspace admins and owners can access

**Backend:**
- New schemas in `schemas/analytics.py`: `MemberActivityDay`, `MemberRepoStat`, `MemberGitHubStats`, `TeamActivityDay`, `TopRepoStat`, `GitHubAnalyticsSummary`, `WorkspaceGitHubAnalytics`
- New service method: `AnalyticsDashboardService.get_workspace_github_analytics()` - Aggregates per-member and team-level GitHub stats from Commit, PullRequest, and CodeReview models
- New API endpoint: `GET /workspaces/{workspace_id}/github-analytics?days=30` - Returns full workspace GitHub analytics (admin/owner only)

---

## [0.5.0] - 2026-02-02

### Added

#### Platform-Wide Automations

Migrated automations from CRM-specific to a platform-wide automation framework accessible from `/automations`.

**New Routes:**
- `/automations` - List all automations with module filtering (CRM, Tickets, Hiring, Email, etc.)
- `/automations/new` - Create new automation with module selector
- `/automations/[automationId]` - Edit automation with workflow builder

**Module Support:**
- CRM: `record.created`, `record.updated`, `field.changed`, `stage.changed`
- Tickets: `ticket.created`, `ticket.status_changed`, `sla.breached`, `ticket.assigned`
- Hiring: `candidate.created`, `candidate.stage_changed`, `interview.scheduled`
- Email Marketing: `campaign.sent`, `email.opened`, `email.bounced`
- Uptime: `monitor.down`, `incident.created`
- Sprints: `task.status_changed`, `sprint.completed`
- Forms: `form.submitted`
- Booking: `booking.confirmed`, `booking.cancelled`

**Backend:**
- New API router: `api/automations.py` at `/workspaces/{id}/automations/*`
- New schemas: `schemas/automation.py` with `AutomationModule` enum
- New service: `services/automation_service.py` for generic automation handling
- Trigger/Action registry pattern for extensible module support
- Migration: `migrate_platform_automations.sql` adds `module` column to automations

**CRM Routes Redirected:**
- `/crm/automations` → `/automations?module=crm`
- `/crm/automations/new` → `/automations/new?module=crm`
- `/crm/automations/[id]` → `/automations/[id]`

---

#### Agent Email Integration

Agents can now have dedicated email addresses and manage their own inboxes.

**Email Address Allocation:**
- Agents can be assigned email addresses like `support@workspace.aexy.email`
- Email address allocation via mailagent microservice integration
- Enable/disable email per agent
- Auto-reply configuration with confidence threshold

**Agent Inbox:** `frontend/src/app/(app)/agents/[agentId]/inbox/page.tsx`
- View incoming emails assigned to the agent
- Email status tracking: `pending`, `processing`, `responded`, `escalated`, `archived`
- AI classification results with confidence scores
- Suggested responses from agent processing
- Manual reply and escalation actions

**Backend:**
- New model: `models/agent_inbox.py` - `AgentInboxMessage` for storing received emails
- New service: `services/agent_email_service.py` - Email allocation, routing, and processing
- New API: `api/email_webhooks.py` - Inbound email webhook handlers
- Migration: `migrate_agent_email.sql` - Agent email fields and inbox table

**Agent Model Extensions:**
- `email_address` - Unique email address for the agent
- `email_enabled` - Toggle email processing
- `auto_reply_enabled` - Enable automatic responses
- `email_signature` - Custom signature for outgoing emails

---

#### Agent Chat Interface

New conversational interface for interacting with AI agents.

**New Routes:**
- `/agents/[agentId]/chat` - Start new conversation with agent
- `/agents/[agentId]/chat/[conversationId]` - Continue existing conversation

**Features:**
- Real-time chat interface with message streaming
- Conversation history and context preservation
- Agent tool execution display (CRM lookups, email sends, etc.)
- Confidence indicators for agent responses
- Conversation list with search and filtering

**Backend:**
- Migration: `migrate_agent_conversations.sql` - Conversation and message tables
- Extended `api/agents.py` with conversation endpoints
- Message types: `user`, `assistant`, `system`, `tool_call`, `tool_result`

---

#### Automation Agents Integration

Connect AI agents to workflow automations for intelligent task handling.

**New Model:** `models/automation_agent.py`
- `AutomationAgent` - Links agents to automation workflows
- `AutomationAgentExecution` - Tracks agent executions within workflows
- `AutomationAgentConfig` - Stores agent-specific workflow configuration

**New API:** `api/automation_agents.py`
- `POST /automations/{id}/agents` - Add agent to automation
- `DELETE /automations/{id}/agents/{agent_id}` - Remove agent
- `GET /automations/{id}/agents` - List agents in automation
- `POST /automations/{id}/agents/{agent_id}/execute` - Manually trigger agent

**Workflow Actions:** `services/workflow_actions.py`
- `run_agent` action type for workflow nodes
- Agent execution with context from trigger data
- Result handling and error propagation

**Migration:** `migrate_automation_agents.sql`

---

#### Mailagent Integration Client

Client for communicating with the mailagent microservice.

**New Integration:** `integrations/mailagent_client.py`
- Async HTTP client for mailagent API
- Domain management (create, verify, list)
- Agent email provisioning
- Inbound email processing delegation
- Email sending via mailagent infrastructure

**Configuration:**
- `MAILAGENT_URL` environment variable (default: `http://mailagent:8001`)
- Automatic retry with exponential backoff
- Health check integration

---

#### Agent Management Improvements

**Agent Detail Page:** `/agents/[agentId]`
- Comprehensive agent overview with metrics
- Execution history with status and duration
- Performance charts (success rate, response time)
- Quick actions (test, enable/disable, edit)

**Agent Edit Page:** `/agents/[agentId]/edit`
- Tabbed configuration editor
- Email configuration section
- Tool selection with categories
- Behavior settings (confidence, approval thresholds)
- Working hours configuration

**Agents List Page:** `/agents`
- Grid view with agent cards
- Status badges (active, inactive, error)
- Filtering by type and status
- Search functionality
- Quick stats (total agents, active, executions)

### Changed

- CRM Agents routes now redirect to platform-wide `/agents` routes
- CRM Automations routes now redirect to platform-wide `/automations` routes
- Sidebar navigation updated with Automations in dedicated section
- Agent tools now include email tools: `send_email`, `create_draft`, `get_email_history`, `get_writing_style`

### Fixed

- Domain creation now returns HTTP 409 Conflict for duplicates instead of 500 with SQL error
- `SendingDomainResponse.provider_id` is now optional (nullable)
- SQLAlchemy reserved word error in mailagent (`metadata` → `decision_metadata`)
- Missing `LLMConfig` export in mailagent LLM module
- Email marketing domain creation toast notifications for success/error feedback

### Removed

- Alembic migration files (using raw SQL migrations via `run_migrations.py`)
- `roadmap_voting` model and related code
- `public_projects` API (consolidated into projects API)
- Some Google sync tasks (moved to separate service)

#### Mailagent Microservice

A new standalone microservice for email administration, AI agent processing, and domain management.

**Core Service:** `mailagent/`
- FastAPI service running on port 8001
- SQLAlchemy async models with PostgreSQL
- Redis for caching and rate limiting
- Docker Compose integration

**Email Provider Support:** `mailagent/src/mailagent/providers/`
- AWS SES integration with IAM credentials
- SendGrid API integration
- Mailgun (planned)
- Postmark (planned)
- Custom SMTP support

**Domain Management:** `mailagent/src/mailagent/api/domains.py`
- Domain registration and health scoring
- DNS verification (SPF, DKIM, DMARC)
- Automated DNS record generation
- Domain warming schedules (conservative, moderate, aggressive)

**Agent System:** `mailagent/src/mailagent/agents/`
- Base agent class with confidence-based decisions
- Agent types: `support`, `sales`, `scheduling`, `onboarding`, `recruiting`, `newsletter`, `custom`
- Agent actions: `reply`, `forward`, `escalate`, `schedule`, `create_task`, `update_crm`, `wait`, `request_approval`
- Specialized agents with pre-configured behaviors

**LLM Integration:** `mailagent/src/mailagent/llm/`
- Claude (Anthropic) provider
- Gemini (Google) provider
- Factory pattern for provider selection
- Configurable temperature and max tokens

**API Endpoints:**
- `/api/v1/admin/*` - Provider CRUD and dashboard
- `/api/v1/domains/*` - Domain management and verification
- `/api/v1/onboarding/*` - Inbox creation and verification
- `/api/v1/agents/*` - Agent CRUD and configuration
- `/api/v1/agents/{id}/process` - Process email with agent
- `/api/v1/invocations/*` - Execution history and metrics
- `/api/v1/webhooks/*` - Inbound email processing
- `/api/v1/send/*` - Outbound email sending

**Email Processing Pipeline:**
- Inbound webhook handlers for SES/SendGrid
- Thread detection and conversation context
- Knowledge base search integration
- Contact enrichment from CRM
- Response generation with approval workflow

---

#### AI Agents Management UI

A comprehensive interface for creating and managing custom AI agents with configurable tool access and behavior settings.

**New Routes:**
- `/agents` - Agent list page with grid view, stats, filtering, and search
- `/agents/new` - Multi-step agent creation wizard
- `/agents/[agentId]` - Agent detail page with execution history and metrics
- `/agents/[agentId]/edit` - Tabbed configuration editor

**Frontend Components:** `frontend/src/components/agents/`
- `AgentCreationWizard` - 7-step wizard (type, basic info, LLM, tools, behavior, prompts, review)
- `AgentTypeBadge` - Type indicator with icon and color
- `AgentStatusBadge` - Active/inactive status
- `ToolSelector` - Multi-select tool picker with categories
- `LLMProviderSelector` - Provider and model selection (Claude, Gemini, Ollama)
- `ConfidenceSlider` - 0-1 range slider for thresholds
- `WorkingHoursConfigPanel` - Hours, timezone, and days configuration
- `PromptEditor` - System prompt editor with variable hints

**Dashboard Widget:**
- `AIAgentsWidget` - Shows active agents, total runs, success rate
- Added to dashboard widget registry and default visible widgets

**Sidebar Navigation:**
- AI Agents added as top-level navigation item with own "AI" section
- Sub-items: All Agents, Create Agent

**Product Page:**
- `/products/ai-agents` - Marketing page for AI Agents feature

**Backend API Extensions:**
- `GET /agents/check-handle` - Verify mention handle availability
- `GET /agents/{id}/metrics` - Agent performance metrics (runs, success rate, avg duration)

**Database Migration:** `backend/scripts/migrate_agent_extended_config.sql`
- Extended CRMAgent model with: `mention_handle`, `llm_provider`, `temperature`, `max_tokens`, `confidence_threshold`, `require_approval_below`, `max_daily_responses`, `response_delay_minutes`, `working_hours`, `custom_instructions`, `escalation_email`, `escalation_slack_channel`

**Documentation:**
- `/docs/ai-agents.md` - Comprehensive guide covering agent types, configuration, tools, and API
- Updated `/docs/README.md` with AI Agents in guides and products
- Updated `/CLAUDE.md` with AI Agents key files and API testing commands

### Changed

- AI Agents now appears in dedicated "AI" section in grouped sidebar layout

---

## [0.4.6] - 2026-01-30

### Added

#### Auto-Sync for Gmail and Calendar
- Configurable auto-sync intervals for Gmail and Calendar integrations
- New periodic Celery task (`check_auto_sync_integrations`) runs every minute to check which integrations need syncing
- Preset interval buttons (Off, 5m, 15m, 30m, 1h, 24h) and custom input in settings UI
- Minimum interval enforced at 5 minutes to prevent aggressive API usage
- Tracks `gmail_last_sync_at` and `calendar_last_sync_at` for accurate scheduling
- Duplicate job detection prevents overlapping sync operations

**Database Migrations:**
- `migrate_auto_sync_interval.sql` - Adds `auto_sync_interval_minutes` column
- `migrate_auto_sync_calendar_interval.sql` - Adds `auto_sync_calendar_interval_minutes` column

#### Markdown Editor Mode
- Toggle between Rich Text and Markdown editing modes in document editor
- `tiptap-markdown` integration for seamless markdown parsing/serialization
- Markdown content persists when switching between modes
- Error handling prevents data loss if markdown parsing fails

#### Document Editor UI Improvements
- Redesigned toolbar with grouped buttons and keyboard shortcut tooltips
- Unified header layout with breadcrumb integration
- Enhanced visual styling with backdrop blur, shadows, and animations
- Re-enabled home navigation link in document breadcrumb

#### CRM Inbox Enhancements
- Email HTML content rendered in isolated iframe to prevent style leakage
- Lazy loading of full email body (fetches on selection, not on list load)
- Loading state indicator while email content is being fetched

### Fixed

- **Workspace Selection Race Condition**: Fixed issue where auto-selection could override user's stored workspace preference by adding `isInitialized` state guard in `useWorkspace` hook
- **Auto-sync Task Counter**: Fixed incorrect `dir()` check that always returned 0 for total integrations checked
- **Email Display**: Fixed `to_emails` field to properly extract email addresses from recipient objects
- **Markdown Mode Stability**: Added try-catch error handling to prevent crashes when parsing malformed markdown

### Changed

- Production Dockerfile now uses `--legacy-peer-deps` for dependency compatibility
- AppShell main content wrapper no longer uses `container` class for full-width layouts

### Dependencies

- Added `tiptap-markdown@^0.8.10`
- Added `y-prosemirror@^1.3.7`

## [0.4.5] - 2026-01-30

#### Public Project Pages
- **Project visibility toggle** - Projects can now be made public or private via settings
- **Public project URLs** - Each public project gets a unique public slug (e.g., `/p/my-project-k3f9x2`)
- **Customizable public tabs** - Admins can configure which tabs are visible on the public page:
  - Overview, Backlog, Board, Stories, Bugs, Goals, Releases, Timeline, Roadmap, Sprints

#### Roadmap Voting System
- **Feature request submissions** - Authenticated users can submit feature requests with title, description, and category
- **Voting** - Users can upvote/downvote feature requests (toggle vote)
- **Comments** - Threaded comments on feature requests with admin badge support
- **Request categories** - Feature, Improvement, Integration, Bug Fix, Other
- **Status tracking** - Under Review, Planned, In Progress, Completed, Declined
- **Admin responses** - Project admins can respond to requests and update status
- **Pagination** - Paginated list of roadmap requests with filtering and sorting

#### New UI Components
- `Pagination` component with ellipsis support and accessibility labels
- Public project page tab components (Overview, Backlog, Board, Stories, Bugs, Goals, Releases, Sprints, Timeline, Roadmap)

#### New Backend Services
- **Models**: `RoadmapRequest`, `RoadmapVote`, `RoadmapComment` for voting system
- **API Router**: `/api/v1/public/projects/{public_slug}/...` for unauthenticated access
- **Sanitization**: Input sanitization module for user-generated content (`backend/src/aexy/core/sanitize.py`)

#### New API Endpoints
- `POST /workspaces/{id}/projects/{id}/toggle-visibility` - Toggle project public/private
- `GET/PUT /workspaces/{id}/projects/{id}/public-tabs` - Configure visible tabs
- `GET /public/projects/{slug}` - Get public project info
- `GET /public/projects/{slug}/backlog|board|stories|bugs|goals|releases|roadmap|sprints|timeline` - Public data endpoints
- `GET/POST /public/projects/{slug}/roadmap-requests` - List/create feature requests
- `POST /public/projects/{slug}/roadmap-requests/{id}/vote` - Vote on requests
- `GET/POST /public/projects/{slug}/roadmap-requests/{id}/comments` - Comments

### Changed
- `Project` model includes `is_public` (boolean) and `public_slug` (unique string) fields
- Sprint/roadmap/timeline endpoints use optimized SQL aggregation queries (N+1 fix)
- Vote counting uses atomic SQL UPDATE to prevent race conditions
- Project list and detail responses include visibility fields

### Security
- HTML tag stripping and entity escaping for user-submitted content
- Input length validation: title (150 chars), description (1000 chars), comments (2000 chars)
- Tab access control - public endpoints verify tab is enabled before returning data
- Permission checks on admin endpoints require workspace owner/admin role

### Database Migrations
- `alembic/versions/61fd11a7e0ea_add_public_project_visibility.py` - Adds visibility columns
- `scripts/migrate_roadmap_voting.sql` - Creates roadmap voting tables with indexes

### Files Changed Summary
```
47 files changed, ~5,900 insertions(+), ~500 deletions(-)
```

**Backend:**
- `api/public_projects.py` (new - 903 lines)
- `api/projects.py` (+186 lines)
- `models/roadmap_voting.py` (new - 205 lines)
- `models/project.py` (+37 lines)
- `schemas/project.py` (+265 lines)
- `core/sanitize.py` (new - 107 lines)

**Frontend:**
- `app/p/[publicSlug]/page.tsx` (new - 265 lines)
- `components/public-project-page/*` (new - 12 components)
- `components/ui/pagination.tsx` (new - 136 lines)
- `app/(app)/settings/projects/[projectId]/page.tsx` (+254 lines)
- `lib/api.ts` (+351 lines)

---

## [0.4.4] - 2026-01-29

### Added

#### GitHub Intelligence System

A comprehensive intelligence analysis system that extracts insights from GitHub activity to provide developer profiling, burnout detection, expertise tracking, and team collaboration analysis.

**Semantic Commit Analysis:**
- Conventional commit parsing (feat, fix, refactor, chore, docs, test, style, perf, build, ci)
- Scope and component extraction from commit messages
- Breaking change detection from `!` suffix and `BREAKING CHANGE:` footer
- Commit message quality scoring (0-100)
- Semantic tag extraction for categorization
- Optional LLM-enhanced analysis for complex messages

**New Service:** `backend/src/aexy/services/commit_analyzer.py`
- API: `POST /api/v1/intelligence/commits/analyze`
- API: `GET /api/v1/intelligence/commits/distribution`

**PR Review Quality Analysis:**
- Review depth scoring (1-5 scale based on comment length and complexity)
- Thoroughness classification: cursory, standard, detailed, exhaustive
- Mentoring behavior detection (explains_why, provides_examples, suggests_alternatives, asks_questions, shares_resources)
- Review response time calculation
- Mentoring score aggregation

**New Service:** `backend/src/aexy/services/review_quality_analyzer.py`
- API: `GET /api/v1/intelligence/reviews/quality`
- API: `POST /api/v1/intelligence/reviews/analyze`
- API: `GET /api/v1/intelligence/reviews/response-time`

**Expertise Confidence Intervals:**
- Logarithmic proficiency scoring based on commit count and lines of code
- Confidence intervals (0-1) based on data quantity and repo diversity
- Recency factor with exponential decay (180-day half-life)
- Depth levels: novice, intermediate, advanced, expert
- Context classification: production, personal, learning, unknown
- Repository diversity scoring

**New Service:** `backend/src/aexy/services/expertise_confidence.py`
- API: `GET /api/v1/intelligence/expertise`
- API: `POST /api/v1/intelligence/expertise/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/expertise/{skill_name}`

**Burnout Risk Indicators:**
- After-hours commit percentage tracking (before 9am / after 6pm)
- Weekend work frequency analysis
- Consecutive high-activity days detection
- Days since last break calculation
- Review quality trend analysis
- Risk levels: low, moderate, high, critical
- Risk score (0-1) with weighted indicators
- Trend detection (improving, stable, worsening)
- Configurable thresholds

**New Service:** `backend/src/aexy/services/burnout_detector.py`
- API: `GET /api/v1/intelligence/burnout`
- API: `POST /api/v1/intelligence/burnout/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/burnout`

**Collaboration Network Analysis:**
- Graph-based collaboration mapping from PR reviews
- Collaboration strength scoring (frequency + recency weighted)
- Knowledge silo detection for isolated developers
- Team cohesion scoring with graph density metrics
- Central connector identification
- Collaboration diversity scoring

**New Service:** `backend/src/aexy/services/collaboration_network.py`
- API: `GET /api/v1/intelligence/collaborators`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration`
- API: `GET /api/v1/intelligence/team/{workspace_id}/collaboration/graph`

**Project Complexity Classification:**
- PR complexity levels: trivial, simple, moderate, complex, critical
- Complexity scoring (0-100) based on files, layers, and components
- Change categories: feature, bugfix, refactor, documentation, infrastructure, configuration, dependency, test, security, performance
- Architectural layer detection (api, service, model, repository, ui, infrastructure, config, test)
- Component extraction from file paths
- Cross-cutting change detection
- Infrastructure and migration flagging
- Security-sensitive file identification
- Review effort estimation (low, medium, high, very_high)
- Risk indicator generation

**New Service:** `backend/src/aexy/services/complexity_classifier.py`
- API: `GET /api/v1/intelligence/complexity`
- API: `POST /api/v1/intelligence/complexity/analyze`
- API: `POST /api/v1/intelligence/complexity/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/complexity`

**Technology Evolution Tracking:**
- Framework/library version detection from dependency files
- Version status classification: current, recent, outdated, deprecated
- Technology adoption score (0-1)
- Automated upgrade suggestions with priority
- Support for 30+ popular technologies (React, Vue, Angular, FastAPI, Django, etc.)
- Team-wide technology health scoring
- Critical upgrade identification

**New Service:** `backend/src/aexy/services/technology_tracker.py`
- API: `GET /api/v1/intelligence/technology`
- API: `POST /api/v1/intelligence/technology/update`
- API: `GET /api/v1/intelligence/team/{workspace_id}/technology`

**Full Analysis Endpoint:**
- API: `POST /api/v1/intelligence/analyze-all` - Runs all analysis types in one call

**Database Migration:**
- New migration: `backend/scripts/migrate_github_intelligence.sql`
- Added `semantic_analysis` JSONB column to commits table
- Added `quality_metrics` JSONB column to code_reviews table
- Added `expertise_confidence` JSONB column to developers table
- Added `burnout_indicators` JSONB column to developers table
- Added `last_intelligence_analysis_at` timestamp to developers table
- Added `complexity_analysis` JSONB column to pull_requests table
- Created `developer_collaborations` table for collaboration graph storage

**New API Router:**
- `backend/src/aexy/api/intelligence.py` with 22 endpoints

## [0.4.4] - 2026-01-29

### Fixed

#### Slack Notification Bug for Uptime Monitors

Fixed an issue where Slack notifications were not being sent for uptime monitor incidents when the monitor didn't have a specific `slack_channel_id` configured.

**Root Cause:**
- Notifications required `monitor.slack_channel_id` to be set, but most monitors relied on the workspace's default Slack channel configuration
- The code didn't fall back to looking up the workspace's configured Slack channel from `slack_channel_configs`

**Changes:**
- Added fallback logic to look up workspace notification channel when monitor-specific channel is not set
- Auto-add `slack` to `notification_channels` when creating new monitors if Slack is configured for the workspace
- Auto-add `slack` to existing monitors when a Slack channel is first configured for a workspace

### Improved

#### Code Quality & Maintainability

**Centralized Slack Integration Helpers:**
- Created new `backend/src/aexy/services/slack_helpers.py` module with shared functions:
  - `get_slack_integration_for_workspace()` - finds integration by workspace/org ID
  - `get_slack_channel_config()` - gets channel config for an integration
  - `get_workspace_notification_channel()` - combines both to get channel ID
  - `check_slack_channel_configured()` - boolean check for Slack setup
- Removed duplicated Slack lookup logic from `uptime_service.py` and `uptime_tasks.py`

**Added Constants for Notification Channels:**
- `NOTIFICATION_CHANNEL_SLACK = "slack"`
- `NOTIFICATION_CHANNEL_WEBHOOK = "webhook"`
- `NOTIFICATION_CHANNEL_TICKET = "ticket"`
- Replaced magic strings throughout the codebase

**Improved Type Safety:**
- Added proper type hints (`db: AsyncSession`) to notification helper functions
- Added return type annotations to `_send_slack_notification()`

**Better Exception Handling:**
- Changed broad `Exception` catches to specific `SQLAlchemyError` for database operations
- Added specific `HTTPError` handling for Slack API calls
- Added explicit timeout (30s) to HTTP client for Slack notifications

**Graceful Error Handling:**
- Wrapped `add_slack_to_monitors()` call in try/except to prevent channel configuration failures if monitor update fails
- Logs warning but doesn't fail the primary operation

**Files Changed:**
- `backend/src/aexy/services/slack_helpers.py` (new)
- `backend/src/aexy/services/uptime_service.py`
- `backend/src/aexy/processing/uptime_tasks.py`
- `backend/src/aexy/api/slack.py`

---

## [0.4.2] - 2026-01-25

### Added

#### Email Provider Configuration UI

**Provider Edit Modal:**
- Added comprehensive provider configuration modal with provider-specific credential fields
- SES credentials: Access Key ID, Secret Access Key, Region, Configuration Set
- SendGrid credentials: API Key
- Mailgun credentials: API Key, Domain, Region (US/EU selector)
- Postmark credentials: Server Token
- SMTP credentials: Host, Port, Username, Password, TLS toggle

**Provider Card Improvements:**
- Added "Configure" button to edit provider settings and credentials
- Added "Setup Required" badge for providers without credentials configured
- Test connection button now disabled until credentials are configured
- Display provider description when available

**Provider Test Feedback:**
- Added toast notifications for provider connection test results
- Success toast shows "Connection successful" with provider message
- Error toast shows "Connection failed" with detailed error message (e.g., invalid credentials)
- Added Toaster component to root layout for app-wide notifications

**Credential Encryption (Security):**
- Added Fernet-based encryption for provider credentials at rest
- Credentials are encrypted before storing in database using AES-128-CBC
- Encryption key derived from application `secret_key` via SHA256
- Backward compatible with existing unencrypted credentials (auto-detected)
- New encryption utility module at `core/encryption.py`

### Changed

- Updated `EmailProvider` TypeScript interface with `credentials`, `description`, `settings`, and status fields
- Updated provider update API to accept `credentials` and `description` parameters
- Added `has_credentials` boolean field to provider API responses for secure credential status indication
- Credentials are no longer returned in API responses (security improvement) - only `has_credentials` flag indicates if configured

### Fixed

- Fixed migration runner `--force` flag not re-running changed migrations
- Fixed TypeScript type errors in provider credential handling
- Fixed provider test not showing results to user (toast notifications now display success/error)
- Fixed "Setup Required" badge not updating after credentials are saved (now uses `has_credentials` from API)

---

## [0.4.1] - 2026-01-25

### Added

#### Email Marketing Infrastructure Improvements

**DNS Records UI:**
- Enhanced DNS records display with collapsible section in domain cards
- Copy-to-clipboard functionality for DNS record names and values
- Visual indicators for verified/pending DNS records
- "Action Required" badge for unverified domains
- Documentation link to GitHub for DNS setup guidance
- Support for Verification, SPF, DKIM, and DMARC record types

**Provider Management:**
- Providers can now be created without credentials (configurable later)
- Credentials field now accepts empty dict as default

### Fixed

#### Provider Connection Testing
- Fixed provider test connection hanging when credentials are not configured
- Added credential validation before attempting API connections for all providers:
  - SES: checks for `access_key_id` and `secret_access_key`
  - SendGrid: checks for `api_key`
  - Mailgun: checks for `api_key` and `domain`
  - Postmark: checks for `server_token`
  - SMTP: checks for `host`
- Returns helpful error message indicating which credentials are missing

#### Sending Domain Model
- Made `provider_id` nullable in SendingDomain model
- Added `SET NULL` on delete for provider foreign key relationship
- Added `dns_records`, `verification_token`, and `verified_at` fields to SendingDomainListResponse schema

---

## [0.4.0] - 2026-01-25

### Added

#### Assessment Proctoring System

A comprehensive real-time proctoring system for assessment integrity with AI-powered face detection, violation tracking, and chunked video recording with cloud storage.

**Face Detection & Monitoring:**
- Real-time face detection using face-api.js with TinyFaceDetector
- No face detected alerts with configurable cooldown (10 seconds)
- Multiple faces detection with count reporting
- Face landmark and recognition model support
- Live webcam preview during assessment

**Violation Tracking:**
- Configurable maximum violation count before auto-submission
- Violation types: no face, multiple faces, tab switch, window blur, fullscreen exit, copy/paste attempt
- Real-time violation counter with visual warnings
- Warning modal with violation details and remaining attempts
- Automatic assessment submission on max violations exceeded

**Screen & Webcam Recording:**
- Chunked recording with configurable duration (10 second chunks)
- Cloudflare R2 upload integration for video storage
- Separate webcam and screen recording streams
- Progress tracking for uploads
- Graceful recording stop and finalization on submission

**Proctoring Settings:**
- Enable/disable proctoring per assessment
- Webcam requirement toggle
- Screen recording toggle
- Fullscreen enforcement toggle
- Face detection toggle
- Tab/window tracking toggle
- Copy/paste prevention toggle

**Security Features:**
- Fullscreen mode enforcement with exit detection
- Tab switch detection via visibility API
- Window blur detection
- Copy/cut/paste prevention with event blocking
- Right-click context menu prevention
- Re-enable prompts for fullscreen and screen sharing after violations

**Backend Proctoring Service:**
- `ProctoringService` for event logging and analysis
- Proctoring event types with severity levels (info, warning, critical)
- Event summary generation for attempt review
- Trust score calculation based on violations
- Integration with assessment attempt model

**R2 Upload Service:**
- Chunked upload support for large video files
- Multipart upload with progress tracking
- Signed URL generation for secure uploads
- Recording type tagging (webcam/screen)

**Assessment Settings UI (Step 3):**
- Proctoring settings section with toggles
- `enable_webcam`, `enable_screen_recording`, `enable_fullscreen_enforcement`
- `enable_face_detection`, `enable_tab_tracking`, `enable_copy_paste_detection`
- Additional options: `allow_calculator`, `allow_ide`

**Assessment Review UI (Step 5):**
- Proctoring status display in review summary
- Settings verification before publish

**New Files:**
- `frontend/src/hooks/useChunkedRecording.ts` - Chunked recording hook
- `frontend/src/services/recordingUploadService.ts` - R2 upload service
- `frontend/src/constants/index.ts` - MAX_VIOLATION_COUNT constant
- `frontend/public/models/` - Face-api.js model files
- `backend/src/aexy/services/proctoring_service.py` - Proctoring event service
- `backend/src/aexy/services/r2_upload_service.py` - Cloudflare R2 integration

**Dependencies Added:**
- `face-api.js` - Browser-based face detection

---

## [0.3.1] - 2026-01-24

### Fixed

#### Uptime Module - Nullability & Visibility Fixes

**Monitor Visibility Bug:**
- Fixed monitors not appearing in the UI after creation
- Backend returns array directly for `/monitors` endpoint, but frontend expected `{ monitors: [], total }` format
- Updated API client to normalize response formats across all uptime endpoints

**API Response Format Alignment:**
- `monitors.list()` - Now correctly handles array response from backend
- `incidents.list()` - Now correctly handles `{ items: [] }` response format
- `monitors.getChecks()` - Now correctly handles `{ items: [] }` response format

**Unknown Status Handling:**
- Added `unknown` status support for newly created monitors (before first check runs)
- Added `unknown` to `STATUS_COLORS` in all uptime pages to prevent render crashes
- Added `DEFAULT_STATUS_STYLE` fallback for unrecognized status values

**Null-Safe Data Handling:**
- Added optional chaining (`?.`) when accessing API response properties
- Added fallback to empty arrays (`|| []`) for all list data
- Added error state resets in catch blocks to prevent stale data display
- Fixed `TypeError: Cannot read properties of undefined (reading 'length')` errors

**Files Updated:**
- `frontend/src/lib/uptime-api.ts` - API response normalization
- `frontend/src/app/(app)/uptime/page.tsx` - Dashboard null safety
- `frontend/src/app/(app)/uptime/monitors/page.tsx` - Monitors list null safety
- `frontend/src/app/(app)/uptime/monitors/[monitorId]/page.tsx` - Monitor detail null safety
- `frontend/src/app/(app)/uptime/incidents/page.tsx` - Incidents list null safety
- `frontend/src/app/(app)/uptime/incidents/[incidentId]/page.tsx` - Incident detail null safety
- `frontend/src/app/(app)/uptime/history/page.tsx` - Check history null safety

---

## [0.3.0] - 2026-01-24

### Added

#### Uptime Monitoring Module

A comprehensive uptime monitoring system for tracking HTTP endpoints, TCP ports, and WebSocket connections with automatic incident management and ticket creation.

**Core Features:**
- **Multi-Protocol Monitoring**: Support for HTTP, TCP, and WebSocket endpoint checks
- **Configurable Check Intervals**: 1 minute, 5 minutes, 15 minutes, 30 minutes, or 1 hour
- **SSL Certificate Monitoring**: Track SSL expiry days and alert on upcoming expirations
- **Consecutive Failure Thresholds**: Configure how many failures before alerting (default: 3)
- **Auto-Ticketing**: Automatically create support tickets when services go down
- **Auto-Close on Recovery**: Tickets are automatically closed when services recover with full timeline

**Incident Management:**
- Incident status tracking: `ongoing`, `acknowledged`, `resolved`
- Incident timeline with start, acknowledgment, and resolution timestamps
- Failed checks count and total checks during incident
- Root cause and resolution notes for post-mortems
- Automatic linking to support tickets

**HTTP Check Features:**
- Configurable HTTP methods (GET, POST, HEAD, PUT, PATCH)
- Expected status codes validation (e.g., [200, 201, 204])
- Custom request headers
- Request body support
- SSL verification toggle
- Follow redirects option
- Response time tracking

**TCP Check Features:**
- Host and port configuration
- Connection timeout handling
- Response time measurement

**WebSocket Check Features:**
- WebSocket URL monitoring
- Optional message sending on connect
- Expected response pattern validation
- Connection health verification

**Notification Channels:**
- Slack notifications via channel ID
- Custom webhook delivery
- Email alerts (via existing infrastructure)
- Recovery notifications (configurable)

**Database Tables:**
- `uptime_monitors` - Monitor configurations
- `uptime_checks` - Individual check results (time-series)
- `uptime_incidents` - Incident tracking with ticket integration

**API Endpoints:**
- `GET /workspaces/{id}/uptime/monitors` - List monitors
- `POST /workspaces/{id}/uptime/monitors` - Create monitor
- `GET /workspaces/{id}/uptime/monitors/{id}` - Get monitor details
- `PATCH /workspaces/{id}/uptime/monitors/{id}` - Update monitor
- `DELETE /workspaces/{id}/uptime/monitors/{id}` - Delete monitor
- `POST /workspaces/{id}/uptime/monitors/{id}/pause` - Pause monitoring
- `POST /workspaces/{id}/uptime/monitors/{id}/resume` - Resume monitoring
- `POST /workspaces/{id}/uptime/monitors/{id}/test` - Run immediate test
- `GET /workspaces/{id}/uptime/monitors/{id}/checks` - Check history
- `GET /workspaces/{id}/uptime/monitors/{id}/stats` - Monitor statistics
- `GET /workspaces/{id}/uptime/incidents` - List incidents
- `GET /workspaces/{id}/uptime/incidents/{id}` - Get incident details
- `PATCH /workspaces/{id}/uptime/incidents/{id}` - Update incident notes
- `POST /workspaces/{id}/uptime/incidents/{id}/resolve` - Manually resolve
- `POST /workspaces/{id}/uptime/incidents/{id}/acknowledge` - Acknowledge incident
- `GET /workspaces/{id}/uptime/stats` - Workspace-level statistics

**Frontend Pages:**
- `/uptime` - Uptime dashboard with stats and overview
- `/uptime/monitors` - Monitors list with create modal
- `/uptime/monitors/[id]` - Monitor detail with stats, checks, and configuration
- `/uptime/incidents` - Incidents list with filtering
- `/uptime/incidents/[id]` - Incident detail with timeline and post-mortem notes
- `/uptime/history` - Check history viewer

**Product Page:**
- `/products/uptime` - Marketing landing page for uptime monitoring

**Celery Background Tasks:**
- `process_due_checks` - Runs every minute, dispatches checks for due monitors
- `execute_check` - Performs individual HTTP/TCP/WebSocket checks
- `send_uptime_notification` - Sends Slack and webhook notifications
- `cleanup_old_checks` - Daily cleanup of check history (keeps 30 days)

**Access Control Integration:**
- Added to sidebar under "Engineering" section
- Sub-navigation: Monitors, Incidents, History
- App bundle configuration:
  - Engineering bundle: Uptime enabled
  - People bundle: Uptime disabled
  - Business bundle: Uptime disabled
  - Full Access bundle: Uptime enabled
- Permission: `can_view_uptime`

**Statistics & Metrics:**
- Uptime percentage (24h, 7d, 30d)
- Average response time
- Total and failed checks
- Incident counts
- Current and longest streak up

---

## [0.2.1] - 2026-01-23

### Added

#### Team Booking Features

Extended the booking module with team scheduling capabilities.

**All Hands Mode:**
- New `ALL_HANDS` assignment type for team event types
- Book meetings where all team members attend (not just rotating hosts)
- All members added as attendees with individual RSVP tracking

**RSVP System:**
- Team attendees receive unique `response_token` for accepting/declining
- Public RSVP page at `/rsvp/{token}` for viewing booking details and responding
- Attendee status tracking: `pending`, `confirmed`, `declined`
- Email notifications for RSVP invitations

**Team Calendar View:**
- New page at `/booking/team-calendar`
- Visual overview of team availability across the week
- Overlapping available slots highlighted
- Filter by team event type or workspace team
- Copy booking link functionality

**Custom Booking Links:**
- Workspace landing page: `/book/{workspace}` - Lists all public event types
- Team-specific booking: `/book/{workspace}/{event}/team/{team}`
- Custom member selection via query params: `?members=id1,id2,id3`
- Clean URL structure with workspace and event slugs

**New Database Table:**
- `booking_attendees` - Stores team meeting attendees with RSVP status and response tokens

**New API Endpoints:**
- `GET /booking/rsvp/{token}` - Get booking details for RSVP
- `POST /booking/rsvp/{token}/respond` - Submit RSVP response (accept/decline)
- `GET /public/book/{workspace}/teams` - List workspace teams for booking
- `GET /public/book/{workspace}/team/{team_id}` - Get team info for booking page
- `GET /booking/calendars/callback/{provider}` - OAuth callback endpoint

**New Frontend Pages:**
- `/booking/team-calendar` - Team availability calendar view
- `/book/{workspace}` - Public workspace landing page
- `/book/{workspace}/{event}/team/{team}` - Team-specific booking page
- `/rsvp/{token}` - Public RSVP response page

#### Documentation & Website

- Added comprehensive booking module documentation at `/docs/booking.md`
- Added booking product page at `/products/booking`
- Updated `/docs/README.md` to include booking in documentation index
- Updated `/docs/google.md` with booking calendar callback URLs

### Fixed

**Calendar OAuth Flow:**
- Fixed "Method Not Allowed" error when connecting Google/Microsoft calendars
- Refactored to use standard OAuth callback pattern (backend receives redirect)
- OAuth state now signed with HMAC for security
- Proper error handling with user-friendly redirect messages

**Callback URL Change:**
- Old: Frontend received OAuth redirect, then POST to backend
- New: Backend receives OAuth redirect directly at `/api/v1/booking/calendars/callback/{provider}`
- Backend exchanges code for tokens and redirects user to frontend with success/error params

### Changed

- Calendar OAuth redirect URIs now point to backend callback endpoints
- Frontend calendars page handles `?success=true` and `?error=...` query params

---

## [0.2.0] - 2026-01-22

### Added

#### Knowledge Graph for Docs (Enterprise)

An intelligent knowledge graph feature that automatically extracts entities from documentation and visualizes relationships in an interactive force-directed graph.

**Core Features:**
- **LLM-powered Entity Extraction**: Automatically identifies people, concepts, technologies, projects, organizations, and code references from markdown documents
- **Interactive Graph Visualization**: Force-directed layout using @xyflow/react and d3-force with zoom, pan, and drag capabilities
- **Relationship Mapping**: Tracks connections between entities and documents with strength-based edge visualization
- **Discovery Tools**: Entity search, path finding between nodes, and neighborhood exploration

**Entity Types:**
- Person (team members, authors, stakeholders)
- Concept (technical/business concepts)
- Technology (languages, frameworks, tools)
- Project (product/project names)
- Organization (teams, companies)
- Code (functions, classes, APIs)
- External (URLs, external references)

**Relationship Types:**
- `mentions`, `related_to`, `depends_on`, `authored_by`, `implements`, `references`, `links_to`, `shares_entity`

**Backend Components:**
- Database tables: `knowledge_entities`, `knowledge_entity_mentions`, `knowledge_relationships`, `knowledge_document_relationships`, `knowledge_extraction_jobs`
- SQLAlchemy models with full type annotations
- RESTful API endpoints under `/workspaces/{id}/knowledge-graph/`
- Services: `KnowledgeExtractionService`, `KnowledgeGraphService`
- Celery tasks for async extraction processing

**API Endpoints:**
- `GET /graph` - Full graph data with filters
- `GET /graph/document/{id}` - Document-centric view
- `GET /graph/entity/{id}` - Entity neighborhood
- `GET /entities` - List/search entities
- `GET /path` - Find path between nodes
- `GET /statistics` - Graph statistics
- `GET /temporal` - Timeline data
- `POST /extract` - Trigger extraction
- `GET /jobs` - Extraction job status

**Frontend Components:**
- Knowledge Graph page at `/docs/knowledge-graph`
- Interactive canvas with custom document and entity nodes
- Toolbar with search, filters, and view controls
- Sidebar panel for node details
- Timeline slider for temporal filtering
- Enterprise gate with upgrade prompt for non-Enterprise users

**Temporal Features:**
- Timeline filtering by date range
- Activity tracking with node color intensity
- First seen / last seen timestamps for entities

**Quality Metrics:**
- Confidence scoring for extracted entities
- Occurrence counting across documents
- Relationship strength calculation

#### Calendar Booking Module

A comprehensive calendar booking system similar to Calendly, fully integrated into the Aexy ecosystem.

**Core Features:**
- **Event Types**: Create and manage bookable event types with customizable durations (15, 30, 45, 60+ minutes)
- **Public Booking Pages**: Shareable booking links for external users to schedule meetings
- **Availability Management**: Set weekly availability schedules with timezone support
- **Date Overrides**: Configure vacation days, holidays, and special hours
- **Calendar Integrations**: Connect Google Calendar and Microsoft Outlook for conflict detection

**Backend Components:**
- Database models: `EventType`, `Booking`, `UserAvailability`, `AvailabilityOverride`, `CalendarConnection`, `TeamEventMember`, `BookingWebhook`
- RESTful API endpoints for event types, bookings, availability, and calendar management
- Services: `BookingService`, `AvailabilityService`, `CalendarSyncService`, `BookingPaymentService`, `BookingNotificationService`
- Celery background tasks for reminders, calendar sync, and cleanup

**Frontend Pages:**
- `/booking` - Booking dashboard with stats, event types overview, and upcoming bookings
- `/booking/event-types` - List and manage event types
- `/booking/event-types/new` - Create new event type
- `/booking/event-types/[id]` - Edit existing event type
- `/booking/availability` - Weekly availability schedule editor
- `/booking/calendars` - Calendar connections management

**Public Booking Pages:**
- `/public/book/[workspace]/[event]` - Public event booking page with calendar picker
- `/public/book/confirmation/[bookingId]` - Booking confirmation page
- `/public/book/cancel/[bookingId]` - Booking cancellation page
- `/public/book/reschedule/[bookingId]` - Booking reschedule page

**Event Type Configuration:**
- Custom name, slug, and description
- Duration options (15-120 minutes)
- Location types: Zoom, Google Meet, Phone, In-Person, Custom
- Buffer times before and after meetings
- Minimum notice and maximum future booking windows
- Custom intake questions for invitees
- Color coding for visual organization

**Availability Features:**
- Weekly recurring availability slots
- Multiple time slots per day
- Timezone-aware scheduling (UTC, ET, CT, MT, PT, GMT, CET, JST)
- Date-specific overrides for vacations and holidays

**Calendar Integration:**
- Google Calendar OAuth connection
- Microsoft Outlook OAuth connection
- Automatic conflict detection from connected calendars
- Event creation in primary calendar on booking
- Manual and automatic sync (every 5 minutes)
- Primary calendar designation

**Booking Management:**
- Booking status tracking (pending, confirmed, cancelled, completed, no-show)
- Cancellation with reason tracking
- Reschedule functionality
- Booking statistics and metrics

**Access Control Integration:**
- Added to sidebar under "Business" section
- Sub-navigation: Event Types, Availability, Calendars
- App bundle configuration:
  - Engineering bundle: Booking disabled
  - People bundle: Booking disabled
  - Business bundle: Booking enabled with all modules
  - Full Access bundle: Booking enabled with all modules
- Permission: `can_view_booking`

**Background Tasks (Celery):**
- `send_booking_reminders` - Send reminder emails 24h and 1h before meetings
- `sync_all_calendars` - Periodic calendar synchronization
- `process_booking_webhooks` - Dispatch webhooks to registered endpoints
- `cleanup_expired_pending_bookings` - Cancel stale pending bookings
- `mark_completed_bookings` - Auto-mark past bookings as completed
- `generate_booking_analytics` - Generate booking statistics

**Enterprise Features (Planned):**
- Payment collection via Stripe
- Custom branding
- Webhooks for external integrations
- Advanced analytics

#### Developer Tools

**Migration Runner Script:**
- New `backend/scripts/run_migrations.py` for running SQL migrations
- Tracks applied migrations in `schema_migrations` table with checksums
- Supports `--list`, `--dry-run`, `--file`, `--force`, `--database-url` options
- Detects changed migrations via MD5 checksum comparison
- Works both locally and on production servers

**Test Token Generator:**
- New `backend/scripts/generate_test_token.py` for API testing
- Lists available developers and generates JWT tokens
- Configurable token expiration

### Changed

- Updated sidebar layouts to include Booking module
- Extended app definitions catalog with booking app and modules

### Fixed

- Calendar list API response handling in frontend

---

## [0.1.1] - Initial Release

The foundational release of Aexy - a comprehensive Engineering OS platform for team management, performance tracking, hiring, and business operations.

### Added

#### Dashboard & Analytics

**Customizable Dashboards:**
- Role-based preset layouts (developer, manager, product, HR, support, sales, admin)
- Widget management with visibility toggles and size customization
- Grid-based layout configuration with drag-and-drop
- Dashboard preferences persistence per user

#### Tracking Module

**Daily Standups:**
- Standup records with yesterday summary, today plans, and blockers
- Slack integration for submission via commands and channels
- LLM-powered parsing for task references and blocker extraction
- Sentiment scoring and productivity signal detection
- Team mood analysis and participation metrics

**Work Logs:**
- Multiple entry types (progress, note, question, decision, update)
- Manual and inferred time tracking with confidence scoring
- External task reference support
- Slack and web submission sources

**Time Tracking:**
- Duration-based time entries with optional start/end timestamps
- Inferred time from activity patterns
- Confidence scoring for automated entries

**Blockers:**
- Severity levels (low, medium, high, critical)
- Categories (technical, dependency, resource, external, process)
- Status workflow (active, resolved, escalated)
- Resolution tracking with time metrics

**Activity Patterns:**
- Per-developer activity aggregation
- Standup consistency scoring and streaks
- Work log frequency analysis
- Active hours and days detection
- Slack activity signals and response times

#### Sprint Planning & Task Management

**Sprint Management:**
- Sprint lifecycle (planning, active, review, retrospective, completed)
- Capacity and velocity tracking
- Sprint goals with JSONB configuration
- Planning sessions with participant and decision logging

**Task Management:**
- Task hierarchies with parent/child relationships
- External sources (GitHub, Jira, Linear, manual)
- Rich descriptions with TipTap editor
- Story point estimation and priority levels
- Custom workspace statuses with colors and icons
- Cycle time and lead time metrics
- AI-based assignment suggestions
- Carry-over tracking across sprints

**Task Types:**
- Task, bug, subtask, spike, chore, feature
- Custom fields (text, number, select, multiselect, date, URL)
- Field validation and ordering

**Sprint Metrics:**
- Daily snapshots with burndown tracking
- Task completion metrics
- Team velocity with focus factor
- Completion rates and carry-over analysis

**Retrospectives:**
- Went-well, to-improve, action items structure
- Team mood scoring (1-5 scale)
- Voting on retrospective items
- Action item assignment and tracking

**Task Templates:**
- Reusable templates with variables
- Default priority, story points, and labels
- Subtask and checklist templates
- Usage tracking

**GitHub Integration:**
- Task links to commits and pull requests
- Auto-link detection via patterns (Fixes, Closes, Refs)
- Reference metadata tracking

#### Performance Reviews & Goals

**Review Cycles:**
- Configurable periods (annual, semi-annual, quarterly, custom)
- Phase workflow (self-review, peer-review, manager-review, completed)
- Anonymous peer review support
- Customizable questions and rating scales
- GitHub metrics integration

**Individual Reviews:**
- Manager assignment with source tracking
- Contribution summary caching
- Overall ratings with criteria breakdown
- AI-generated review summaries

**Review Submissions:**
- COIN framework (Context, Observation, Impact, Next Steps)
- Self, peer, and manager submission types
- Anonymous tokens for peer reviews
- Linked goals and contributions as evidence

**Peer Review Requests:**
- Employee-initiated and manager-assigned modes
- Request status tracking
- Deadline management

**Work Goals (SMART Framework):**
- Goal types (performance, skill, project, leadership, team contribution)
- Key results with target tracking (OKR-style)
- Progress percentage and status tracking
- Auto-linked GitHub activity
- Learning path integration
- Review cycle association

**Contribution Summaries:**
- GitHub metrics (commits, PRs, code reviews)
- Skills demonstrated tracking
- Repository breakdown
- Notable PR identification
- AI-generated insights

#### Hiring & Assessments

**Assessment Platform:**
- Multi-step wizard for creation
- Job designation and experience targeting
- Skill-based assessments with weighting
- Status lifecycle (draft, active, completed, archived)

**Question Types:**
- Code questions with test cases and starter code
- Multiple choice (single/multiple correct)
- Subjective questions with sample answers
- Pseudo-code questions
- Audio questions (repeat, transcribe, spoken answer, read-speak)

**Question Configuration:**
- Topic and subtopic organization
- Difficulty levels (easy, medium, hard)
- Time estimates and max marks
- Constraints and hints
- AI generation with metadata
- Reusable question bank

**Assessment Settings:**
- Schedule and timezone support
- Access window configuration
- Custom candidate fields
- Email template customization
- Proctoring (webcam, screen recording, face detection, tab tracking)
- Security (shuffle, copy-paste prevention)

**Candidates:**
- Profiles with resume, LinkedIn, GitHub, portfolio
- Custom fields and source tracking
- Invitation management with tokens
- Email open and click tracking
- Deadline management

**Attempts & Proctoring:**
- Multiple attempts with limiting
- Trust score calculation
- Proctoring event tracking with severity
- Video recording (webcam and screen)
- IP address and device tracking

**Evaluation:**
- AI-powered scoring with percentages
- Test case results for code
- Code quality analysis (complexity, readability, security)
- Rubric-based scoring
- Strong/weak areas identification
- Recommendations (strong_yes, yes, maybe, no)

**Question Analytics:**
- Score distribution and percentiles
- Time-to-completion metrics
- Difficulty calibration
- Skip and completion rates

#### CRM Module

**Objects & Attributes:**
- Standard objects (Company, Person, Deal, Project)
- Custom object support
- 20+ field types (text, currency, date, select, record references)
- AI-computed fields for enrichment

**Records:**
- Flexible JSONB storage
- Ownership and creator tracking
- Soft delete with archive
- Source tracking (manual, email sync, API, import)
- Record relationships (one-to-many, many-to-many)

**Record Lists:**
- View types (table, kanban, calendar, timeline, gallery)
- Advanced filtering and sorting
- Kanban with group-by and WIP limits
- Calendar view with date attributes
- Manual ordering

**Activities:**
- 25+ activity types
- Communication tracking (email, call, meeting)
- Record change history
- Note and task management
- External engagement tracking

**Automations:**
- Triggers (record created/updated/deleted, field changed, scheduled, webhook, form)
- Condition-based filtering
- Multi-action sequences
- Error handling modes
- Rate limiting and execution tracking

**Sequences & Campaigns:**
- Multi-step sequences
- Step types (email, task, wait, condition, action)
- Configurable delays
- Exit conditions (reply, meeting booked, deal created)
- Send window configuration
- Enrollment tracking

**Webhooks:**
- Outgoing subscriptions
- Event filtering
- HMAC signature verification
- Custom headers
- Retry with backoff

#### Email Marketing

**Templates:**
- Code-based with Jinja2
- Visual builder with drag-drop
- Categories (marketing, onboarding, release, transactional, newsletter)
- Variable support with types
- Template versioning

**Campaigns:**
- Types (one-time, recurring, triggered)
- Audience targeting via CRM lists
- Status lifecycle (draft, scheduled, sending, sent, paused, cancelled)
- Optimal send window scheduling
- Multi-domain sending infrastructure
- Template context overrides
- Statistics (sent, delivered, opened, clicked, bounced, unsubscribed)

**Recipient Tracking:**
- Individual status tracking
- Engagement metrics (opens, clicks)
- Bounce classification (hard, soft)
- Multi-domain sending tracking
- Personalization context

**Email Tracking:**
- Open tracking via pixel
- Device and client detection
- Link click tracking
- User agent and IP logging

**Analytics:**
- Time-series (daily, hourly)
- Rate calculations (open, click, click-to-open)
- Workspace aggregates (daily, weekly, monthly)
- Health metrics (bounce rate, complaint rate)

**Subscriber Management:**
- Global status (active, unsubscribed, bounced, complained)
- Verification tracking
- Subscription categories with frequency
- Unsubscribe event logging

#### Documentation Module

**Document Management:**
- Notion-like spaces with team organization
- Templates with AI generation
- Rich content editing with code blocks
- Version history and change tracking
- Collaborative editing with mentions

**Sharing & Permissions:**
- Granular permissions (view, comment, edit, admin)
- Privacy levels (private, workspace, public)
- Code file linking for references

**Collaboration:**
- Comments and discussions
- Notifications (comment, mention, share, edit)
- Search and filtering

#### Forms Module

**Form Builder:**
- Standalone forms with multi-destination routing
- Templates (bug report, feature request, support, contact, lead capture, feedback)
- Field types (text, textarea, email, phone, number, URL, select, checkbox, radio, file, date, hidden)

**Form Features:**
- Public sharing (anonymous/verified modes)
- Multi-destination support (CRM, ticketing, email)
- Ticket creation from submissions
- CRM record creation/linking
- Email notification routing
- Conditional logic and field dependencies

**Analytics:**
- Submission tracking
- Status tracking (pending, processing, completed, failed)

#### Learning Management

**Learning Goals:**
- Manager-set goals for team members
- Types (course, hours, skill, certification, path, custom)
- Status tracking (pending, in progress, completed, cancelled, overdue)
- Due date and progress tracking

**Approvals:**
- Request system for courses, certifications, conferences
- Multi-level workflows
- Budget impact assessment

**Budget Management:**
- Team and individual budgets
- Transaction tracking (allocation, adjustment, expense, refund)
- Utilization metrics
- Department-level management

#### Ticketing System

**Ticket Management:**
- Ticket creation from forms and manual entry
- Status and priority tracking
- Assignment workflows
- SLA management

#### Core Platform

**Multi-Workspace:**
- Workspace isolation
- Team management
- Organization structure
- Role-based access control
- App-wise member access

**Integrations:**
- **Slack**: Standups, work logs, blockers via commands and channels
- **GitHub**: Repository sync, commits, PRs, contribution metrics
- **LLM Providers**: Claude, Gemini, Ollama with rate limiting
- **Email**: Multi-domain sending, SES, SendGrid, SMTP

**Security & Compliance:**
- Soft delete for data recovery
- Audit trails
- User permissions
- Activity logging
