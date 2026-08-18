"""Every schedule entry must survive registration.

`register_schedules` resolves each entry by importing its module, looking up
the class by name, and constructing the input with **no arguments**. A typo
in any of those three, or an input dataclass with a required field, raises
only at startup against a live Temporal — which is exactly how the document
sync queue came to have a worker activity and no schedule at all.

These assertions are cheap and cover every entry, not just the new one.
"""

from __future__ import annotations

from importlib import import_module

import pytest

from aexy.temporal.schedules import SCHEDULES


def schedule_ids() -> list[str]:
    return [s["id"] for s in SCHEDULES]


@pytest.mark.parametrize("schedule", SCHEDULES, ids=schedule_ids())
def test_input_class_resolves_and_takes_no_arguments(schedule):
    module = import_module(schedule["input_module"])
    input_class = getattr(module, schedule["input_class"])
    # register_schedules calls `input_class()`; a required field would raise
    # TypeError there and abort registration for every later schedule too.
    input_class()


@pytest.mark.parametrize("schedule", SCHEDULES, ids=schedule_ids())
def test_target_exists_in_its_module(schedule):
    """The activity or workflow named must actually be importable."""
    if "workflow" in schedule:
        module = import_module(schedule["workflow_module"])
        assert hasattr(module, schedule["workflow"])
    else:
        module = import_module(schedule["input_module"])
        assert hasattr(module, schedule["activity"]), (
            f"{schedule['id']} names activity {schedule['activity']!r}, "
            f"which does not exist in {schedule['input_module']}"
        )


def test_schedule_ids_are_unique():
    ids = schedule_ids()
    assert len(ids) == len(set(ids))


class TestDocumentSyncQueueIsScheduled:
    """Break 3: the activity was registered on the worker and nothing ever
    triggered it, so documents queued for the daily-batch tier were never
    drained."""

    def test_the_queue_has_a_schedule(self):
        assert "document-sync-queue" in schedule_ids()

    def test_it_fans_out_rather_than_naming_a_workspace(self):
        """`process_document_sync_queue` needs a workspace id and a schedule
        input takes none — so the schedule has to point at the fan-out."""
        entry = next(s for s in SCHEDULES if s["id"] == "document-sync-queue")
        assert entry["activity"] == "enqueue_document_sync_queues"

    def test_the_activity_is_registered_on_the_worker(self):
        """A scheduled activity absent from the worker's registration list
        starts a workflow that then waits forever for a worker to poll it."""
        import inspect

        from aexy.temporal import worker

        source = inspect.getsource(worker)
        assert "enqueue_document_sync_queues" in source

    def test_it_has_an_explicit_dispatch_config(self):
        """The 5-minute default would truncate a fan-out over every
        workspace with pending documentation work."""
        from aexy.temporal.dispatch import ACTIVITY_CONFIG

        for name in (
            "enqueue_document_sync_queues",
            "process_document_sync_queue",
            "regenerate_document",
        ):
            assert name in ACTIVITY_CONFIG, f"{name} falls back to DEFAULT_CONFIG"
