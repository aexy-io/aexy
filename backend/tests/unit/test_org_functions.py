"""The declared vocabulary for ``Department.function_key``.

A function key is a routing key, not a label: Service Desk row-level visibility
resolves it, the digest resolves it to find a department head, and ticket
auto-assignment resolves it to pick an owner. Nothing declared it, so two modules
invented their own sets and disagreed — ``service_desk_industry_templates``
shipped ``ops_kam`` for Operations in one template and ``operations`` in another,
for the same concept, and since the key is unique per workspace the spelling you
got depended on which template your desk started from.

The failure mode is why these tests are thorough: a mismatch raises nothing. The
department's people see an empty queue, indistinguishable from a quiet day.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.organization import DepartmentCreate, DepartmentUpdate
from aexy.services.onboarding_use_cases import USE_CASES
from aexy.services.org_functions import (
    CUSTOM_PREFIX,
    FUNCTIONS,
    FUNCTIONS_BY_KEY,
    canonical_function_key,
    function_key_spellings,
    validate_function_key,
)
from aexy.services.organization_service import OrganizationService, department_for_function
from aexy.services.service_desk_industry_templates import INDUSTRY_TEMPLATES


# ==================== the registry itself ====================


def test_the_standard_set_is_what_we_agreed():
    assert set(FUNCTIONS_BY_KEY) == {
        "operations",
        "sales",
        "marketing",
        "support",
        "engineering",
        "product",
        "finance",
        "legal",
        "compliance",
        "hr",
    }


def test_every_entry_is_described():
    """The description is the whole point of the picker: it says what choosing
    this key will do, which the free-text box it replaced could not."""
    for spec in FUNCTIONS:
        assert spec.label and spec.description


def test_no_alias_collides_with_a_key():
    """An alias that is also a key would make resolution order load-bearing."""
    aliases = {alias for spec in FUNCTIONS for alias in spec.aliases}
    assert not (aliases & set(FUNCTIONS_BY_KEY))


# ==================== resolution ====================


def test_retired_spellings_resolve_forward():
    assert canonical_function_key("ops_kam") == "operations"


@pytest.mark.parametrize("raw", ["Operations", " operations ", "OPERATIONS", "ops-kam"])
def test_punctuation_and_case_are_not_a_different_function(raw: str):
    """These arrive from a form, a template and a migration respectively."""
    assert canonical_function_key(raw) == "operations"


def test_custom_keys_are_their_own_canonical_form():
    assert canonical_function_key("x_underwriting") == "x_underwriting"


@pytest.mark.parametrize(
    "raw",
    [
        "claims dept",  # not declared, not namespaced
        "underwriting",  # plausible, but would collide with a future registry key
        "x_",  # says nothing
        "x_a",  # ditto
        "x_ops_",  # differs from x_ops only by punctuation
    ],
)
def test_junk_does_not_resolve(raw: str):
    assert canonical_function_key(raw) is None


def test_custom_keys_are_normalised_not_rejected():
    """Someone typing into the custom field shouldn't need to know the rules."""
    assert canonical_function_key("X_Ops") == "x_ops"


def test_spellings_covers_both_directions():
    """Used with ``IN`` by every read, so it has to answer the same set for a
    retired spelling as for the canonical one."""
    assert set(function_key_spellings("operations")) == {"operations", "ops_kam"}
    assert set(function_key_spellings("ops_kam")) == {"operations", "ops_kam"}
    assert function_key_spellings("x_underwriting") == ("x_underwriting",)
    assert function_key_spellings("nonsense") == ()


def test_the_rejection_says_how_to_succeed():
    """A bare "invalid" leaves an admin with no way to express a function we don't
    list, which is exactly the case the open namespace exists for."""
    with pytest.raises(ValueError) as ei:
        validate_function_key("claims dept")
    message = str(ei.value)
    assert CUSTOM_PREFIX in message
    assert "operations" in message


def test_blank_means_no_function_not_an_error():
    assert validate_function_key(None) is None
    assert validate_function_key("   ") is None


# ==================== the two seeders agree with it ====================


def test_every_use_case_seeds_a_canonical_key():
    for use_case, config in USE_CASES.items():
        for department in config["departments"]:
            key = department["function_key"]
            if key is None:
                continue
            assert canonical_function_key(key) == key, f"{use_case} seeds {key!r}"


def test_every_template_ships_canonical_keys():
    """Enforced at import too; asserted here so the failure names the template."""
    for template in INDUSTRY_TEMPLATES:
        for spec in template.departments:
            assert canonical_function_key(spec.function_key) == spec.function_key, (
                f"{template.slug} department {spec.name}"
            )
        for stakeholder in template.stakeholders:
            if stakeholder.function_key:
                assert (
                    canonical_function_key(stakeholder.function_key)
                    == stakeholder.function_key
                ), f"{template.slug} stakeholder {stakeholder.slug}"


def test_no_two_templates_name_one_function_differently():
    """The bug this registry exists to prevent, stated directly."""
    by_department_name: dict[str, set[str]] = {}
    for template in INDUSTRY_TEMPLATES:
        for spec in template.departments:
            by_department_name.setdefault(spec.name.lower(), set()).add(spec.function_key)
    for name, keys in by_department_name.items():
        assert len(keys) == 1, f"'{name}' is {sorted(keys)} across templates"


# ==================== the write path ====================


async def _workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db.commit()
    return ws


@pytest.mark.asyncio
async def test_creating_with_a_retired_spelling_stores_the_canonical_one(
    db_session: AsyncSession,
):
    ws = await _workspace(db_session, "fn-forward")
    svc = OrganizationService(db_session)

    dept = await svc.create_department(
        ws.id, DepartmentCreate(name="Operations", function_key="ops_kam")
    )
    await db_session.commit()

    assert dept.function_key == "operations"


@pytest.mark.asyncio
async def test_creating_with_junk_is_a_400_not_a_stored_typo(db_session: AsyncSession):
    ws = await _workspace(db_session, "fn-junk")
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as ei:
        await svc.create_department(
            ws.id, DepartmentCreate(name="Claims", function_key="claims dept")
        )
    assert ei.value.status_code == 400


@pytest.mark.asyncio
async def test_a_custom_key_is_accepted(db_session: AsyncSession):
    ws = await _workspace(db_session, "fn-custom")
    svc = OrganizationService(db_session)

    dept = await svc.create_department(
        ws.id, DepartmentCreate(name="Underwriting", function_key="x_underwriting")
    )
    await db_session.commit()

    assert dept.function_key == "x_underwriting"


@pytest.mark.asyncio
async def test_a_retired_spelling_already_claims_the_function(db_session: AsyncSession):
    """A workspace holding ``ops_kam`` has claimed ``operations``.

    The unique index compares strings and cannot see this, so without the
    spelling-aware check a second department could take the canonical key and the
    workspace would have two departments for one function — the state the index
    exists to prevent.
    """
    ws = await _workspace(db_session, "fn-claimed")
    svc = OrganizationService(db_session)

    # Written the way a pre-migration workspace holds it.
    legacy = await svc.create_department(ws.id, DepartmentCreate(name="Ops"))
    legacy_row = await svc._get(ws.id, legacy.id)
    legacy_row.function_key = "ops_kam"
    await db_session.commit()

    with pytest.raises(HTTPException) as ei:
        await svc.create_department(
            ws.id, DepartmentCreate(name="Operations", function_key="operations")
        )
    assert ei.value.status_code == 409


@pytest.mark.asyncio
async def test_an_unchanged_pre_registry_key_does_not_block_a_rename(
    db_session: AsyncSession,
):
    """Otherwise a department carrying a key we no longer recognise could never be
    edited at all — its name, cost centre and headcount would all be frozen by a
    field the form wasn't even changing."""
    ws = await _workspace(db_session, "fn-grandfather")
    svc = OrganizationService(db_session)
    dept = await svc.create_department(ws.id, DepartmentCreate(name="Legacy"))
    row = await svc._get(ws.id, dept.id)
    row.function_key = "weird_legacy_value"
    await db_session.commit()

    updated = await svc.update_department(
        ws.id,
        dept.id,
        DepartmentUpdate(name="Legacy renamed", function_key="weird_legacy_value"),
    )
    await db_session.commit()

    assert updated.name == "Legacy renamed"
    assert updated.function_key == "weird_legacy_value"


@pytest.mark.asyncio
async def test_changing_a_pre_registry_key_to_junk_is_still_rejected(
    db_session: AsyncSession,
):
    """Grandfathering is for the value that is already there, not a licence."""
    ws = await _workspace(db_session, "fn-grandfather-limit")
    svc = OrganizationService(db_session)
    dept = await svc.create_department(ws.id, DepartmentCreate(name="Legacy"))
    row = await svc._get(ws.id, dept.id)
    row.function_key = "weird_legacy_value"
    await db_session.commit()

    with pytest.raises(HTTPException) as ei:
        await svc.update_department(
            ws.id, dept.id, DepartmentUpdate(function_key="another bad one")
        )
    assert ei.value.status_code == 400


# ==================== the shared resolver ====================


@pytest.mark.asyncio
async def test_resolver_finds_a_department_holding_a_retired_spelling(
    db_session: AsyncSession,
):
    """The reason intake and the digest share one resolver: each open-coded query
    had to remember this, and the one in intake didn't — it compared to the
    literal ``"ops_kam"``, so every workspace that never used the insurance
    template had its incoming mail arrive unassigned."""
    ws = await _workspace(db_session, "fn-resolve")
    svc = OrganizationService(db_session)
    dept = await svc.create_department(ws.id, DepartmentCreate(name="Ops"))
    row = await svc._get(ws.id, dept.id)
    row.function_key = "ops_kam"
    await db_session.commit()

    found = await department_for_function(db_session, ws.id, "operations")
    assert found is not None and found.id == dept.id


@pytest.mark.asyncio
async def test_resolver_ignores_an_inactive_department(db_session: AsyncSession):
    ws = await _workspace(db_session, "fn-inactive")
    svc = OrganizationService(db_session)
    dept = await svc.create_department(
        ws.id, DepartmentCreate(name="Ops", function_key="operations")
    )
    row = await svc._get(ws.id, dept.id)
    row.is_active = False
    await db_session.commit()

    assert await department_for_function(db_session, ws.id, "operations") is None


@pytest.mark.asyncio
async def test_resolver_is_scoped_to_the_workspace(db_session: AsyncSession):
    mine = await _workspace(db_session, "fn-mine")
    theirs = await _workspace(db_session, "fn-theirs")
    svc = OrganizationService(db_session)
    await svc.create_department(
        theirs.id, DepartmentCreate(name="Ops", function_key="operations")
    )
    await db_session.commit()

    assert await department_for_function(db_session, mine.id, "operations") is None


@pytest.mark.asyncio
async def test_resolver_answers_none_for_no_key(db_session: AsyncSession):
    ws = await _workspace(db_session, "fn-nokey")
    assert await department_for_function(db_session, ws.id, None) is None


# ==================== the catalogue the picker renders ====================


@pytest.mark.asyncio
async def test_catalog_names_who_has_claimed_each_function(db_session: AsyncSession):
    ws = await _workspace(db_session, "fn-catalog")
    svc = OrganizationService(db_session)
    await svc.create_department(
        ws.id, DepartmentCreate(name="Revenue", function_key="sales")
    )
    await db_session.commit()

    catalog = await svc.function_catalog(ws.id)
    by_key = {option.key: option for option in catalog.options}

    assert by_key["sales"].claimed_by_department_name == "Revenue"
    assert by_key["finance"].claimed_by_department_id is None
    assert catalog.custom_prefix == CUSTOM_PREFIX


@pytest.mark.asyncio
async def test_catalog_keeps_offering_a_custom_key_the_workspace_uses(
    db_session: AsyncSession,
):
    """A custom key is not in the registry, so without this it would vanish from
    its own department's dropdown and read as "no function"."""
    ws = await _workspace(db_session, "fn-catalog-custom")
    svc = OrganizationService(db_session)
    await svc.create_department(
        ws.id, DepartmentCreate(name="Underwriting", function_key="x_underwriting")
    )
    await db_session.commit()

    catalog = await svc.function_catalog(ws.id)
    custom = next(o for o in catalog.options if o.key == "x_underwriting")

    assert custom.is_custom is True
    assert custom.claimed_by_department_name == "Underwriting"


@pytest.mark.asyncio
async def test_catalog_on_a_workspace_with_no_desk_claims_no_routing(
    db_session: AsyncSession,
):
    """`routes_stakeholders` is computed from the workspace's own taxonomy, so a
    workspace without a Service Desk must not be told its keys route anything."""
    ws = await _workspace(db_session, "fn-nodesk")
    svc = OrganizationService(db_session)

    catalog = await svc.function_catalog(ws.id)

    assert all(option.routes_stakeholders == [] for option in catalog.options)
    assert catalog.unclaimed_stakeholder_functions == []
