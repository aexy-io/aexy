# API Overview

This page used to host hand-maintained endpoint tables and protocol details that drifted from the code. That content has moved to two living docs:

- **[API conventions](../guides/api-conventions.md)** — URL shape, request/response patterns, status codes, error format, pagination, idempotency, OpenAPI client generation, public endpoints.
- **[Authentication & permissions](../guides/authentication.md)** — JWT issuance and validation, OAuth providers (GitHub / Google / Microsoft), API tokens (`aexy_…`), workspaces, RBAC, public share tokens.

For per-module endpoint lists, see the module docs — each one cites the actual file + endpoint paths from the codebase. Start at the [docs index](../README.md).

## Base URL

```
Local dev      http://localhost:8000/api/v1
Production     https://server.aexy.io/api/v1   # (or your BACKEND_URL + /api/v1)
```

Every route is mounted under `/api/v1`. There is no `/api/v2`.

## Live API documentation

The backend serves its own OpenAPI schema and human-readable docs:

- `GET /docs` — Swagger UI
- `GET /redoc` — ReDoc
- `GET /openapi.json` — raw schema (used by the frontend codegen at `frontend/src/lib/api.ts`)

These reflect the running code, so they are always more authoritative than any hand-written endpoint table.

## Quick reference

| Topic | Doc |
|---|---|
| How to add a new endpoint | [Adding a feature](../guides/adding-a-feature.md) |
| URL/request/response patterns | [API conventions](../guides/api-conventions.md) |
| JWT, OAuth, API tokens | [Authentication & permissions](../guides/authentication.md) |
| Inbound + outbound webhooks | [Webhooks](../guides/webhooks.md) |
| File uploads (presigned URLs) | [File uploads](../guides/file-uploads.md) |
| Background dispatch from a handler | [Temporal](../guides/temporal.md) |
| Frontend data fetching against this API | [Frontend conventions](../guides/frontend-conventions.md) |
