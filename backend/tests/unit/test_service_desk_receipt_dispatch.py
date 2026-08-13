"""Handing the manual-ticket receipt to Temporal, and what happens when it hangs.

``_queue_manual_ticket_receipt`` decides between a durable receipt and an
in-process one. Its whole job is to be quick about it: an operator is on a call
when they log a ticket, so this must never be what makes them wait.

The case pinned here is the one that was wrong. The fallback was reached by
catching whatever ``dispatch`` raised, which covers a refused connection and
nothing else — but "unreachable" is often not a refusal. A wedged container, a
partition, or a port forward outliving what it forwarded to all complete the TCP
handshake and then say nothing, and ``start_workflow`` carries no deadline of its
own. That combination hung the request indefinitely, and it hung on precisely the
path the fallback was written for.

These call the helper directly rather than through the endpoint: the ASGI stack
meters every request through Redis, and needing a live Redis to prove a Temporal
timeout would only make this test fail for reasons that are not about Temporal.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import BackgroundTasks

import aexy.api.service_desk as service_desk_api
import aexy.temporal.dispatch as dispatch_module

TICKET_ID = "ticket-1"


@pytest.fixture
def fallback(monkeypatch) -> list[str]:
    """Record what the in-process fallback was asked to acknowledge."""
    acknowledged: list[str] = []

    async def _acknowledge(ticket_id: str) -> None:
        acknowledged.append(ticket_id)

    monkeypatch.setattr(
        "aexy.services.service_desk_intake_service.acknowledge_ticket_in_background",
        _acknowledge,
    )
    return acknowledged


def _dispatch(monkeypatch, behaviour) -> list[dict]:
    """Replace ``dispatch`` with `behaviour`, recording how it was called."""
    calls: list[dict] = []

    async def _fake(activity_name, activity_input, **kwargs):
        calls.append({"activity": activity_name, **kwargs})
        return await behaviour()

    monkeypatch.setattr(dispatch_module, "dispatch", _fake)
    return calls


async def _run(background: BackgroundTasks) -> float:
    """Queue the receipt, returning how long the caller was made to wait."""
    started = asyncio.get_running_loop().time()
    await service_desk_api._queue_manual_ticket_receipt(TICKET_ID, background)
    return asyncio.get_running_loop().time() - started


@pytest.mark.asyncio
async def test_a_temporal_that_never_answers_does_not_hold_the_request(
    monkeypatch, fallback
):
    """The regression. Not a raise — a call that is accepted and then ignored.

    Deliberately run against the real deadline rather than a shortened one, so
    what is asserted is that the wait is bounded at all. Patching the constant
    would make this pass on code with no deadline in it, which is the exact
    defect. Costs the deadline in wall clock; worth it for the only assertion
    here that cannot be faked.
    """

    async def _never_answers():
        await asyncio.Event().wait()

    _dispatch(monkeypatch, _never_answers)
    background = BackgroundTasks()

    # Plain numbers, not the constant: naming it would make this test error out
    # on code that has no deadline at all, when what should happen is that it
    # hangs and fails. Both are comfortably above the 5s the endpoint allows.
    waited = await asyncio.wait_for(_run(background), timeout=12)

    assert waited < 10, (
        f"the operator waited {waited:.1f}s on a Temporal that never replied"
    )
    # and the receipt is not lost — it falls back to the in-process send
    assert len(background.tasks) == 1
    await background()
    assert fallback == [TICKET_ID]


@pytest.mark.asyncio
async def test_a_refused_connection_still_falls_back(monkeypatch, fallback):
    """The case that already worked, kept honest."""

    async def _refused():
        raise ConnectionError("connection refused")

    _dispatch(monkeypatch, _refused)
    background = BackgroundTasks()

    await _run(background)

    assert len(background.tasks) == 1
    await background()
    assert fallback == [TICKET_ID]


@pytest.mark.asyncio
async def test_a_queued_receipt_is_not_also_sent_in_process(monkeypatch, fallback):
    """Temporal took it, so nothing else may send it — that would be two receipts."""

    async def _accepted():
        return "workflow-id"

    calls = _dispatch(monkeypatch, _accepted)
    background = BackgroundTasks()

    await _run(background)

    assert background.tasks == []
    assert fallback == []
    # Named after the ticket and refusing a repeat id, so a second attempt at the
    # same ticket cannot acknowledge the requester twice.
    assert calls[0]["workflow_id"] == f"send_service_desk_receipt-{TICKET_ID}"
    assert calls[0]["reject_duplicate_id"] is True


@pytest.mark.asyncio
async def test_a_receipt_already_queued_is_left_alone(monkeypatch, fallback):
    """The duplicate-id refusal means it is already handled, not that it failed."""
    from temporalio.exceptions import WorkflowAlreadyStartedError

    async def _already_started():
        raise WorkflowAlreadyStartedError(
            f"send_service_desk_receipt-{TICKET_ID}", "SingleActivityWorkflow"
        )

    _dispatch(monkeypatch, _already_started)
    background = BackgroundTasks()

    await _run(background)

    assert background.tasks == [], "sending again would acknowledge the requester twice"
    assert fallback == []
