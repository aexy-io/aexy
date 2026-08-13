"""Every notification event must be routable, defaultable and silenceable.

These are structural invariants, not behaviour: an event that is missing from
one of these tables does not fail loudly, it misbehaves quietly. The bugs that
prompted these tests were all of that shape —

* a second copy of ``NotificationEventType`` in ``aexy.schemas.notification``
  drifted from the model's copy. ``EmailService`` imports the schema copy, so a
  model-only member failed the enum cast inside a broad ``except Exception``:
  the log row said "failed", ``email_sent`` stayed false, and nothing retried.
* ``usage_alert_*`` was emitted but absent from ``DEFAULT_NOTIFICATION_PREFERENCES``,
  so ``get_preferences()`` never created a row, the settings screen never listed
  it, and ``get_preference()``'s unknown-event fallback defaulted email to on.
  Billing mail nobody could turn off.
* ``workspace_join_request`` was emitted from an enum member that existed only
  in the schema copy, so it had no category and no default either.
"""

import pytest

from aexy.models.notification import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    EVENT_TYPE_TO_CATEGORY,
    NOTIFICATION_CATEGORIES,
    NotificationEventType,
)
from aexy.schemas.notification import NOTIFICATION_TEMPLATES
from aexy.schemas.notification import NotificationEventType as SchemaEventType


def test_schema_reexports_the_model_enum():
    """One enum, not two copies that agree today."""
    assert SchemaEventType is NotificationEventType


@pytest.mark.parametrize("event", list(NotificationEventType), ids=lambda e: e.value)
def test_event_has_a_category(event: NotificationEventType):
    """Without a category the event has no master toggle and no Slack routing.

    ``send_notification_slack`` looks the category up to find a routing channel,
    and ``update_category_preference`` uses it to propagate a master toggle down
    to the event. An uncategorised event silently opts out of both.
    """
    assert event.value in EVENT_TYPE_TO_CATEGORY, (
        f"{event.value} is in no NOTIFICATION_CATEGORIES bucket, so it has no "
        f"category toggle and cannot be routed to a Slack channel"
    )


@pytest.mark.parametrize("event", list(NotificationEventType), ids=lambda e: e.value)
def test_event_has_channel_defaults(event: NotificationEventType):
    """Without defaults the event is unlistable in settings and defaults to email.

    ``get_preferences()`` builds the settings screen by iterating
    ``DEFAULT_NOTIFICATION_PREFERENCES``, so a missing entry means the event has
    no row to toggle, while ``get_preference()`` still creates one on demand with
    email enabled. The result is mail the recipient cannot switch off.
    """
    assert event in DEFAULT_NOTIFICATION_PREFERENCES, (
        f"{event.value} has no DEFAULT_NOTIFICATION_PREFERENCES entry, so it "
        f"will not appear in notification settings but will still send email"
    )


@pytest.mark.parametrize("event", list(NotificationEventType), ids=lambda e: e.value)
def test_channel_defaults_are_complete(event: NotificationEventType):
    """All four channels must be stated. `.get(..., True)` on a missing key opts in."""
    defaults = DEFAULT_NOTIFICATION_PREFERENCES[event]
    assert set(defaults) == {"in_app", "email", "slack", "web_push"}, (
        f"{event.value} defaults are {sorted(defaults)}; state every channel "
        f"explicitly rather than relying on a fallback"
    )
    assert all(isinstance(v, bool) for v in defaults.values())


def test_categories_contain_only_real_events():
    """A category listing an unknown event silently widens a master toggle to nothing."""
    known = {e.value for e in NotificationEventType}
    for category, events in NOTIFICATION_CATEGORIES.items():
        unknown = sorted(set(events) - known)
        assert not unknown, f"category {category!r} lists unknown events: {unknown}"


def test_no_event_is_in_two_categories():
    """EVENT_TYPE_TO_CATEGORY is a dict, so a duplicate silently drops one mapping."""
    seen: dict[str, str] = {}
    for category, events in NOTIFICATION_CATEGORIES.items():
        for event in events:
            assert event not in seen, (
                f"{event} is in both {seen[event]!r} and {category!r}; the reverse "
                f"mapping keeps only one, so one category's toggle would do nothing"
            )
            seen[event] = category


def test_templates_reference_real_events():
    """A template keyed on a stale member would never be found."""
    known = set(NotificationEventType)
    unknown = sorted(str(k) for k in NOTIFICATION_TEMPLATES if k not in known)
    assert not unknown, f"NOTIFICATION_TEMPLATES has entries for unknown events: {unknown}"


def test_templates_declare_subject_and_body():
    """A half-filled template is worse than none — the fallback is skipped per-key."""
    for event, template in NOTIFICATION_TEMPLATES.items():
        assert template.get("body_template"), f"{event} template has no body_template"
        assert template.get("email_subject"), f"{event} template has no email_subject"
