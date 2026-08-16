"""Not paying to regenerate a document that barely changed.

Once a repository is documented module by module, most pushes touch *some*
module. Two savings follow from that, and both are about the calls that do
not happen: noise never reaches a model at all, and a real change revises
the existing prose from a patch rather than rewriting it from source.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.models.documentation import TemplateCategory
from aexy.services.document_sync_service import (
    DocumentSyncService,
    _category_for_link,
    is_substantive_path,
)


def make_service():
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.limits_service = MagicMock()
    return svc


DOC = {"type": "doc", "content": [{"type": "paragraph"}]}
REVISED = {"type": "doc", "content": [{"type": "paragraph", "attrs": {"n": 2}}]}


class TestSubstantivePaths:
    @pytest.mark.parametrize(
        "path",
        [
            "package-lock.json",
            "frontend/yarn.lock",
            "backend/uv.lock",
            "go.sum",
            "node_modules/left-pad/index.js",
            "frontend/dist/bundle.js",
            "static/app.min.js",
            "assets/logo.png",
            "docs/diagram.svg",
            "tests/__snapshots__/a.snap",
        ],
    )
    def test_noise_is_not_substantive(self, path):
        assert is_substantive_path(path) is False

    @pytest.mark.parametrize(
        "path",
        [
            "src/aexy/services/document_sync_service.py",
            "frontend/src/components/docs/Editor.tsx",
            "README.md",
            "requirements.txt",
            "Dockerfile",
            "src/distributed/queue.py",  # "dist" only as part of a longer name
        ],
    )
    def test_source_is_substantive(self, path):
        assert is_substantive_path(path) is True

    def test_the_filter_errs_towards_regenerating(self):
        """A missed skip costs one generation. A wrong skip leaves a document
        wrong and tells nobody, so anything unrecognised counts as real."""
        assert is_substantive_path("src/some.weird-extension") is True


class TestNoiseNeverReachesTheDatabase:
    @pytest.mark.asyncio
    async def test_a_lockfile_only_push_stops_before_any_query(self):
        svc = make_service()
        svc.db.execute = AsyncMock(side_effect=AssertionError("should not query"))

        result = await svc.handle_code_change(
            repository_id="repo-1",
            commit_sha="abc123",
            changed_paths=["package-lock.json", "yarn.lock"],
        )

        assert result["skipped_non_substantive"] == 2
        assert result["real_time_synced"] == []
        svc.db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_one_real_file_among_the_noise_still_counts(self):
        """The filter narrows the push; it must not discard it."""
        svc = make_service()
        svc.db.execute = AsyncMock(
            return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
        )
        svc.db.commit = AsyncMock()

        result = await svc.handle_code_change(
            repository_id="repo-1",
            commit_sha="abc123",
            changed_paths=["package-lock.json", "src/pkg/auth.py"],
        )

        assert "skipped_non_substantive" not in result
        svc.db.execute.assert_awaited()


class TestDocumentKeepsItsKind:
    def test_a_stored_category_is_honoured(self):
        link = SimpleNamespace(id="l1", template_category="module_docs")
        assert _category_for_link(link) == TemplateCategory.MODULE_DOCS

    def test_a_link_without_a_category_falls_back(self):
        """Links created before the column existed keep the old constant."""
        link = SimpleNamespace(id="l1", template_category=None)
        assert _category_for_link(link) == TemplateCategory.FUNCTION_DOCS

    def test_an_unknown_category_falls_back_rather_than_raising(self):
        link = SimpleNamespace(id="l1", template_category="nonsense")
        assert _category_for_link(link) == TemplateCategory.FUNCTION_DOCS


class FakeGithub:
    def __init__(self, diff):
        self.diff = diff
        self.compare_calls: list[tuple] = []

    async def compare_commits(self, full_name, base, head, path_prefix=""):
        self.compare_calls.append((full_name, base, head, path_prefix))
        return self.diff


def revise_setup(
    *,
    diff=None,
    base="base111",
    head="head222",
    content=None,
    update_result=None,
):
    document = SimpleNamespace(
        id="doc-1", created_by_id="dev-1", content=DOC if content is None else content
    )
    code_link = SimpleNamespace(
        id="link-1",
        repository=SimpleNamespace(full_name="acme/widgets"),
        path="src/pkg",
        branch="main",
        owner_developer_id="dev-1",
        last_synced_commit_sha=base,
        last_commit_sha=head,
    )
    gen = MagicMock()
    gen.update_documentation = AsyncMock(
        return_value=update_result
        if update_result is not None
        else {"updated_doc": REVISED, "changes_made": ["auth flow"]}
    )
    gen.generate_from_repository = AsyncMock(return_value={"type": "doc", "content": []})
    return make_service(), document, code_link, gen, FakeGithub(diff)


PATCH = {"patch": "--- src/pkg/auth.py\n@@ -1 +1 @@\n-old\n+new", "summary": "1 file"}


class TestRevisingFromTheDiff:
    @pytest.mark.asyncio
    async def test_a_change_with_a_known_base_is_revised_not_rewritten(self):
        svc, doc, link, gen, gh = revise_setup(diff=PATCH)

        result = await svc._revise(doc, link, gen, gh, "dev-1")

        assert result == REVISED
        gen.generate_from_repository.assert_not_awaited()
        # Scoped to the link's path: the rest of the repository's diff is
        # context the document was already correct about.
        assert gh.compare_calls == [("acme/widgets", "base111", "head222", "src/pkg")]

    @pytest.mark.asyncio
    async def test_the_patch_is_what_reaches_the_model(self):
        svc, doc, link, gen, gh = revise_setup(diff=PATCH)

        await svc._revise(doc, link, gen, gh, "dev-1")

        kwargs = gen.update_documentation.await_args.kwargs
        assert kwargs["new_code"] == PATCH["patch"]
        assert kwargs["existing_doc"] == DOC
        assert kwargs["changes_summary"] == "1 file"
        assert kwargs["developer_id"] == "dev-1"

    @pytest.mark.asyncio
    async def test_no_recorded_base_means_regenerate(self):
        """Guessing a base produces a diff against a version that was never
        written, which is worse than paying for a rewrite."""
        svc, doc, link, gen, gh = revise_setup(diff=PATCH, base=None)

        assert await svc._revise(doc, link, gen, gh, "dev-1") is None
        assert gh.compare_calls == []

    @pytest.mark.asyncio
    async def test_an_empty_document_is_a_first_draft_not_an_edit(self):
        svc, doc, link, gen, gh = revise_setup(
            diff=PATCH, content={"type": "doc", "content": []}
        )

        assert await svc._revise(doc, link, gen, gh, "dev-1") is None

    @pytest.mark.asyncio
    async def test_already_at_head_needs_nothing(self):
        svc, doc, link, gen, gh = revise_setup(diff=PATCH, base="same", head="same")

        assert await svc._revise(doc, link, gen, gh, "dev-1") is None

    @pytest.mark.asyncio
    async def test_an_out_of_range_diff_falls_back(self):
        """compare_commits returns None past its size bound, where a rewrite is
        both cheaper and better than patching."""
        svc, doc, link, gen, gh = revise_setup(diff=None)

        assert await svc._revise(doc, link, gen, gh, "dev-1") is None
        gen.update_documentation.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_an_echoed_document_is_not_an_update(self):
        """`update_documentation` returns the input unchanged when the model's
        reply will not parse. Proposing that would ask someone to review a
        diff with nothing in it."""
        svc, doc, link, gen, gh = revise_setup(
            diff=PATCH, update_result={"updated_doc": DOC, "changes_made": []}
        )

        assert await svc._revise(doc, link, gen, gh, "dev-1") is None

    @pytest.mark.asyncio
    async def test_a_failed_revision_falls_back_rather_than_giving_up(self):
        svc, doc, link, gen, gh = revise_setup(diff=PATCH)
        gen.update_documentation = AsyncMock(side_effect=RuntimeError("model down"))

        assert await svc._revise(doc, link, gen, gh, "dev-1") is None

    @pytest.mark.asyncio
    async def test_a_reader_without_compare_support_falls_back(self):
        svc, doc, link, gen, _ = revise_setup(diff=PATCH)

        assert await svc._revise(doc, link, gen, object(), "dev-1") is None


class TestTheExpensivePathIsTheFallback:
    @pytest.mark.asyncio
    async def test_a_successful_revision_skips_full_regeneration(self, monkeypatch):
        svc, doc, link, gen, gh = revise_setup(diff=PATCH)
        proposal = SimpleNamespace(id="prop-1")
        service = MagicMock()
        service.create_proposal = AsyncMock(return_value=proposal)
        monkeypatch.setattr(
            "aexy.services.proposed_edits_service.ProposedEditsService",
            lambda db: service,
        )

        outcome = await svc._generate_and_propose(
            document=doc,
            code_link=link,
            category=TemplateCategory.MODULE_DOCS,
            gen_service=gen,
            github_service=gh,
            source="code_change_sync",
        )

        assert outcome == {"proposal_id": "prop-1", "content": REVISED}
        gen.generate_from_repository.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_regeneration_still_runs_when_revision_is_not_possible(
        self, monkeypatch
    ):
        svc, doc, link, gen, gh = revise_setup(diff=PATCH, base=None)
        proposal = SimpleNamespace(id="prop-2")
        service = MagicMock()
        service.create_proposal = AsyncMock(return_value=proposal)
        monkeypatch.setattr(
            "aexy.services.proposed_edits_service.ProposedEditsService",
            lambda db: service,
        )

        outcome = await svc._generate_and_propose(
            document=doc,
            code_link=link,
            category=TemplateCategory.MODULE_DOCS,
            gen_service=gen,
            github_service=gh,
            source="code_change_sync",
        )

        assert outcome is not None
        gen.generate_from_repository.assert_awaited_once()
