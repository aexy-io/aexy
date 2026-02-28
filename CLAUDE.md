# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aexy is an Engineering OS platform — a full-stack application with developer analytics, sprint planning, CRM, email marketing, AI agents, workflow automation, and many more modules.

## Tech Stack

- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.0 (async via asyncpg), Temporal
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, Zustand, React Query
- **Database**: PostgreSQL 18 (async via asyncpg, sync via psycopg2 for background tasks)
- **Queue/Cache**: Redis 7, Temporal (workflow engine replacing Celery)
- **LLM**: Claude (Anthropic), Gemini (Google), Ollama — abstracted behind `aexy.llm.gateway`
- **AI Agents**: LangGraph + LangChain for agent orchestration
- **Storage**: RustFS (S3-compatible)

## Development Commands

### Start all services
```bash
docker-compose up -d
```
Services: Backend :8000, Frontend :3000, Mailagent :8001, Temporal UI :8080, PostgreSQL :5432, Redis :6379, RustFS :9000

### Backend

```bash
# Run backend locally (outside Docker)
cd backend && uvicorn aexy.main:app --reload

# Run Temporal worker
cd backend && python -m aexy.temporal.worker

# Run tests (uses SQLite in-memory)
cd backend && pytest

# Run a single test file
cd backend && pytest tests/unit/test_something.py

# Run a single test
cd backend && pytest tests/unit/test_something.py::test_function_name -v

# Lint
cd backend && ruff check src/

# Type check
cd backend && mypy src/
```

### Frontend

```bash
cd frontend && npm run dev        # Dev server on :3000
cd frontend && npm run build      # Production build
cd frontend && npm start          # Production server
cd frontend && npm run lint       # ESLint
cd frontend && npm run test       # Vitest unit tests
cd frontend && npm run test:coverage  # Vitest with coverage
cd frontend && npm run test:e2e   # Playwright E2E tests
cd frontend && npm run test:e2e:ui  # Playwright with UI
```

### Mailagent (Email Infrastructure Microservice)

Separate FastAPI service for email domain management, SPF/DKIM/DMARC verification, domain warming, and inbox administration. Runs on port `:8001`.

```bash
cd mailagent && uv pip install -e ".[dev]"
cd mailagent && uvicorn mailagent.main:app --reload --port 8001
cd mailagent && pytest
```

### Database Migrations

Custom SQL-based system (not Alembic). Migration files live in `backend/scripts/migrate_*.sql`.

```bash
docker exec aexy-backend python scripts/run_migrations.py --list      # Status
docker exec aexy-backend python scripts/run_migrations.py --dry-run   # Preview
docker exec aexy-backend python scripts/run_migrations.py             # Run all pending
docker exec aexy-backend python scripts/run_migrations.py --file migrate_feature.sql  # Run specific
```

Migrations tracked in `schema_migrations` table with checksums. Run in alphabetical order.

### Test Tokens

```bash
# Generate a JWT for API testing (needs at least one developer account)
docker exec aexy-backend python scripts/generate_test_token.py --first

# Quick export
export AEXY_TEST_TOKEN=$(cd backend && python scripts/generate_test_token.py --first 2>/dev/null | grep -A1 "Token:" | tail -1)
```

## Architecture

### Backend Structure (`backend/src/aexy/`)

The backend follows a layered architecture: **API → Service → Model**

- `main.py` — FastAPI app factory with lifespan (creates tables on startup)
- `api/` — ~100 FastAPI routers, all mounted under `/api/v1` in `api/__init__.py`
- `models/` — ~74 SQLAlchemy ORM models (declarative base in `core/database.py`)
- `schemas/` — Pydantic v2 request/response schemas
- `services/` — Business logic layer (~160 service modules)
- `core/config.py` — Pydantic BaseSettings (loads from `.env`)
- `core/database.py` — Engine, session management (async + sync), `get_db()` dependency
- `temporal/` — Workflow engine (see below)
- `llm/` — Multi-provider LLM abstraction with rate limiting
- `agents/` — LangGraph-based AI agent implementations

### Adding a New Feature (Checklist)

When adding a new backend feature:
1. **Model**: Create in `models/`, then add explicit import + `__all__` entry in `models/__init__.py` (models are NOT auto-discovered)
2. **Migration**: Write SQL file in `backend/scripts/migrate_*.sql`
3. **Schema**: Create Pydantic schemas in `schemas/`
4. **Service**: Create service in `services/`
5. **API**: Create router in `api/`, then import and mount in `api/__init__.py`

When adding a new app/module visible in the UI:
- Update **both** `frontend/src/config/appDefinitions.ts` AND `backend/src/aexy/models/app_definitions.py` — these must stay in sync
- Update `frontend/src/config/sidebarLayouts.ts` for navigation entries

### API Pattern

Every endpoint follows this pattern:
```python
@router.post("/", status_code=201)
async def create_thing(
    data: ThingCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ThingService(db)
    return await service.create(current_user.id, data)
```

Auth is JWT via `get_current_developer` / `get_current_developer_id` from `api/developers.py`. OAuth providers: GitHub, Google.

### Database Sessions

- **In FastAPI endpoints**: `db: AsyncSession = Depends(get_db)` — auto-commits on success, rollbacks on exception
- **In background tasks / Temporal activities**: `async with get_async_session() as session:` (context manager)
- **In sync contexts**: `with get_sync_session() as session:` (for psycopg2-based sync access)
- Engine is per-process cached to handle forked workers (asyncpg can't share connections across forks)

### Temporal (Background Processing)

Temporal replaced Celery. Key concepts:

- `temporal/dispatch.py` — `await dispatch("activity_name", input, task_queue=TaskQueue.ANALYSIS)` (fire-and-forget, replaces `.delay()`)
- `temporal/workflows/` — Workflow definitions (e.g., `SingleActivityWorkflow` wraps a single activity)
- `temporal/activities/` — ~44 activity files organized by domain
- `temporal/task_queues.py` — Queue constants (ANALYSIS, SYNC, CRM, etc.)
- `temporal/schedules.py` — Periodic schedules (replaces Celery Beat)
- Worker: `python -m aexy.temporal.worker` (supports `--queues` parameter)

New activities must be added to `ACTIVITY_CONFIG` in `dispatch.py` to get proper retry/timeout behavior. Three retry policies: `STANDARD_RETRY` (4 attempts, 60s backoff), `LLM_RETRY` (6 attempts, non-retryable on `ValueError`/`KeyError`), `WEBHOOK_RETRY` (6 attempts, up to 1hr backoff). Pass a stable `workflow_id` for idempotency.

### Frontend Structure (`frontend/src/`)

- `app/` — Next.js App Router. Route groups: `(app)` (protected), `(admin)`, `auth/`, `public/`, `embed/`
- `app/(app)/` — Main feature modules: dashboard, sprints, crm, agents, analytics, settings, etc.
- `components/` — Shared React components (Radix UI primitives + custom)
- `hooks/` — ~71 custom hooks (data fetching, auth, UI state)
- `lib/api.ts` — Generated API client (~605KB, likely OpenAPI-generated). Base URL: `NEXT_PUBLIC_API_URL`
- `stores/` — Zustand stores for global state
- `config/` — App registry (`appDefinitions.ts`), sidebar layouts, dashboard widgets

Auth token stored in localStorage under key `token`. Data fetching via React Query (`@tanstack/react-query`).

### LLM System

- `llm/gateway.py` — Unified gateway, routes to provider by config
- `llm/claude_provider.py`, `llm/gemini_provider.py` — Provider implementations
- `services/llm_rate_limiter.py` — Redis-based rate limiting (per-minute, per-day, per-token)
- Rate limit errors (`LLMRateLimitError`) trigger Temporal retry automatically

### Environment Files

- `backend/.env` — DATABASE_URL, REDIS_URL, TEMPORAL_ADDRESS, SECRET_KEY, LLM API keys
- `frontend/.env` — NEXT_PUBLIC_API_URL (default: `http://localhost:8000/api/v1`)

## Important Gotchas

- **`expire_on_commit=False`** on the async session maker — ORM objects remain usable after commit without re-fetching.
- **`db.no_autoflush`** is a sync context manager even on async sessions. Use `with db.no_autoflush:` NOT `async with`.
- **Pydantic v2**: Cannot use both `model_config = ConfigDict(...)` and `class Config:` on the same model. Use only `model_config`.
- **Ghost developers** (external contributors synced from GitHub): have nullable `email`. PR/review authors deduplicate by `name == github_login AND email IS NULL`. Commit authors deduplicate by `email == author_email`.
- **Tests use SQLite in-memory** — some PostgreSQL-specific features won't work in tests.
- **Frontend build** ignores TypeScript errors and ESLint warnings (`next.config.js` has `ignoreBuildErrors: true`).
- **`lib/api.ts`** is generated — don't hand-edit it.
- **Alembic** is installed as a dependency but NOT used — the project uses a custom SQL migration system. Don't create Alembic migrations.
- **Next.js `output: 'standalone'`** — builds a self-contained output for Docker deployment. URL rewrite: `/book/:path*` → `/public/book/:path*`.
- **Frontend image hosts** must be allowlisted in `next.config.js` (`images.remotePatterns`).

## Configuration

### LLM Rate Limits (env vars)
```
CLAUDE_REQUESTS_PER_MINUTE=60    GEMINI_REQUESTS_PER_MINUTE=60
CLAUDE_REQUESTS_PER_DAY=-1       GEMINI_REQUESTS_PER_DAY=1500
CLAUDE_TOKENS_PER_MINUTE=100000  RATE_LIMIT_ENABLED=true
```

### Redis debugging
```bash
docker exec aexy-redis redis-cli PING
docker exec aexy-redis redis-cli KEYS "llm:ratelimit:*"
```

## Browser Testing (Playwright MCP)

Frontend auth token is stored in localStorage under key `token` (not `auth_token`). To test authenticated pages:
1. Generate token: `docker exec aexy-backend python scripts/generate_test_token.py --first`
2. Set via `browser_evaluate`: `localStorage.setItem('token', '<jwt>')`
3. Navigate to protected route
