"""Who may curate a workspace's document templates.

The endpoints these cover shipped with no caller at all, so nothing had ever
exercised the gate in front of them. That is the worst state for an
authorization check to be in: it looks present in review and has never once run.

The service-level behaviour is covered in `test_document_templates.py`, but the
tests that write template rows are `@requires_postgres` — `variables` is an
`ARRAY(String)` column, which SQLite cannot bind — so they skip on the default
run. These do not touch a row, and therefore run everywhere.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from aexy.api import documents as documents_api
from aexy.services.document_service import DocumentService
from aexy.services.workspace_service import WorkspaceService

pytestmark = pytest.mark.asyncio

WORKSPACE = "11111111-1111-4111-8111-111111111111"
OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222"
TEMPLATE = "33333333-3333-4333-8333-333333333333"


@pytest.fixture(autouse=True)
def _module_enabled(monkeypatch):
    """The docs toggle is a separate gate with its own tests; neutralise it."""

    async def enabled(*_args, **_kwargs):
        return None

    monkeypatch.setattr(documents_api, "ensure_app_enabled", enabled)


def _as_member(monkeypatch, *, allowed: bool):
    async def check_permission(_self, _workspace_id, _developer_id, _role):
        return allowed

    monkeypatch.setattr(WorkspaceService, "check_permission", check_permission)


def _user():
    return SimpleNamespace(id="44444444-4444-4444-8444-444444444444")


async def test_a_non_member_cannot_rename_a_template(monkeypatch):
    _as_member(monkeypatch, allowed=False)

    async def must_not_run(*_args, **_kwargs):
        raise AssertionError("the service was reached without a permission check")

    monkeypatch.setattr(DocumentService, "update_workspace_template", must_not_run)

    with pytest.raises(HTTPException) as caught:
        await documents_api.update_template(
            TEMPLATE,
            documents_api.TemplateUpdate(name="Mine now"),
            workspace_id=WORKSPACE,
            current_user=_user(),
            db=None,
        )

    assert caught.value.status_code == 403


async def test_a_non_member_cannot_retire_a_template(monkeypatch):
    _as_member(monkeypatch, allowed=False)

    async def must_not_run(*_args, **_kwargs):
        raise AssertionError("the service was reached without a permission check")

    monkeypatch.setattr(DocumentService, "delete_workspace_template", must_not_run)

    with pytest.raises(HTTPException) as caught:
        await documents_api.delete_template(
            TEMPLATE,
            workspace_id=WORKSPACE,
            current_user=_user(),
            db=None,
        )

    assert caught.value.status_code == 403


async def test_a_template_from_another_workspace_reads_as_missing(monkeypatch):
    """404, not 403 — the two have to be indistinguishable.

    A 403 would confirm that this id names a real template somewhere, which is
    how a workspace learns what another workspace has.
    """
    _as_member(monkeypatch, allowed=True)

    seen = {}

    async def update(_self, template_id, workspace_id, fields):
        # The service scopes by workspace in the query rather than checking after
        # loading, so a foreign id simply finds nothing.
        seen["args"] = (template_id, workspace_id, fields)
        return None

    monkeypatch.setattr(DocumentService, "update_workspace_template", update)

    with pytest.raises(HTTPException) as caught:
        await documents_api.update_template(
            TEMPLATE,
            documents_api.TemplateUpdate(name="Mine now"),
            workspace_id=OTHER_WORKSPACE,
            current_user=_user(),
            db=None,
        )

    assert caught.value.status_code == 404
    assert seen["args"][1] == OTHER_WORKSPACE, "the caller's workspace must scope the query"


async def test_only_the_fields_the_request_sent_are_passed_on(monkeypatch):
    """An omitted field and an explicit null are different requests.

    Collapsing them is what makes a description unclearable once written, so the
    endpoint passes `exclude_unset` and the service applies exactly that.
    """
    _as_member(monkeypatch, allowed=True)
    seen = {}

    async def update(_self, _template_id, _workspace_id, fields):
        seen["fields"] = fields
        return SimpleNamespace(
            id=TEMPLATE,
            workspace_id=WORKSPACE,
            name="Renamed",
            description=None,
            category="custom",
            icon=None,
            content_template={},
            prompt_template="",
            system_prompt=None,
            variables=[],
            is_system=False,
            is_active=True,
            created_by_id=None,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )

    monkeypatch.setattr(DocumentService, "update_workspace_template", update)

    await documents_api.update_template(
        TEMPLATE,
        # Only `name` and an explicit null description; `icon` is not mentioned.
        documents_api.TemplateUpdate(name="Renamed", description=None),
        workspace_id=WORKSPACE,
        current_user=_user(),
        db=None,
    )

    assert seen["fields"] == {"name": "Renamed", "description": None}
    assert "icon" not in seen["fields"]


async def test_a_system_template_is_not_editable(monkeypatch):
    """It ships with the code. Forking is the way to get a version you can change."""
    _as_member(monkeypatch, allowed=True)
    service = DocumentService(db=None)

    assert await service.update_workspace_template("sys:prd", WORKSPACE, {"name": "x"}) is None
    assert await service.delete_workspace_template("sys:prd", WORKSPACE) is False


async def test_a_field_the_caller_may_not_set_is_dropped(monkeypatch):
    """`is_system` would promote a workspace row into something undeletable."""
    captured = SimpleNamespace(
        id=TEMPLATE, workspace_id=WORKSPACE, name="Ours", is_system=False
    )

    class FakeResult:
        @staticmethod
        def scalar_one_or_none():
            return captured

    class FakeDb:
        @staticmethod
        async def execute(_stmt):
            return FakeResult()

        @staticmethod
        async def commit():
            return None

    await DocumentService(db=FakeDb()).update_workspace_template(
        TEMPLATE,
        WORKSPACE,
        {"name": "Renamed", "is_system": True, "workspace_id": OTHER_WORKSPACE},
    )

    assert captured.name == "Renamed"
    assert captured.is_system is False
    assert captured.workspace_id == WORKSPACE
