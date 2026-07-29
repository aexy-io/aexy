"""What the automations API accepts, and what it refuses out loud.

Two failures of the same kind, found while writing the manual-run tests.

Pydantic drops undeclared fields by default, so every field absent from
`AutomationUpdate` was accepted with a 200 and thrown away. A PATCH carrying
`runs_this_month` looked like it reset the counter; it did nothing. Worse, the
builder PATCHes `trigger_type` whenever the trigger node changes — and that
field was not declared either, so it had never once taken effect. The canvas
and the stored trigger could disagree indefinitely with nothing to show for it.

And `crm_automations.object_id` is a foreign key with no workspace in it, which
nothing checked before the insert: a made-up id came back as a 500, and an id
belonging to another workspace was accepted outright.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from aexy.schemas.automation import AutomationUpdate
from aexy.schemas.crm import CRMAutomationUpdate
from aexy.services.automation_service import (
    InvalidAutomationObject,
    check_automation_object,
)

pytestmark = pytest.mark.asyncio

WORKSPACE = str(uuid4())


# =============================================================================
# The update schemas refuse what they cannot apply
# =============================================================================

def test_a_counter_cannot_be_written_over_the_api():
    """It is the number the monthly limit is enforced against."""
    with pytest.raises(ValidationError) as caught:
        AutomationUpdate.model_validate({"name": "x", "runs_this_month": 0})

    assert "runs_this_month" in str(caught.value)


@pytest.mark.parametrize(
    "field", ["runs_this_month", "total_runs", "successful_runs", "failed_runs"]
)
def test_no_engine_owned_counter_is_settable(field):
    with pytest.raises(ValidationError):
        AutomationUpdate.model_validate({field: 0})


def test_an_unknown_field_is_refused_rather_than_dropped():
    """A typo should fail, not look like it worked."""
    with pytest.raises(ValidationError):
        AutomationUpdate.model_validate({"nmae": "typo"})


def test_the_trigger_the_builder_sends_is_actually_accepted():
    """The regression this file exists for: it used to be silently discarded."""
    parsed = AutomationUpdate.model_validate({"trigger_type": "record.updated"})

    assert parsed.model_dump(exclude_unset=True) == {
        "trigger_type": "record.updated"
    }


def test_module_and_object_are_refused_because_they_are_not_edits():
    """Either one reinterprets stored actions against a different registry or
    record type. Refusing is honest; accepting and ignoring was not."""
    for field, value in (("module", "tickets"), ("object_id", str(uuid4()))):
        with pytest.raises(ValidationError):
            AutomationUpdate.model_validate({field: value})


def test_an_untouched_field_stays_untouched():
    """exclude_unset is what makes PATCH a patch; forbidding extras must not
    turn every absent field into an explicit null."""
    parsed = AutomationUpdate.model_validate({"name": "renamed"})

    assert parsed.model_dump(exclude_unset=True) == {"name": "renamed"}


def test_the_crm_scoped_schema_has_the_same_contract():
    with pytest.raises(ValidationError):
        CRMAutomationUpdate.model_validate({"runs_this_month": 0})

    parsed = CRMAutomationUpdate.model_validate({"trigger_type": "record.created"})
    assert parsed.trigger_type == "record.created"


def test_the_crm_scoped_schema_rejects_a_trigger_outside_its_registry():
    with pytest.raises(ValidationError):
        CRMAutomationUpdate.model_validate({"trigger_type": "not.a.trigger"})


# =============================================================================
# A target object has to be one this workspace can use
# =============================================================================

def _db(found):
    """A session whose single query returns *found*."""
    result = SimpleNamespace(scalar_one_or_none=lambda: found)
    return SimpleNamespace(execute=AsyncMock(return_value=result))


async def test_no_object_is_fine():
    """Automations that are not tied to a record type are ordinary."""
    await check_automation_object(_db(None), WORKSPACE, None)


async def test_an_object_in_this_workspace_is_accepted():
    object_id = str(uuid4())

    await check_automation_object(_db(object_id), WORKSPACE, object_id)


async def test_an_object_that_does_not_exist_is_refused():
    """Used to be an integrity error on insert, surfaced to the caller as 500."""
    with pytest.raises(InvalidAutomationObject, match="No object"):
        await check_automation_object(_db(None), WORKSPACE, str(uuid4()))


async def test_another_workspace_s_object_is_refused():
    """The foreign key is satisfied by it, which is the whole problem: the
    constraint has no workspace in it, so this bound an automation to an object
    its own workspace cannot see."""
    db = _db(None)  # the query is workspace-scoped, so it misses

    with pytest.raises(InvalidAutomationObject):
        await check_automation_object(db, WORKSPACE, str(uuid4()))

    # And it must be scoped — a lookup by id alone would have found it.
    where = str(db.execute.await_args.args[0])
    assert "workspace_id" in where, "the lookup was not scoped to the workspace"


async def test_a_malformed_object_id_is_refused_before_the_query():
    """Binding a non-uuid to a uuid column fails in the driver — a 500 for the
    same mistake, one layer down."""
    db = _db(None)

    with pytest.raises(InvalidAutomationObject, match="not a valid object id"):
        await check_automation_object(db, WORKSPACE, "not-a-uuid")

    db.execute.assert_not_awaited()


# =============================================================================
# The endpoint turns that refusal into a 400
# =============================================================================

async def test_create_reports_a_bad_object_as_a_bad_request():
    from aexy.api.automations import create_automation
    from aexy.schemas.automation import AutomationCreate

    data = AutomationCreate(
        name="e2e",
        module="crm",
        trigger_type="record.created",
        object_id=str(uuid4()),
        actions=[],
    )

    with patch(
        "aexy.api.automations.check_workspace_permission", AsyncMock()
    ), patch(
        "aexy.api.automations.check_automation_object",
        AsyncMock(side_effect=InvalidAutomationObject("No object 'x'")),
    ):
        with pytest.raises(HTTPException) as caught:
            await create_automation(
                workspace_id=WORKSPACE,
                data=data,
                db=_db(None),
                current_user=SimpleNamespace(id="dev-1"),
            )

    assert caught.value.status_code == 400
    assert "No object" in caught.value.detail
