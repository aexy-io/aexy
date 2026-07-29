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


async def test_the_durable_path_resolves_a_secret_in_a_header(db_session):
    """The same guarantee as the inline path, on the executor that actually
    runs published workflows.

    This was broken and untested. Header templates are rendered before secrets
    are resolved, and the renderer raises on any `{{...}}` it cannot resolve —
    `secrets` is not one of its namespaces, so every `{{secrets.NAME}}` header
    failed its step with "Dynamic value is missing" and the reference never
    reached the resolver. The existing tests all exercised the inline CRM
    service, and the one durable test asserted a *failure*, which this bug
    produced for the wrong reason.
    """
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    service, ws = await _service(db_session)
    await service.upsert(ws, "STRIPE", "sk-live-abc123")

    captured: dict = {}

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
        result = await WorkflowActionHandler(db_session)._webhook_call(
            {
                "webhook_url": "https://hooks.example.com/x",
                "headers": '{"Authorization": "Bearer {{secrets.STRIPE}}"}',
            },
            WorkflowExecutionContext(workspace_id=ws),
        )

    assert result.status == "success", result.error
    assert captured["headers"]["Authorization"] == "Bearer sk-live-abc123"


async def test_a_record_reference_beside_a_secret_still_renders(db_session):
    """Passing `secrets.*` through the renderer must not disable the rest of
    it — a header can legitimately carry both."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    service, ws = await _service(db_session)
    await service.upsert(ws, "TOKEN", "abc")

    captured: dict = {}

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
        result = await WorkflowActionHandler(db_session)._webhook_call(
            {
                "webhook_url": "https://hooks.example.com/x",
                "headers": (
                    '{"Authorization": "Bearer {{secrets.TOKEN}}",'
                    ' "X-Record": "{{record.id}}"}'
                ),
            },
            WorkflowExecutionContext(
                workspace_id=ws, record_id="rec-9", record_data={"id": "rec-9"}
            ),
        )

    assert result.status == "success", result.error
    assert captured["headers"]["Authorization"] == "Bearer abc"
    assert captured["headers"]["X-Record"] == "rec-9"


async def test_a_missing_record_reference_still_fails_the_step(db_session):
    """The pass-through is for `secrets.*` only. A typo'd record path must
    still be caught rather than sent as literal `{{record.nope}}`."""
    from unittest.mock import AsyncMock, patch

    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    _service_obj, ws = await _service(db_session)

    with patch(
        "aexy.services.crm_automation_service.resolve_public_webhook_host",
        AsyncMock(return_value=None),
    ):
        result = await WorkflowActionHandler(db_session)._webhook_call(
            {
                "webhook_url": "https://hooks.example.com/x",
                "headers": '{"X-Thing": "{{record.nope}}"}',
            },
            WorkflowExecutionContext(workspace_id=ws),
        )

    assert result.status == "failed"
    assert "missing" in (result.error or "")


async def test_the_api_request_auth_fields_were_read_by_nothing(db_session):
    """The regression these tests exist for.

    The builder collects `auth_type` with a bearer token or an API key. No
    executor read those fields: the credential sat in the workflow definition,
    where any member can read it, and the request went out unauthenticated. So
    the step both leaked the token and did not use it.
    """
    from aexy.services.workflow_actions import _resolve_auth_header

    service, ws = await _service(db_session)
    await service.upsert(ws, "STRIPE", "sk-live-abc123")

    header, used = await _resolve_auth_header(
        {"auth_type": "bearer", "bearer_token": "{{secrets.STRIPE}}"},
        service,
        ws,
    )

    assert header == ("Authorization", "Bearer sk-live-abc123")
    assert used == {"sk-live-abc123"}


async def test_an_api_key_goes_into_the_header_it_names(db_session):
    from aexy.services.workflow_actions import _resolve_auth_header

    service, ws = await _service(db_session)
    await service.upsert(ws, "KEY", "k-123")

    header, _ = await _resolve_auth_header(
        {
            "auth_type": "api_key",
            "api_key_header": "X-Acme-Key",
            "api_key": "{{secrets.KEY}}",
        },
        service,
        ws,
    )

    assert header == ("X-Acme-Key", "k-123")


async def test_bearer_is_not_doubled_when_the_author_types_it(db_session):
    """`Bearer {{secrets.X}}` is the natural thing to write having just seen
    the header form, and prefixing it again would send `Bearer Bearer`."""
    from aexy.services.workflow_actions import _resolve_auth_header

    service, ws = await _service(db_session)
    await service.upsert(ws, "TOKEN", "abc")

    header, _ = await _resolve_auth_header(
        {"auth_type": "bearer", "bearer_token": "Bearer {{secrets.TOKEN}}"},
        service,
        ws,
    )

    assert header == ("Authorization", "Bearer abc")


async def test_a_literal_credential_is_refused_at_run_time_too(db_session):
    """Validation blocks this on save, but saved workflows predate that.

    Sending it anyway would keep a readable credential in the graph working,
    which is the arrangement being retired.
    """
    from aexy.services.workflow_actions import _resolve_auth_header

    service, ws = await _service(db_session)

    with pytest.raises(ValueError, match="literal credential"):
        await _resolve_auth_header(
            {"auth_type": "bearer", "bearer_token": "sk-live-pasted"},
            service,
            ws,
        )


async def test_no_auth_configured_adds_no_header(db_session):
    from aexy.services.workflow_actions import _resolve_auth_header

    service, ws = await _service(db_session)

    for config in ({}, {"auth_type": "none"}, {"auth_type": ""}):
        header, used = await _resolve_auth_header(config, service, ws)
        assert header is None
        assert used == set()


async def test_auth_set_but_empty_is_refused_rather_than_sent_bare(db_session):
    from aexy.services.workflow_actions import _resolve_auth_header

    service, ws = await _service(db_session)

    with pytest.raises(ValueError, match="is empty"):
        await _resolve_auth_header(
            {"auth_type": "api_key", "api_key": "   "}, service, ws
        )


async def test_an_api_request_step_authenticates_and_keeps_it_out_of_history(
    db_session,
):
    """The whole path: builder keys, auth applied, echoed response scrubbed.

    Uses the panel's own key names — `api_url`, `api_method`, `api_body` —
    because the executor read `webhook_url` / `http_method` / `body_template`
    and nothing else, so every api_request step built in the builder failed on
    "No webhook URL specified" whatever it was configured with.
    """
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    service, ws = await _service(db_session)
    await service.upsert(ws, "ACME", "k-super-secret")

    class EchoingClient:
        """Replays the request headers, the way httpbin does."""

        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return None

        async def request(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                status_code=200,
                is_success=True,
                text='{"headers": %r}' % (kwargs["headers"],),
            )

    captured: dict = {}
    handler = WorkflowActionHandler(db_session)

    with patch(
        "aexy.services.crm_automation_service.resolve_public_webhook_host",
        AsyncMock(return_value=None),
    ), patch("httpx.AsyncClient", EchoingClient):
        result = await handler._webhook_call(
            {
                "api_url": "https://api.example.com/charge",
                "api_method": "POST",
                "api_body": "{}",
                "auth_type": "api_key",
                "api_key_header": "X-Acme-Key",
                "api_key": "{{secrets.ACME}}",
            },
            WorkflowExecutionContext(workspace_id=ws),
        )

    assert result.status == "success", result.error
    # The request carried the credential…
    assert captured["headers"]["X-Acme-Key"] == "k-super-secret"
    # …and the recorded response did not.
    assert "k-super-secret" not in str(result.output)
    assert "[redacted secret]" in result.output["response"]


async def test_an_explicit_header_wins_over_the_auth_field(db_session):
    """The more specific instruction. Silently overwriting a header the author
    wrote by hand would be the surprising choice."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    service, ws = await _service(db_session)
    await service.upsert(ws, "FROM_FIELD", "from-the-auth-field")
    await service.upsert(ws, "FROM_HEADER", "from-the-header")

    captured: dict = {}

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
        result = await WorkflowActionHandler(db_session)._webhook_call(
            {
                "api_url": "https://api.example.com/x",
                "headers": '{"Authorization": "Bearer {{secrets.FROM_HEADER}}"}',
                "auth_type": "bearer",
                "bearer_token": "{{secrets.FROM_FIELD}}",
            },
            WorkflowExecutionContext(workspace_id=ws),
        )

    assert result.status == "success", result.error
    assert captured["headers"]["Authorization"] == "Bearer from-the-header"


def test_a_literal_in_the_auth_field_blocks_the_save():
    from aexy.services.workflow_service import WorkflowService

    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}},
        {"id": "req", "type": "action", "data": {
            "action_type": "api_request",
            "api_url": "https://api.example.com/x",
            "auth_type": "bearer",
            "bearer_token": "sk-live-pasted",
        }},
    ]

    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"source": "t", "target": "req"}]
    )

    flagged = [e for e in result.errors if e.error_type == "literal_secret_in_auth"]
    assert len(flagged) == 1
    assert "{{secrets.NAME}}" in flagged[0].message
    assert result.is_valid is False


def test_a_reference_in_the_auth_field_validates():
    from aexy.services.workflow_service import WorkflowService

    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}},
        {"id": "req", "type": "action", "data": {
            "action_type": "api_request",
            "api_url": "https://api.example.com/x",
            "auth_type": "api_key",
            "api_key": "{{secrets.ACME}}",
        }},
    ]

    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"source": "t", "target": "req"}]
    )

    assert [e.error_type for e in result.errors] == []
    assert result.is_valid is True


def test_a_token_left_behind_by_switching_to_no_auth_is_not_flagged():
    """It is inert — nothing reads it — so blocking the save would be noise
    the author cannot act on without knowing to clear a hidden field."""
    from aexy.services.workflow_service import WorkflowService

    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}},
        {"id": "req", "type": "action", "data": {
            "action_type": "api_request",
            "api_url": "https://api.example.com/x",
            "auth_type": "none",
            "bearer_token": "sk-live-stale",
        }},
    ]

    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"source": "t", "target": "req"}]
    )

    assert [e.error_type for e in result.errors] == []


def test_api_request_headers_are_checked_like_webhook_headers():
    """Same executor, same exposure — the check only covered webhook_call."""
    from aexy.services.workflow_service import WorkflowService

    nodes = [
        {"id": "t", "type": "trigger", "data": {"trigger_type": "record.created"}},
        {"id": "req", "type": "action", "data": {
            "action_type": "api_request",
            "api_url": "https://api.example.com/x",
            "headers": '{"Authorization": "Bearer sk-live-abc"}',
        }},
    ]

    result = WorkflowService(db=None).validate_workflow(
        nodes, [{"source": "t", "target": "req"}]
    )

    assert [e.error_type for e in result.errors] == ["literal_secret_in_header"]


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
