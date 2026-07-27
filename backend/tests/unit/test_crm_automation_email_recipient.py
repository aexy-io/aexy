"""Regression checks for CRM record-created email recipients."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from aexy.services.crm_automation_service import CRMAutomationService


def _record(**values):
    return SimpleNamespace(id="record-1", name="Alex", values=values)


def test_placeholders_use_record_and_trigger_values():
    service = CRMAutomationService(db=None)

    rendered = service._replace_placeholders(
        "Hi {{record.values.name}}: {{trigger.source.kind}} / {email}",
        _record(name="Alex", email="alex@example.com"),
        {"source": {"kind": "record.created"}},
    )

    assert rendered == "Hi Alex: record.created / alex@example.com"


def test_missing_placeholder_fails_loudly_instead_of_rendering_blank():
    """US-6.4: an unresolvable placeholder must not silently become "".

    This previously rendered an empty string, so a customer received a message
    with a visible gap where their name should have been and nothing anywhere
    recorded that a value had gone missing. It now raises, which surfaces as a
    failed run naming the exact placeholder.
    """
    service = CRMAutomationService(db=None)

    with pytest.raises(ValueError, match=r"record\.values\.missing"):
        service._replace_placeholders(
            "Hi {{record.values.missing}}",
            _record(name="Alex", email="alex@example.com"),
            None,
        )


def test_placeholders_support_record_metadata_without_removing_literal_braces():
    service = CRMAutomationService(db=None)

    rendered = service._replace_placeholders(
        "{{record.id}} {{record.name}} <style>.card {color: red}</style> {missing}",
        _record(name="Alex"),
        None,
    )

    assert rendered == "record-1 Alex <style>.card {color: red}</style> {missing}"


@pytest.mark.asyncio
async def test_email_action_dispatches_the_record_email_for_a_record_placeholder():
    service = CRMAutomationService(db=None)

    with patch(
        "aexy.temporal.dispatch.dispatch", new_callable=AsyncMock
    ) as dispatch:
        result = await service._action_send_email(
            {
                "to": "{{record.values.email}}",
                "email_subject": "Welcome {{record.values.name}}",
                "email_body": "Hello {name}",
            },
            _record(name="Alex", email="alex@example.com"),
            "workspace-1",
        )

    # No run to reconcile against, so this one goes straight out.
    sent_email = dispatch.await_args.args[1]
    assert result["success"] is True
    assert sent_email.to_email == "alex@example.com"
    assert sent_email.subject == "Welcome Alex"
    assert sent_email.html_body == "Hello Alex"


@pytest.mark.asyncio
async def test_email_body_escapes_record_values_but_not_the_template():
    """A record field is attacker-controllable; the template is not.

    Anyone able to create a lead can put markup in a company name. Dropping
    that straight into html_body ships it to the recipient as live markup, so
    substituted values are escaped — while the admin-authored template keeps
    the formatting it was written with.
    """
    service = CRMAutomationService(db=None)

    with patch(
        "aexy.temporal.dispatch.dispatch", new_callable=AsyncMock
    ) as dispatch:
        await service._action_send_email(
            {
                "to": "alex@example.com",
                "email_subject": "Welcome",
                "email_body": "<p>Hello {{record.values.name}}</p>",
            },
            _record(name='<img src=x onerror="alert(1)">', email="alex@example.com"),
            "workspace-1",
        )

    html_body = dispatch.await_args.args[1].html_body
    assert html_body == (
        "<p>Hello &lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>"
    )


@pytest.mark.asyncio
async def test_email_action_reports_a_missing_record_email_without_dispatching():
    """A record with no email must stop the send and say which value was missing.

    US-6.4 changed how this surfaces: the recipient placeholder now fails while
    being resolved, so the reason names the exact path rather than the vaguer
    "No recipient email address specified". Either way nothing is dispatched,
    which is the part that protects the customer.
    """
    service = CRMAutomationService(db=None)

    with patch(
        "aexy.temporal.dispatch.dispatch", new_callable=AsyncMock
    ) as dispatch:
        with pytest.raises(ValueError, match=r"record\.values\.email"):
            await service._action_send_email(
                {
                    "to": "{{record.values.email}}",
                    "email_subject": "Welcome",
                    "email_body": "Hello",
                },
                _record(name="Alex"),
                "workspace-1",
            )

    dispatch.assert_not_awaited()
