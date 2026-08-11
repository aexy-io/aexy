"""What a connected Gmail account keeps out of Aexy.

Two mechanisms with different failure modes, so both are pinned here: standing
rules that stop a message becoming a row at all, and one-off hides that delete a
row and leave a tombstone. Most of this file exists because of the second — the
``synced_emails`` row is also the "already synced" marker, so a hide that only
deletes is a hide that undoes itself on the next full sync.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.google_integration import (
    GoogleIntegration,
    GoogleSyncHiddenMessage,
    SyncedEmail,
)
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.gmail_sync_exclusions import (
    ExclusionValueError,
    GmailSyncExclusionService,
    address_of,
    matching_rule,
    normalise_value,
    participants,
)


def _uniq(tag: str) -> str:
    return f"{tag}-{uuid4().hex[:8]}"


async def _integration(db: AsyncSession) -> GoogleIntegration:
    owner = Developer(name="Owner", email=f"{_uniq('owner')}@example.test")
    db.add(owner)
    await db.flush()

    ws = Workspace(id=str(uuid4()), name=_uniq("ws"), slug=_uniq("ws"), owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )

    integration = GoogleIntegration(
        id=str(uuid4()),
        workspace_id=ws.id,
        connected_by_id=str(owner.id),
        google_email=f"{_uniq('me')}@example.test",
        access_token="tok",
        refresh_token="ref",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        gmail_sync_enabled=True,
        is_active=True,
    )
    db.add(integration)
    await db.flush()
    return integration


async def _synced(
    db: AsyncSession,
    integration: GoogleIntegration,
    gmail_id: str,
    from_email: str | None = None,
    to_emails: list[str] | None = None,
    cc_emails: list[str] | None = None,
) -> SyncedEmail:
    email = SyncedEmail(
        id=str(uuid4()),
        workspace_id=integration.workspace_id,
        integration_id=integration.id,
        gmail_id=gmail_id,
        from_email=from_email,
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject="hello",
    )
    db.add(email)
    await db.flush()
    return email


# ── normalising what somebody typed ──────────────────────────────────────


@pytest.mark.parametrize(
    "kind,typed,expected",
    [
        ("address", "  Bob@Acme.com ", "bob@acme.com"),
        ("domain", "Acme.COM", "acme.com"),
        # Typing the @ is the obviously intended thing, so it is accepted and
        # stripped rather than stored as a domain that can never match.
        ("domain", "@acme.com", "acme.com"),
    ],
)
def test_values_are_stored_in_the_one_shape_matching_expects(kind, typed, expected):
    assert normalise_value(kind, typed) == expected


@pytest.mark.parametrize(
    "kind,typed",
    [
        ("address", "not-an-address"),
        ("address", "bob@acme"),
        ("domain", "bob@acme.com"),
        ("domain", "acme"),
        ("address", "   "),
    ],
)
def test_a_value_that_could_never_match_is_refused(kind, typed):
    """Silently storing these would look like a working rule that hides nothing."""
    with pytest.raises(ExclusionValueError):
        normalise_value(kind, typed)


def test_display_names_are_unwrapped():
    """Gmail sends `Bob <bob@acme.com>` as often as the bare address."""
    assert address_of("Bob Smith <Bob@Acme.com>") == "bob@acme.com"
    assert address_of("bob@acme.com") == "bob@acme.com"
    assert address_of(None) is None


def test_participants_include_recipients():
    found = participants("a@x.test", ["b@y.test"], ["c@z.test"])
    assert found == {"a@x.test", "b@y.test", "c@z.test"}


# ── matching ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_domain_rule_also_hides_your_own_replies(db_session: AsyncSession):
    """The reason `participants` is the default.

    Your reply to a hidden correspondent carries them in `to_emails`, not
    `from_email`. Matching the sender alone would leave half of every
    conversation in place while looking like the domain was hidden.
    """
    integration = await _integration(db_session)
    service = GmailSyncExclusionService(db_session)
    rule = await service.create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )

    inbound = matching_rule([rule], "bob@acme.com", ["me@example.test"], None)
    outbound = matching_rule([rule], "me@example.test", ["bob@acme.com"], None)

    assert inbound is rule
    assert outbound is rule


@pytest.mark.asyncio
async def test_sender_scope_is_the_narrower_deliberate_choice(
    db_session: AsyncSession,
):
    integration = await _integration(db_session)
    rule = await GmailSyncExclusionService(db_session).create_rule(
        str(integration.id),
        str(integration.workspace_id),
        "domain",
        "acme.com",
        match_scope="sender",
    )

    assert matching_rule([rule], "bob@acme.com", None, None) is rule
    assert matching_rule([rule], "me@example.test", ["bob@acme.com"], None) is None


@pytest.mark.asyncio
async def test_an_address_rule_does_not_hide_the_whole_domain(
    db_session: AsyncSession,
):
    integration = await _integration(db_session)
    rule = await GmailSyncExclusionService(db_session).create_rule(
        str(integration.id), str(integration.workspace_id), "address", "bob@acme.com"
    )

    assert matching_rule([rule], "bob@acme.com", None, None) is rule
    assert matching_rule([rule], "sue@acme.com", None, None) is None


@pytest.mark.asyncio
async def test_a_message_with_no_addresses_matches_nothing(db_session: AsyncSession):
    integration = await _integration(db_session)
    rule = await GmailSyncExclusionService(db_session).create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )
    assert matching_rule([rule], None, None, None) is None


# ── rules ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_asking_twice_is_not_an_error(db_session: AsyncSession):
    """The caller wants the rule to exist, and after both calls it does."""
    integration = await _integration(db_session)
    service = GmailSyncExclusionService(db_session)

    first = await service.create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )
    second = await service.create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "ACME.com"
    )

    assert str(first.id) == str(second.id)
    assert len(await service.list_rules(str(integration.id))) == 1


@pytest.mark.asyncio
async def test_rules_belong_to_one_integration(db_session: AsyncSession):
    a = await _integration(db_session)
    b = await _integration(db_session)
    service = GmailSyncExclusionService(db_session)

    await service.create_rule(str(a.id), str(a.workspace_id), "domain", "acme.com")

    assert len(await service.list_rules(str(a.id))) == 1
    assert await service.list_rules(str(b.id)) == []


# ── the purge ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_new_rule_removes_what_is_already_synced(db_session: AsyncSession):
    """"Hide mail from this domain" that leaves last month's in the CRM is not
    what anybody means by hide."""
    integration = await _integration(db_session)
    await _synced(db_session, integration, "m1", from_email="bob@acme.com")
    await _synced(db_session, integration, "m2", from_email="me@example.test",
                  to_emails=["sue@acme.com"])
    await _synced(db_session, integration, "m3", from_email="ok@elsewhere.test")

    service = GmailSyncExclusionService(db_session)
    rule = await service.create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )
    purged = await service.purge_for_rule(
        str(integration.id), str(integration.workspace_id), rule
    )

    assert purged == 2
    remaining = (
        await db_session.execute(
            select(SyncedEmail.gmail_id).where(
                SyncedEmail.integration_id == integration.id
            )
        )
    ).scalars().all()
    assert list(remaining) == ["m3"]


@pytest.mark.asyncio
async def test_a_purge_does_not_touch_another_integration(db_session: AsyncSession):
    a = await _integration(db_session)
    b = await _integration(db_session)
    await _synced(db_session, a, "a1", from_email="bob@acme.com")
    await _synced(db_session, b, "b1", from_email="bob@acme.com")

    service = GmailSyncExclusionService(db_session)
    rule = await service.create_rule(
        str(a.id), str(a.workspace_id), "domain", "acme.com"
    )
    await service.purge_for_rule(str(a.id), str(a.workspace_id), rule)

    survivors = (
        await db_session.execute(
            select(SyncedEmail.gmail_id).where(SyncedEmail.integration_id == b.id)
        )
    ).scalars().all()
    assert list(survivors) == ["b1"]


# ── tombstones ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hiding_a_message_deletes_the_row_and_remembers_it(
    db_session: AsyncSession,
):
    """The trap this table exists for.

    `_sync_message` returns early when a `synced_emails` row already exists —
    the row *is* the dedup marker. So a hide that only deleted the row would be
    undone by the next full sync, and the user would watch something they hid
    come back.
    """
    integration = await _integration(db_session)
    await _synced(db_session, integration, "m1", from_email="bob@acme.com")
    service = GmailSyncExclusionService(db_session)

    await service.hide_message(
        str(integration.id), str(integration.workspace_id), "m1"
    )

    gone = (
        await db_session.execute(
            select(SyncedEmail).where(SyncedEmail.gmail_id == "m1")
        )
    ).scalar_one_or_none()
    assert gone is None
    assert await service.is_hidden(str(integration.id), "m1") is True


@pytest.mark.asyncio
async def test_hiding_the_same_message_twice_is_harmless(db_session: AsyncSession):
    integration = await _integration(db_session)
    await _synced(db_session, integration, "m1", from_email="bob@acme.com")
    service = GmailSyncExclusionService(db_session)

    await service.hide_message(str(integration.id), str(integration.workspace_id), "m1")
    await service.hide_message(str(integration.id), str(integration.workspace_id), "m1")

    tombstones = (
        await db_session.execute(
            select(GoogleSyncHiddenMessage).where(
                GoogleSyncHiddenMessage.integration_id == integration.id
            )
        )
    ).scalars().all()
    assert len(tombstones) == 1


@pytest.mark.asyncio
async def test_hiding_a_message_that_was_never_synced_still_tombstones_it(
    db_session: AsyncSession,
):
    """So a message can be pre-emptively kept out, and so a hide raced against a
    sync cannot land in the gap."""
    integration = await _integration(db_session)
    service = GmailSyncExclusionService(db_session)

    await service.hide_message(str(integration.id), str(integration.workspace_id), "never")

    assert await service.is_hidden(str(integration.id), "never") is True


@pytest.mark.asyncio
async def test_deleting_a_rule_does_not_resurrect_what_it_purged(
    db_session: AsyncSession,
):
    """Deliberate. Someone who excluded a domain and watched a year of mail go
    should not get it all back by tidying up their rule list.
    """
    integration = await _integration(db_session)
    await _synced(db_session, integration, "m1", from_email="bob@acme.com")
    service = GmailSyncExclusionService(db_session)

    rule = await service.create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )
    await service.purge_for_rule(
        str(integration.id), str(integration.workspace_id), rule
    )
    assert await service.delete_rule(str(integration.id), str(rule.id)) is True

    assert await service.list_rules(str(integration.id)) == []
    # The tombstone outlives the rule, so the next sync still refuses it.
    assert await service.is_hidden(str(integration.id), "m1") is True


@pytest.mark.asyncio
async def test_deleting_another_integrations_rule_is_refused(
    db_session: AsyncSession,
):
    a = await _integration(db_session)
    b = await _integration(db_session)
    service = GmailSyncExclusionService(db_session)
    rule = await service.create_rule(
        str(a.id), str(a.workspace_id), "domain", "acme.com"
    )

    assert await service.delete_rule(str(b.id), str(rule.id)) is False
    assert len(await service.list_rules(str(a.id))) == 1


# ── enforcement at the sync choke point ──────────────────────────────────
#
# Both sync paths funnel through `_sync_message`, so this is the one place that
# decides whether a message becomes a row at all. Excluded mail must never be
# written — not written-then-deleted — so that no body, snippet or attachment
# preview ever exists to be scrubbed.


def _gmail_message(gmail_id: str, from_email: str, to_email: str) -> dict:
    return {
        "id": gmail_id,
        "threadId": f"t-{gmail_id}",
        "labelIds": ["INBOX"],
        "snippet": "a snippet that must not be stored",
        "payload": {},
        "_parsed": {
            "subject": "subject",
            "from_email": from_email,
            "from_name": "Someone",
            "to_emails": [to_email],
            "cc_emails": [],
            "body_text": "a body that must not be stored",
            "body_html": None,
            "has_attachments": False,
            "date": None,
        },
    }


def _fake_sync_service(db, monkeypatch):
    from aexy.services.gmail_sync_service import GmailSyncService

    service = GmailSyncService(db)

    async def _fetch(_integration, _method, path, **_kwargs):
        return service._messages[path.rsplit("/", 1)[-1]]

    monkeypatch.setattr(service, "_make_gmail_request", _fetch)
    monkeypatch.setattr(service, "_parse_message", lambda m: m["_parsed"])
    service._messages = {}
    return service


@pytest.mark.asyncio
async def test_an_excluded_message_never_becomes_a_row(
    db_session: AsyncSession, monkeypatch
):
    integration = await _integration(db_session)
    await GmailSyncExclusionService(db_session).create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )

    service = _fake_sync_service(db_session, monkeypatch)
    service._messages["m1"] = _gmail_message("m1", "bob@acme.com", "me@example.test")
    monkeypatch.setattr(service, "_is_service_desk_mailbox", _never_a_desk)

    assert await service._sync_message(integration, "m1") is None

    rows = (
        await db_session.execute(
            select(SyncedEmail).where(SyncedEmail.gmail_id == "m1")
        )
    ).scalars().all()
    assert rows == []


async def _never_a_desk(_integration) -> bool:
    return False


async def _always_a_desk(_integration) -> bool:
    return True


@pytest.mark.asyncio
async def test_an_unmatched_message_still_syncs(
    db_session: AsyncSession, monkeypatch
):
    integration = await _integration(db_session)
    await GmailSyncExclusionService(db_session).create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )

    service = _fake_sync_service(db_session, monkeypatch)
    service._messages["m2"] = _gmail_message("m2", "ok@elsewhere.test", "me@example.test")
    monkeypatch.setattr(service, "_is_service_desk_mailbox", _never_a_desk)

    stored = await service._sync_message(integration, "m2")
    assert stored is not None
    assert stored.gmail_id == "m2"


@pytest.mark.asyncio
async def test_a_hidden_message_is_not_re_imported(
    db_session: AsyncSession, monkeypatch
):
    """The whole reason tombstones exist.

    The row is the dedup marker, so hiding a message has to delete it. Without
    the tombstone the very next full sync would fetch it again and write it back,
    and the user would watch something they hid return.
    """
    integration = await _integration(db_session)
    await _synced(db_session, integration, "m3", from_email="bob@acme.com")
    await GmailSyncExclusionService(db_session).hide_message(
        str(integration.id), str(integration.workspace_id), "m3"
    )

    service = _fake_sync_service(db_session, monkeypatch)
    service._messages["m3"] = _gmail_message("m3", "bob@acme.com", "me@example.test")
    monkeypatch.setattr(service, "_is_service_desk_mailbox", _never_a_desk)

    assert await service._sync_message(integration, "m3") is None
    rows = (
        await db_session.execute(
            select(SyncedEmail).where(SyncedEmail.gmail_id == "m3")
        )
    ).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_a_service_desk_mailbox_ignores_personal_exclusions(
    db_session: AsyncSession, monkeypatch
):
    """A desk address is a shared business channel, not private mail.

    Letting a personal rule apply there would stop a customer's tickets from
    being created, silently, and nobody would find out until they asked why they
    had been ignored. Stated rule, not an ordering accident.
    """
    integration = await _integration(db_session)
    await GmailSyncExclusionService(db_session).create_rule(
        str(integration.id), str(integration.workspace_id), "domain", "acme.com"
    )

    service = _fake_sync_service(db_session, monkeypatch)
    service._messages["m4"] = _gmail_message("m4", "bob@acme.com", "desk@example.test")
    monkeypatch.setattr(service, "_is_service_desk_mailbox", _always_a_desk)

    stored = await service._sync_message(integration, "m4")
    assert stored is not None, "a desk mailbox must still receive its mail"
