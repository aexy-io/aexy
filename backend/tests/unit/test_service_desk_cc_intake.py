"""The desk copied rather than addressed.

A customer writing to their account manager and copying the desk is the ordinary
way requests arrive on a shared mailbox. The inbound webhook used to read one
address — the first name in the To line — so exactly those messages found no
mailbox and were dropped without a ticket, a log line, or any other trace.
"""

import pytest

from aexy.api.email_webhooks import _recipient_addresses


def test_every_recipient_is_read_from_a_postmark_payload():
    from aexy.api.email_webhooks import _parse_inbound_json

    parsed = _parse_inbound_json({
        "FromFull": {"Email": "cust@acme.com", "Name": "Cust"},
        "ToFull": [{"Email": "kam@ourcompany.com"}],
        "CcFull": [{"Email": "desk@ourcompany.com"}],
        "Subject": "Policy please",
        "TextBody": "body",
    })

    assert parsed is not None
    assert "desk@ourcompany.com" in parsed["recipients"]
    # The To is still first: a desk addressed directly outranks one copied in.
    assert parsed["recipients"][0] == "kam@ourcompany.com"


def test_a_generic_payload_carries_its_cc_through():
    from aexy.api.email_webhooks import _parse_inbound_json

    parsed = _parse_inbound_json({
        "to": "kam@ourcompany.com",
        "cc": "desk@ourcompany.com, ops@ourcompany.com",
        "from": "cust@acme.com",
        "subject": "Policy please",
    })

    assert parsed is not None
    assert parsed["recipients"] == [
        "kam@ourcompany.com",
        "desk@ourcompany.com",
        "ops@ourcompany.com",
    ]


@pytest.mark.parametrize(
    "value,expected",
    [
        ("Desk <desk@ourcompany.com>", ["desk@ourcompany.com"]),
        ("a@x.com, b@x.com", ["a@x.com", "b@x.com"]),
        (["a@x.com", "B@X.com"], ["a@x.com", "b@x.com"]),
        ([{"Email": "a@x.com"}], ["a@x.com"]),
        (None, []),
        ("", []),
    ],
)
def test_recipient_shapes_the_providers_actually_send(value, expected):
    """Bare string, comma-separated header, list of strings, list of dicts."""
    assert _recipient_addresses(value) == expected
