# E2E Test Coverage Tracker

## Coverage Summary
- **Total App Route Modules**: 30
- **Modules with Tests**: 21
- **Modules Missing Tests**: 9
- **Route Coverage**: 70%
- **Last Updated**: 2026-02-15
- **Target**: 100%

## Module Coverage Matrix

| Module | Route(s) | Test File | Status | Flows Covered | Notes |
|--------|----------|-----------|--------|---------------|-------|
| Dashboard | /dashboard | dashboard.spec.ts | Complete | Widget rendering, ordering, edit layout, customize modal, presets, grid | 18 tests |
| Settings | /settings, /settings/* | settings.spec.ts | Complete | Hub nav, appearance, billing, repos, org, projects, integrations, task config, ticket forms, escalation, access control | 76 tests |
| Insights | /insights, /insights/me, /insights/leaderboard, /insights/repositories, /insights/ai | insights.spec.ts | Partial | Team, My, Leaderboard, Repositories, AI, Navigation, Empty/No-install states | Missing: compare, allocations, alerts, executive, sprint-capacity, sync-status, developer detail |
| Tracking | /tracking, /tracking/standups, /tracking/blockers, /tracking/time | tracking.spec.ts | Partial | Main page, standups, blockers, time tracking | Missing: analytics, standups/team, team/[teamId] |
| Sprints | /sprints, /sprints/[projectId]/* | sprints.spec.ts | Partial | Project list, sprint board, backlog, detail, analytics, retro, epics | Missing: roadmap, timeline, releases, goals, bugs, stories, templates |
| Epics | /sprints?tab=epics, /sprints/epics/[epicId] | epics.spec.ts | Complete | Epics tab, epic detail, tasks, empty/error states | 75 tests |
| Tickets | /tickets, /tickets/[ticketId] | tickets.spec.ts | Complete | List, detail, create, filters, SLA, comments, empty/error states | 101 tests |
| Booking | /booking, /booking/event-types, /booking/availability, /booking/calendars | booking.spec.ts | Partial | Dashboard, event types, availability, calendars | Missing: event-types/new, event-types/[id], bookings/[id], team-calendar |
| CRM | /crm, /crm/contacts, /crm/activities | crm.spec.ts | Partial | Dashboard, object views, activities | Missing: agents, automations, calendar, inbox, settings, onboarding |
| Compliance | /compliance, /compliance/certifications, /compliance/documents, /compliance/training | compliance.spec.ts | Partial | Dashboard, certifications, documents, training | Missing: calendar, reminders, documents/[id] |
| Email Marketing | /email-marketing | email-marketing.spec.ts | Partial | Dashboard overview | Missing: campaigns, templates, settings sub-pages |
| Docs | /docs | docs.spec.ts | Partial | List view | Missing: [documentId] detail, knowledge-graph |
| Forms | /forms | forms.spec.ts | Partial | List view | Missing: [formId] detail |
| Agents | /agents, /agents/new, /agents/[agentId] | agents.spec.ts | Complete | List, create, detail, chat, inbox, edit, empty/error states | 27 tests |
| Automations | /automations | automations.spec.ts | Partial | List view | Missing: [automationId] detail, new |
| Learning | /learning | learning.spec.ts | Partial | Main page | Missing: analytics, compliance, integrations, manager |
| Leave | /leave | leave.spec.ts | Complete | Balances, requests, apply, approve/reject, holidays, policies, team calendar, who-is-out, empty/error states | 119 tests |
| Reviews | /reviews, /reviews/* | reviews.spec.ts | Complete | Dashboard, cycles, goals, manage, peer-requests, CRUD flows | 104 tests |
| Hiring | /hiring, /hiring/* | hiring.spec.ts | Complete | Dashboard, assessments, candidates, questions, templates, analytics, CRUD | 85 tests |
| Uptime | /uptime | uptime.spec.ts | Partial | Main page only | Missing: monitors, incidents, history sub-pages |
| Analytics | /analytics | -- | Missing | -- | Needs full test suite |
| Reports | /reports | -- | Missing | -- | Needs full test suite |
| Profile | /profile | -- | Missing | -- | Needs full test suite |
| Onboarding | /onboarding/* | -- | Missing | -- | Needs full test suite |
| Reminders | /reminders/* | -- | Missing | -- | Needs full test suite |

## Detailed Coverage by Area

### Fully Covered Modules
- [x] Dashboard (18 tests)
- [x] Settings Hub + all sub-pages (76 tests)
- [x] Agents (27 tests)
- [x] Tickets (101 tests)
- [x] Leave Management (119 tests)
- [x] Reviews (104 tests)
- [x] Hiring (85 tests)
- [x] Epics (75 tests)

### Partially Covered Modules
- [~] Insights (47 tests) -- missing 7 sub-pages
- [~] Tracking (41 tests) -- missing 3 sub-pages
- [~] Sprints (84 tests) -- missing 7 sub-pages
- [~] Booking (36 tests) -- missing 4 sub-pages
- [~] CRM (37 tests) -- missing 6 sub-pages
- [~] Compliance (32 tests) -- missing 3 sub-pages
- [~] Email Marketing (36 tests) -- missing 3 sub-pages
- [~] Uptime (7 tests) -- missing 4 sub-pages
- [~] Docs (7 tests) -- missing 2 sub-pages
- [~] Forms (7 tests) -- missing 1 sub-page
- [~] Automations (7 tests) -- missing 2 sub-pages
- [~] Learning (6 tests) -- missing 4 sub-pages

### Uncovered Modules
- [ ] Analytics
- [ ] Reports
- [ ] Profile
- [ ] Onboarding
- [ ] Reminders

## Uncovered Flows (Priority Queue)
1. [HIGH] Analytics page - no tests exist
2. [HIGH] Reports page - no tests exist
3. [HIGH] Profile page - no tests exist
4. [HIGH] Onboarding flow - no tests exist (7 pages)
5. [HIGH] Reminders module - no tests exist (6 pages)
6. [MED] Uptime sub-pages (monitors, incidents, history)
7. [MED] Insights sub-pages (compare, allocations, alerts, executive, sprint-capacity, sync-status, developer detail)
8. [MED] Tracking sub-pages (analytics, standups/team, team detail)
9. [MED] Sprints sub-pages (roadmap, timeline, releases, goals, bugs, stories, templates)
10. [MED] CRM sub-pages (agents, automations, calendar, inbox, settings, onboarding)
11. [MED] Booking sub-pages (event-types/new, event-types/[id], bookings/[id], team-calendar)
12. [MED] Compliance sub-pages (calendar, reminders, documents/[id])
13. [MED] Email Marketing sub-pages (campaigns, templates, settings)
14. [LOW] Docs sub-pages (document detail, knowledge-graph)
15. [LOW] Forms sub-pages (form detail)
16. [LOW] Automations sub-pages (detail, new)
17. [LOW] Learning sub-pages (analytics, compliance, integrations, manager)
18. [LOW] Settings sub-pages not yet covered (plans, email-delivery, insights, org/roles, access/logs, access/templates)
