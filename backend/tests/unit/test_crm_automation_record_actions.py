"""Behaviour checks for CRM automation record-management actions."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.services.crm_automation_service import CRMAutomationService


@pytest.mark.asyncio
async def test_delete_action_requires_confirmation_before_archiving():
    service = CRMAutomationService(MagicMock())
    record = SimpleNamespace(id="record-1")

    result = await service._execute_action(
        "delete_record", {}, record, "workspace-1"
    )

    assert result == {"error": "Delete action requires confirmation"}


@pytest.mark.asyncio
async def test_delete_action_archives_after_confirmation():
    service = CRMAutomationService(MagicMock())
    record_service = MagicMock()
    record_service.delete_record = AsyncMock(return_value=True)

    with patch(
        "aexy.services.crm_automation_service.CRMRecordService",
        return_value=record_service,
    ):
        result = await service._execute_action(
            "delete_record", {"confirm_delete": True}, SimpleNamespace(id="record-1"), "workspace-1"
        )

    assert result["record_id"] == "record-1"
    assert result["archived"] is True
    assert result["message"] == "archived"
    assert result["result"] == "archived"
    record_service.delete_record.assert_awaited_once_with("record-1", permanent=False)


@pytest.mark.asyncio
async def test_assign_owner_accepts_an_active_workspace_member_by_email():
    service = CRMAutomationService(MagicMock())
    service.db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=SimpleNamespace(id="owner-1"))
    ))
    service.db.flush = AsyncMock()
    record = SimpleNamespace(id="record-1", owner_id=None, values={})

    result = await service._execute_action(
        "assign_owner", {"owner_email": "owner@example.com"}, record, "workspace-1"
    )

    assert result == {"record_id": "record-1", "owner_id": "owner-1"}
    assert record.owner_id == "owner-1"
    service.db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_link_records_creates_a_relation_for_a_workspace_record():
    service = CRMAutomationService(MagicMock())
    target = SimpleNamespace(id="target-1")
    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=target)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    ])
    service.db.add = MagicMock()
    service.db.begin_nested = MagicMock(return_value=AsyncMock())

    result = await service._execute_action(
        "link_records",
        {"link_type": "specific", "link_record_id": "target-1", "relation_type": "company"},
        SimpleNamespace(id="record-1", values={}),
        "workspace-1",
    )

    assert result["target_record_id"] == "target-1"
    assert result["relation_id"]
    service.db.add.assert_called_once()


@pytest.mark.asyncio
async def test_link_records_rejects_an_archived_or_other_workspace_target():
    service = CRMAutomationService(MagicMock())
    service.db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=None)
    ))

    result = await service._execute_action(
        "link_records",
        {"link_type": "specific", "link_record_id": "target-1"},
        SimpleNamespace(id="record-1", values={}),
        "workspace-1",
    )

    assert result == {"error": "Target record was not found in this workspace"}


@pytest.mark.asyncio
async def test_link_records_field_mode_links_to_the_record_named_in_a_field():
    service = CRMAutomationService(MagicMock())
    target = SimpleNamespace(id="target-1")
    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=target)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    ])
    service.db.add = MagicMock()
    service.db.begin_nested = MagicMock(return_value=AsyncMock())

    result = await service._execute_action(
        "link_records",
        {"link_type": "field", "link_field": "{{record.values.primary_contact}}"},
        SimpleNamespace(id="record-1", values={"primary_contact": "target-1"}),
        "workspace-1",
    )

    assert result["target_record_id"] == "target-1"
    service.db.add.assert_called_once()


@pytest.mark.asyncio
async def test_link_records_field_mode_unwraps_a_single_item_list():
    service = CRMAutomationService(MagicMock())
    target = SimpleNamespace(id="target-1")
    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=target)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    ])
    service.db.add = MagicMock()
    service.db.begin_nested = MagicMock(return_value=AsyncMock())

    result = await service._execute_action(
        "link_records",
        {"link_type": "field", "link_field": "{{record.values.contacts}}"},
        SimpleNamespace(id="record-1", values={"contacts": ["target-1"]}),
        "workspace-1",
    )

    assert result["target_record_id"] == "target-1"


@pytest.mark.asyncio
async def test_link_records_field_mode_rejects_a_multi_item_list():
    service = CRMAutomationService(MagicMock())
    service.db.execute = AsyncMock()

    result = await service._execute_action(
        "link_records",
        {"link_type": "field", "link_field": "{{record.values.contacts}}"},
        SimpleNamespace(id="record-1", values={"contacts": ["target-1", "target-2"]}),
        "workspace-1",
    )

    assert result == {
        "error": "The selected field holds more than one value; pick a single-value field instead"
    }
    service.db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_assign_owner_field_mode_resolves_the_value_stored_on_the_record():
    service = CRMAutomationService(MagicMock())
    service.db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=SimpleNamespace(id="owner-1"))
    ))
    service.db.flush = AsyncMock()
    record = SimpleNamespace(
        id="record-1", owner_id=None, values={"account_manager_email": "owner@example.com"}
    )

    result = await service._execute_action(
        "assign_owner",
        {"assign_type": "field", "owner_field": "{{record.values.account_manager_email}}"},
        record,
        "workspace-1",
    )

    assert result == {"record_id": "record-1", "owner_id": "owner-1"}
    assert record.owner_id == "owner-1"


@pytest.mark.asyncio
async def test_create_record_links_to_the_triggering_record_on_first_fire():
    service = CRMAutomationService(MagicMock())
    target_object = SimpleNamespace(
        id="obj-1",
        primary_attribute_id=None,
        attributes=[SimpleNamespace(id="attr-1", slug="name", attribute_type="text")],
    )
    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # no existing relation
        MagicMock(scalar_one_or_none=MagicMock(return_value=target_object)),
    ])
    service.db.add = MagicMock()
    service.db.flush = AsyncMock()
    record_service = MagicMock()
    record_service.create_record = AsyncMock(return_value=SimpleNamespace(id="new-record-1"))

    with patch(
        "aexy.services.crm_automation_service.CRMRecordService",
        return_value=record_service,
    ):
        result = await service._execute_action(
            "create_record",
            {"target_object_id": "obj-1", "record_name": "Acme Co", "link_to_current": True},
            SimpleNamespace(id="record-1", values={}),
            "workspace-1",
        )

    assert result["created_record_id"] == "new-record-1"
    assert result["relation_id"]
    record_service.create_record.assert_awaited_once_with(
        workspace_id="workspace-1", object_id="obj-1", values={"name": "Acme Co"}
    )
    service.db.add.assert_called_once()
    service.db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_record_skips_a_second_link_for_the_same_source():
    service = CRMAutomationService(MagicMock())
    existing_relation = SimpleNamespace(id="relation-1")
    service.db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=existing_relation)
    ))
    service.db.add = MagicMock()
    record_service = MagicMock()
    record_service.create_record = AsyncMock()

    with patch(
        "aexy.services.crm_automation_service.CRMRecordService",
        return_value=record_service,
    ):
        result = await service._execute_action(
            "create_record",
            {"target_object_id": "obj-1", "record_name": "Acme Co", "link_to_current": True},
            SimpleNamespace(id="record-1", values={}),
            "workspace-1",
        )

    assert result == {"relation_id": "relation-1", "already_linked": True}
    record_service.create_record.assert_not_awaited()
    service.db.add.assert_not_called()
    service.db.execute.assert_awaited_once()

@pytest.mark.asyncio
async def test_link_records_race_loser_reports_already_linked_instead_of_crashing():
    """Two fires can both pass the existence check; the unique constraint then
    rejects the second insert. The loser must resolve to the winner's relation,
    not blow up the run (which also destroyed its run row before the fix)."""
    from sqlalchemy.exc import IntegrityError

    service = CRMAutomationService(MagicMock())
    target = SimpleNamespace(id="target-1")
    winner = SimpleNamespace(id="relation-won")
    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=target)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=winner)),
    ])
    service.db.add = MagicMock()
    failing_savepoint = AsyncMock()
    failing_savepoint.__aexit__.side_effect = IntegrityError("stmt", {}, Exception("duplicate"))
    service.db.begin_nested = MagicMock(return_value=failing_savepoint)

    result = await service._execute_action(
        "link_records",
        {"link_type": "specific", "link_record_id": "target-1"},
        SimpleNamespace(id="record-1", values={}),
        "workspace-1",
    )

    assert result == {"relation_id": "relation-won", "already_linked": True}

@pytest.mark.asyncio
async def test_link_records_defaults_to_field_mode_matching_the_builder_panel():
    """A config saved without an explicit mode must execute in field mode,
    because that is what the builder panel displays for a fresh step. (It
    used to default to specific mode and fail with "no target specified".)
    A modeless config carrying only a specific-record id still infers
    specific mode so hand-built configs keep working."""
    service = CRMAutomationService(MagicMock())
    target = SimpleNamespace(id="target-1")
    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=target)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    ])
    service.db.add = MagicMock()
    service.db.begin_nested = MagicMock(return_value=AsyncMock())

    result = await service._execute_action(
        "link_records",
        {"link_field": "primary_contact"},  # no link_type key at all
        SimpleNamespace(id="record-1", values={"primary_contact": "target-1"}),
        "workspace-1",
    )
    assert result["target_record_id"] == "target-1"

    service.db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=target)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    ])
    result = await service._execute_action(
        "link_records",
        {"link_record_id": "target-1"},  # modeless legacy specific config
        SimpleNamespace(id="record-1", values={}),
        "workspace-1",
    )
    assert result["target_record_id"] == "target-1"

def test_run_if_gate_matches_picker_paths_and_bare_slugs():
    """The per-step gate resolves the field picker's {{record.values.slug}}
    form and a bare slug identically, and an unset gate always allows."""
    service = CRMAutomationService(MagicMock())
    record = SimpleNamespace(id="r1", values={"stage": "lost", "value": 500})

    assert service._run_if_allows({}, record) is True
    assert service._run_if_allows(
        {"run_if_field": "{{record.values.stage}}", "run_if_operator": "equals", "run_if_value": "lost"},
        record,
    ) is True
    assert service._run_if_allows(
        {"run_if_field": "stage", "run_if_operator": "equals", "run_if_value": "won"},
        record,
    ) is False
    assert service._run_if_allows(
        {"run_if_field": "value", "run_if_operator": "gt", "run_if_value": "100"},
        record,
    ) is True
    # Unevaluable comparison (text vs number) withholds the step, not crashes
    assert service._run_if_allows(
        {"run_if_field": "stage", "run_if_operator": "gt", "run_if_value": "10"},
        record,
    ) is False
    # No record context (e.g. schedule trigger) runs the step
    assert service._run_if_allows(
        {"run_if_field": "stage", "run_if_operator": "equals", "run_if_value": "lost"},
        None,
    ) is True
