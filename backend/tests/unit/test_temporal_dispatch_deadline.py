"""Starting a workflow has a deadline.

``dispatch`` is called from roughly a hundred places, and a great many of them
are HTTP request handlers that treat a failure to queue as recoverable — they
log it, or fall back to doing the work in-process. All of that depends on the
call coming back.

``start_workflow`` carries no deadline of its own. A Temporal that refuses the
connection fails fast and everything works as designed; a Temporal that completes
the TCP handshake and then says nothing does not fail at all. A wedged container,
a network partition, or a port forward outliving what it forwarded to all produce
the second shape, and every one of those careful callers waits forever instead.

So the deadline belongs here, once, rather than at each call site.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest

from aexy.temporal.dispatch import START_WORKFLOW_RPC_TIMEOUT, dispatch
from aexy.temporal.task_queues import TaskQueue


class _Input:
    """Any dataclass-ish payload; dispatch only forwards it."""


class _StallingClient:
    """A Temporal that accepts the call and then never answers.

    Honours ``rpc_timeout`` the way the real client does — that is the whole
    mechanism under test, so faking it away would test nothing.
    """

    def __init__(self) -> None:
        self.rpc_timeouts: list[timedelta | None] = []

    async def start_workflow(self, *args, rpc_timeout=None, **kwargs):
        self.rpc_timeouts.append(rpc_timeout)
        if rpc_timeout is None:
            await asyncio.Event().wait()
        await asyncio.sleep(rpc_timeout.total_seconds())
        raise TimeoutError("Timeout expired")


@pytest.fixture
def stalling_temporal(monkeypatch) -> _StallingClient:
    client = _StallingClient()

    async def _get_client():
        return client

    monkeypatch.setattr("aexy.temporal.client.get_temporal_client", _get_client)
    monkeypatch.setattr("aexy.temporal.dispatch.get_temporal_client", _get_client)
    return client


@pytest.mark.asyncio
async def test_a_server_that_never_answers_does_not_hang_the_caller(stalling_temporal):
    """The regression: without a deadline this never returns at all."""
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(
            dispatch("send_notification_email", _Input(), task_queue=TaskQueue.EMAIL),
            # Generously above the deadline. If the deadline is ever removed this
            # is what fails, and it fails by timing out rather than by name.
            timeout=START_WORKFLOW_RPC_TIMEOUT.total_seconds() + 10,
        )

    assert stalling_temporal.rpc_timeouts == [START_WORKFLOW_RPC_TIMEOUT]


@pytest.mark.asyncio
async def test_the_deadline_is_short_enough_for_a_request_handler():
    """It is only useful if a person waiting on a response would tolerate it."""
    assert START_WORKFLOW_RPC_TIMEOUT <= timedelta(seconds=10)


@pytest.mark.asyncio
async def test_a_caller_may_ask_for_a_different_deadline(stalling_temporal):
    """A worker with time to spare should not be held to the request-path bound."""
    with pytest.raises(TimeoutError):
        await dispatch(
            "sync_repository",
            _Input(),
            task_queue=TaskQueue.SYNC,
            rpc_timeout=timedelta(seconds=0.1),
        )

    assert stalling_temporal.rpc_timeouts == [timedelta(seconds=0.1)]
