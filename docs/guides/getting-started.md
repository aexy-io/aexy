# Getting Started with Aexy

## The short version

Docker, about 4 GB of RAM, and two commands:

```bash
git clone https://github.com/aexy-io/aexy.git
cd aexy
docker compose up -d

# once the backend is up
docker compose exec backend python scripts/seed_demo_workspace.py
```

Then open <http://localhost:3000/login> and use the **Self-hosted demo** panel:

- **Email**: `demo@example.com`
- **Password**: `aexy-demo`

That is the whole first run. No OAuth application to register, no LLM key, no
migrations to run by hand — the app creates its tables on startup and the
seeder gives the demo workspace a CRM, an active sprint, docs, automations and
a review cycle to look at.

Services: frontend `:3000`, backend `:8000` (OpenAPI at `/docs`, ReDoc at
`/redoc`), Temporal UI `:8080`, Postgres `:5432`, Redis `:6379`, RustFS
`:9000`, Mailpit `:8025`.

### About that demo account

It is one shared account, and its password is in the environment — so it is
gated behind `AEXY_DEMO_LOGIN`, which `docker-compose.yml` sets to `true` for
local development and `docker-compose.prod.yml` does not set at all.

```bash
AEXY_DEMO_LOGIN=true          # off by default; the sign-in panel only appears when true
AEXY_DEMO_EMAIL=demo@example.com
AEXY_DEMO_PASSWORD=aexy-demo  # blank disables demo login even with the flag on
```

Do not turn it on for a deployment holding real data. For a public demo box,
set your own `AEXY_DEMO_PASSWORD`. To sign in as yourself instead, register an
OAuth app with GitHub, Google or Microsoft — see
[Authentication & permissions](authentication.md) and the GitHub App section
below.

**Email and AI are visible but inert.** Every module stays on screen — the point
of a demo is to show what is there — and the two that cost real money refuse
when you press the button:

- The workspace **AI kill switch** (`WorkspaceAISettings.ai_enabled`) is off, so
  the LLM gateway refuses every call for this workspace: request handlers,
  agents and Temporal activities alike. You can open an agent, read its tools and
  policy gates, and get "AI features are disabled for this workspace" if you run
  it.
- **Outbound email is refused at both send paths** while `AEXY_DEMO_LOGIN` is
  true, whatever provider is configured, so a stranger cannot mail anyone from
  your domain. Campaigns, templates and the builder all work; sending answers
  with the reason it did not. `AEXY_DEMO_ALLOW_OUTBOUND_EMAIL=true` lifts this —
  use it for a demo box pointed at the bundled Mailpit on `:8025`, not for one
  with real credentials.
- The seeded automations are left **inactive**. They still show their triggers,
  actions and run history; one of them runs an agent on every lead created, and
  an enabled copy would be a way to spend your budget by filling in a form.

Two things keep the kill switch off rather than one. Provisioning re-asserts it
on every sign-in, *and* the API refuses a request to enable it for the demo
workspace — the account is shared, so "reverted at the next sign-in" would still
leave every session in between spending. Nothing here hides a module: hiding the
two features most worth showing would cost the demo its point and protect
nothing, since the gateway and the send paths are what actually refuse.

`AEXY_DEMO_EMAIL` has to be a real-looking address: the developer profile
response validates it as an email, and reserved TLDs like `.local` are
rejected, which would break the first API call after a successful sign-in.

## Running it natively

For working on the backend or frontend itself. The services (Postgres, Redis,
Temporal, RustFS) are still easiest from `docker compose up -d postgres redis
temporal rustfs`.

### Prerequisites

- **Python 3.13** — backend runtime
- **Node.js 18+** — frontend runtime
- **PostgreSQL 18** with pgvector — the app creates the `vector` extension's
  types on startup, so a plain Postgres image will fail
- **Redis 7** — cache and rate limiting
- **Temporal** — workflow engine

### Environment

`backend/.env` — start from `backend/.env.example`, which is the authoritative
list. The variables you cannot skip:

```bash
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/aexy
REDIS_URL=redis://localhost:6379/0
TEMPORAL_ADDRESS=localhost:7233

# JWT signing. Generate one with: openssl rand -hex 32
SECRET_KEY=change-me

# Demo sign-in (see above)
AEXY_DEMO_LOGIN=true
```

AI features need a provider, and nothing else does:

```bash
LLM_PROVIDER=ollama                    # local, free
OLLAMA_BASE_URL=http://localhost:11434
# or
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

`frontend/.env` — copy `frontend/.env.example`. The one that matters:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

The `/api/v1` suffix is part of it. Without the version segment every request
from the browser 404s.

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

createdb aexy
psql aexy -c "CREATE EXTENSION IF NOT EXISTS vector;"
python scripts/run_migrations.py

uvicorn aexy.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### The demo account, natively

```bash
cd backend
python scripts/seed_demo_workspace.py            # account + content
python scripts/seed_demo_workspace.py --no-content   # account only
```

Both are idempotent; re-running adds nothing.

## Setting Up GitHub App

1. Go to https://github.com/settings/apps
2. Click "New GitHub App"
3. Fill in the details:
   - **Name**: Aexy (your-org)
   - **Homepage URL**: http://localhost:3000
   - **Callback URL**: http://localhost:8000/api/v1/auth/github/callback
   - **Webhook URL**: http://localhost:8000/api/v1/webhooks/github (use ngrok for local dev)
   - **Permissions** — required:
     - Repository contents: **Read and write** (read for analysis; write is what
       publishes a document back to the repository)
     - Metadata: Read
     - Organization: Read
     - Pull requests: Read
   - **Permissions** — optional, each enabling one feature:
     - Pull requests: **Write** — lets Aexy comment on a pull request that
       touches documented code. Off in every workspace until an admin turns it
       on under Settings → Repositories → Documentation impact.
     - Checks: **Write** — lets it add a "Documentation impact" check to the
       commit instead of, or as well as, commenting.
   - **Events**: Push, Pull request, Pull request review, Issues, Installation

> Granting a permission to an App that is already installed requires each
> installation to accept the change. Aexy notices when they do — it handles the
> `installation` webhook — so nothing needs re-authenticating afterwards.

4. After creation, note down:
   - App ID
   - Client ID
   - Client Secret (generate one)
   - Webhook Secret (set one)

## Setting Up LLM Provider

### Option A: Ollama (Recommended for Development)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.2
# or
ollama pull codellama

# Ollama runs automatically on port 11434
```

### Option B: Claude (Production)

1. Get an API key from https://console.anthropic.com
2. Set in `.env`:
   ```bash
   LLM_PROVIDER=claude
   ANTHROPIC_API_KEY=your_api_key
   ```

## Running Background Workers

Background jobs and periodic schedules run on **Temporal** (Celery + Celery Beat + APScheduler from older iterations are gone).

Start the Temporal worker:

```bash
cd backend
python -m aexy.temporal.worker
```

The worker pulls every registered queue by default; pass `--queues ANALYSIS,SYNC` to scope it. Periodic schedules in `aexy/temporal/schedules.py` register themselves with the Temporal server on worker startup — you don't run a separate "beat" process.

Inspect workflows, activities, and schedules in the Temporal UI at http://localhost:8080.

## Development Workflow

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

### Code Quality

```bash
# Backend linting
cd backend
ruff check src/
ruff format src/

# Frontend linting
cd frontend
npm run lint
```

### Database Migrations

Aexy uses a custom SQL migration system tracked in the `schema_migrations` table.

```bash
cd backend

# Create a new migration: drop a SQL file into scripts/migrate_*.sql
# Filenames sort alphabetically and run in that order.

# Preview pending migrations
python scripts/run_migrations.py --dry-run

# Apply all pending
python scripts/run_migrations.py

# Apply a specific file (useful for testing)
python scripts/run_migrations.py --file migrate_feature.sql
```

Alembic is installed as a transitive dependency only — do **not** create Alembic migrations.

## Next Steps

1. **Look around the demo workspace** — CRM, Planning, Docs and Automations all
   have seeded content
2. **Connect GitHub** to pull in real repositories and developer analytics
   (needs the GitHub App above)
3. **Create teams** and assign developers under Organization
4. **Point an assistant at it** — the MCP server lets Claude, ChatGPT, Cursor
   or VS Code work in the workspace directly; see [MCP](../mcp.md)
5. **Set up integrations** — Slack, Google, Microsoft, the CLI, the VS Code
   extension

## Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Under docker compose
docker compose ps postgres
docker compose logs postgres

# Natively
pg_isready -h localhost -p 5432
createdb aexy
```

**Redis Connection Failed**
```bash
# Check Redis is running
redis-cli ping
```

**LLM Not Responding**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Or test Claude
curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages
```

**Frontend Build Errors**
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
npm run dev
```

## Getting Help

- **Documentation**: the `docs/` folder, or <https://aexy.io/handbook>
- **API reference**: <http://localhost:8000/docs>
- **Issues**: <https://github.com/aexy-io/aexy/issues>
