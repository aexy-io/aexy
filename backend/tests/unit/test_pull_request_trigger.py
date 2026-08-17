"""Which change a proposal says it came from.

`ProposedChange` has documented a `pull_request` trigger key since it was built,
and the review inbox's grouping branches on it before falling back to the
commit. Nothing ever wrote it — `handle_code_change` took a repository, a commit
and a list of paths — so every group was per-commit, and one merge across four
commits became four groups of one. The opposite of what grouping is for: "the
auth rework touched these four pages" is a decision, four unrelated documents is
a chore.

A push payload has no pull request field; GitHub does not put one there. The
number is in the merge commit's own subject, which GitHub writes.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.api.webhooks import _pull_request_from_commits
from aexy.models.proposed_change import ProposedChange
from aexy.services.document_sync_service import DocumentSyncService


class TestReadingItOffTheMergeCommit:
    def test_a_merge_commit_names_its_pull_request(self):
        commits = [
            {"message": "Merge pull request #128 from acme/session-expiry\n\nRework expiry"}
        ]
        assert _pull_request_from_commits(commits) == 128

    def test_a_squash_merge_names_it_in_the_title(self):
        commits = [{"message": "Rework session expiry so a logout is immediate (#128)"}]
        assert _pull_request_from_commits(commits) == 128

    def test_the_last_merge_in_a_push_wins(self):
        """A push can carry several merges. The newest is the one whose review
        this delivery belongs to; grouping under an older one would file these
        proposals against a pull request somebody already finished with."""
        commits = [
            {"message": "Merge pull request #100 from acme/old"},
            {"message": "Merge pull request #128 from acme/new"},
        ]
        assert _pull_request_from_commits(commits) == 128

    def test_an_ordinary_commit_names_none(self):
        # A rebase merge and a direct push both land here, and both are
        # ordinary — the proposal groups by commit instead.
        assert _pull_request_from_commits([{"message": "Fix the expiry window"}]) is None

    def test_a_number_in_prose_is_not_a_pull_request(self):
        """`(#128)` at the end is GitHub's squash format. The same digits in the
        middle of a sentence are somebody writing about issue 128."""
        assert (
            _pull_request_from_commits([{"message": "See #128 for why this is ugly"}])
            is None
        )

    def test_an_empty_push_names_none(self):
        assert _pull_request_from_commits([]) is None
        assert _pull_request_from_commits([{"message": ""}]) is None

    def test_an_implausible_number_is_not_taken(self):
        """Bounded so a commit that happens to end in a long parenthesised
        number does not become a pull request nobody has."""
        assert (
            _pull_request_from_commits([{"message": "Bump timeout (#123456789)"}])
            is None
        )


def _service():
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.db.execute = AsyncMock()
    svc.db.flush = AsyncMock()
    return svc


class TestItSurvivesToTheProposal:
    @pytest.mark.asyncio
    async def test_the_real_time_path_records_it(self, monkeypatch):
        svc = _service()
        seen: dict = {}

        async def _propose(**kwargs):
            seen.update(kwargs)
            return {"proposal_id": "p1"}

        monkeypatch.setattr(svc, "_generate_and_propose", _propose)
        monkeypatch.setattr(svc, "_build_github_reader", AsyncMock(return_value=MagicMock()))

        await svc._trigger_real_time_sync(
            document=SimpleNamespace(id="doc-1"),
            code_link=SimpleNamespace(
                id="link-1", link_type="directory", path="src/pkg", document_id="doc-1"
            ),
            commit_sha="abc1234",
            changed_paths=["src/pkg/a.py"],
            pull_request=128,
        )

        assert seen["trigger"]["pull_request"] == 128
        # The commit stays: the group label comes from the pull request, but
        # "which commit" is still the answer to "how far behind was this".
        assert seen["trigger"]["commit_sha"] == "abc1234"

    @pytest.mark.asyncio
    async def test_an_unknown_pull_request_is_absent_not_null(self, monkeypatch):
        """A stored `{"pull_request": None}` would read as a fact about a merge
        rather than the absence of one, and `_group` would still fall through —
        but every consumer would have to know that."""
        svc = _service()
        seen: dict = {}

        async def _propose(**kwargs):
            seen.update(kwargs)
            return {"proposal_id": "p1"}

        monkeypatch.setattr(svc, "_generate_and_propose", _propose)
        monkeypatch.setattr(svc, "_build_github_reader", AsyncMock(return_value=MagicMock()))

        await svc._trigger_real_time_sync(
            document=SimpleNamespace(id="doc-1"),
            code_link=SimpleNamespace(
                id="link-1", link_type="directory", path="src/pkg", document_id="doc-1"
            ),
            commit_sha="abc1234",
            changed_paths=["src/pkg/a.py"],
        )

        assert "pull_request" not in seen["trigger"]

    @pytest.mark.asyncio
    async def test_the_batched_path_reads_it_back_off_the_queue(self):
        """The Temporal activity is handed a document id and nothing else, so a
        batched document can only learn its pull request from the queue row it
        is draining."""
        svc = _service()
        svc.db.execute = AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: 128)
        )

        trigger = await svc._batch_trigger(
            "doc-1", SimpleNamespace(last_commit_sha="abc1234")
        )

        assert trigger == {
            "commit_sha": "abc1234",
            "paths": [],
            "pull_request": 128,
        }

    @pytest.mark.asyncio
    async def test_the_batched_path_only_reads_a_row_still_in_flight(self):
        svc = _service()
        svc.db.execute = AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
        )

        await svc._batch_trigger("doc-1", SimpleNamespace(last_commit_sha="abc1234"))

        statement = str(svc.db.execute.await_args.args[0]).lower()
        # A completed row describes a previous regeneration, and grouping this
        # proposal under it would attribute it to a merge already dealt with.
        assert "status in" in statement

    @pytest.mark.asyncio
    async def test_nothing_is_claimed_when_no_commit_is_known(self):
        svc = _service()

        assert await svc._batch_trigger("doc-1", SimpleNamespace(last_commit_sha=None)) is None
        svc.db.execute.assert_not_awaited()


class TestTheGroupingItFeeds:
    def test_a_pull_request_outranks_a_commit(self):
        from aexy.api.review_items import _group

        row = ProposedChange()
        row.trigger = {"commit_sha": "abc1234def", "pull_request": 128}

        key, label = _group(row)
        assert key == "pr:128"
        assert label == "Pull request #128"

    def test_two_documents_from_one_merge_share_a_group(self):
        from aexy.api.review_items import _group

        first, second = ProposedChange(), ProposedChange()
        # Different commits within the same merge — which is the case that used
        # to split into two groups.
        first.trigger = {"commit_sha": "aaa1111", "pull_request": 128}
        second.trigger = {"commit_sha": "bbb2222", "pull_request": 128}

        assert _group(first)[0] == _group(second)[0]
