"""The order an incremental Gmail batch is processed in.

Service Desk intake gives the ticket to whichever message of a thread it sees
first, so this is not cosmetic: collecting the batch into a ``set`` let the
desk's own reply be processed before the customer's original, which opened a
ticket with the desk as its own requester and filed the real request as a reply
to it.
"""

from __future__ import annotations

from aexy.services.gmail_sync_service import ordered_new_message_ids


def _history(*ids: str) -> list[dict]:
    return [{"messagesAdded": [{"message": {"id": message_id}}]} for message_id in ids]


def test_history_order_is_preserved():
    assert ordered_new_message_ids(_history("m1", "m2", "m3")) == ["m1", "m2", "m3"]


def test_duplicates_are_dropped_keeping_the_first_sighting():
    history = _history("m1", "m2", "m1", "m3", "m2")

    assert ordered_new_message_ids(history) == ["m1", "m2", "m3"]


def test_several_messages_in_one_record_keep_their_order():
    history = [
        {
            "messagesAdded": [
                {"message": {"id": "m1"}},
                {"message": {"id": "m2"}},
            ]
        },
        {"messagesAdded": [{"message": {"id": "m3"}}]},
    ]

    assert ordered_new_message_ids(history) == ["m1", "m2", "m3"]


def test_records_without_added_messages_are_ignored():
    history = [
        {"labelsRemoved": [{"message": {"id": "m9"}}]},
        {"messagesAdded": [{"message": {}}, {"other": {}}]},
        {},
    ]

    assert ordered_new_message_ids(history) == []
