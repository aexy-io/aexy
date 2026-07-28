"""CRM pipeline services: pipelines, stages, and the Kanban projection bridge.

`CRMPipelineStage` rows are the single source of truth for a pipeline's stages.
They are *projected* into the pipeline's managed STATUS attribute's
``config.options`` so the existing Kanban board (which reads ``config.options``
and PATCHes ``record.values[status_slug]``) keeps working unchanged.
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import (
    CRMActivityType,
    CRMAttribute,
    CRMAttributeType,
    CRMList,
    CRMListViewType,
    CRMObject,
    CRMObjectType,
    CRMPipeline,
    CRMPipelineStage,
    CRMRecord,
    CRMStageHistory,
    CRMStageType,
)
from aexy.services.crm_service import (
    CRMAttributeService,
    CRMRecordService,
    generate_attribute_slug,
    generate_slug,
)

# Marker written into a managed STATUS attribute's config so raw option edits
# can be rejected (they must go through the pipeline API instead).
MANAGED_MARKER = "_managed_by_pipeline"

# Default stages used when a pipeline is created without explicit stages.
DEFAULT_STAGES = [
    {"name": "Lead", "color": "#6B7280", "stage_type": "open", "probability": 10},
    {"name": "Qualified", "color": "#3B82F6", "stage_type": "open", "probability": 30},
    {"name": "Proposal", "color": "#F59E0B", "stage_type": "open", "probability": 60},
    {"name": "Negotiation", "color": "#8B5CF6", "stage_type": "open", "probability": 80},
    {"name": "Won", "color": "#10B981", "stage_type": "won", "probability": 100},
    {"name": "Lost", "color": "#EF4444", "stage_type": "lost", "probability": 0},
]


def infer_stage_type(value_key: str, label: str) -> str:
    """Best-effort semantic type from a stage's key/label (for backfill/adoption)."""
    text = f"{value_key} {label}".lower()
    if any(w in text for w in ("won", "closed won", "success", "converted")):
        return CRMStageType.WON.value
    if any(w in text for w in ("lost", "closed lost", "unqualified", "disqualified", "dead")):
        return CRMStageType.LOST.value
    return CRMStageType.OPEN.value


def infer_probability(stage_type: str, position: int, total: int) -> int:
    """Graded probability when none is supplied."""
    if stage_type == CRMStageType.WON.value:
        return 100
    if stage_type == CRMStageType.LOST.value:
        return 0
    if total <= 1:
        return 50
    return round((position / max(total - 1, 1)) * 90) + 5


async def project_stages_to_attribute(db: AsyncSession, pipeline: CRMPipeline) -> None:
    """Rebuild the managed STATUS attribute's ``config.options`` from live stages.

    Also syncs any Kanban list's ``kanban_settings.columnOrder``. Must be called
    (in the same transaction) after every mutating stage operation.
    """
    if not pipeline.status_attribute_id:
        return

    stages = list(
        (
            await db.execute(
                select(CRMPipelineStage)
                .where(
                    CRMPipelineStage.pipeline_id == pipeline.id,
                    CRMPipelineStage.is_active == True,  # noqa: E712
                )
                .order_by(CRMPipelineStage.position)
            )
        )
        .scalars()
        .all()
    )

    attr = (
        await db.execute(
            select(CRMAttribute).where(CRMAttribute.id == pipeline.status_attribute_id)
        )
    ).scalar_one_or_none()
    if not attr:
        return

    options = [
        {"value": s.value_key, "label": s.name, "color": s.color or "#6B7280"}
        for s in stages
    ]
    # Preserve any unrelated config keys; refresh options + ownership marker.
    new_config = dict(attr.config or {})
    new_config["options"] = options
    new_config[MANAGED_MARKER] = pipeline.id
    attr.config = new_config

    # Keep Kanban column order in sync (best-effort).
    order = [s.value_key for s in stages]
    lists = list(
        (
            await db.execute(
                select(CRMList).where(
                    CRMList.workspace_id == pipeline.workspace_id,
                    CRMList.object_id == pipeline.object_id,
                    CRMList.group_by_attribute == attr.slug,
                    CRMList.view_type == CRMListViewType.KANBAN.value,
                )
            )
        )
        .scalars()
        .all()
    )
    for lst in lists:
        settings = dict(lst.kanban_settings or {})
        settings["columnOrder"] = order
        lst.kanban_settings = settings

    await db.flush()


class PipelineService:
    """CRUD for pipelines."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.attr_service = CRMAttributeService(db)

    async def _unique_slug(self, workspace_id: str, name: str) -> str:
        base = generate_slug(name) or "pipeline"
        slug = base
        counter = 1
        while True:
            existing = (
                await self.db.execute(
                    select(CRMPipeline).where(
                        CRMPipeline.workspace_id == workspace_id,
                        CRMPipeline.slug == slug,
                    )
                )
            ).scalar_one_or_none()
            if not existing:
                return slug
            slug = f"{base}-{counter}"
            counter += 1

    async def get_pipeline(self, pipeline_id: str) -> CRMPipeline | None:
        return (
            await self.db.execute(
                select(CRMPipeline).where(CRMPipeline.id == pipeline_id)
            )
        ).scalar_one_or_none()

    async def list_pipelines(
        self, workspace_id: str, object_id: str | None = None, include_inactive: bool = False
    ) -> list[CRMPipeline]:
        stmt = select(CRMPipeline).where(CRMPipeline.workspace_id == workspace_id)
        if object_id:
            stmt = stmt.where(CRMPipeline.object_id == object_id)
        if not include_inactive:
            stmt = stmt.where(CRMPipeline.is_active == True)  # noqa: E712
        stmt = stmt.order_by(CRMPipeline.position, CRMPipeline.created_at)
        return list((await self.db.execute(stmt)).scalars().all())

    async def create_pipeline(
        self,
        workspace_id: str,
        object_id: str,
        name: str,
        *,
        stages: list[dict] | None = None,
        adopt_attribute_id: str | None = None,
        status_attribute_name: str = "Stage",
        description: str | None = None,
        is_default: bool = False,
        created_by_id: str | None = None,
    ) -> CRMPipeline:
        """Create a pipeline plus its stages and managed STATUS attribute.

        - ``adopt_attribute_id``: bridge to an existing STATUS attribute. If
          ``stages`` is omitted, stages are derived from its current options.
        - otherwise a new STATUS attribute named ``status_attribute_name`` is
          created and populated from ``stages`` (or DEFAULT_STAGES).
        """
        # Resolve / create the managed STATUS attribute.
        if adopt_attribute_id:
            attr = await self.attr_service.get_attribute(adopt_attribute_id)
            if not attr or attr.object_id != object_id:
                raise ValueError("adopt_attribute_id must be a STATUS attribute of this object")
            if stages is None:
                existing_opts = (attr.config or {}).get("options", [])
                stages = [
                    {
                        "name": o.get("label") or o.get("value"),
                        "value_key": o.get("value"),
                        "color": o.get("color"),
                    }
                    for o in existing_opts
                ]
        else:
            attr = await self.attr_service.create_attribute(
                object_id=object_id,
                name=status_attribute_name,
                attribute_type=CRMAttributeType.STATUS.value,
                config={"options": []},
            )

        if not stages:
            stages = [dict(s) for s in DEFAULT_STAGES]

        # First pipeline for an object is default; enforce single default.
        existing = await self.list_pipelines(workspace_id, object_id, include_inactive=True)
        if not existing:
            is_default = True

        max_pos = (
            await self.db.execute(
                select(func.max(CRMPipeline.position)).where(
                    CRMPipeline.object_id == object_id
                )
            )
        ).scalar() or 0

        pipeline = CRMPipeline(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=object_id,
            status_attribute_id=attr.id,
            name=name,
            slug=await self._unique_slug(workspace_id, name),
            description=description,
            is_default=is_default,
            position=max_pos + 1,
            is_active=True,
            created_by_id=created_by_id,
        )
        self.db.add(pipeline)
        await self.db.flush()

        # Create stages.
        total = len(stages)
        used_keys: set[str] = set()
        for pos, s in enumerate(stages):
            value_key = s.get("value_key") or generate_attribute_slug(s["name"])
            base_key = value_key or f"stage_{pos}"
            value_key = base_key
            n = 1
            while value_key in used_keys:
                value_key = f"{base_key}_{n}"
                n += 1
            used_keys.add(value_key)
            stage_type = s.get("stage_type") or infer_stage_type(value_key, s.get("name", ""))
            probability = s.get("probability")
            if probability is None:
                probability = infer_probability(stage_type, pos, total)
            self.db.add(
                CRMPipelineStage(
                    id=str(uuid4()),
                    pipeline_id=pipeline.id,
                    workspace_id=workspace_id,
                    name=s["name"],
                    value_key=value_key,
                    stage_type=stage_type,
                    position=pos,
                    color=s.get("color"),
                    probability=probability,
                    rotting_days=s.get("rotting_days"),
                    is_active=True,
                )
            )
        await self.db.flush()

        if is_default:
            await self._clear_other_defaults(object_id, pipeline.id)

        await project_stages_to_attribute(self.db, pipeline)
        await self.db.refresh(pipeline)
        return pipeline

    async def _clear_other_defaults(self, object_id: str, keep_id: str) -> None:
        others = (
            await self.db.execute(
                select(CRMPipeline).where(
                    CRMPipeline.object_id == object_id,
                    CRMPipeline.is_default == True,  # noqa: E712
                    CRMPipeline.id != keep_id,
                )
            )
        ).scalars().all()
        for p in others:
            p.is_default = False
        await self.db.flush()

    async def set_default(self, pipeline_id: str) -> CRMPipeline | None:
        pipeline = await self.get_pipeline(pipeline_id)
        if not pipeline:
            return None
        pipeline.is_default = True
        await self._clear_other_defaults(pipeline.object_id, pipeline.id)
        await self.db.flush()
        return pipeline

    async def update_pipeline(
        self,
        pipeline_id: str,
        name: str | None = None,
        description: str | None = None,
        settings: dict | None = None,
        is_active: bool | None = None,
    ) -> CRMPipeline | None:
        pipeline = await self.get_pipeline(pipeline_id)
        if not pipeline:
            return None
        if name is not None:
            pipeline.name = name
        if description is not None:
            pipeline.description = description
        if settings is not None:
            pipeline.settings = settings
        if is_active is not None:
            pipeline.is_active = is_active
        await self.db.flush()
        return pipeline

    async def delete_pipeline(self, pipeline_id: str) -> bool:
        """Soft-delete a pipeline. Its managed attribute (and record data) is kept."""
        pipeline = await self.get_pipeline(pipeline_id)
        if not pipeline:
            return False
        pipeline.is_active = False
        pipeline.is_default = False
        await self.db.flush()
        return True


class StageService:
    """CRUD + reorder for pipeline stages, always re-projecting after a change."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_pipeline(self, pipeline_id: str) -> CRMPipeline | None:
        return (
            await self.db.execute(
                select(CRMPipeline).where(CRMPipeline.id == pipeline_id)
            )
        ).scalar_one_or_none()

    async def list_stages(self, pipeline_id: str, include_inactive: bool = False) -> list[CRMPipelineStage]:
        stmt = select(CRMPipelineStage).where(CRMPipelineStage.pipeline_id == pipeline_id)
        if not include_inactive:
            stmt = stmt.where(CRMPipelineStage.is_active == True)  # noqa: E712
        stmt = stmt.order_by(CRMPipelineStage.position)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_stage(self, stage_id: str) -> CRMPipelineStage | None:
        return (
            await self.db.execute(
                select(CRMPipelineStage).where(CRMPipelineStage.id == stage_id)
            )
        ).scalar_one_or_none()

    async def create_stage(
        self,
        pipeline_id: str,
        name: str,
        *,
        color: str | None = None,
        stage_type: str | None = None,
        probability: int | None = None,
        rotting_days: int | None = None,
        position: int | None = None,
    ) -> CRMPipelineStage | None:
        pipeline = await self._get_pipeline(pipeline_id)
        if not pipeline:
            return None
        stages = await self.list_stages(pipeline_id, include_inactive=True)
        used = {s.value_key for s in stages}
        base_key = generate_attribute_slug(name) or "stage"
        value_key = base_key
        n = 1
        while value_key in used:
            value_key = f"{base_key}_{n}"
            n += 1
        if position is None:
            position = (max([s.position for s in stages], default=-1)) + 1
        stage = CRMPipelineStage(
            id=str(uuid4()),
            pipeline_id=pipeline_id,
            workspace_id=pipeline.workspace_id,
            name=name,
            value_key=value_key,
            stage_type=stage_type or CRMStageType.OPEN.value,
            position=position,
            color=color,
            probability=probability if probability is not None else 0,
            rotting_days=rotting_days,
            is_active=True,
        )
        self.db.add(stage)
        await self.db.flush()
        await project_stages_to_attribute(self.db, pipeline)
        return stage

    async def update_stage(
        self,
        stage_id: str,
        name: str | None = None,
        color: str | None = None,
        stage_type: str | None = None,
        probability: int | None = None,
        rotting_days: int | None = None,
    ) -> CRMPipelineStage | None:
        """Update stage metadata. ``value_key`` is immutable (records reference it)."""
        stage = await self.get_stage(stage_id)
        if not stage:
            return None
        if name is not None:
            stage.name = name
        if color is not None:
            stage.color = color
        if stage_type is not None:
            stage.stage_type = stage_type
        if probability is not None:
            stage.probability = probability
        if rotting_days is not None:
            stage.rotting_days = rotting_days
        await self.db.flush()
        pipeline = await self._get_pipeline(stage.pipeline_id)
        if pipeline:
            await project_stages_to_attribute(self.db, pipeline)
        return stage

    async def reorder_stages(self, pipeline_id: str, stage_ids: list[str]) -> list[CRMPipelineStage]:
        stages = {s.id: s for s in await self.list_stages(pipeline_id, include_inactive=True)}
        for pos, sid in enumerate(stage_ids):
            if sid in stages:
                stages[sid].position = pos
        await self.db.flush()
        pipeline = await self._get_pipeline(pipeline_id)
        if pipeline:
            await project_stages_to_attribute(self.db, pipeline)
        return await self.list_stages(pipeline_id)

    async def delete_stage(
        self,
        stage_id: str,
        reassign_to_stage_key: str | None,
        actor_id: str | None = None,
    ) -> bool:
        """Delete a stage, first moving any occupying records off it.

        ``reassign_to_stage_key`` receives those records (or ``None`` clears the
        field). Refuses to delete the last active stage.
        """
        stage = await self.get_stage(stage_id)
        if not stage:
            return False
        pipeline = await self._get_pipeline(stage.pipeline_id)
        if not pipeline:
            return False

        active = await self.list_stages(pipeline.id)
        if len([s for s in active if s.id != stage_id]) == 0:
            raise ValueError("Cannot delete the last remaining stage")
        if reassign_to_stage_key and reassign_to_stage_key == stage.value_key:
            raise ValueError("Cannot reassign records to the stage being deleted")

        # Move occupying records so history + events fire.
        attr = (
            await self.db.execute(
                select(CRMAttribute).where(CRMAttribute.id == pipeline.status_attribute_id)
            )
        ).scalar_one_or_none()
        if attr:
            from aexy.models.crm import CRMRecord
            from aexy.services.crm_service import CRMRecordService

            record_service = CRMRecordService(self.db)
            # Filter in Python (portable across Postgres/SQLite; stage deletes
            # are a rare admin action so loading the object's records is fine).
            candidates = list(
                (
                    await self.db.execute(
                        select(CRMRecord).where(
                            CRMRecord.object_id == pipeline.object_id,
                            CRMRecord.is_archived == False,  # noqa: E712
                        )
                    )
                )
                .scalars()
                .all()
            )
            occupying = [r for r in candidates if r.values.get(attr.slug) == stage.value_key]
            for rec in occupying:
                await record_service.update_record(
                    record_id=rec.id,
                    values={attr.slug: reassign_to_stage_key},
                    updated_by_id=actor_id,
                )

        await self.db.delete(stage)
        await self.db.flush()
        await project_stages_to_attribute(self.db, pipeline)
        return True


async def _pipeline_status_slug(db: AsyncSession, pipeline: CRMPipeline) -> str | None:
    """The record-value slug that this pipeline's stages are written to."""
    if not pipeline.status_attribute_id:
        return None
    attr = (
        await db.execute(
            select(CRMAttribute).where(CRMAttribute.id == pipeline.status_attribute_id)
        )
    ).scalar_one_or_none()
    return attr.slug if attr else None


class StageMovementService:
    """Move records between stages. History/events fire inside update_record."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.record_service = CRMRecordService(db)

    async def _resolve_stage_target(
        self, pipeline_id: str, to_stage_key: str
    ) -> str:
        """Validate a destination stage once and return the status attribute slug.

        The pipeline row, its managed status attribute, and its active stage set
        are all invariant for a given pipeline, so a caller moving many records
        should pay for this lookup once rather than once per record.
        """
        pipeline = (
            await self.db.execute(select(CRMPipeline).where(CRMPipeline.id == pipeline_id))
        ).scalar_one_or_none()
        if not pipeline:
            raise ValueError("Pipeline not found")
        slug = await _pipeline_status_slug(self.db, pipeline)
        if not slug:
            raise ValueError("Pipeline has no managed status attribute")
        valid = {
            s.value_key
            for s in (
                await self.db.execute(
                    select(CRMPipelineStage).where(
                        CRMPipelineStage.pipeline_id == pipeline_id,
                        CRMPipelineStage.is_active == True,  # noqa: E712
                    )
                )
            ).scalars().all()
        }
        if to_stage_key not in valid:
            raise ValueError(f"Unknown stage '{to_stage_key}' for this pipeline")
        return slug

    async def move_record_to_stage(
        self,
        pipeline_id: str,
        record_id: str,
        to_stage_key: str,
        actor_id: str | None = None,
    ) -> CRMRecord | None:
        slug = await self._resolve_stage_target(pipeline_id, to_stage_key)
        return await self.record_service.update_record(
            record_id=record_id,
            values={slug: to_stage_key},
            updated_by_id=actor_id,
        )

    async def bulk_move(
        self,
        pipeline_id: str,
        record_ids: list[str],
        to_stage_key: str,
        actor_id: str | None = None,
    ) -> int:
        """Move many records to one stage, validating the destination once.

        Previously this called ``move_record_to_stage`` per record, which
        re-ran the pipeline fetch, the status-attribute lookup and the active
        stage query on every iteration — roughly four queries per record, so
        ~402 queries to move 100 records. Validation is invariant across the
        batch, so it is hoisted: the cost is now three queries plus one update
        per record. Behaviour and error messages are unchanged, and an invalid
        stage key still fails before any record is touched.
        """
        slug = await self._resolve_stage_target(pipeline_id, to_stage_key)
        moved = 0
        for rid in record_ids:
            rec = await self.record_service.update_record(
                record_id=rid,
                values={slug: to_stage_key},
                updated_by_id=actor_id,
            )
            if rec:
                moved += 1
        return moved


class PipelineAnalyticsService:
    """Aggregate metrics computed from live records + stage history."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _pipeline(self, pipeline_id: str) -> CRMPipeline | None:
        return (
            await self.db.execute(select(CRMPipeline).where(CRMPipeline.id == pipeline_id))
        ).scalar_one_or_none()

    async def _value_slug(self, object_id: str) -> str | None:
        """Slug of the object's currency attribute (for value/forecast sums)."""
        attr = (
            await self.db.execute(
                select(CRMAttribute)
                .where(
                    CRMAttribute.object_id == object_id,
                    CRMAttribute.attribute_type == CRMAttributeType.CURRENCY.value,
                )
                .order_by(CRMAttribute.position)
            )
        ).scalars().first()
        return attr.slug if attr else None

    @staticmethod
    def _to_number(val: Any) -> float:
        try:
            return float(val)
        except (TypeError, ValueError):
            return 0.0

    async def stage_summary(self, pipeline_id: str) -> dict:
        pipeline = await self._pipeline(pipeline_id)
        if not pipeline:
            raise ValueError("Pipeline not found")
        slug = await _pipeline_status_slug(self.db, pipeline)
        value_slug = await self._value_slug(pipeline.object_id)
        stages = list(
            (
                await self.db.execute(
                    select(CRMPipelineStage)
                    .where(
                        CRMPipelineStage.pipeline_id == pipeline_id,
                        CRMPipelineStage.is_active == True,  # noqa: E712
                    )
                    .order_by(CRMPipelineStage.position)
                )
            ).scalars().all()
        )
        records = list(
            (
                await self.db.execute(
                    select(CRMRecord).where(
                        CRMRecord.object_id == pipeline.object_id,
                        CRMRecord.is_archived == False,  # noqa: E712
                    )
                )
            ).scalars().all()
        )
        out = []
        for s in stages:
            in_stage = [
                r for r in records if slug and r.values.get(slug) == s.value_key
            ]
            total_value = sum(
                self._to_number(r.values.get(value_slug)) for r in in_stage
            ) if value_slug else 0.0
            out.append(
                {
                    "stage_key": s.value_key,
                    "name": s.name,
                    "stage_type": s.stage_type,
                    "probability": s.probability,
                    "count": len(in_stage),
                    "total_value": total_value,
                    "weighted_value": total_value * (s.probability / 100.0),
                }
            )
        return {"pipeline_id": pipeline_id, "stages": out}

    async def forecast(self, pipeline_id: str) -> dict:
        summary = await self.stage_summary(pipeline_id)
        open_stages = [s for s in summary["stages"] if s["stage_type"] == CRMStageType.OPEN.value]
        won = [s for s in summary["stages"] if s["stage_type"] == CRMStageType.WON.value]
        return {
            "pipeline_id": pipeline_id,
            "open_value": sum(s["total_value"] for s in open_stages),
            "weighted_forecast": sum(s["weighted_value"] for s in open_stages),
            "won_value": sum(s["total_value"] for s in won),
            "open_count": sum(s["count"] for s in open_stages),
        }

    async def conversion_rates(self, pipeline_id: str, window_days: int = 90) -> dict:
        pipeline = await self._pipeline(pipeline_id)
        if not pipeline:
            raise ValueError("Pipeline not found")
        since = datetime.now(timezone.utc) - timedelta(days=window_days)
        stages = list(
            (
                await self.db.execute(
                    select(CRMPipelineStage)
                    .where(CRMPipelineStage.pipeline_id == pipeline_id)
                    .order_by(CRMPipelineStage.position)
                )
            ).scalars().all()
        )
        # Distinct records that entered each stage within the window.
        entered: dict[str, int] = {}
        for s in stages:
            cnt = (
                await self.db.execute(
                    select(func.count(func.distinct(CRMStageHistory.record_id))).where(
                        CRMStageHistory.pipeline_id == pipeline_id,
                        CRMStageHistory.to_stage_key == s.value_key,
                        CRMStageHistory.entered_at >= since,
                    )
                )
            ).scalar() or 0
            entered[s.value_key] = cnt
        rates = []
        for i, s in enumerate(stages):
            nxt = stages[i + 1] if i + 1 < len(stages) else None
            base = entered.get(s.value_key, 0)
            rate = None
            if nxt and base:
                rate = entered.get(nxt.value_key, 0) / base
            rates.append(
                {
                    "stage_key": s.value_key,
                    "name": s.name,
                    "entered": base,
                    "next_stage_key": nxt.value_key if nxt else None,
                    "conversion_to_next": rate,
                }
            )
        return {"pipeline_id": pipeline_id, "window_days": window_days, "stages": rates}

    async def stage_velocity(self, pipeline_id: str) -> dict:
        """Average time (seconds) records spend in a stage before leaving it."""
        rows = (
            await self.db.execute(
                select(
                    CRMStageHistory.from_stage_key,
                    func.avg(CRMStageHistory.duration_in_previous_seconds),
                )
                .where(
                    CRMStageHistory.pipeline_id == pipeline_id,
                    CRMStageHistory.duration_in_previous_seconds.isnot(None),
                )
                .group_by(CRMStageHistory.from_stage_key)
            )
        ).all()
        return {
            "pipeline_id": pipeline_id,
            "avg_seconds_in_stage": {
                key: float(avg) for key, avg in rows if key is not None
            },
        }


# Declarative field maps: lead value-slug -> target value-slug.
LEAD_TO_PERSON_MAP = {"email": "email", "phone": "phone", "title": "title"}
LEAD_TO_DEAL_MAP = {"estimated_value": "value"}


class LeadConversionService:
    """Convert a Lead record into Company/Contact/Deal records."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.record_service = CRMRecordService(db)

    async def _object_by_type(self, workspace_id: str, object_type: str) -> CRMObject | None:
        return (
            await self.db.execute(
                select(CRMObject).where(
                    CRMObject.workspace_id == workspace_id,
                    CRMObject.object_type == object_type,
                    CRMObject.is_active == True,  # noqa: E712
                )
            )
        ).scalars().first()

    async def _default_open_stage_key(self, pipeline_id: str) -> str | None:
        s = (
            await self.db.execute(
                select(CRMPipelineStage)
                .where(
                    CRMPipelineStage.pipeline_id == pipeline_id,
                    CRMPipelineStage.is_active == True,  # noqa: E712
                )
                .order_by(CRMPipelineStage.position)
            )
        ).scalars().first()
        return s.value_key if s else None

    async def convert_lead(
        self,
        workspace_id: str,
        lead_record_id: str,
        *,
        create_company: bool = True,
        create_contact: bool = True,
        create_deal: bool = True,
        deal_pipeline_id: str | None = None,
        deal_stage_key: str | None = None,
        field_overrides: dict | None = None,
        archive_after_convert: bool = False,
        actor_id: str | None = None,
    ) -> dict:
        lead = await self.record_service.get_record(lead_record_id)
        if not lead:
            raise ValueError("Lead not found")
        v = dict(lead.values or {})
        overrides = field_overrides or {}
        result: dict[str, str | None] = {
            "company_id": None,
            "contact_id": None,
            "deal_id": None,
        }

        company_obj = await self._object_by_type(workspace_id, CRMObjectType.COMPANY.value)
        person_obj = await self._object_by_type(workspace_id, CRMObjectType.PERSON.value)
        deal_obj = await self._object_by_type(workspace_id, CRMObjectType.DEAL.value)

        # 1. Company
        company_id = None
        company_name = v.get("company_name") or v.get("company")
        if create_company and company_obj and company_name:
            company = await self.record_service.create_record(
                workspace_id=workspace_id,
                object_id=company_obj.id,
                values={"name": company_name},
                created_by_id=actor_id,
            )
            company_id = company.id
            result["company_id"] = company_id

        # 2. Contact (Person)
        contact_id = None
        if create_contact and person_obj:
            person_values: dict[str, Any] = {"name": v.get("name")}
            for lead_key, person_key in LEAD_TO_PERSON_MAP.items():
                if v.get(lead_key) is not None:
                    person_values[person_key] = v[lead_key]
            if company_id:
                person_values["company"] = company_id
            person_values.update(overrides.get("contact", {}))
            contact = await self.record_service.create_record(
                workspace_id=workspace_id,
                object_id=person_obj.id,
                values=person_values,
                created_by_id=actor_id,
            )
            contact_id = contact.id
            result["contact_id"] = contact_id

        # 3. Deal
        if create_deal and deal_obj:
            deal_values: dict[str, Any] = {"name": v.get("name")}
            for lead_key, deal_key in LEAD_TO_DEAL_MAP.items():
                if v.get(lead_key) is not None:
                    deal_values[deal_key] = v[lead_key]
            if company_id:
                deal_values["company"] = company_id
            if contact_id:
                deal_values["contacts"] = [contact_id]
            # Place into the requested pipeline/stage.
            pipeline = None
            if deal_pipeline_id:
                pipeline = (
                    await self.db.execute(
                        select(CRMPipeline).where(CRMPipeline.id == deal_pipeline_id)
                    )
                ).scalar_one_or_none()
            if pipeline is None:
                pipeline = (
                    await self.db.execute(
                        select(CRMPipeline).where(
                            CRMPipeline.object_id == deal_obj.id,
                            CRMPipeline.is_default == True,  # noqa: E712
                        )
                    )
                ).scalar_one_or_none()
            if pipeline:
                slug = await _pipeline_status_slug(self.db, pipeline)
                stage_key = deal_stage_key or await self._default_open_stage_key(pipeline.id)
                if slug and stage_key:
                    deal_values[slug] = stage_key
            deal_values.update(overrides.get("deal", {}))
            deal = await self.record_service.create_record(
                workspace_id=workspace_id,
                object_id=deal_obj.id,
                values=deal_values,
                created_by_id=actor_id,
            )
            result["deal_id"] = deal.id

        # 4/5. Back-links + mark converted on the lead.
        lead_update = {
            "lead_status": "converted",
            "converted_at": datetime.now(timezone.utc).isoformat(),
        }
        if result["deal_id"]:
            lead_update["converted_deal"] = result["deal_id"]
        if result["contact_id"]:
            lead_update["converted_contact"] = result["contact_id"]
        if result["company_id"]:
            lead_update["converted_company"] = result["company_id"]
        merged = {**v, **lead_update}
        await self.record_service.update_record(
            record_id=lead_record_id,
            values=merged,
            updated_by_id=actor_id,
        )

        # 6. Activity log on the lead.
        await self.record_service._log_activity(
            workspace_id=workspace_id,
            record_id=lead_record_id,
            activity_type=CRMActivityType.LEAD_CONVERTED.value,
            actor_id=actor_id,
            metadata=result,
        )

        # 7. Optionally archive the lead.
        if archive_after_convert:
            await self.record_service.delete_record(
                record_id=lead_record_id,
                permanent=False,
                deleted_by_id=actor_id,
            )

        return {"lead_id": lead_record_id, **result}
