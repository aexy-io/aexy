"""A credential must not be readable by everyone who can open the builder.

Webhook header templates are stored verbatim in the workflow definition, and
reading a workflow only needs `member`. A pasted `Authorization: Bearer sk-…`
was therefore visible to the whole workspace, and the builder could only warn
because there was nowhere else to put it.
"""


import pytest

from aexy.core.encryption import decrypt_credentials
from aexy.models.workspace_secret import WorkspaceSecret
from aexy.services.workspace_secret_service import (
    UnknownSecretError,
    WorkspaceSecretService,
)
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


async def _service(db):
    return WorkspaceSecretService(db), await seed_workspace(db)


async def test_the_value_is_not_stored_in_the_clear(db_session):
    """The whole point: the row must not contain the token as text."""
    service, ws = await _service(db_session)

    await service.upsert(ws, "STRIPE", "sk-live-abc123")
    await db_session.flush()

    from sqlalchemy import select

    row = (
        await db_session.execute(select(WorkspaceSecret))
    ).scalar_one()
    assert "sk-live-abc123" not in str(row.encrypted_value)
    assert decrypt_credentials(row.encrypted_value)["value"] == "sk-live-abc123"


async def test_a_reference_resolves_to_the_value(db_session):
    service, ws = await _service(db_session)
    await service.upsert(ws, "TOKEN", "sk-live-abc123")

    rendered = await service.resolve_references(ws, "Bearer {{secrets.TOKEN}}")

    assert rendered == "Bearer sk-live-abc123"


async def test_a_missing_secret_fails_loudly(db_session):
    """Leaving the reference unsubstituted would send `{{secrets.X}}` as the
    literal credential, which fails confusingly at the provider instead of
    clearly here."""
    service, ws = await _service(db_session)

    with pytest.raises(UnknownSecretError, match="GONE"):
        await service.resolve_references(ws, "Bearer {{secrets.GONE}}")


async def test_one_workspace_cannot_read_another_s_secret(db_session):
    service, mine = await _service(db_session)
    theirs = await seed_workspace(db_session)
    await service.upsert(theirs, "TOKEN", "not-yours")

    with pytest.raises(UnknownSecretError):
        await service.resolve_references(mine, "{{secrets.TOKEN}}")


async def test_rotation_replaces_the_value_in_place(db_session):
    service, ws = await _service(db_session)
    await service.upsert(ws, "TOKEN", "old")

    await service.upsert(ws, "TOKEN", "new")

    assert await service.resolve_references(ws, "{{secrets.TOKEN}}") == "new"
    assert len(await service.list_names(ws)) == 1, "rotation created a duplicate"


async def test_listing_never_exposes_a_value(db_session):
    service, ws = await _service(db_session)
    await service.upsert(ws, "TOKEN", "sk-live-abc123", description="Stripe")

    listed = await service.list_names(ws)

    assert [s.name for s in listed] == ["TOKEN"]
    assert "sk-live-abc123" not in str(
        [(s.name, s.description) for s in listed]
    )


async def test_a_name_that_cannot_be_referenced_is_refused(db_session):
    """Storable but unreferenceable would be a trap."""
    service, ws = await _service(db_session)

    with pytest.raises(ValueError, match="Secret name"):
        await service.upsert(ws, "has spaces", "x")


async def test_using_a_secret_is_recorded_without_recording_what_for(db_session):
    service, ws = await _service(db_session)
    await service.upsert(ws, "TOKEN", "v")

    await service.resolve_references(ws, "{{secrets.TOKEN}}")

    assert (await service.list_names(ws))[0].last_used_at is not None


def test_a_literal_credential_in_a_header_is_now_refused():
    """Was a warning while there was no alternative; secrets are the alternative."""
    from aexy.services.workflow_service import WorkflowService

    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}},
        {"id": "wh", "type": "action", "data": {
            "action_type": "webhook_call",
            "webhook_url": "https://hooks.example.com/x",
            "headers": '{"Authorization": "Bearer sk-live-abc123"}',
        }},
    ]

    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"source": "t", "target": "wh"}]
    )

    flagged = [e for e in result.errors if e.error_type == "literal_secret_in_header"]
    assert len(flagged) == 1
    assert "{{secrets.NAME}}" in flagged[0].message
    assert result.is_valid is False, "a pasted token must block the save"


def test_a_secret_reference_in_a_header_validates():
    from aexy.services.workflow_service import WorkflowService

    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}},
        {"id": "wh", "type": "action", "data": {
            "action_type": "webhook_call",
            "webhook_url": "https://hooks.example.com/x",
            "headers": '{"Authorization": "Bearer {{secrets.STRIPE}}"}',
        }},
    ]

    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"source": "t", "target": "wh"}]
    )

    assert [e.error_type for e in result.errors] == []
    assert result.is_valid is True


async def test_the_webhook_step_sends_the_resolved_credential(db_session):
    """End to end: the graph holds a reference, the request carries the value."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from aexy.services.crm_automation_service import CRMAutomationService

    service, ws = await _service(db_session)
    await service.upsert(ws, "STRIPE", "sk-live-abc123")

    captured = {}

    class FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return None

        async def request(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(status_code=200, is_success=True, text="ok")

    with patch(
        "aexy.services.crm_automation_service.resolve_public_webhook_host",
        AsyncMock(return_value=None),
    ), patch("httpx.AsyncClient", FakeClient):
        result = await CRMAutomationService(db_session)._action_webhook_call(
            {
                "webhook_url": "https://hooks.example.com/x",
                "headers": '{"Authorization": "Bearer {{secrets.STRIPE}}"}',
            },
            None,
            None,
            workspace_id=ws,
        )

    assert result["success"] is True
    assert captured["headers"]["Authorization"] == "Bearer sk-live-abc123"
    # And the value must not come back in the step's recorded result.
    assert "sk-live-abc123" not in str(result)


async def test_an_echoing_receiver_cannot_put_the_secret_in_run_history(db_session):
    """The webhook step records the response body, and receivers echo requests.

    Found live, not here: the first version of this file asserted the value was
    absent from the result while mocking the response as "ok", so it passed
    without exercising the path at all. Pointing a real step at an echo server
    put the credential straight into run history.
    """
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from aexy.services.crm_automation_service import CRMAutomationService

    service, ws = await _service(db_session)
    await service.upsert(ws, "STRIPE", "sk-live-abc123")

    class EchoingClient:
        """Behaves like httpbin /post: replays the request headers."""

        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return None

        async def request(self, **kwargs):
            return SimpleNamespace(
                status_code=200,
                is_success=True,
                text='{"headers": %r}' % (kwargs["headers"],),
            )

    with patch(
        "aexy.services.crm_automation_service.resolve_public_webhook_host",
        AsyncMock(return_value=None),
    ), patch("httpx.AsyncClient", EchoingClient):
        result = await CRMAutomationService(db_session)._action_webhook_call(
            {
                "webhook_url": "https://hooks.example.com/x",
                "headers": '{"Authorization": "Bearer {{secrets.STRIPE}}"}',
            },
            None,
            None,
            workspace_id=ws,
        )

    assert result["success"] is True
    assert "sk-live-abc123" not in str(result), "the credential reached run history"
    assert "[redacted secret]" in result["response"]
