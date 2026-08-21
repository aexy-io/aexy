"""Workspace settings for AI editing of Word documents.

The interesting behaviour is at the edges, not in the round trip: a workspace
that has never opened the page, a block written by an older client with one bad
value in it, and the difference between what the JSONB reader tolerates and what
the API accepts.
"""

from __future__ import annotations

from typing import Any

import pytest

from aexy.models.workspace import Workspace
from aexy.services import docx_ai_settings as svc


def _workspace(block: Any) -> Workspace:
    """A detached row carrying one settings block. No database needed."""
    workspace = Workspace(name="Acme", slug="acme")
    workspace.settings = {} if block is None else {"docx_ai": block}
    return workspace


class TestDefaults:
    def test_a_workspace_that_never_configured_anything_gets_the_defaults(
        self,
    ) -> None:
        settings = svc.settings_for_workspace(_workspace(None))
        assert settings.enabled
        assert settings.comment_trigger
        assert settings.comment_trigger_handle == "aexy"
        assert settings.allow_ai_comments
        assert settings.ai_author_label == "Aexy AI"
        assert settings.max_ops == svc.DEFAULT_MAX_OPS
        assert settings.notify_owner

    def test_configured_to_the_defaults_reads_the_same_as_never_configured(
        self,
    ) -> None:
        # So no client has to know which it got.
        blank = svc.settings_for_workspace(_workspace(None))
        explicit = svc.settings_for_workspace(_workspace(blank.to_dict()))
        assert blank == explicit

    def test_the_mention_is_the_handle_with_an_at(self) -> None:
        assert svc.settings_for_workspace(_workspace(None)).mention == "@aexy"


class TestCoercion:
    def test_a_block_that_is_not_an_object_falls_back_whole(self) -> None:
        assert svc.settings_for_workspace(_workspace("on")) == svc.DocxAiSettings()

    def test_one_bad_value_costs_only_that_value(self) -> None:
        # Per-field fallback, not all-or-nothing: a single unknown written by an
        # older client must not silently revert the other six settings.
        settings = svc.settings_for_workspace(
            _workspace(
                {
                    "mode": "sometimes",  # not a mode
                    "comment_trigger": False,
                    "ai_author_label": "Reviewer Bot",
                }
            )
        )
        assert settings.mode == svc.DEFAULT_MODE
        assert settings.comment_trigger is False
        assert settings.ai_author_label == "Reviewer Bot"

    def test_off_is_honoured(self) -> None:
        settings = svc.settings_for_workspace(_workspace({"mode": "off"}))
        assert not settings.enabled

    @pytest.mark.parametrize(
        ("stored", "expected"),
        [(0, svc.MIN_MAX_OPS), (999, svc.MAX_MAX_OPS), (-5, svc.MIN_MAX_OPS)],
    )
    def test_the_change_cap_is_clamped_rather_than_rejected(
        self, stored: int, expected: int
    ) -> None:
        # Stored values are not user input any more; clamping keeps a document
        # openable where refusing would strand it.
        assert svc.settings_for_workspace(_workspace({"max_ops": stored})).max_ops == expected

    def test_a_boolean_is_not_a_change_cap(self) -> None:
        # bool is an int in Python, so True would otherwise clamp to 1 and mean
        # "one change per proposal" for ever.
        assert (
            svc.settings_for_workspace(_workspace({"max_ops": True})).max_ops
            == svc.DEFAULT_MAX_OPS
        )

    def test_a_flag_written_as_a_string_falls_back(self) -> None:
        assert svc.settings_for_workspace(
            _workspace({"comment_trigger": "false"})
        ).comment_trigger is svc.DEFAULT_COMMENT_TRIGGER


class TestHandleNormalisation:
    @pytest.mark.parametrize(
        ("given", "expected"),
        [
            ("aexy", "aexy"),
            ("@aexy", "aexy"),
            ("  @Docs.Bot  ", "Docs.Bot"),
            ("a_b-c1", "a_b-c1"),
        ],
    )
    def test_usable_handles(self, given: str, expected: str) -> None:
        assert svc.normalise_handle(given) == expected

    @pytest.mark.parametrize(
        "given", ["", "@", "1bot", "has space", "emoji🙂", "a" * 40, None, 7]
    )
    def test_unusable_handles_are_refused(self, given: Any) -> None:
        assert svc.normalise_handle(given) is None

    def test_an_unusable_stored_handle_degrades_to_the_default(self) -> None:
        settings = svc.settings_for_workspace(
            _workspace({"comment_trigger_handle": "has space"})
        )
        assert settings.comment_trigger_handle == svc.DEFAULT_COMMENT_TRIGGER_HANDLE


class TestAuthorLabel:
    def test_whitespace_is_collapsed(self) -> None:
        assert svc.normalise_author_label("  Aexy   AI \n") == "Aexy AI"

    def test_a_blank_label_is_refused(self) -> None:
        # w:author is required by the schema, so an empty name is not a name.
        assert svc.normalise_author_label("   ") is None
        assert svc.normalise_author_label(None) is None

    def test_a_very_long_label_is_truncated_rather_than_refused(self) -> None:
        assert len(svc.normalise_author_label("x" * 500) or "") == 64


class TestMerge:
    def test_other_namespaces_survive(self) -> None:
        # workspace.settings is shared by several features; replacing the whole
        # dict would silently drop the service desk's prefix.
        merged = svc.merge_settings(
            {"service_desk": {"ticket_prefix": "ACME"}},
            svc.DocxAiSettings(mode="off"),
        )
        assert merged["service_desk"] == {"ticket_prefix": "ACME"}
        assert merged["docx_ai"]["mode"] == "off"

    def test_the_input_dict_is_not_mutated(self) -> None:
        # SQLAlchemy does not detect an in-place JSONB edit, so this returning a
        # copy is what makes a save actually save.
        existing: dict[str, Any] = {"docx_ai": {"mode": "on"}}
        merged = svc.merge_settings(existing, svc.DocxAiSettings(mode="off"))
        assert existing["docx_ai"]["mode"] == "on"
        assert merged["docx_ai"]["mode"] == "off"

    def test_a_round_trip_through_the_blob_preserves_every_field(self) -> None:
        original = svc.DocxAiSettings(
            mode="off",
            comment_trigger=False,
            comment_trigger_handle="docsbot",
            allow_ai_comments=False,
            ai_author_label="Docs Bot",
            max_ops=7,
            notify_owner=False,
        )
        merged = svc.merge_settings(None, original)
        assert svc.settings_for_workspace(_workspace(merged["docx_ai"])) == original
