"""Super-admin endpoints for editing Plan rows + per-workspace overrides.

Mounted under `/platform-admin/plans`. Guarded by `get_platform_admin` so
only the configured platform admin emails can mutate plan rows.

This is intentionally a small, dedicated router separate from
`platform_admin.py` so the two surfaces can evolve independently.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.platform_admin import get_platform_admin
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.plan import Plan
from aexy.models.workspace import Workspace, WorkspacePlanOverride

router = APIRouter(prefix="/platform-admin", tags=["platform-admin-plans"])


# ─── Schemas ───────────────────────────────────────────────────────────────
class PlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tier: str
    description: str | None
    is_active: bool

    # Sync limits
    max_repos: int
    max_commits_per_repo: int
    max_prs_per_repo: int
    sync_history_days: int
    max_storage_gb: int

    # LLM limits
    llm_requests_per_day: int
    llm_requests_per_minute: int
    llm_tokens_per_minute: int
    llm_provider_access: list[str]
    free_llm_tokens_per_month: int
    llm_input_cost_per_1k_cents: int
    llm_output_cost_per_1k_cents: int
    enable_overage_billing: bool

    # Feature flags
    enable_real_time_sync: bool
    enable_advanced_analytics: bool
    enable_exports: bool
    enable_webhooks: bool
    enable_team_features: bool

    # Pricing
    billing_model: str
    base_fee_monthly_cents: int
    per_seat_price_monthly_cents: int
    min_seats: int
    included_seats: int
    requires_payment_method: bool
    payment_timing: str
    price_monthly_cents: int
    price_yearly_cents: int

    created_at: datetime
    updated_at: datetime


class PlanListResponse(BaseModel):
    plans: list[PlanResponse]


class PlanUpdate(BaseModel):
    """Every field is optional; only set ones are applied."""

    name: str | None = None
    description: str | None = None
    is_active: bool | None = None

    # Sync + storage
    max_repos: int | None = None
    max_commits_per_repo: int | None = None
    max_prs_per_repo: int | None = None
    sync_history_days: int | None = None
    max_storage_gb: int | None = Field(
        default=None, description="-1 for unlimited"
    )

    # LLM
    llm_requests_per_day: int | None = None
    llm_requests_per_minute: int | None = None
    llm_tokens_per_minute: int | None = None
    llm_provider_access: list[str] | None = None
    free_llm_tokens_per_month: int | None = None
    llm_input_cost_per_1k_cents: int | None = None
    llm_output_cost_per_1k_cents: int | None = None
    enable_overage_billing: bool | None = None

    # Feature flags
    enable_real_time_sync: bool | None = None
    enable_advanced_analytics: bool | None = None
    enable_exports: bool | None = None
    enable_webhooks: bool | None = None
    enable_team_features: bool | None = None

    # Pricing
    billing_model: str | None = None
    base_fee_monthly_cents: int | None = None
    per_seat_price_monthly_cents: int | None = None
    min_seats: int | None = None
    included_seats: int | None = None
    requires_payment_method: bool | None = None
    payment_timing: str | None = None
    price_monthly_cents: int | None = None
    price_yearly_cents: int | None = None


class WorkspaceOverrideResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workspace_id: str
    max_repos: int | None
    max_commits_per_repo: int | None
    max_prs_per_repo: int | None
    sync_history_days: int | None
    max_storage_gb: int | None
    llm_requests_per_day: int | None
    llm_requests_per_minute: int | None
    llm_tokens_per_minute: int | None
    free_llm_tokens_per_month: int | None
    enable_real_time_sync: bool | None
    enable_advanced_analytics: bool | None
    enable_exports: bool | None
    enable_webhooks: bool | None
    enable_team_features: bool | None
    discount_percent: int | None
    notes: str | None


class WorkspaceOverrideUpdate(BaseModel):
    max_repos: int | None = None
    max_commits_per_repo: int | None = None
    max_prs_per_repo: int | None = None
    sync_history_days: int | None = None
    max_storage_gb: int | None = None
    llm_requests_per_day: int | None = None
    llm_requests_per_minute: int | None = None
    llm_tokens_per_minute: int | None = None
    free_llm_tokens_per_month: int | None = None
    enable_real_time_sync: bool | None = None
    enable_advanced_analytics: bool | None = None
    enable_exports: bool | None = None
    enable_webhooks: bool | None = None
    enable_team_features: bool | None = None
    discount_percent: int | None = None
    notes: str | None = None


# ─── Plans ─────────────────────────────────────────────────────────────────
@router.get("/plans", response_model=PlanListResponse)
async def list_plans(
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = list(
        (await db.execute(select(Plan).order_by(Plan.tier))).scalars().all()
    )
    return PlanListResponse(plans=[PlanResponse.model_validate(r) for r in rows])


@router.patch("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: str,
    data: PlanUpdate,
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    plan = (
        await db.execute(select(Plan).where(Plan.id == plan_id))
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(plan, key):
            setattr(plan, key, value)

    await db.commit()
    await db.refresh(plan)
    return PlanResponse.model_validate(plan)


# ─── Workspace overrides ───────────────────────────────────────────────────
@router.get(
    "/workspaces/{workspace_id}/plan-override",
    response_model=WorkspaceOverrideResponse | None,
)
async def get_workspace_override(
    workspace_id: str,
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    if not await _workspace_exists(db, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    override = await _find_override(db, workspace_id)
    if override is None:
        return None
    return WorkspaceOverrideResponse.model_validate(override)


@router.patch(
    "/workspaces/{workspace_id}/plan-override",
    response_model=WorkspaceOverrideResponse,
)
async def upsert_workspace_override(
    workspace_id: str,
    data: WorkspaceOverrideUpdate,
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    if not await _workspace_exists(db, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    override = await _find_override(db, workspace_id)
    if override is None:
        override = WorkspacePlanOverride(workspace_id=workspace_id)
        db.add(override)

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(override, key):
            setattr(override, key, value)

    await db.commit()
    await db.refresh(override)
    return WorkspaceOverrideResponse.model_validate(override)


@router.delete(
    "/workspaces/{workspace_id}/plan-override",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_workspace_override(
    workspace_id: str,
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    override = await _find_override(db, workspace_id)
    if override is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Override not found"
        )
    await db.delete(override)
    await db.commit()
    return None


# ─── AI metadata backfill (super-admin) ────────────────────────────────────
class BackfillStartRequest(BaseModel):
    """Optional knobs for the workspace backfill job."""

    delay_seconds: float = Field(default=6.0, ge=0.0, le=60.0)
    max_files: int | None = Field(default=None, ge=1, le=100_000)


class BackfillStartResponse(BaseModel):
    workspace_id: str
    workflow_id: str
    queued_at: str


class BackfillStatusResponse(BaseModel):
    workspace_id: str
    workflow_id: str | None
    status: str       # "running" | "completed" | "failed" | "unknown" | "not-started"
    enqueued: int | None = None
    skipped: int | None = None
    started_at: str | None = None
    closed_at: str | None = None


@router.post(
    "/workspaces/{workspace_id}/backfill-file-metadata",
    response_model=BackfillStartResponse,
)
async def start_backfill(
    workspace_id: str,
    request: BackfillStartRequest = Body(default_factory=BackfillStartRequest),
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Kick off a Temporal job that scans uncovered files in the workspace
    and dispatches the AI pipeline per file at the configured rate."""
    if not await _workspace_exists(db, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    from datetime import datetime as _dt, timezone as _tz
    from aexy.temporal.activities.file_metadata import BackfillWorkspaceInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    # Stable workflow id per workspace so re-clicking the button finds the
    # already-running workflow instead of starting a parallel one.
    workflow_id = f"file-ai-backfill-{workspace_id}"
    await dispatch(
        "backfill_workspace_file_metadata",
        BackfillWorkspaceInput(
            workspace_id=workspace_id,
            delay_seconds=request.delay_seconds,
            max_files=request.max_files,
        ),
        task_queue=TaskQueue.ANALYSIS,
        workflow_id=workflow_id,
    )
    return BackfillStartResponse(
        workspace_id=workspace_id,
        workflow_id=workflow_id,
        queued_at=_dt.now(_tz.utc).isoformat(),
    )


@router.get(
    "/workspaces/{workspace_id}/backfill-file-metadata/status",
    response_model=BackfillStatusResponse,
)
async def get_backfill_status(
    workspace_id: str,
    _: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Look up the workflow status by its stable id. Returns
    `not-started` if the workspace has never had a backfill kicked off.
    """
    if not await _workspace_exists(db, workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    workflow_id = f"file-ai-backfill-{workspace_id}"
    try:
        from aexy.temporal.client import get_temporal_client

        client = await get_temporal_client()
        handle = client.get_workflow_handle(workflow_id)
        desc = await handle.describe()
    except Exception:
        return BackfillStatusResponse(
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            status="not-started",
        )

    status_name = desc.status.name.lower() if desc.status else "unknown"
    started_at = desc.start_time.isoformat() if desc.start_time else None
    closed_at = desc.close_time.isoformat() if desc.close_time else None
    enqueued: int | None = None
    skipped: int | None = None
    try:
        result = await handle.result(rpc_timeout=None)  # type: ignore[arg-type]
        if isinstance(result, dict):
            enqueued = int(result.get("enqueued") or 0)
            skipped = int(result.get("skipped") or 0)
    except Exception:
        # Workflow still running or failed; partial info is fine.
        pass
    return BackfillStatusResponse(
        workspace_id=workspace_id,
        workflow_id=workflow_id,
        status=status_name,
        enqueued=enqueued,
        skipped=skipped,
        started_at=started_at,
        closed_at=closed_at,
    )


# ─── helpers ───────────────────────────────────────────────────────────────
async def _find_override(
    db: AsyncSession, workspace_id: str
) -> WorkspacePlanOverride | None:
    return (
        await db.execute(
            select(WorkspacePlanOverride).where(
                WorkspacePlanOverride.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()


async def _workspace_exists(db: AsyncSession, workspace_id: str) -> bool:
    return (
        await db.execute(select(Workspace.id).where(Workspace.id == workspace_id))
    ).first() is not None
