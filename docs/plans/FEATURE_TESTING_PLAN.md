# Aexy Feature Testing & Implementation Plan

> Generated: January 29, 2026

## Overview

This document tracks the testing and implementation status of all Aexy features documented in the pitch materials and technical docs.

---

## Implementation Status Summary

| Category | Features | API Modules | Status |
|----------|----------|-------------|--------|
| Core Products | 10 | 76 | Mostly Built |
| Analytics | 6 | Yes | Built |
| Integrations | 5 | Yes | Built |
| Client Tools | 3 | Partial | Needs Testing |

---

## Task Tracker

### Core Products

| # | Feature | Description | Status | Priority |
|---|---------|-------------|--------|----------|
| 1 | Activity Tracking | GitHub webhooks, developer profiles, language detection | pending | High |
| 2 | Sprint Planning | AI capacity planning, multi-source tasks, velocity tracking | pending | High |
| 3 | Uptime Monitoring | HTTP/TCP/WebSocket monitoring, incidents, alerts | pending | High |
| 10 | Forms & Workflows | Form builder, escalation rules, automation | pending | Medium |
| 12 | Documentation | Knowledge base, document spaces | pending | Medium |
| 13 | Performance Reviews | 360° feedback, SMART goals, LLM analysis | pending | Medium |
| 17 | Booking/Calendar | Event types, public booking pages, team scheduling | pending | Medium |

### Intelligence & Analytics

| # | Feature | Description | Status | Priority |
|---|---------|-------------|--------|----------|
| 4 | Analytics & Predictions | Skill heatmaps, productivity trends, attrition/burnout risk | pending | High |
| 5 | Learning & Development | Career paths, gap analysis, LLM recommendations | pending | Medium |
| 6 | Hiring Intelligence | Skill gaps, JD generation, interview rubrics | pending | Medium |
| 15 | Assessments | Question bank, assessment taking, scoring | pending | Medium |

### Integrations

| # | Feature | Description | Status | Priority |
|---|---------|-------------|--------|----------|
| 7 | Email Marketing | Multi-domain, campaigns, visual builder, tracking | pending | Medium |
| 8 | CRM & Google | Gmail/Calendar sync, contact enrichment | pending | Medium |
| 9 | Slack | OAuth, commands, events, notifications | pending | High |
| 11 | On-Call | Schedules, incident routing, escalations | pending | High |
| 14 | Billing (Stripe) | Plans, subscriptions, webhooks | pending | Medium |

### Platform & Clients

| # | Feature | Description | Status | Priority |
|---|---------|-------------|--------|----------|
| 16 | Workspace Management | Multi-tenant, teams, RBAC, invitations | pending | High |
| 18 | VS Code Extension | Profile view, insights, team views | pending | Low |
| 19 | CLI Tool | profile, team, match, insights, report commands | pending | Low |
| 20 | Compliance | GDPR/CCPA, data export, consent management | pending | Medium |

---

## Detailed Feature Specifications

### 1. Activity Tracking & GitHub Integration

**Endpoints:**
- `GET /developers` - List developers
- `GET /developers/{id}` - Get developer details
- `GET /developers/{id}/profile` - Get developer profile
- `GET /developers/{id}/activity` - Get activity history
- `POST /webhooks/github` - GitHub webhook receiver

**Test Cases:**
- [ ] GitHub webhook receives commit events
- [ ] PR events create activity records
- [ ] Code review activity tracked
- [ ] Multi-language detection works (20+ languages)
- [ ] Line counting accurate
- [ ] Developer profile auto-generated

---

### 2. Sprint Planning & Task Management

**Endpoints:**
- `GET/POST /sprints` - Sprint CRUD
- `GET /sprints/{id}/analytics` - Sprint analytics
- `GET /sprints/{id}/tasks` - Sprint tasks
- `GET/POST /epics` - Epic management

**Test Cases:**
- [ ] Create sprint with capacity planning
- [ ] Import tasks from Jira
- [ ] Import tasks from Linear
- [ ] Import tasks from GitHub Issues
- [ ] Sprint velocity calculation
- [ ] What-if simulation works
- [ ] Epic progress rollup

---

### 3. Uptime Monitoring System

**Endpoints:**
- `GET/POST /uptime/monitors` - Monitor CRUD
- `GET /uptime/incidents` - Incident list
- `GET /uptime/stats` - Statistics

**Test Cases:**
- [ ] HTTP monitor checks endpoint
- [ ] TCP monitor checks port
- [ ] WebSocket monitor validates messages
- [ ] SSL expiry tracking works
- [ ] Incident created on failure
- [ ] Slack notification sent
- [ ] Email notification sent
- [ ] Auto-ticket creation works

---

### 4. Analytics & Predictions

**Endpoints:**
- `GET /analytics/heatmap/*` - Skill heatmaps
- `GET /analytics/productivity` - Productivity trends
- `GET /analytics/workload` - Workload distribution
- `GET /analytics/collaboration` - Collaboration network
- `GET /predictions/attrition/{id}` - Attrition risk
- `GET /predictions/burnout/{id}` - Burnout risk
- `GET /predictions/trajectory/{id}` - Performance trajectory
- `GET /predictions/team-health` - Team health

**Test Cases:**
- [ ] Skill heatmap generates correctly
- [ ] Productivity trends over time
- [ ] Workload imbalance detected
- [ ] Collaboration network visualized
- [ ] Attrition risk prediction
- [ ] Burnout early warning
- [ ] Performance trajectory forecast

---

### 5. Learning & Career Development

**Endpoints:**
- `GET /learning/{id}/path` - Learning path
- `GET /learning/{id}/milestones` - Milestones
- `GET /learning/{id}/progress` - Progress
- `GET /career/roles` - Career roles
- `GET /career/{id}/comparison` - Role comparison

**Test Cases:**
- [ ] Learning path generated
- [ ] Gap analysis works
- [ ] LLM generates activities
- [ ] Milestone tracking
- [ ] Career ladder navigation
- [ ] Stretch assignments recommended

---

### 6. Hiring Intelligence

**Endpoints:**
- `GET /hiring/gaps` - Team skill gaps
- `POST /hiring/jd` - Generate job description
- `POST /hiring/rubric` - Generate interview rubric
- `POST /hiring/match` - Match candidates

**Test Cases:**
- [ ] Skill gap aggregation
- [ ] Bus factor analysis
- [ ] LLM generates JD
- [ ] Interview rubric created
- [ ] Candidate scoring works

---

### 7. Email Marketing System

**Endpoints:**
- `GET/POST /email-marketing/templates` - Templates
- `GET/POST /email-marketing/campaigns` - Campaigns
- `GET /email-marketing/analytics` - Analytics
- `GET/POST /visual-builder/*` - Visual builder

**Test Cases:**
- [ ] Template creation with Jinja2
- [ ] Visual builder blocks (16+ types)
- [ ] Campaign scheduling
- [ ] Open tracking pixel
- [ ] Click tracking
- [ ] GDPR preference center
- [ ] IP warming schedules
- [ ] Domain health monitoring

---

### 8. CRM & Google Integration

**Endpoints:**
- `GET/POST /crm/*` - CRM operations
- `GET /google-integration/*` - Google OAuth
- `GET /google-calendar/*` - Calendar sync

**Test Cases:**
- [ ] Gmail OAuth flow
- [ ] Email sync (full/incremental)
- [ ] Calendar event sync
- [ ] Contact enrichment with AI
- [ ] Email-to-record linking
- [ ] Meeting activity creation

---

### 9. Slack Integration

**Endpoints:**
- `GET /slack/install` - Start OAuth
- `GET /slack/callback` - OAuth callback
- `POST /slack/commands` - Slash commands
- `POST /slack/events` - Event subscriptions
- `POST /slack/interactions` - Interactive components

**Test Cases:**
- [ ] OAuth workspace installation
- [ ] Slash command handling
- [ ] Event subscription processing
- [ ] Button/menu interactions
- [ ] Direct message sending
- [ ] Channel posting (public/private)
- [ ] Incident notifications

---

### 10. Forms & Workflows

**Endpoints:**
- `GET/POST /forms` - Form management
- `POST /public_forms/*` - Public submission
- `GET/POST /workflows` - Workflow automation
- `GET/POST /escalation` - Escalation rules

**Test Cases:**
- [ ] Form builder creates form
- [ ] Public form submission
- [ ] Workflow triggered on submission
- [ ] Escalation rules execute
- [ ] Ticket created from form

---

### 11. On-Call & Incident Management

**Endpoints:**
- `GET/POST /oncall/*` - On-call schedules
- `GET/POST /escalation/*` - Escalation policies

**Test Cases:**
- [ ] On-call schedule creation
- [ ] Rotation management
- [ ] Incident auto-routing to skilled on-call
- [ ] Escalation policy execution
- [ ] Multi-channel notifications

---

### 12. Documentation & Knowledge Base

**Endpoints:**
- `GET/POST /document_spaces` - Spaces
- `GET/POST /documents` - Documents
- `GET /knowledge_graph/*` - Knowledge graph

**Test Cases:**
- [ ] Document space creation
- [ ] Document CRUD
- [ ] Knowledge graph statistics
- [ ] Search functionality
- [ ] Team knowledge linking

---

### 13. Performance Reviews

**Endpoints:**
- `GET/POST /reviews` - Review management
- `GET/POST /goals` - SMART goals

**Test Cases:**
- [ ] Review cycle creation
- [ ] 360° feedback collection
- [ ] SMART goal tracking
- [ ] LLM performance analysis
- [ ] Review summary generation

---

### 14. Billing & Stripe Integration

**Endpoints:**
- `GET/POST /billing/*` - Billing operations

**Test Cases:**
- [ ] Plan display (Free, Pro, Enterprise)
- [ ] Checkout session creation
- [ ] Subscription management
- [ ] Webhook event handling
- [ ] Customer portal access

---

### 15. Assessments & Question Bank

**Endpoints:**
- `GET/POST /assessments` - Assessment CRUD
- `GET/POST /question_bank` - Question management
- `POST /assessment_take/*` - Take assessment

**Test Cases:**
- [ ] Assessment creation
- [ ] Question bank population
- [ ] Assessment taking flow
- [ ] Auto-scoring
- [ ] Results display

---

### 16. Workspace & Team Management

**Endpoints:**
- `GET/POST /workspaces` - Workspace CRUD
- `GET/POST /teams` - Team management
- `GET/POST /workspace_teams` - Team assignment
- `GET/POST /roles` - Role management

**Test Cases:**
- [ ] Workspace creation
- [ ] Team creation
- [ ] Member invitation
- [ ] Role assignment (owner, admin, member, viewer)
- [ ] Permission enforcement
- [ ] Data isolation between workspaces

---

### 17. Booking/Calendar Scheduling

**Note:** May need implementation - no dedicated `/booking` endpoint found.

**Required Features:**
- Event type creation with duration/buffer
- Calendar integration (Google, Outlook)
- Public booking pages/URLs
- Team booking (Round Robin, Collective, All Hands)
- RSVP system
- Conflict detection
- Automatic event creation

**Implementation Tasks:**
- [ ] Create booking models
- [ ] Create booking API endpoints
- [ ] Build public booking page
- [ ] Integrate with Google Calendar
- [ ] Add team booking logic

---

### 18. VS Code Extension

**Location:** `/aexy-vscode`

**Test Cases:**
- [ ] Extension installs correctly
- [ ] Authentication flow
- [ ] Profile view displays
- [ ] Insights panel works
- [ ] Team view functionality

---

### 19. CLI Tool

**Location:** `/aexy-cli`

**Test Cases:**
- [ ] `aexy profile` - View profile
- [ ] `aexy team` - Team info
- [ ] `aexy match` - Task matching
- [ ] `aexy insights` - Get insights
- [ ] `aexy report` - Generate reports
- [ ] Authentication works

---

### 20. Compliance & Security Features

**Endpoints:**
- `GET/POST /compliance/*` - Compliance operations

**Test Cases:**
- [ ] GDPR data export
- [ ] CCPA compliance
- [ ] Data deletion request
- [ ] Consent management
- [ ] PII anonymization
- [ ] Developer opt-out

---

## API Modules Inventory

The backend has **76 API modules** implemented:

```
admin.py              epics.py              projects.py
admin_rate_limits.py  escalation.py         public_forms.py
agents.py             exports.py            question_bank.py
analysis.py           forms.py              questions.py
analytics.py          gamification.py       releases.py
app_access.py         goals.py              reports.py
assessment_take.py    google_calendar.py    repositories.py
assessments.py        google_integration.py retrospectives.py
auth.py               health.py             reviews.py
billing.py            hiring.py             roles.py
bugs.py               integrations.py       slack.py
career.py             knowledge_graph.py    sprint_analytics.py
collaboration.py      learning.py           sprint_tasks.py
compliance.py         learning_activities.py sprints.py
crm.py                learning_analytics.py stories.py
crm_automation.py     learning_integrations.py task_config.py
dashboard.py          manager_learning.py   task_templates.py
dependencies.py       notifications.py      teams.py
developers.py         oncall.py             ticket_forms.py
document_spaces.py    platform_admin.py     tickets.py
documents.py          predictions.py        tracking.py
email_infrastructure.py preferences.py      uptime.py
email_marketing.py    project_tasks.py      visual_builder.py
email_tracking.py                           webhooks.py
email_webhooks.py                           workflow_events.py
entity_activity.py                          workflows.py
                                            workspace_teams.py
                                            workspaces.py
```

---

## Testing Instructions

### Prerequisites

```bash
# Start services
docker-compose up -d

# Generate test token
cd backend && python scripts/generate_test_token.py --first
export AEXY_TEST_TOKEN="<token>"
```

### Running Tests

```bash
# Backend tests
cd backend && pytest

# Frontend tests
cd frontend && npm test

# Test specific endpoint
curl -H "Authorization: Bearer $AEXY_TEST_TOKEN" \
  http://localhost:8000/api/v1/health
```

---

## Notes

- **Phase 1-5 Complete**: Foundation, Intelligence, Career, Scale, Email Marketing
- **Booking Feature**: May need implementation (documented but no endpoint found)
- **Current Branch**: `slack-notification-bug` - has pending Slack fixes

---

## Progress Log

| Date | Task | Notes |
|------|------|-------|
| 2026-01-29 | Plan created | Initial task tracker with 20 items |

