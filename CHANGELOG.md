# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
