"""One answer to "which pages does this change touch", for every caller.

`handle_code_change` grew this logic inline: filter the noise, skip a commit
that is our own export, skip a muted link, then narrow the matched paths per
link. A pull request needs exactly the same answer *before* the merge — and a
second implementation of it would be wrong in the worst available way. It would
tell somebody their PR affects a page that the merge of the same files then
leaves alone, or stay quiet about one it does flag, and neither disagreement is
visible to anybody: two plausible answers, no error, no way to notice.

So the rule is one public method and these tests are its contract. The
behaviour-unchanged half is covered by the existing suite — `test_document_sync_cost.py`
drives `own_export` and `muted` through `handle_code_change` and still passes
untouched, which is what says the extraction did not change what a push does.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.services.document_sync_service import (
    DocumentSyncService,
    path_matches_link,
)


def make_service():
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.limits_service = MagicMock()
    return svc


def make_link(**overrides):
    defaults = dict(
        id="l1",
        document_id="doc-1",
        sync_mode="propose",
        path="src/pkg",
        link_type="directory",
        has_pending_changes=False,
        document=SimpleNamespace(id="doc-1", created_by_id="dev-1"),
        owner_developer_id="dev-1",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def with_links(svc, links, export_commits=()):
    """First execute returns the code links, second the export commits."""
    svc.db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: list(links))),
            *[
                SimpleNamespace(fetchall=lambda: [(c,) for c in export_commits])
                for _ in links
            ],
        ]
    )


class TestWhatItExcludes:
    @pytest.mark.asyncio
    async def test_a_push_of_pure_noise_never_reaches_the_links(self):
        """The cheapest saving in the pipeline: no query, no match, no LLM."""
        svc = make_service()
        svc.db.execute = AsyncMock(side_effect=AssertionError("should not query"))

        affected = await svc.resolve_affected_links(
            "repo-1", ["package-lock.json", "frontend/dist/bundle.js"]
        )

        assert affected.matches == []
        assert affected.substantive_paths == []
        assert affected.skipped_non_substantive == 2

    @pytest.mark.asyncio
    async def test_our_own_export_is_not_somebody_changing_the_code(self):
        svc = make_service()
        with_links(svc, [make_link(path="docs", link_type="directory")],
                   export_commits=["ourcommit"])

        affected = await svc.resolve_affected_links(
            "repo-1", ["docs/session.md"], commit_sha="ourcommit"
        )

        assert affected.matches == []
        assert affected.own_export == 1

    @pytest.mark.asyncio
    async def test_without_a_commit_the_export_check_is_skipped(self):
        """A caller asking "what would these paths touch" has no single commit.

        Skipping the check is the only available answer — and it is the safe
        direction, because the cost is naming a page that turns out to be our
        own export, not silently missing one.
        """
        svc = make_service()
        with_links(svc, [make_link(path="docs", link_type="directory")])

        affected = await svc.resolve_affected_links("repo-1", ["docs/session.md"])

        assert len(affected.matches) == 1
        assert affected.own_export == 0

    @pytest.mark.asyncio
    async def test_a_muted_link_is_not_reported_as_affected_at_all(self):
        """Not "do not propose" — not mentioned. Telling somebody a page they
        muted is affected is how the whole feature earns a mute of its own."""
        svc = make_service()
        with_links(svc, [make_link(sync_mode="off")])

        affected = await svc.resolve_affected_links("repo-1", ["src/pkg/mod.py"])

        assert affected.matches == []
        assert affected.muted == 1

    @pytest.mark.asyncio
    async def test_a_link_nothing_touched_is_counted_not_returned(self):
        svc = make_service()
        with_links(svc, [make_link(path="src/other")])

        affected = await svc.resolve_affected_links("repo-1", ["src/pkg/mod.py"])

        assert affected.matches == []
        assert affected.no_match == 1


class TestWhatItReturns:
    @pytest.mark.asyncio
    async def test_only_the_paths_that_matched_this_link(self):
        """The reason a person reads. A push of fifty files that names two under
        this module is legible; the same push naming all fifty is not."""
        svc = make_service()
        with_links(svc, [make_link(path="src/pkg", link_type="directory")])

        affected = await svc.resolve_affected_links(
            "repo-1",
            ["src/pkg/a.py", "src/elsewhere/b.py", "src/pkg/deep/c.py"],
        )

        assert len(affected.matches) == 1
        assert affected.matches[0].matched_paths == ["src/pkg/a.py", "src/pkg/deep/c.py"]

    @pytest.mark.asyncio
    async def test_noise_is_gone_from_the_matched_paths_too(self):
        """Not only from the decision to match — from what the caller is told,
        so a proposal never cites a lockfile as its reason."""
        svc = make_service()
        with_links(svc, [make_link(path="src/pkg", link_type="directory")])

        affected = await svc.resolve_affected_links(
            "repo-1", ["src/pkg/a.py", "src/pkg/package-lock.json"]
        )

        assert affected.matches[0].matched_paths == ["src/pkg/a.py"]
        assert affected.skipped_non_substantive == 0  # some were substantive

    @pytest.mark.asyncio
    async def test_it_flags_nothing_and_commits_nothing(self):
        """Read-only, because the pull-request caller runs before the merge —
        marking a page behind for a change that may never land would be a lie
        the author cannot correct."""
        svc = make_service()
        link = make_link()
        with_links(svc, [link])
        svc.db.commit = AsyncMock()

        await svc.resolve_affected_links("repo-1", ["src/pkg/mod.py"])

        assert link.has_pending_changes is False
        svc.db.commit.assert_not_awaited()


class TestTheMatcherIsShared:
    def test_the_private_method_still_answers(self):
        """Kept as a delegate: the existing suite calls it directly, and a
        rename would have quietly deleted that coverage."""
        svc = make_service()
        assert svc._path_matches_link("src/a.py", "file", ["src/a.py"]) is True
        assert svc._path_matches_link("src/a.py", "file", ["src/b.py"]) is False

    def test_a_file_link_is_exact_and_a_directory_link_is_a_prefix(self):
        assert path_matches_link("src/a.py", "file", ["src/a.py"]) is True
        assert path_matches_link("src/a.py", "file", ["src/a.py.bak"]) is False
        assert path_matches_link("src/pkg", "directory", ["src/pkg/deep/m.py"]) is True
        # The trap a prefix match invites: a sibling whose name starts the same.
        assert path_matches_link("src/pkg", "directory", ["src/pkg2/m.py"]) is False
