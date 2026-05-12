# Adding a New Feature

The full-stack checklist for adding a feature to Aexy. Use this as a paste-and-tick list when you start a new module.

## Decide the shape

Before writing code, answer:

- **Is this a new app** (a new entry in the sidebar with its own pages) or an addition to an existing module?
- **What workspace permissions** does it need? Existing ones (browse `models/permissions.py`) or a new permission slug?
- **Is there background work?** Sync, scheduled jobs, LLM calls — those go through Temporal, not request handlers.
- **Does it need to be visible to external users / public URLs?** That's a deliberate decision — public endpoints live under `/api/v1/public/...` and bypass the workspace scope.

## Backend

For a new resource called `Widget`:

### 1. Model

`backend/src/aexy/models/widget.py`:

```python
import uuid
from sqlalchemy import Column, ForeignKey, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from aexy.core.database import Base


class Widget(Base):
    __tablename__ = "widgets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("developers.id"), nullable=False)
    name = Column(String, nullable=False)
    config = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

Then — **and this matters** — register the model:

```python
# backend/src/aexy/models/__init__.py
from aexy.models.widget import Widget

__all__ = [..., "Widget"]
```

Models are **not** auto-discovered. If you skip this, `Base.metadata.create_all()` won't include the table and Alembic-style introspection won't see it either.

### 2. Migration

`backend/scripts/migrate_<NNNN>_add_widgets.sql`:

```sql
-- Adds the widgets table for the Widgets feature.

BEGIN;

CREATE TABLE IF NOT EXISTS widgets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_id UUID NOT NULL REFERENCES developers(id),
    name          TEXT NOT NULL,
    config        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_widgets_workspace ON widgets (workspace_id);

COMMIT;
```

Migrations run in alphabetical order. Use a numeric prefix (zero-padded to four digits) to keep them sorted.

Run:

```bash
docker exec aexy-backend python scripts/run_migrations.py --dry-run   # preview
docker exec aexy-backend python scripts/run_migrations.py             # apply
```

**Don't** create Alembic migrations. Alembic is a transitive dep that isn't used.

### 3. Schemas

`backend/src/aexy/schemas/widget.py`:

```python
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class WidgetCreate(BaseModel):
    name: str
    config: dict = {}


class WidgetUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None


class WidgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    created_by_id: UUID
    name: str
    config: dict
    created_at: datetime
    updated_at: datetime
```

Pydantic v2 only. Don't mix `model_config = ConfigDict(...)` with `class Config:`.

### 4. Service

`backend/src/aexy/services/widget_service.py`:

```python
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.widget import Widget
from aexy.schemas.widget import WidgetCreate, WidgetUpdate


class WidgetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_workspace(self, workspace_id: UUID) -> list[Widget]:
        result = await self.db.execute(
            select(Widget).where(Widget.workspace_id == workspace_id).order_by(Widget.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, workspace_id: UUID, developer_id: UUID, data: WidgetCreate) -> Widget:
        widget = Widget(
            workspace_id=workspace_id,
            created_by_id=developer_id,
            name=data.name,
            config=data.config,
        )
        self.db.add(widget)
        await self.db.flush()
        return widget
```

Business logic lives here, not in the handler.

### 5. Router

`backend/src/aexy/api/widgets.py`:

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.widget import WidgetCreate, WidgetResponse
from aexy.services.widget_service import WidgetService
from aexy.services.permission_service import PermissionService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/widgets",
    tags=["Widgets"],
)


@router.get("", response_model=list[WidgetResponse])
async def list_widgets(
    workspace_id: UUID,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    if not await PermissionService(db).check_permission(str(workspace_id), str(current_user.id), "can_view_widgets"):
        raise HTTPException(status_code=403, detail="Permission denied")
    return await WidgetService(db).list_for_workspace(workspace_id)


@router.post("", status_code=201, response_model=WidgetResponse)
async def create_widget(
    workspace_id: UUID,
    data: WidgetCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    if not await PermissionService(db).check_permission(str(workspace_id), str(current_user.id), "can_manage_widgets"):
        raise HTTPException(status_code=403, detail="Permission denied")
    return await WidgetService(db).create(workspace_id, current_user.id, data)
```

### 6. Mount the router

`backend/src/aexy/api/__init__.py`:

```python
from aexy.api.widgets import router as widgets_router
...
app_router.include_router(widgets_router)
```

Without this, your endpoints 404 even though the file exists.

### 7. Permissions (if you added a new slug)

`backend/src/aexy/models/permissions.py` — add `can_view_widgets` and `can_manage_widgets` to `PERMISSIONS`, with a category, description, and which built-in templates grant them by default. Then run the migration that backfills the new permission onto existing roles where appropriate (or expose a self-service grant in the roles UI).

### 8. Background work (if applicable)

If the feature needs async work, add a Temporal activity per [temporal.md](./temporal.md) — not `BackgroundTasks`. Dispatch from your service:

```python
await dispatch("recompute_widget_stats", RecomputeWidgetInput(widget_id=str(widget.id)), task_queue=TaskQueue.ANALYSIS, workflow_id=f"widget-stats-{widget.id}")
```

## Frontend

### 9. App definition (if it's a new app)

If the feature deserves its own sidebar entry — say it's a new "Widgets" app — update **both** of these in lockstep:

- `frontend/src/config/appDefinitions.ts`
- `backend/src/aexy/models/app_definitions.py`

The slug must match. Missing the backend half means workspaces can't enable the app; missing the frontend half hides it from the sidebar.

Also update `frontend/src/config/sidebarLayouts.ts` with the navigation entry.

### 10. Page

`frontend/src/app/(app)/widgets/page.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useWidgets } from "@/hooks/useWidgets";

export default function WidgetsPage() {
  const t = useTranslations("widgets");
  const { widgets, isLoading, create } = useWidgets();

  if (isLoading) return <div>{t("loading")}</div>;

  return (
    <div>
      <h1>{t("title")}</h1>
      <ul>
        {widgets.map((w) => (
          <li key={w.id}>{w.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

All user-facing strings go through `useTranslations()` — no hardcoded English. See [i18n.md](./i18n.md).

### 11. Hook

`frontend/src/hooks/useWidgets.ts` — wrap React Query around the generated client:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { widgetsApi } from "@/lib/api";

export function useWidgets(workspaceId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["widgets", workspaceId],
    queryFn: () => widgetsApi.list(workspaceId),
  });
  const create = useMutation({
    mutationFn: (data) => widgetsApi.create(workspaceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["widgets", workspaceId] }),
  });
  return { widgets: query.data ?? [], isLoading: query.isLoading, create: create.mutate };
}
```

Don't hand-edit `frontend/src/lib/api.ts` — it's generated from the OpenAPI schema.

### 12. Translations

`frontend/messages/en/widgets.json`:

```json
{ "widgets": { "title": "Widgets", "loading": "Loading widgets..." } }
```

Add `frontend/messages/hi/widgets.json` with the same keys (Hindi values, technical terms in English). Run `npm run i18n:merge`.

## Tests

### 13. Backend

`backend/tests/unit/test_widget_service.py` — service-level tests use SQLite in-memory by default. Watch for Postgres-specific features (`JSONB`, `ARRAY`) that won't work in SQLite — those need integration tests against a real PG container.

### 14. Frontend

- Unit: `frontend/src/__tests__/widgets.test.tsx` with Vitest.
- E2E: `frontend/e2e/widgets.spec.ts` with Playwright if it's a user-visible flow.

## Verify

- `cd backend && pytest -k widget` — service + API tests green
- `cd backend && ruff check src/` and `mypy src/` — linters green
- `cd frontend && npm run lint && npm run test`
- Start `docker-compose up -d`, hit the page in a browser, exercise the golden path, then at least one error path
- For features with background work, watch the Temporal UI at http://localhost:8080 and verify activities succeed

## Don't

- Don't add new tasks to `aexy/processing/celery_app.py`. That file is a deprecated stub; new work goes through Temporal.
- Don't create Alembic migrations. Use the SQL migration system.
- Don't put logic in the handler. Handlers are wiring.
- Don't hand-edit `frontend/src/lib/api.ts`.
- Don't introduce a new public endpoint unless you've considered the authentication model — the rest of the system assumes a logged-in user with a workspace.
