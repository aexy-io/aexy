"""Every notification event should have something that fires it.

A declared event with no emitter is not harmless: it gets channel defaults, a
category, and a switch in notification settings that the user can toggle all day
without changing anything. That is worse than no switch, because it looks like a
promise the product does not keep — the "Chat mention" toggle did nothing for
months because chat sent the generic ``mention`` event instead.

This test finds the events nothing can fire and compares them against an explicit
list. It fails in both directions on purpose:

* adding an event without an emitter fails, so a new dead toggle cannot be
  introduced by accident;
* wiring one up also fails, prompting whoever did it to delete the line here.

The list is not a wishlist. Each entry is an event whose recipient is a genuine
product question rather than an oversight, so guessing would ship the wrong
behaviour to real inboxes.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

from aexy.models.notification import NotificationEventType

SRC = Path(__file__).resolve().parents[2] / "src" / "aexy"

# Files that only *declare* events; a reference here is not an emitter.
DECLARATION_ONLY = {
    "models/notification.py",
    "schemas/notification.py",
    "services/notification_service.py",
}

# Events with no emitter, and why. Wire one up → delete its entry here.
#
# Every event on this list must also be off on all four channels (enforced by
# `test_unwired_events_are_off_by_default` below). A toggle that cannot deliver
# anything must not be presented as switched on.
UNWIRED_EVENTS: set[str] = {
    # `oncall_shift_starting` is wired and fires 30 minutes ahead. A second alert
    # at the moment the shift begins repeats what was already said.
    "oncall_shift_started",
}


def _sources() -> list[tuple[str, str]]:
    """Every Python source file that could contain an emitter."""
    files = []
    for path in SRC.rglob("*.py"):
        rel = path.relative_to(SRC).as_posix()
        if rel in DECLARATION_ONLY:
            continue
        files.append((rel, path.read_text()))
    return files


def _notify_helpers() -> dict[str, set[str]]:
    """Map each ``notify_*`` helper to the event values it creates.

    Emitters mostly call these helpers rather than naming the enum member, so
    looking only for ``NotificationEventType.X`` would call almost everything dead.
    """
    module = SRC / "services" / "notification_service.py"
    tree = ast.parse(module.read_text())
    members = {member.name: member.value for member in NotificationEventType}

    helpers: dict[str, set[str]] = {}
    for node in tree.body:
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        if not node.name.startswith("notify_"):
            continue
        events = {
            members[sub.attr]
            for sub in ast.walk(node)
            if isinstance(sub, ast.Attribute)
            and isinstance(sub.value, ast.Name)
            and sub.value.id == "NotificationEventType"
            and sub.attr in members
        }
        helpers[node.name] = events
    return helpers


def _reachable_events() -> set[str]:
    """Events that some call site outside the declaring modules can produce."""
    helpers = _notify_helpers()
    sources = _sources()
    blob = "\n".join(text for _, text in sources)

    reachable: set[str] = set()

    # Helpers actually called from somewhere.
    for helper, events in helpers.items():
        if re.search(rf"\b{re.escape(helper)}\b", blob):
            reachable |= events

    # Direct enum references and raw string literals.
    for event in NotificationEventType:
        pattern = rf"(NotificationEventType\.{event.name}\b|[\"']{re.escape(event.value)}[\"'])"
        if re.search(pattern, blob):
            reachable.add(event.value)

    return reachable


def test_unwired_events_match_the_documented_list():
    dead = {e.value for e in NotificationEventType} - _reachable_events()

    newly_dead = sorted(dead - UNWIRED_EVENTS)
    assert not newly_dead, (
        "These events have no emitter, so their notification-settings toggles do "
        f"nothing: {newly_dead}. Either wire an emitter or, if the recipient is a "
        "genuine product question, add the event to UNWIRED_EVENTS with the reason."
    )

    now_wired = sorted(UNWIRED_EVENTS - dead)
    assert not now_wired, (
        f"These events now have emitters: {now_wired}. Remove them from "
        "UNWIRED_EVENTS — the list is meant to shrink."
    )


def test_unwired_events_are_off_by_default():
    """An event nothing can fire must not ship with a channel switched on.

    Otherwise the settings screen shows a toggle in the "on" position for a
    notification that will never arrive, which reads as a delivery failure rather
    than an unbuilt feature.
    """
    from aexy.models.notification import DEFAULT_NOTIFICATION_PREFERENCES

    for event in sorted(UNWIRED_EVENTS):
        defaults = DEFAULT_NOTIFICATION_PREFERENCES[NotificationEventType(event)]
        enabled = sorted(channel for channel, on in defaults.items() if on)
        assert not enabled, (
            f"{event} has no emitter but defaults {enabled} to on — the toggle "
            f"promises delivery that cannot happen"
        )


def test_the_events_this_change_added_are_all_wired():
    """The point of adding them was that assignment told nobody anything."""
    added = {
        "task_assigned",
        "task_unassigned",
        "task_status_changed",
        "task_commented",
        "ticket_assigned",
        "desk_ticket_assigned",
        "desk_ticket_pending_with_changed",
        "workspace_join_request",
        "workspace_join_approved",
        "workspace_join_rejected",
        "chat_mention",
        # Second pass: previously-dead toggles that now have real emitters.
        "goal_at_risk",
        "goal_auto_linked",
        "learning_approval_requested",
        "assessment_completed",
        "automation_run_completed",
        "deadline_reminder_1_day",
        "deadline_reminder_day_of",
        # Third pass: documents moved off their own notification table, and the
        # comment feature those two events were waiting for now exists.
        "document_commented",
        "document_mentioned",
        "document_ai_proposal",
        "candidate_stage_changed",
    }
    unwired = sorted(added - _reachable_events())
    assert not unwired, f"declared but never fired: {unwired}"
