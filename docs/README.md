# Aexy Documentation

**Aexy** is the open-source operating system for engineering organizations. Built with AI to help teams understand their work, optimize operations, and build talent—all in one platform.

## Mission

We're on a mission to bring positive change by building world-class tools actually accessible for everyone using AI. We believe good companies can be created by good people with good culture.

[Read our full mission →](/mission)

## Documentation Index

### Architecture & Design
- [System Architecture](./architecture/system-architecture.md) - High-level system design and components
- [Tech Stack](./architecture/tech-stack.md) - Technologies and frameworks used
- [Database Schema](./architecture/database-schema.md) - Data models and relationships
- [LLM Integration](./architecture/llm-integration.md) - AI/LLM provider architecture

### API Reference
- [API Overview](./api/overview.md) - Base URL, live Swagger/ReDoc, pointers to the cross-cutting API docs
- [Tracker ingest API](./api/tracker-ingest.md) - Aexy Tracker device enrollment + idempotent event ingest contract

### For administrators
- [Setting up a workspace](./guides/workspace-setup.md) - The first hour: people, apps, departments, modules
- [Roles, permissions & app access](./guides/roles-and-access.md) - Why two colleagues see different things, and how to change it
- [Email and inbox setup](./guides/email-setup.md) - Mail arriving and mail leaving, and which module reads which
- [Importing your data](./guides/importing-data.md) - CRM, prospects, wikis and spreadsheets, and what no import does for you
- [Working hours, holidays & the clocks](./guides/working-hours-and-clocks.md) - The shift, the one holiday calendar, and which clock is which

### Getting started & operations
- [Getting Started](./guides/getting-started.md) - Quick start guide
- [Deployment](./guides/deployment.md) - Production deployment guide
- [Database Operations](./guides/database-operations.md) - Migrations, backups, restores, postgres rebuilds, pgvector upgrades
- [CLI Usage](./guides/cli-usage.md) - Command-line interface guide
- [VS Code Extension](./guides/vscode-extension.md) - IDE extension guide

### Developer guides (cross-cutting)
- [Adding a feature](./guides/adding-a-feature.md) - Full-stack checklist for a new module
- [API conventions](./guides/api-conventions.md) - URL shape, pagination, errors, status codes
- [Authentication & permissions](./guides/authentication.md) - JWT, OAuth, workspaces, RBAC, API tokens
- [Temporal](./guides/temporal.md) - Workflows, activities, schedules, retries, idempotency
- [Webhooks](./guides/webhooks.md) - Inbound + outbound signing and delivery
- [File uploads & object storage](./guides/file-uploads.md) - RustFS / S3 + presigned URLs + AI metadata pipeline
- [Internationalization (i18n)](./guides/i18n.md) - next-intl, cookie-based locale, message files
- [Frontend conventions](./guides/frontend-conventions.md) - App Router, React Query, Zustand, generated client

### Provider setup
- [Google integration](./google.md) - Sign-in, Gmail & Calendar
- [Microsoft integration](./microsoft.md) - Sign-in, Outlook & Calendar (Microsoft Graph)
- [Slack](./slack.md) - Bot install, slash commands, OAuth
- [Stripe](./stripe.md) - Billing & subscriptions
- [MCP (Model Context Protocol)](./mcp.md) - Connect Claude Code, Claude Desktop, Codex, Cursor & VS Code to Aexy
- [OpenObserve](./integrations/openobserve.md) - Log and trace shipping

### Modules — Work & planning
- [Sprints & planning](./sprints.md) - The board, the backlog, running a cycle, estimating together
- [Sprints & planning architecture](./sprints-architecture.md) - Models, lifecycle endpoints, poker sessions, external sync
- [Tickets & projects](./tickets-and-projects.md) - Raising tickets, where the queue lives, forms, converting to work
- [Tickets & projects architecture](./tickets-and-projects-architecture.md) - The four work-item models, statuses, sync, public projects
- [Service Desk](./service-desk.md) - Running a desk: mailboxes, master data, handoffs, the clock, reports
- [Service Desk architecture](./service-desk-architecture.md) - How it is built: intake pipeline, models, API, frontend
- [Booking](./booking.md) - Calendar scheduling, team bookings & RSVP
- [Tracking](./tracking.md) - Standups, time entries, blockers, entity activity
- [Aexy Tracker](./aexy-tracker.md) - macOS work tracker + AI auto-attribution (timesheet, journals, insights)

### Modules — Core
- [Dashboard](./dashboard.md) - My Work, the widget grid, presets
- [Organization](./organization.md) - Departments, placing people, reporting lines, and what a department switches on
- [Organization architecture](./organization-architecture.md) - The tree, access resolution, positions, the directory read

### Modules — People
- [Reviews, hiring & learning](./reviews-and-people.md) - Performance reviews, hiring & assessments, learning paths
- [Compliance](./compliance.md) - Mandatory training, certifications, reminders, escalation, audit
- [Reminders (guide)](./guides/reminders.md) - The narrower how-to for recurring compliance reminders
- [Leave](./leave.md) - Types, policies, balances, requesting and approving, the holiday calendar
- [Leave architecture](./leave-architecture.md) - Endpoints, models, the request workflow, carry-forward

### Modules — Customers
- [CRM](./crm.md) - Objects and records, lists, pipelines, automations, sequences
- [CRM architecture](./crm-architecture.md) - Storage, the attribute system, the automation engine, webhooks
- [GTM](./gtm.md) - Lead scoring, ABM, outreach sequences, intent, expansion playbooks
- [Forms](./forms.md) - Public form builder, themes, conditional logic, ticket/CRM/deal routing
- [Tables](./tables.md) - Airtable-style custom data tables with saved views
- [Email Marketing](./email-marketing.md) - Campaigns, automation & infrastructure

### Modules — AI & knowledge
- [AI Agents](./ai-agents.md) - LangGraph-based agents with CRM/email tools
- [Workflows & automations](./workflows-and-automations.md) - Automation triggers/actions + visual workflows + agent policies
- [Knowledge base](./knowledge-base.md) - Spaces, pages, collaborative editing, review and freshness, search, publishing, import & export
- [Documents, Drive & Knowledge Graph](./documents-and-drive.md) - Architecture behind the above, plus Drive, the AI metadata pipeline and MCP
- [Drive](./drive.md) - Files, folders, smart views, quota

### Modules — Observability
- [Analytics, insights & reports](./analytics.md) - Dashboards, snapshots, custom reports, predictions, intelligence
- [Uptime Monitoring](./uptime.md) - Endpoint monitoring & incident management
- [Reports](./reports.md) - Custom report builder, templates, schedules, exports
- [On-Call](./oncall.md) - Team rotations, schedules, swaps, overrides

### Modules — Communication
- [Notifications & chat](./notifications-and-chat.md) - In-app/web push/email/Slack delivery, chat, onboarding, profile
- [Community](./community.md) - The public forum built on chat: visibility contract, participation, starter templates, opt-in links

### Testing
- [Testing Strategy](./testing/testing-strategy.md) - Overall testing approach

## Products

Aexy is a complete Engineering OS with 10 integrated products:

| Product | Description |
|---------|-------------|
| **Activity Tracking** | Real-time visibility into engineering activity |
| **Sprint Planning** | AI-powered capacity planning and sprint management |
| **Ticketing** | Keyboard-first issue tracking |
| **Forms** | Drag-and-drop form builder |
| **Documentation** | Connected team knowledge base |
| **Performance Reviews** | 360° feedback and SMART goals |
| **Learning & Dev** | Personalized skill growth paths |
| **Technical Hiring** | AI-powered assessments |
| **CRM** | Relationship management for teams |
| **Email Marketing** | Campaigns, automation & multi-domain infrastructure |
| **Booking** | Calendar scheduling with team support |
| **AI Agents** | Intelligent automation for email, support & workflows |

## For Different Personas

- **Engineering Managers** - Visibility and planning tools
- **Developers** - No surveillance, just growth
- **CTOs & VPs** - Scale with confidence
- **HR & People Ops** - Hiring, reviews, and L&D

## Quick Links

| Resource | Description |
|----------|-------------|
| [API Endpoints](./api/overview.md) | Complete API reference |
| [Getting Started](./guides/getting-started.md) | Development setup |

## Why Open Source

We believe in transparency:
- See how every metric is calculated
- Every algorithm is open-source and auditable
- Your data is always yours
- No vendor lock-in
- Community-driven development

## Project Status

- **Phase 1**: Foundation - Complete
- **Phase 2**: Intelligence - Complete
- **Phase 3**: Career - Complete
- **Phase 4**: Scale - Complete
- **Phase 5**: Email Marketing & Engagement - Complete

## Links

- [Website](https://aexy.io)
- [GitHub](https://github.com/aexy-io/aexy)

## License

Aexy is dual-licensed:

- **AGPL v3** for open-source and internal use
- **Commercial License** for SaaS, closed-source, or competitive use

If you want to offer Aexy as a hosted service without AGPL obligations,
you must obtain a commercial license.

Contact: licensing@aexy.io

