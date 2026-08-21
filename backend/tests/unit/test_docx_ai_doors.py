"""The three ways to ask for a Word edit, and what each one tells whom.

`DraftRequest` was built "independent of which door it came in through", and for
a while there were no doors at all — the drafting service worked and nothing
called it. These tests pin the three, and specifically the part that differs
between them: who finds out.

  - **endpoint**: the person is looking at the answer. No notification.
  - **background**: they have gone. `notify_docx_ai_draft_ready` to whoever asked.
  - **comment mention**: nobody in Aexy asked. `notify_docx_ai_comment_answered`
    to whoever wrote the comment — often neither the owner nor a member who was
    watching anything.
"""

from __future__ import annotations

import types
from dataclasses import dataclass

import pytest

from aexy.temporal.activities import docx_ai_edit as activities


@dataclass
class _Comment:
    id: str
    author: str
    text: str
    anchor_text: str = ""
    resolved: bool = False
    parent_id: str | None = None


class _Proposal:
    id = "33333333-3333-3333-3333-333333333333"
    diff_summary = {"summary": "Extended the notice period", "op_count": 2}


class TestBackgroundDoor:
    async def test_it_tells_whoever_asked(self, monkeypatch) -> None:
        # The owner event `create_proposal` sends has a self-action guard, so it
        # deliberately says nothing about your own request. Without this call the
        # person who asked for a background draft hears nothing at all.
        sent: list[dict] = []

        async def _notify(db, **kwargs):
            sent.append(kwargs)
            return 1

        monkeypatch.setattr(
            "aexy.services.notification_service.notify_docx_ai_draft_ready", _notify
        )
        monkeypatch.setattr(
            activities, "get_async_session", _fake_session(document_title="Contract")
        )
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService.draft_edit",
            _returns(_Proposal()),
        )

        result = await activities.draft_docx_ai_edit(
            activities.DraftDocxEditInput(
                document_id="d1",
                workspace_id="w1",
                requested_by_id="dev-1",
                instruction="Extend the notice period",
            )
        )

        assert result["drafted"] is True
        assert len(sent) == 1
        assert sent[0]["recipient_id"] == "dev-1"
        assert sent[0]["change_count"] == 2
        assert sent[0]["document_title"] == "Contract"

    async def test_nobody_is_told_when_nobody_asked(self, monkeypatch) -> None:
        # A draft with no requester — a schedule, or a future caller. There is no
        # honest recipient, and picking the owner would be inventing one.
        sent: list[dict] = []

        async def _notify(db, **kwargs):
            sent.append(kwargs)
            return 1

        monkeypatch.setattr(
            "aexy.services.notification_service.notify_docx_ai_draft_ready", _notify
        )
        monkeypatch.setattr(activities, "get_async_session", _fake_session())
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService.draft_edit",
            _returns(_Proposal()),
        )

        await activities.draft_docx_ai_edit(
            activities.DraftDocxEditInput(document_id="d1", requested_by_id=None)
        )
        assert sent == []

    async def test_a_refusal_is_recorded_rather_than_retried(
        self, monkeypatch
    ) -> None:
        # AI switched off, or more changes than the workspace allows. Temporal
        # retrying that would produce the same refusal five more times.
        from aexy.services.docx_ai_edit_service import DocxAiEditError

        monkeypatch.setattr(activities, "get_async_session", _fake_session())
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService.draft_edit",
            _raises(DocxAiEditError("Word AI editing is switched off.")),
        )

        result = await activities.draft_docx_ai_edit(
            activities.DraftDocxEditInput(document_id="d1", requested_by_id="dev-1")
        )
        assert result == {
            "drafted": False,
            "reason": "Word AI editing is switched off.",
        }


class TestCommentMentionDoor:
    async def test_a_mention_drafts_and_tells_the_comment_author(
        self, monkeypatch
    ) -> None:
        sent: list[dict] = []

        async def _notify(db, **kwargs):
            sent.append(kwargs)
            return 1

        monkeypatch.setattr(
            "aexy.services.notification_service.notify_docx_ai_comment_answered",
            _notify,
        )
        monkeypatch.setattr(
            activities, "get_async_session", _fake_session(document_title="Contract")
        )
        monkeypatch.setattr(
            "aexy.services.docx_service.extract_comments",
            lambda raw: [
                _Comment("1", "Priya", "@aexy can we push this to 60 days?"),
                _Comment("2", "Sam", "Looks fine to me."),
            ],
        )
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService._load_bytes",
            _returns(b"PK\x03\x04"),
        )
        captured: list = []
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService.draft_edit",
            _capture(captured, _Proposal()),
        )
        monkeypatch.setattr(activities, "_author_id_of", _returns("dev-priya"))

        result = await activities.scan_docx_comments_for_mentions(
            activities.ScanDocxCommentsInput(document_id="d1", workspace_id="w1")
        )

        assert result["mentions"] == 1
        assert result["drafted"] is True
        # Only the mentioning comment is answered; "Looks fine to me" is not a
        # request.
        assert captured[0].comment_ids == ("1",)
        assert captured[0].trigger["door"] == "comment_mention"
        # And the person told is the one who wrote it.
        assert sent[0]["recipient_id"] == "dev-priya"
        assert "60 days" in sent[0]["comment_excerpt"]

    async def test_a_resolved_thread_is_left_alone(self, monkeypatch) -> None:
        # Somebody marked that conversation finished. Re-answering it on every
        # subsequent save would reopen a closed argument.
        monkeypatch.setattr(activities, "get_async_session", _fake_session())
        monkeypatch.setattr(
            "aexy.services.docx_service.extract_comments",
            lambda raw: [
                _Comment("1", "Priya", "@aexy push to 60 days", resolved=True)
            ],
        )
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService._load_bytes",
            _returns(b"PK\x03\x04"),
        )

        result = await activities.scan_docx_comments_for_mentions(
            activities.ScanDocxCommentsInput(document_id="d1", workspace_id="w1")
        )
        assert result == {"scanned": True, "mentions": 0}

    async def test_no_mention_is_a_no_op(self, monkeypatch) -> None:
        # The common case on every save of every Word document.
        monkeypatch.setattr(activities, "get_async_session", _fake_session())
        monkeypatch.setattr(
            "aexy.services.docx_service.extract_comments",
            lambda raw: [_Comment("1", "Sam", "Typo in clause 3.")],
        )
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService._load_bytes",
            _returns(b"PK\x03\x04"),
        )

        result = await activities.scan_docx_comments_for_mentions(
            activities.ScanDocxCommentsInput(document_id="d1", workspace_id="w1")
        )
        assert result["mentions"] == 0

    async def test_the_trigger_can_be_switched_off(self, monkeypatch) -> None:
        from aexy.services import docx_ai_settings

        monkeypatch.setattr(activities, "get_async_session", _fake_session())

        async def _off(db, workspace_id):
            return docx_ai_settings.DocxAiSettings(comment_trigger=False)

        monkeypatch.setattr(docx_ai_settings, "get_settings", _off)

        result = await activities.scan_docx_comments_for_mentions(
            activities.ScanDocxCommentsInput(document_id="d1", workspace_id="w1")
        )
        assert result == {"scanned": False, "reason": "comment trigger is off"}

    async def test_several_remarks_become_one_draft(self, monkeypatch) -> None:
        # Three remarks on the same clause are one editing decision. Three
        # separate redlines against the same paragraph would conflict on apply.
        monkeypatch.setattr(activities, "get_async_session", _fake_session())
        monkeypatch.setattr(
            "aexy.services.docx_service.extract_comments",
            lambda raw: [
                _Comment("1", "Priya", "@aexy push to 60 days"),
                _Comment("2", "Priya", "@aexy and fix the cap"),
                _Comment("3", "Sam", "@aexy agree with Priya"),
            ],
        )
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService._load_bytes",
            _returns(b"PK\x03\x04"),
        )
        captured: list = []
        monkeypatch.setattr(
            "aexy.services.docx_ai_edit_service.DocxAiEditService.draft_edit",
            _capture(captured, _Proposal()),
        )
        monkeypatch.setattr(activities, "_author_id_of", _returns(None))

        result = await activities.scan_docx_comments_for_mentions(
            activities.ScanDocxCommentsInput(document_id="d1", workspace_id="w1")
        )
        assert len(captured) == 1
        assert captured[0].comment_ids == ("1", "2", "3")
        assert result["mentions"] == 3


class TestAuthorMatching:
    async def test_an_ambiguous_name_notifies_nobody(self, monkeypatch) -> None:
        # Word records a display name, not an email. Two members called "Sam"
        # means we do not know which one wrote it, and telling the wrong person
        # is worse than telling nobody.
        class _Result:
            def scalars(self):
                return types.SimpleNamespace(all=lambda: ["a", "b"])

        class _Db:
            async def execute(self, _q):
                return _Result()

        assert (
            await activities._author_id_of(_Db(), _Comment("1", "Sam", "x"), "w1")
            is None
        )

    async def test_an_unmatched_name_notifies_nobody(self, monkeypatch) -> None:
        # An external reviewer who is not an Aexy member at all.
        class _Result:
            def scalars(self):
                return types.SimpleNamespace(all=lambda: [])

        class _Db:
            async def execute(self, _q):
                return _Result()

        assert (
            await activities._author_id_of(
                _Db(), _Comment("1", "External Counsel", "x"), "w1"
            )
            is None
        )

    async def test_no_workspace_means_no_lookup(self) -> None:
        assert (
            await activities._author_id_of(None, _Comment("1", "Sam", "x"), None)
            is None
        )


def test_the_excerpt_fits_a_notification_body() -> None:
    long = " ".join(["clause"] * 200)
    out = activities._excerpt(long)
    assert len(out) <= 120
    assert out.endswith("…")


def test_the_excerpt_collapses_whitespace() -> None:
    assert activities._excerpt("one\n\n  two   three") == "one two three"


# ── helpers ──


def _fake_session(document_title: str = "A document"):
    """A `get_async_session` that yields a session with a findable document."""

    class _Document:
        title = document_title
        workspace_id = "w1"
        content_format = "docx"
        # `db.get` in the fake answers for any model, and the settings lookup
        # asks for a Workspace — an empty blob gives the documented defaults.
        settings: dict = {}

    class _Db:
        async def get(self, _model, _id):
            return _Document()

        async def flush(self):
            return None

        async def execute(self, _q):
            class _R:
                def scalars(self):
                    return types.SimpleNamespace(all=lambda: [])

            return _R()

    class _Ctx:
        async def __aenter__(self):
            return _Db()

        async def __aexit__(self, *_a):
            return False

    return lambda: _Ctx()


def _returns(value):
    async def _fn(*_args, **_kwargs):
        return value

    return _fn


def _raises(exc):
    async def _fn(*_args, **_kwargs):
        raise exc

    return _fn


def _capture(sink: list, value):
    async def _fn(_self, request, *_a, **_k):
        sink.append(request)
        return value

    return _fn
