# Contributing to Aexy

Thanks for looking. This is a large codebase — roughly 100 API routers, 74
models and 160 services on the backend, plus a Next.js app with about 40
modules — so the most useful thing this document can do is tell you where
things go and what will get a change rejected.

## Before you start

- **Open an issue first for anything non-trivial.** A new module, a schema
  change, or anything touching auth or billing is worth agreeing on before you
  write it. Bug fixes and docs need no ceremony.
- **Get it running**: `docker compose up -d`, then
  `docker compose exec backend python scripts/seed_demo_workspace.py`, then
  sign in through the demo panel at http://localhost:3000/login. See
  [docs/guides/getting-started.md](docs/guides/getting-started.md).
- **By contributing you agree your work is licensed under AGPL-3.0**, the same
  licence as the rest of the repository.

## Where things go

Backend follows **API → Service → Model**. Business logic belongs in
`services/`, not in the router.

Adding a backend feature:

1. **Model** in `models/`, then an explicit import and `__all__` entry in
   `models/__init__.py` — models are not auto-discovered
2. **Migration**: a SQL file at `backend/scripts/migrate_*.sql`. Not Alembic;
   Alembic is a transitive dependency and is not used
3. **Schema**: Pydantic v2 in `schemas/`
4. **Service** in `services/`
5. **Router** in `api/`, imported and mounted in `api/__init__.py`

Adding a module that appears in the UI touches two catalogues that must agree —
`frontend/src/config/appDefinitions.ts` and
`backend/src/aexy/models/app_definitions.py`, including the system bundles at
the bottom of each. Regenerate the parity fixture rather than trusting yourself:

```bash
cd backend && python scripts/dump_app_catalog.py
```

The backend is the authority; two tests fail if either side drifts.

The full checklist is in [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md).

## Things that will come back in review

- Background work outside Temporal. `dispatch()` in `temporal/dispatch.py` is
  how you queue work; new activities need an `ACTIVITY_CONFIG` entry for retry
  and timeout behaviour
- `async with db.no_autoflush:` — it is a *sync* context manager even on an
  async session
- Both `model_config = ConfigDict(...)` and `class Config:` on one Pydantic
  model
- User-facing strings hardcoded in a new component. Use
  `useTranslations()` and add the keys under `frontend/messages/en/` **and**
  `frontend/messages/hi/`
- A new external image host that is not in `next.config.js`
  `images.remotePatterns`

## Tests

```bash
cd backend  && pytest && ruff check src/ && mypy src/
cd frontend && npm run test && npm run lint
```

Backend tests run against SQLite in memory, so a few PostgreSQL-specific
behaviours are not covered there — if your change depends on one, say so in the
PR. The AI test tier (`backend/tests/ai/`) runs against a real model and
defaults to a local LM Studio; it is skipped unless one is reachable.

A bug fix without a regression test is a bug fix that comes back.

## Commits and pull requests

Describe what changed and why the old behaviour was wrong. The
[changelog](CHANGELOG.md) is written in that voice and it is the most useful
part of this repository's history — a PR that explains itself becomes a
changelog entry almost for free.

Keep a pull request to one concern. A 40-file PR that fixes a bug and also
reformats three modules cannot be reviewed.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
