"""What the desk's own mail is allowed to contain.

Two defects lived here, both visible in a real acknowledgement a customer
received with the subject ``SD-21 How&#39;s it going, {{first_name}}?``:

* the shared template renderer HTML-escaped the *subject line* and the
  *plain-text body*, so an ordinary apostrophe arrived as ``&#39;``; and
* an unresolved merge tag in the inbound subject was echoed straight back out,
  because Jinja renders once and never looks inside a value.

The desk sends plain text end to end, so the escaping defect touched every
subject, closure note and digest it has ever sent.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.service_desk_templates import render_sd, strip_merge_tags
from tests.conftest import seed_service_desk_taxonomy


async def _workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await seed_service_desk_taxonomy(db, ws.id)
    return ws


# --------------------------------------------------------------- no escaping


@pytest.mark.asyncio
async def test_an_apostrophe_survives_the_subject(db_session: AsyncSession):
    ws = await _workspace(db_session, "outbound-apostrophe")

    subject, _ = await render_sd(
        db_session,
        ws.id,
        "receipt",
        {"display_id": "SD-21", "subject": "How's it going?", "requester_name": "Bhanu"},
    )

    assert subject == "SD-21 How's it going?"
    assert "&#39;" not in subject


@pytest.mark.asyncio
async def test_markup_characters_survive_the_text_body(db_session: AsyncSession):
    """``&``, ``<`` and quotes are ordinary characters in a plain-text body."""
    ws = await _workspace(db_session, "outbound-body")

    _, body = await render_sd(
        db_session,
        ws.id,
        "closure",
        {
            "display_id": "SD-21",
            "requester_name": 'Ram & Co "Ops"',
            "closure_note": "Cover < 5L confirmed & issued",
            "overall_days": "0.71",
        },
    )

    assert 'Ram & Co "Ops"' in body
    assert "Cover < 5L confirmed & issued" in body
    for entity in ("&amp;", "&lt;", "&#39;", "&#34;", "&quot;"):
        assert entity not in body


# ------------------------------------------------------------- no merge tags


@pytest.mark.asyncio
async def test_an_inbound_merge_tag_is_not_echoed_back(db_session: AsyncSession):
    """The exact subject from the reported acknowledgement."""
    ws = await _workspace(db_session, "outbound-mergetag")

    subject, _ = await render_sd(
        db_session,
        ws.id,
        "receipt",
        {
            "display_id": "SD-21",
            "subject": "How's it going, {{first_name}}?",
            "requester_name": "Bhanu",
        },
    )

    assert subject == "SD-21 How's it going?"
    assert "{{" not in subject


@pytest.mark.asyncio
async def test_the_desks_own_placeholders_still_resolve(db_session: AsyncSession):
    """Stripping applies to values, never to the template being rendered."""
    ws = await _workspace(db_session, "outbound-resolve")

    subject, body = await render_sd(
        db_session,
        ws.id,
        "receipt",
        {"display_id": "SD-7", "subject": "Endorsement request", "requester_name": "Asha"},
    )

    assert subject == "SD-7 Endorsement request"
    assert "Dear Asha," in body
    assert "Ticket #SD-7" in body


def test_text_without_a_tag_is_returned_untouched():
    """The digest's pre-rendered ticket block must keep its layout exactly."""
    block = "  SD-6 | JLL | Battery Cover | query | pending: kam\n  SD-9 | — | — | query"

    assert strip_merge_tags(block) == block


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("How's it going, {{first_name}}?", "How's it going?"),
        ("Renewal due for {{ company }}", "Renewal due for"),
        ("{{greeting}} — policy attached", "— policy attached"),
        ("{% if x %}Hello{% endif %}", "Hello"),
        ("Nothing to strip here", "Nothing to strip here"),
    ],
)
def test_merge_tag_stripping(raw: str, expected: str):
    assert strip_merge_tags(raw) == expected
