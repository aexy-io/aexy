# Technology Stack

## Overview

Aexy is a full-stack Engineering OS — a Next.js frontend talking to a FastAPI backend, with Temporal driving every background workflow and Microsoft Graph / Google APIs / Slack / Stripe / GitHub / Anthropic / Gemini wired in as integrations.

## Backend

### Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.13 | Primary language |
| FastAPI | 0.109+ | Web framework |
| Pydantic | 2.5+ | Data validation |
| SQLAlchemy | 2.0+ | ORM (async via asyncpg, sync via psycopg2) |

> Database migrations use a **custom SQL system** (`backend/scripts/migrate_*.sql` + `schema_migrations` table). Alembic is installed as a transitive dependency but is not used.

### Database & Storage

| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 18 | Primary database (+ pgvector for embeddings) |
| Redis | 7 | Cache, sessions, LLM rate limiting |
| RustFS | — | S3-compatible object storage for uploads |

### Background Processing

| Technology | Purpose |
|------------|---------|
| Temporal | Workflow engine — replaces Celery/Beat/APScheduler |
| `temporalio` SDK | Python client and worker |
| croniter | Cron expression parsing for schedules |

Activities live in `aexy/temporal/activities/`, workflows in `aexy/temporal/workflows/`, periodic schedules in `aexy/temporal/schedules.py`. The worker is `python -m aexy.temporal.worker`.

### AI / LLM

| Technology | Purpose |
|------------|---------|
| Anthropic Claude | Primary LLM provider |
| Google Gemini | Alternate LLM provider |
| Ollama | Local/OSS LLM provider |
| LangGraph + LangChain | Agent orchestration (`aexy/agents/`) |

All providers sit behind `aexy/llm/gateway.py`. Rate limiting is Redis-based; `LLMRateLimitError` triggers a Temporal retry.

### Authentication

| Technology | Purpose |
|------------|---------|
| JWT (python-jose) | API tokens |
| GitHub OAuth | Sign-in |
| Google OAuth | Sign-in + Gmail/Calendar |
| Microsoft Graph OAuth 2.0 | Sign-in + Outlook/Calendar |
| passlib (bcrypt) | Password hashing |

### External Integrations

| Integration | API Type | Purpose |
|-------------|----------|---------|
| GitHub | REST + Webhooks + GitHub App | Source code data |
| Google Workspace | REST | Gmail + Calendar + People |
| Microsoft Graph | REST | Outlook + Calendar + Teams |
| Slack | REST + Events | Notifications, slash commands |
| Stripe | REST + Webhooks | Subscription billing |
| Twilio | REST | SMS |
| Web Push (VAPID) | — | Browser push notifications |
| AWS SES / SMTP | — | Outbound email |

## Frontend

### Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14 (App Router) | React framework |
| React | 18 | UI library |
| TypeScript | 5+ | Type safety |

### State & Data

| Technology | Purpose |
|------------|---------|
| Zustand | Global client state |
| @tanstack/react-query | Server-state fetching, caching, invalidation |

### Styling

| Technology | Purpose |
|------------|---------|
| TailwindCSS | Utility-first CSS |
| Radix UI | Accessible primitives |
| Lucide Icons | Icon library |
| clsx | Conditional classes |

### Internationalisation

| Technology | Purpose |
|------------|---------|
| next-intl | i18n (App Router integration, cookie-based locale) |

### Testing (frontend)

| Technology | Purpose |
|------------|---------|
| Vitest | Unit tests |
| Playwright | End-to-end tests |

## Mailagent (Email Infrastructure Microservice)

Separate FastAPI service that handles email domain management, SPF/DKIM/DMARC verification, warming, and inbox administration. Runs on port `:8001`. Same tech stack as the main backend (FastAPI + SQLAlchemy + Temporal).

## CLI Tool

| Technology | Purpose |
|------------|---------|
| Python 3.11+ | Language |
| Click | CLI framework |
| Rich | Terminal formatting |
| httpx | HTTP client |
| keyring | Credential storage |

## VS Code Extension

| Technology | Purpose |
|------------|---------|
| TypeScript | Language |
| VS Code Extension API | Extension framework |

## Development Tools

### Code Quality

| Tool | Purpose |
|------|---------|
| Ruff | Python lint + format |
| mypy | Python type checking |
| ESLint | TypeScript linting |
| Prettier | Code formatting |

### Testing (backend)

| Tool | Purpose |
|------|---------|
| pytest | Test framework |
| pytest-asyncio | Async test support |
| pytest-cov | Coverage reporting |
| aiosqlite | SQLite-backed test DB (note: some PostgreSQL-specific behaviours don't surface in tests) |

## Infrastructure

### Deployment

| Option | Purpose |
|--------|---------|
| Docker | Containerization |
| Docker Compose | Local development + single-host prod (`docker-compose.prod.yml`) |
| nginx | TLS termination, `/storage/` → RustFS proxy |

### Default ports

| Service | Port |
|---------|------|
| Backend (FastAPI) | 8000 |
| Frontend (Next.js) | 3000 |
| Mailagent | 8001 |
| Temporal UI | 8080 |
| Temporal server | 7233 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RustFS | 9000 |

## Version Compatibility Matrix

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Python | 3.13 | 3.13 |
| Node.js | 18 | 20 LTS |
| PostgreSQL | 16 (with pgvector) | 18 |
| Redis | 6 | 7 |
| Temporal server | 1.22 | latest |

## Environment Configuration

The full set is documented in `.env.prod.example`; the most load-bearing variables:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/aexy

# Redis
REDIS_URL=redis://localhost:6379/0

# Temporal
TEMPORAL_ADDRESS=temporal:7233

# Auth
SECRET_KEY=...  # openssl rand -hex 32
JWT_ALGORITHM=HS256

# LLM (pick one default)
LLM_PROVIDER=gemini       # or claude / ollama
LLM_MODEL=gemini-2.0-flash
GEMINI_API_KEY=...
# ANTHROPIC_API_KEY=...

# Object storage (S3 / RustFS)
RUSTFS_ROOT_USER=...
RUSTFS_ROOT_PASSWORD=...
S3_PUBLIC_ENDPOINT_URL=https://server.aexy.io/storage

# OAuth providers
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=common
```

See [Microsoft integration](../microsoft.md), [Google integration](../google.md), and the booking/slack/stripe docs for provider-specific setup.

## Package Dependencies

Backend dependencies are pinned in `backend/pyproject.toml`. Highlights (excerpt — see the file for the complete list):

```toml
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "psycopg2-binary>=2.9.0",
    "pydantic[email]>=2.5.0",
    "pydantic-settings>=2.1.0",
    "httpx>=0.26.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "anthropic>=0.40.0",
    "langgraph>=0.2.0",
    "langchain>=0.3.0",
    "langchain-anthropic>=0.2.0",
    "langchain-google-genai>=2.0.0",
    "twilio>=9.0.0",
    "pywebpush>=2.0.0",
    "aiosmtplib>=3.0.0",
    "boto3>=1.34.0",
    "jinja2>=3.1.0",
    "redis>=5.0.0",
    "croniter>=2.0.0",
    "temporalio>=1.9.0",
    "stripe>=7.0.0",
    "PyJWT>=2.8.0",
    "openpyxl>=3.1.0",
    "pgvector>=0.3.0",
    "pypdf>=5.0.0",
    "python-docx>=1.1.0",
]
```

Frontend dependencies are pinned in `frontend/package.json` — Next.js 14, React 18, Tailwind 3, Zustand, React Query, Radix UI, next-intl, Vitest, Playwright.
