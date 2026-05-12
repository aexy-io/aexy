# API Conventions

How endpoints are structured, named, paginated, and how errors are reported.

## Layout

Every endpoint lives in `backend/src/aexy/api/<module>.py`, exposes a `router = APIRouter(prefix=..., tags=...)`, and is mounted under `/api/v1` by `backend/src/aexy/api/__init__.py`. Adding a router file alone does nothing — it must also be imported and `app.include_router(...)`'d in `__init__.py`.

There are ~100 routers; aim for one router per module (e.g. `sprints.py`, `crm.py`, `reviews.py`).

## URL shape

Most resources sit under a workspace:

```
/api/v1/workspaces/{workspace_id}/<resource>/...
```

Some live deeper under a team or sprint:

```
/api/v1/workspaces/{workspace_id}/teams/{team_id}/sprints
/api/v1/sprints/{sprint_id}/tasks
```

A few are workspace-agnostic and live at the top level — `/api/v1/developers/me`, `/api/v1/health`, `/api/v1/auth/...`, `/api/v1/public/...`.

Use plural nouns for collections (`/tickets`), singular nested resources (`/tickets/{ticket_id}/comments`). Path params use snake_case (`workspace_id`).

## Endpoint pattern

The canonical FastAPI handler:

```python
@router.post("/", status_code=201)
async def create_thing(
    workspace_id: str,
    data: ThingCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ThingService(db)
    return await service.create(workspace_id, current_user.id, data)
```

Notes:

- The handler is **only** wiring: dependencies in, validation by Pydantic, hand off to a service, return the result.
- All business logic lives in a service under `backend/src/aexy/services/`.
- `get_db()` commits on success and rolls back on exception, so handlers don't call `db.commit()` directly.
- Path params come first, then body, then dependencies (`db`, `current_user`) — Python's keyword-argument rules mean dependencies must follow defaults.

## Authentication

`Depends(get_current_developer)` (full model) or `Depends(get_current_developer_id)` (just the UUID). Both accept JWTs and `aexy_…` API tokens transparently. See [authentication.md](./authentication.md) for the full story.

## Authorization

There is no decorator. Endpoints that need RBAC call `PermissionService.check_permission(workspace_id, developer_id, "can_X")` explicitly and raise 403 on failure. The full permission catalog lives in `backend/src/aexy/models/permissions.py`.

## Schemas

Pydantic v2 only. One file per resource under `backend/src/aexy/schemas/`. Conventions:

- `ThingCreate` — request body for POST
- `ThingUpdate` — request body for PATCH (all fields optional)
- `ThingResponse` — the serialized output
- `ThingListResponse` — paginated list wrapper, if used

Use `model_config = ConfigDict(...)` for config — **not** `class Config:`. Mixing them raises at import time on Pydantic v2.

## Pagination

There is no single global standard, but the most common patterns in the codebase are:

- **Offset + limit**: query params `offset` and `limit` (default 50, max 100). Recently standardized for PR/issue search endpoints; preferred for new code.
- **Cursor**: a few list endpoints use a `cursor` token returned in the response — rare, mostly in activity/event feeds.

Both return:

```json
{
  "items": [...],
  "total": 1234,
  "has_more": true
}
```

Pick offset+limit unless you have a specific reason to use cursors.

## Status codes

| Code | When |
|---|---|
| 200 | Successful GET/PATCH/DELETE that returns data |
| 201 | Successful POST that created a resource |
| 204 | Successful action with no body (rare; prefer 200 with `{ "ok": true }`) |
| 400 | Client validation error not caught by Pydantic |
| 401 | Missing/invalid auth token |
| 403 | Authenticated but lacks the required permission |
| 404 | Resource not found (or hidden by RLS) |
| 409 | Conflict (duplicate slug, idempotency violation) |
| 422 | Pydantic validation failure (FastAPI sets this automatically) |
| 429 | Rate-limited (LLM rate limiter, mostly) |
| 503 | Provider not configured (e.g. Microsoft env vars missing) |

## Error responses

FastAPI's default `HTTPException` shape:

```json
{ "detail": "Description of the problem" }
```

For validation errors Pydantic returns:

```json
{
  "detail": [
    { "loc": ["body", "email"], "msg": "value is not a valid email address", "type": "value_error.email" }
  ]
}
```

There is no global wrapping (`{ "error": ..., "data": ... }`). Frontends read `response.detail` directly.

## Idempotency

Two flavors:

- **Database**: unique constraints on slugs and natural keys. Duplicate POSTs surface as 409s.
- **Temporal**: pass a stable `workflow_id` to `dispatch()` so re-issuing the same dispatch is a no-op while the prior run is open. See [temporal.md](./temporal.md).

Top-level HTTP endpoints do **not** read an `Idempotency-Key` header.

## OpenAPI / generated client

The frontend client in `frontend/src/lib/api.ts` is generated (likely from the FastAPI OpenAPI schema). **Don't hand-edit it.** Add or change endpoints in the backend, regenerate, then use the new client method.

The schema is served at:

- `GET /docs` — Swagger UI
- `GET /redoc` — ReDoc
- `GET /openapi.json` — raw schema

## Background work from handlers

When a request needs to kick off work that doesn't fit in the response timeout, dispatch a Temporal activity instead of using FastAPI `BackgroundTasks`:

```python
from aexy.temporal.dispatch import dispatch
from aexy.temporal.task_queues import TaskQueue

await dispatch(
    "sync_repository",
    SyncRepositoryInput(repository_id=str(repo.id)),
    task_queue=TaskQueue.SYNC,
    workflow_id=f"sync-repo-{repo.id}",
)
```

`BackgroundTasks` would die with the request worker; Temporal survives crashes and retries.

## Database sessions

Inside a handler: `db: AsyncSession = Depends(get_db)`. The session auto-commits on success, rolls back on exception.

Inside a service called from a handler: use the same session that was passed in. Don't open a second one.

Inside a Temporal activity or other off-request context: `async with get_async_session() as session:`.

For synchronous tools (psycopg2-only stuff like full-text search rebuilds): `with get_sync_session() as session:`.

`expire_on_commit=False` is set on the async sessionmaker, so ORM objects stay usable after commit without re-fetching. Tradeoff: a stale object can mask a concurrent update — re-`SELECT` when correctness matters.

`db.no_autoflush` is a **sync** context manager even on async sessions: `with db.no_autoflush:`, not `async with`.

## Public/unauthenticated endpoints

Three routers explicitly skip auth: `public_forms.py`, `public_projects.py`, `public_tables.py`. They sit under `/api/v1/public/...` and authenticate via share-link tokens instead of JWTs. Don't add new public routers casually — they bypass the workspace-scope assumption baked into the rest of the codebase.

## Versioning

Everything is `/api/v1`. There is no `/v2`. If a backwards-incompatible change is needed, the patterns the codebase has used historically:

- Add a sibling endpoint at a different path
- Add a query/body flag to opt in to the new behavior
- Migrate clients, then remove the old shape

The frontend ships in lockstep with the backend (same repo), so breaking changes there are usually a coordinated PR, not a versioned API change.
