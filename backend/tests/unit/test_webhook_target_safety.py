"""A webhook step must not be usable as a request-forgery primitive.

The URL is supplied by whoever builds the automation, along with the headers,
and the request leaves from inside our network. Without a target check that
reaches everything the backend can and the author cannot: the cloud metadata
endpoint, Redis, Temporal, other tenants' internal APIs. Validating only the
scheme leaves all of it reachable.
"""

import socket
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from aexy.services.crm_automation_service import (
    CRMAutomationService,
    resolve_public_webhook_host,
)


def _record():
    return SimpleNamespace(id="rec-1", name="Acme", values={"name": "Acme"})


def _resolves_to(*addresses):
    """Stand in for DNS so the test does not depend on a real resolver."""
    async def _getaddrinfo(host, port, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))
            for address in addresses
        ]
    return _getaddrinfo


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",           # loopback
        "169.254.169.254",     # cloud instance metadata
        "10.1.2.3",            # RFC1918
        "172.16.5.4",          # RFC1918
        "192.168.0.10",        # RFC1918
        "0.0.0.0",             # unspecified
        "::1",                 # IPv6 loopback
        "::ffff:127.0.0.1",    # loopback wearing a v6 hat
        "fd00::1",             # IPv6 unique-local
    ],
)
async def test_internal_literals_are_refused(address):
    assert await resolve_public_webhook_host(address, 80) is not None


@pytest.mark.asyncio
async def test_public_literal_is_allowed():
    assert await resolve_public_webhook_host("93.184.216.34", 443) is None


@pytest.mark.asyncio
async def test_a_hostname_pointed_at_metadata_is_refused():
    """A literal address is not required — any domain can be aimed there."""
    with patch(
        "asyncio.get_running_loop",
        return_value=SimpleNamespace(getaddrinfo=_resolves_to("169.254.169.254")),
    ):
        reason = await resolve_public_webhook_host("evil.example.com", 80)

    assert reason and "internal" in reason


@pytest.mark.asyncio
async def test_one_internal_answer_among_several_is_enough_to_refuse():
    """The client picks any of them, so every answer has to be public."""
    with patch(
        "asyncio.get_running_loop",
        return_value=SimpleNamespace(
            getaddrinfo=_resolves_to("93.184.216.34", "127.0.0.1")
        ),
    ):
        reason = await resolve_public_webhook_host("split.example.com", 80)

    assert reason is not None


@pytest.mark.asyncio
async def test_self_hosted_deployments_can_opt_out():
    """Calling internal systems is a real use case — but a deliberate one."""
    from aexy.core.config import get_settings

    settings = get_settings()
    original = settings.allow_private_webhook_targets
    settings.allow_private_webhook_targets = True
    try:
        assert await resolve_public_webhook_host("127.0.0.1", 80) is None
    finally:
        settings.allow_private_webhook_targets = original


@pytest.mark.asyncio
async def test_webhook_action_refuses_the_target_before_sending():
    """The refusal has to happen instead of the request, not alongside it."""
    service = CRMAutomationService(db=None)

    with patch("httpx.AsyncClient") as client:
        result = await service._action_webhook_call(
            {"webhook_url": "http://169.254.169.254/latest/meta-data/"},
            _record(),
            None,
        )

    assert "error" in result
    client.assert_not_called()


@pytest.mark.asyncio
async def test_the_durable_path_applies_the_same_target_check():
    """A canvas with a wait or condition runs through the other handler.

    Guarding only the inline executor would mean adding a wait node is enough
    to sidestep it.
    """
    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    handler = WorkflowActionHandler(db=None)

    with patch("httpx.AsyncClient") as client:
        result = await handler.execute_action(
            "webhook_call",
            {"webhook_url": "http://169.254.169.254/latest/meta-data/"},
            WorkflowExecutionContext(
                workspace_id="ws",
                record_id=None,
                record_data={},
                trigger_data={},
                variables={},
                is_dry_run=False,
            ),
        )

    assert result.status == "failed"
    assert "internal" in (result.error or "")
    client.assert_not_called()


@pytest.mark.asyncio
async def test_a_body_template_is_rendered_once():
    """The not-JSON fallback must not re-render and re-raise.

    A missing dynamic value raises out of the renderer. Rendering a second time
    inside the handler meant to catch a JSON error turned a body that is simply
    not JSON into an unhandled failure.
    """
    service = CRMAutomationService(db=None)
    renders = []

    real_render = CRMAutomationService._replace_placeholders

    def _counting_render(self, template, record, trigger_data, escape_html=False):
        renders.append(template)
        return real_render(self, template, record, trigger_data, escape_html)

    response = SimpleNamespace(
        status_code=200, is_success=True, text="ok"
    )
    client = AsyncMock()
    client.__aenter__.return_value.request = AsyncMock(return_value=response)

    with patch.object(
        CRMAutomationService, "_replace_placeholders", _counting_render
    ), patch(
        "aexy.services.crm_automation_service.resolve_public_webhook_host",
        AsyncMock(return_value=None),
    ), patch("httpx.AsyncClient", return_value=client):
        result = await service._action_webhook_call(
            {
                "webhook_url": "https://hooks.example.com/x",
                "body_template": "plain text {{record.values.name}}",
            },
            _record(),
            None,
        )

    assert result["success"] is True
    assert renders.count("plain text {{record.values.name}}") == 1


def test_a_literal_credential_in_a_webhook_header_is_flagged():
    """Header templates are stored verbatim and any member can read them back.

    A `{{trigger.*}}` reference resolves at run time and leaves nothing at
    rest; a pasted token sits in the workflow definition in plain text.
    """
    from aexy.services.workflow_service import WorkflowService

    service = WorkflowService(db=None)
    nodes = [
        {"id": "trigger", "type": "trigger",
         "data": {"trigger_type": "record.created"}},
        {"id": "wh", "type": "action", "data": {
            "action_type": "webhook_call",
            "webhook_url": "https://hooks.example.com/x",
            "headers": '{"Authorization": "Bearer sk-live-abc123"}',
        }},
    ]

    result = service.validate_workflow(nodes, [{"source": "trigger", "target": "wh"}])
    flagged = [w for w in result.warnings if w.error_type == "literal_secret_in_header"]

    assert len(flagged) == 1
    assert "Authorization" in flagged[0].message
    # A warning, not an error: there is no secret store to point at yet, so
    # blocking the save would just stop a legitimate step.
    assert flagged[0].severity == "warning"
    assert result.is_valid is True


def test_a_referenced_credential_is_not_flagged():
    from aexy.services.workflow_service import WorkflowService

    service = WorkflowService(db=None)
    nodes = [
        {"id": "trigger", "type": "trigger",
         "data": {"trigger_type": "record.created"}},
        {"id": "wh", "type": "action", "data": {
            "action_type": "webhook_call",
            "webhook_url": "https://hooks.example.com/x",
            "headers": '{"Authorization": "Bearer {{trigger.token}}"}',
        }},
    ]

    result = service.validate_workflow(nodes, [{"source": "trigger", "target": "wh"}])

    assert [w for w in result.warnings if w.error_type == "literal_secret_in_header"] == []
