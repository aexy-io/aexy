"""Unit tests for CRM pipelines, stages, the projection bridge, and conversion."""

from uuid import uuid4

import pytest
from sqlalchemy import select

from aexy.models.crm import (
    CRMAttribute,
    CRMObjectType,
    CRMPipeline,
    CRMPipelineStage,
    CRMStageHistory,
)
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.crm_pipeline_service import (
    LeadConversionService,
    PipelineService,
    StageMovementService,
    StageService,
)
from aexy.services.crm_service import (
    CRMAttributeService,
    CRMObjectService,
    CRMRecordService,
)


async def _make_workspace(db) -> Workspace:
    owner = Developer(name="Owner", email=f"owner-{uuid4().hex[:8]}@example.com")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()),
        name="Acme",
        slug=f"acme-{uuid4().hex[:8]}",
        owner_id=owner.id,
        next_task_key=1,
    )
    db.add(ws)
    await db.flush()
    return ws


async def _seed(db):
    ws = await _make_workspace(db)
    objects = await CRMObjectService(db).seed_standard_objects(ws.id)
    by_type = {o.object_type: o for o in objects}
    return ws, by_type


async def _deal_pipeline(db, ws_id, deal_obj_id) -> CRMPipeline:
    return (
        await db.execute(
            select(CRMPipeline).where(
                CRMPipeline.workspace_id == ws_id,
                CRMPipeline.object_id == deal_obj_id,
            )
        )
    ).scalar_one()


async def _status_options(db, attr_id):
    attr = (
        await db.execute(select(CRMAttribute).where(CRMAttribute.id == attr_id))
    ).scalar_one()
    return attr.config.get("options", []), attr.config


@pytest.mark.asyncio
async def test_seed_creates_default_pipelines(db_session):
    ws, by_type = await _seed(db_session)
    deal = by_type[CRMObjectType.DEAL.value]
    lead = by_type[CRMObjectType.LEAD.value]

    pipelines = await PipelineService(db_session).list_pipelines(ws.id)
    names = {p.name for p in pipelines}
    assert "Sales Pipeline" in names
    assert "Lead Pipeline" in names

    sales = await _deal_pipeline(db_session, ws.id, deal.id)
    assert sales.is_default is True
    stages = await StageService(db_session).list_stages(sales.id)
    keys = [s.value_key for s in stages]
    assert keys == ["lead", "qualified", "proposal", "negotiation", "won", "lost"]

    # Won/lost stage semantics were inferred.
    won = next(s for s in stages if s.value_key == "won")
    lost = next(s for s in stages if s.value_key == "lost")
    assert won.stage_type == "won" and won.probability == 100
    assert lost.stage_type == "lost" and lost.probability == 0


@pytest.mark.asyncio
async def test_projection_marks_managed_and_mirrors_options(db_session):
    ws, by_type = await _seed(db_session)
    sales = await _deal_pipeline(db_session, ws.id, by_type[CRMObjectType.DEAL.value].id)
    options, config = await _status_options(db_session, sales.status_attribute_id)
    assert config.get("_managed_by_pipeline") == sales.id
    assert [o["value"] for o in options] == [
        "lead", "qualified", "proposal", "negotiation", "won", "lost",
    ]


@pytest.mark.asyncio
async def test_add_stage_reflected_in_options(db_session):
    ws, by_type = await _seed(db_session)
    sales = await _deal_pipeline(db_session, ws.id, by_type[CRMObjectType.DEAL.value].id)
    await StageService(db_session).create_stage(sales.id, name="Contract Sent", color="#000000")
    options, _ = await _status_options(db_session, sales.status_attribute_id)
    assert any(o["label"] == "Contract Sent" for o in options)


@pytest.mark.asyncio
async def test_rename_stage_keeps_value_key(db_session):
    ws, by_type = await _seed(db_session)
    sales = await _deal_pipeline(db_session, ws.id, by_type[CRMObjectType.DEAL.value].id)
    stages = await StageService(db_session).list_stages(sales.id)
    qualified = next(s for s in stages if s.value_key == "qualified")

    await StageService(db_session).update_stage(qualified.id, name="Sales Qualified")
    refreshed = await StageService(db_session).get_stage(qualified.id)
    assert refreshed.value_key == "qualified"  # immutable
    assert refreshed.name == "Sales Qualified"

    options, _ = await _status_options(db_session, sales.status_attribute_id)
    q_opt = next(o for o in options if o["value"] == "qualified")
    assert q_opt["label"] == "Sales Qualified"


@pytest.mark.asyncio
async def test_reorder_stages_updates_option_order(db_session):
    ws, by_type = await _seed(db_session)
    sales = await _deal_pipeline(db_session, ws.id, by_type[CRMObjectType.DEAL.value].id)
    stages = await StageService(db_session).list_stages(sales.id)
    reversed_ids = [s.id for s in reversed(stages)]
    await StageService(db_session).reorder_stages(sales.id, reversed_ids)

    options, _ = await _status_options(db_session, sales.status_attribute_id)
    assert [o["value"] for o in options] == ["lost", "won", "negotiation", "proposal", "qualified", "lead"]


@pytest.mark.asyncio
async def test_managed_attribute_option_edit_rejected(db_session):
    ws, by_type = await _seed(db_session)
    sales = await _deal_pipeline(db_session, ws.id, by_type[CRMObjectType.DEAL.value].id)
    with pytest.raises(ValueError):
        await CRMAttributeService(db_session).update_attribute(
            sales.status_attribute_id, config={"options": []}
        )


@pytest.mark.asyncio
async def test_delete_last_stage_guard(db_session):
    ws = await _make_workspace(db_session)
    obj = await CRMObjectService(db_session).create_object(
        workspace_id=ws.id, name="Thing", plural_name="Things",
    )
    attr = await CRMAttributeService(db_session).create_attribute(
        object_id=obj.id, name="Stage", attribute_type="status", config={"options": []},
    )
    pipeline = await PipelineService(db_session).create_pipeline(
        workspace_id=ws.id, object_id=obj.id, name="P",
        adopt_attribute_id=attr.id, stages=[{"name": "Only"}],
    )
    stage = (await StageService(db_session).list_stages(pipeline.id))[0]
    with pytest.raises(ValueError):
        await StageService(db_session).delete_stage(stage.id, reassign_to_stage_key=None)


@pytest.mark.asyncio
async def test_move_record_writes_stage_history(db_session):
    ws, by_type = await _seed(db_session)
    deal = by_type[CRMObjectType.DEAL.value]
    sales = await _deal_pipeline(db_session, ws.id, deal.id)

    record = await CRMRecordService(db_session).create_record(
        workspace_id=ws.id, object_id=deal.id, values={"name": "Acme deal", "stage": "lead"},
    )
    await StageMovementService(db_session).move_record_to_stage(
        sales.id, record.id, "qualified",
    )

    hist = (
        await db_session.execute(
            select(CRMStageHistory).where(CRMStageHistory.record_id == record.id)
        )
    ).scalars().all()
    assert any(h.to_stage_key == "qualified" for h in hist)

    refreshed = await CRMRecordService(db_session).get_record(record.id)
    assert refreshed.values["stage"] == "qualified"


@pytest.mark.asyncio
async def test_move_to_unknown_stage_rejected(db_session):
    ws, by_type = await _seed(db_session)
    deal = by_type[CRMObjectType.DEAL.value]
    sales = await _deal_pipeline(db_session, ws.id, deal.id)
    record = await CRMRecordService(db_session).create_record(
        workspace_id=ws.id, object_id=deal.id, values={"name": "X"},
    )
    with pytest.raises(ValueError):
        await StageMovementService(db_session).move_record_to_stage(
            sales.id, record.id, "nonexistent",
        )


@pytest.mark.asyncio
async def test_convert_lead_creates_records(db_session):
    ws, by_type = await _seed(db_session)
    lead_obj = by_type[CRMObjectType.LEAD.value]

    lead = await CRMRecordService(db_session).create_record(
        workspace_id=ws.id,
        object_id=lead_obj.id,
        values={
            "name": "Jane Doe",
            "email": "jane@acme.com",
            "company_name": "Acme Inc",
            "estimated_value": 5000,
            "lead_status": "qualified",
        },
    )

    result = await LeadConversionService(db_session).convert_lead(
        workspace_id=ws.id, lead_record_id=lead.id,
    )
    assert result["deal_id"] and result["contact_id"] and result["company_id"]

    refreshed = await CRMRecordService(db_session).get_record(lead.id)
    assert refreshed.values["lead_status"] == "converted"
    assert refreshed.values.get("converted_deal") == result["deal_id"]


@pytest.mark.asyncio
async def test_bulk_move_validates_once_not_per_record(db_session, monkeypatch):
    """Bulk stage moves must not re-validate the pipeline for every record.

    Review finding: bulk_move called move_record_to_stage in a loop, so the
    pipeline fetch, status-attribute lookup and active-stage query all ran
    once per record — roughly four queries per record (~402 to move 100).
    Validation is invariant across the batch, so it must happen exactly once
    no matter how many records are moved.
    """
    ws, by_type = await _seed(db_session)
    deal_obj = by_type[CRMObjectType.DEAL.value]
    sales = await _deal_pipeline(db_session, ws.id, deal_obj.id)

    records = []
    for i in range(5):
        records.append(
            await CRMRecordService(db_session).create_record(
                workspace_id=ws.id,
                object_id=deal_obj.id,
                values={"name": f"Deal {i}"},
            )
        )
    await db_session.flush()

    service = StageMovementService(db_session)
    calls = {"n": 0}
    original = service._resolve_stage_target

    async def counting(pipeline_id, to_stage_key):
        calls["n"] += 1
        return await original(pipeline_id, to_stage_key)

    monkeypatch.setattr(service, "_resolve_stage_target", counting)

    moved = await service.bulk_move(
        sales.id, [r.id for r in records], "qualified"
    )

    assert moved == 5
    # The whole point: one validation for the batch, not one per record.
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_bulk_move_rejects_unknown_stage_before_touching_records(db_session):
    """An invalid destination must fail before any record is modified."""
    ws, by_type = await _seed(db_session)
    deal_obj = by_type[CRMObjectType.DEAL.value]
    sales = await _deal_pipeline(db_session, ws.id, deal_obj.id)

    record = await CRMRecordService(db_session).create_record(
        workspace_id=ws.id,
        object_id=deal_obj.id,
        values={"name": "Untouched Deal"},
    )
    await db_session.flush()
    before = dict(record.values or {})

    with pytest.raises(ValueError, match="Unknown stage"):
        await StageMovementService(db_session).bulk_move(
            sales.id, [record.id], "not-a-real-stage"
        )

    await db_session.refresh(record)
    assert dict(record.values or {}) == before
