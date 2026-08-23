# Aexy

**One system where CRM, sprints, tickets, docs, workflows, people ops and AI
agents share the same database** — instead of six SaaS tools that each know a
fifth of the story. Self-hostable, AGPL-3.0, and it ships an MCP server so
ChatGPT or Claude can act inside your workspace rather than just read about it.

- **Docs**: [aexy.io/handbook](https://aexy.io/handbook) — 53 pages, generated from this repo
- **Hosted**: [aexy.io](https://aexy.io) — if you would rather not run it
- **Licence**: AGPL-3.0 for the code, with a [commercial licence](COMMERCIAL_LICENSE.md) for hosting it as a service. See [Licence](#licence).

## Run it

Requires Docker and about 4 GB of RAM.

```bash
git clone https://github.com/aexy-io/aexy.git
cd aexy
docker compose up -d
```

Then give yourself an account with something in it:

```bash
docker compose exec backend python scripts/seed_demo_workspace.py
```

Open http://localhost:3000/login and use the **Self-hosted demo** panel —
`demo@example.com` / `aexy-demo`. That panel only appears because
`docker-compose.yml` sets `AEXY_DEMO_LOGIN=true`; sign-in otherwise goes through
GitHub, Google or Microsoft OAuth, which means registering an app with one of
them first. `docker-compose.prod.yml` leaves demo login off.

The demo account cannot send email or spend LLM tokens. Its workspace has the AI
kill switch off and the email-marketing and agents modules disabled, outbound
email is refused at both send paths while demo login is on, and the seeded
automations are left inactive — all re-applied on every sign-in, because the demo
account is an owner and could otherwise switch them back on. Details in
[getting-started](docs/guides/getting-started.md#about-that-demo-account).

Services come up on: frontend `:3000`, backend `:8000` (OpenAPI at `/docs`),
Temporal UI `:8080`, Postgres `:5432`, Redis `:6379`, RustFS `:9000`, Mailpit
`:8025`.

Nothing above needs an LLM key. AI features are the part that does — set
`LLM_PROVIDER` and the matching key in `backend/.env`, or point
`LLM_PROVIDER=ollama` at a local model. Everything else works without one.

See [docs/guides/getting-started.md](docs/guides/getting-started.md) for a
native install, and [DEPLOY.md](DEPLOY.md) for a real deployment.

## What's in it

Breadth is the point — the modules share one database, which is what lets an
agent answer a question that spans three of them. It also means depth varies:
some of these are the tool we run our own company on, and some are thinner than
the product they would replace. [CHANGELOG.md](CHANGELOG.md) is the honest
record of where the work has actually been going, and each module's page in the
handbook says what it does and does not do.

**Engineering** — sprints & epics, tickets & projects, service desk, standups
and time tracking, on-call rotations, uptime monitoring, GitHub sync, delivery
analytics
**Customers** — schema-flexible CRM (custom objects, sequences, automations),
GTM (lead scoring, ABM, intent), email marketing, forms, tables, booking
**People** — performance reviews, hiring & assessments, learning paths,
compliance training, leave
**Knowledge** — collaborative docs, drive, knowledge graph, AI metadata
pipeline
**AI** — LangGraph agents with tool access, policy gates and an audit trail;
visual workflow automation; an MCP server for ChatGPT, Claude, Cursor and
friends

## How it's built

```
backend/src/aexy/
  api/        ~100 FastAPI routers under /api/v1
  models/     ~74 SQLAlchemy ORM models
  schemas/    Pydantic v2 request/response schemas
  services/   ~160 business-logic modules
  temporal/   Workflows, activities, schedules
  llm/        Multi-provider LLM gateway with rate limiting
  agents/     LangGraph agent implementations

frontend/src/
  app/        Next.js App Router — (app), (admin), auth/, public/
  components/ Radix UI primitives + custom
  hooks/      ~71 hooks
  lib/api.ts  API client
  config/     App registry, sidebar, dashboard widgets
```

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, TailwindCSS |
| Database | PostgreSQL 18 (pgvector), Redis 7 |
| Background work | Temporal — not Celery |
| LLM | Claude, Gemini, OpenRouter, Ollama, LM Studio behind one gateway |
| Agents | LangGraph + LangChain |
| Storage | RustFS (S3-compatible) |
| Email | Postmark |

Deeper reading: [architecture](docs/architecture),
[adding a feature](docs/guides/adding-a-feature.md),
[API conventions](docs/guides/api-conventions.md),
[Temporal](docs/guides/temporal.md),
[MCP](docs/mcp.md), [billing](docs/billing.md).

## Develop

```bash
# Backend
cd backend
uvicorn aexy.main:app --reload        # :8000
python -m aexy.temporal.worker        # background worker
pytest                                # tests (SQLite in-memory)
ruff check src/ && mypy src/

# Frontend
cd frontend
npm run dev                           # :3000
npm run test                          # Vitest
npm run test:e2e                      # Playwright
npm run lint
```

Migrations are plain SQL files in `backend/scripts/migrate_*.sql`, tracked with
checksums in a `schema_migrations` table. Alembic is installed as a transitive
dependency and is **not** used.

```bash
docker compose exec backend python scripts/run_migrations.py --list
docker compose exec backend python scripts/run_migrations.py
```

There is a second test tier that runs the AI features against a real model,
defaulting to a local LM Studio so it costs nothing —
see [docs/testing](docs/testing) and `backend/tests/ai/`.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go to the
process in [SECURITY.md](SECURITY.md) — please don't open a public issue for
those.

## Licence

The code in this repository is licensed under the **GNU Affero General Public
License v3.0** ([LICENSE.md](LICENSE.md)). You can run it, read it, modify it
and self-host it for your own company at no cost. The AGPL's condition is that
if you modify it and offer it to others over a network, those users get your
modified source.

A separate **[commercial licence](COMMERCIAL_LICENSE.md)** exists for the cases
the AGPL makes impractical: hosting Aexy as a service for third parties, or
combining it with proprietary code you cannot release. It is not a paid tier of
the software — nothing is withheld from the AGPL build, and self-hosting is the
same software the hosted product runs. If you are self-hosting for your own
organisation, the AGPL is all you need.

Trademark: the commercial licence does not grant rights to the Aexy name.
