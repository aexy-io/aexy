# Aexy - Engineering OS

Aexy is a full-stack Engineering OS platform with developer analytics, sprint planning, CRM, email marketing, AI agents, workflow automation, and many more modules.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, TailwindCSS |
| Database | PostgreSQL 18, Redis 7 |
| Background Jobs | Temporal (workflow engine) |
| AI/LLM | Claude, Gemini, OpenRouter, Ollama (abstracted gateway) |
| AI Agents | LangGraph + LangChain |
| Storage | RustFS (S3-compatible) |
| Email | Postmark (transactional + broadcast) |

## Quick Start

```bash
# Start all services
docker-compose up -d

# Services: Backend :8000, Frontend :3000, Temporal UI :8080, PostgreSQL :5432, Redis :6379
```

### Backend

```bash
cd backend
uvicorn aexy.main:app --reload          # Dev server on :8000
python -m aexy.temporal.worker           # Temporal worker
pytest                                    # Run tests
ruff check src/                           # Lint
```

### Frontend

```bash
cd frontend
npm run dev                               # Dev server on :3000
npm run build                             # Production build
npm run lint                              # ESLint
npm run test                              # Vitest unit tests
npm run test:e2e                          # Playwright E2E tests
```

### Database Migrations

Custom SQL-based migration system (not Alembic). Migration files in `backend/scripts/migrate_*.sql`.

```bash
docker exec aexy-backend python scripts/run_migrations.py --list      # Status
docker exec aexy-backend python scripts/run_migrations.py              # Run all pending
docker exec aexy-backend python scripts/run_migrations.py --file migrate_feature.sql  # Run specific
```

## Architecture

```
backend/src/aexy/
  api/            # ~100 FastAPI routers under /api/v1
  models/         # ~74 SQLAlchemy ORM models
  schemas/        # Pydantic v2 request/response schemas
  services/       # ~160 business logic service modules
  temporal/       # Workflow engine (activities, workflows, schedules)
  llm/            # Multi-provider LLM abstraction with rate limiting
  agents/         # LangGraph-based AI agents

frontend/src/
  app/            # Next.js App Router (route groups: (app), (admin), auth/, public/)
  components/     # Shared React components (Radix UI + custom)
  hooks/          # ~71 custom hooks
  lib/api.ts      # Generated API client
  stores/         # Zustand stores
  config/         # App registry, sidebar, dashboard widgets
```

## Modules

### Engineering
- **Dashboard** - Developer profiles, skill fingerprints, work patterns
- **Tracking** - Standups, blockers, time entries
- **Sprints** - Board, epics, tasks, backlog, velocity
- **Tickets** - Customer support ticketing with SLA
- **Insights** - AI-powered developer & team analytics
- **On-Call** - Scheduling and swap requests
- **Uptime** - Monitor health checks and incidents

### People
- **Reviews** - Performance review cycles, goals, peer feedback
- **Hiring** - Assessments, candidates, proctored coding tests
- **Learning** - Goals, budgets, certifications, compliance training
- **Leave** - Requests, approvals, balances, team calendar

### Business
- **CRM** - Contacts, accounts, deals, activities, automations
- **Email Marketing** - Campaigns, templates, visual builder, analytics
- **Booking** - Calendar scheduling with availability management
- **GTM** - Lead scoring, intent signals, competitor tracking, ABM

### Productivity
- **Documents** - Collaborative docs with spaces and versioning
- **Tables** - Custom data tables with views and sharing
- **Forms** - Public/private forms with automation triggers
- **Chat** - Team messaging with channels and topics
- **AI Agents** - Configurable LangGraph agents with policies
- **Automations** - Workflow definitions and execution engine

## Billing System

Flexible per-org billing with 4 models:

| Plan | Model | Description |
|------|-------|-------------|
| Free | `free` | All modules, soft limits (10 repos, 90-day history), limited AI |
| Pro | `per_seat` | $X/user/month, full AI access, 500K tokens/month included |
| Flat + Usage | `flat_plus_usage` | $Y/month flat + metered AI token usage |
| Postpaid | `postpaid` | Pay at end of billing period, per-seat + AI usage |
| Enterprise | `per_seat` | Custom pricing, SSO, dedicated support |

### Per-Org Configuration

Platform admins can override any plan field per workspace via `WorkspacePlanOverride`:
- Custom pricing, limits, and discounts
- Custom billing model (switch between per-seat, flat+usage, postpaid)
- Custom net terms (`days_until_due`)
- Payment method preference (Stripe or bank transfer)

### Bank Transfer / Offline Invoicing

For B2B customers paying via bank transfer (ACH/wire):

1. Admin generates invoice via `/settings/admin-invoices` or API
2. Customer receives invoice with amount due
3. Customer wires payment to company bank account
4. Admin marks invoice as paid with bank transfer reference

```bash
# Admin API endpoints
POST   /api/v1/platform-admin/invoices                              # Create manual invoice
POST   /api/v1/platform-admin/invoices/{id}/mark-paid               # Mark as paid
POST   /api/v1/platform-admin/invoices/{id}/void                    # Void invoice
GET    /api/v1/platform-admin/invoices                              # List invoices
POST   /api/v1/platform-admin/workspaces/{id}/generate-invoice      # Generate from usage
```

## E2E Tests

Playwright E2E tests with mocked API routes (no backend needed):

```bash
cd frontend

# Run all billing tests
npm run test:e2e:billing

# Run admin invoice tests
npm run test:e2e:invoices

# Run with headed browser
npm run test:e2e:billing:headed
npm run test:e2e:invoices:headed

# Run with Playwright UI
npm run test:e2e:billing:ui

# Run all E2E tests
npm run test:e2e
```

If the dev server is running on a non-default port:
```bash
PLAYWRIGHT_BASE_URL=http://localhost:3002 npm run test:e2e:billing
```

## Environment

```bash
# Backend (.env)
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://localhost:6379
TEMPORAL_ADDRESS=localhost:7233
SECRET_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
CLAUDE_API_KEY=...
GEMINI_API_KEY=...

# Frontend (.env)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## License

Proprietary. All rights reserved.
