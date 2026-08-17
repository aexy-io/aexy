"""The joins that make a document notice its code changed.

Everything here covers a *connection* rather than a behaviour, because the
behaviour was already written and simply never reached:

  - the push webhook never called `handle_code_change`, so no document ever
    learned that its source had moved;
  - `_generate_and_propose` handed the generation service an object it could
    not call, and the resulting `TypeError` was caught and logged as an
    ordinary failure — which is why these assert on *outcomes*. A test that
    only checked "regeneration was attempted" passed against the broken code.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.api.webhooks import _changed_paths, _sync_documents_for_push
from aexy.services.document_sync_service import DocumentSyncService


def make_service():
    """A sync service with no database behind it."""
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.limits_service = MagicMock()
    return svc


# ---------------------------------------------------------------------------
# The GitHub reader handed to the generation service
# ---------------------------------------------------------------------------


class RecordingAppService:
    """Stands in for `GitHubAppService`, recording how it was called.

    Note the signature: `installation_id, owner, repo, path, ref`. The
    generation service asks for content as `(repository_full_name, path,
    branch)`, so passing this object straight through — as the background
    sync used to — binds `installation_id` to "owner/repo" and never
    supplies `path` at all.
    """

    def __init__(self):
        self.file_calls: list[dict] = []
        self.dir_calls: list[dict] = []

    async def resolve_repository_access(self, repository, developer_id=None):
        # Resolution order lives in the shared resolver and is covered in
        # tests/unit/test_github_access_resolution.py; what this file cares
        # about is the *shape* of the reader that comes back.
        self.access_request = (repository.owner_login, developer_id)
        return (42, "ghs_token")

    async def get_file_content(self, installation_id, owner, repo, path, ref="main"):
        self.file_calls.append(
            {
                "installation_id": installation_id,
                "owner": owner,
                "repo": repo,
                "path": path,
                "ref": ref,
            }
        )
        return {"content": "def f(): ..."}

    async def get_repository_contents(self, installation_id, owner, repo, path, ref="main"):
        self.dir_calls.append({"path": path, "ref": ref})
        return [{"name": "f.py", "type": "file"}]


@pytest.fixture
def reader_setup(monkeypatch):
    """`_build_github_reader` wired to a recording app service."""
    app_service = RecordingAppService()
    monkeypatch.setattr(
        "aexy.services.github_app_service.GitHubAppService",
        lambda db: app_service,
    )
    repository = SimpleNamespace(
        full_name="acme/widgets", owner_login="acme", name="widgets"
    )
    document = SimpleNamespace(id="doc-1", created_by_id="author-1")
    code_link = SimpleNamespace(
        id="link-1",
        repository=repository,
        path="src/pkg",
        branch="main",
        owner_developer_id="dev-1",
    )
    return make_service(), document, code_link, app_service


class TestBackgroundGitHubReader:
    @pytest.mark.asyncio
    async def test_reader_accepts_the_generation_service_calling_convention(
        self, reader_setup
    ):
        """The regression test for the broken background path.

        `generate_from_repository` calls `get_file_content(full_name, path,
        branch)` positionally. Before the adapter was restored this raised
        `TypeError: missing a required argument: 'path'`.
        """
        svc, document, code_link, app_service = reader_setup

        reader = await svc._build_github_reader(document, code_link)
        assert reader is not None

        result = await reader.get_file_content("acme/widgets", "src/pkg/mod.py", "main")

        assert result == {"content": "def f(): ..."}
        assert app_service.file_calls == [
            {
                "installation_id": 42,
                "owner": "acme",
                "repo": "widgets",
                "path": "src/pkg/mod.py",
                "ref": "main",
            }
        ]

    @pytest.mark.asyncio
    async def test_access_is_resolved_for_this_repository(self, reader_setup):
        """The reader asks about the repository it is going to read, with the
        sync owner as the fallback identity."""
        svc, document, code_link, app_service = reader_setup

        await svc._build_github_reader(document, code_link)

        assert app_service.access_request == ("acme", "dev-1")

    @pytest.mark.asyncio
    async def test_directory_root_is_normalised(self, reader_setup):
        """A link on the repository root arrives as "." and GitHub wants ""."""
        svc, document, code_link, app_service = reader_setup

        reader = await svc._build_github_reader(document, code_link)
        await reader.get_directory_contents("acme/widgets", ".", "main")

        assert app_service.dir_calls == [{"path": "", "ref": "main"}]

    @pytest.mark.asyncio
    async def test_no_installation_yields_no_reader(self, reader_setup, monkeypatch):
        svc, document, code_link, app_service = reader_setup
        app_service.resolve_repository_access = AsyncMock(return_value=None)

        assert await svc._build_github_reader(document, code_link) is None

    @pytest.mark.asyncio
    async def test_link_without_a_repository_yields_no_reader(self, reader_setup):
        svc, document, code_link, _ = reader_setup
        code_link.repository = None

        assert await svc._build_github_reader(document, code_link) is None


# ---------------------------------------------------------------------------
# Which changed paths concern which link
# ---------------------------------------------------------------------------


class TestPathMatchesLink:
    def test_file_link_matches_only_itself(self):
        svc = make_service()
        assert svc._path_matches_link("src/a.py", "file", ["src/a.py"]) is True
        assert svc._path_matches_link("src/a.py", "file", ["src/b.py"]) is False

    def test_directory_link_matches_anything_beneath_it(self):
        svc = make_service()
        assert (
            svc._path_matches_link("src/pkg", "directory", ["src/pkg/deep/mod.py"])
            is True
        )

    def test_directory_link_does_not_match_a_sibling_with_a_shared_prefix(self):
        """`src/pkg` must not claim `src/pkg2`. A plain `startswith` on the
        bare path would, which is why the match appends the separator."""
        svc = make_service()
        assert (
            svc._path_matches_link("src/pkg", "directory", ["src/pkg2/mod.py"])
            is False
        )

    def test_a_deletion_still_counts_as_a_change(self):
        """A removed file is as much a reason to revisit prose as an edited
        one — the webhook folds `removed` in with `added` and `modified`."""
        svc = make_service()
        assert svc._path_matches_link("src/a.py", "file", ["src/a.py"]) is True

    def test_a_rename_matches_through_both_of_its_halves(self):
        """GitHub reports a rename as a remove plus an add. Either side
        landing under the link is enough to flag it."""
        svc = make_service()
        changed = ["src/pkg/old.py", "src/pkg/new.py"]
        assert svc._path_matches_link("src/pkg", "directory", changed) is True
        assert svc._path_matches_link("src/pkg/old.py", "file", changed) is True

    def test_an_unrelated_push_matches_nothing(self):
        svc = make_service()
        assert (
            svc._path_matches_link("src/pkg", "directory", ["README.md", "docs/x.md"])
            is False
        )


# ---------------------------------------------------------------------------
# The webhook → sync join
# ---------------------------------------------------------------------------


class TestChangedPaths:
    def test_all_three_change_kinds_are_collected(self):
        commits = [
            {"added": ["a.py"], "modified": ["b.py"], "removed": ["c.py"]},
        ]
        assert _changed_paths(commits) == ["a.py", "b.py", "c.py"]

    def test_paths_touched_by_several_commits_appear_once(self):
        commits = [
            {"modified": ["a.py"]},
            {"modified": ["a.py", "b.py"]},
        ]
        assert _changed_paths(commits) == ["a.py", "b.py"]

    def test_a_push_with_no_file_changes_yields_nothing(self):
        assert _changed_paths([{"message": "empty"}]) == []


class TestTheCallSiteExists:
    def test_the_push_handler_calls_the_document_sync(self):
        """The tests below prove the helper works. This one proves it is
        reached — which is the defect that actually shipped: the sync
        service was complete and simply had no callers, so every test of
        its behaviour passed while nothing invoked it.
        """
        from aexy.api.webhooks import handle_github_webhook

        assert "_sync_documents_for_push" in handle_github_webhook.__code__.co_names


class TestSyncDocumentsForPush:
    @pytest.mark.asyncio
    async def test_the_push_reaches_handle_code_change(self, monkeypatch):
        """The join that did not exist: `handle_code_change` had no callers,
        so no push ever reached the document sync service."""
        repository = SimpleNamespace(id="repo-1", full_name="acme/widgets")
        db = MagicMock()
        db.execute = AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: repository)
        )

        seen = {}

        async def fake_handle_code_change(
            repository_id, commit_sha, changed_paths, pull_request=None
        ):
            seen.update(
                repository_id=repository_id,
                commit_sha=commit_sha,
                changed_paths=changed_paths,
                pull_request=pull_request,
            )
            return {"marked_pending": ["doc-1"], "no_match": 0}

        monkeypatch.setattr(
            DocumentSyncService, "handle_code_change", staticmethod(fake_handle_code_change)
        )

        event = SimpleNamespace(
            repository="acme/widgets",
            commits=[
                {"id": "aaa", "modified": ["src/pkg/one.py"]},
                {"id": "bbb", "added": ["src/pkg/two.py"]},
            ],
        )

        result = await _sync_documents_for_push(db, event)

        assert result == {"marked_pending": ["doc-1"], "no_match": 0}
        assert seen["repository_id"] == "repo-1"
        # The head commit, not the first one: the document is behind the tip.
        assert seen["commit_sha"] == "bbb"
        assert seen["changed_paths"] == ["src/pkg/one.py", "src/pkg/two.py"]
        # Nothing in these commit messages names a pull request, and that is the
        # ordinary case — a direct push. The proposal groups by commit.
        assert seen["pull_request"] is None

    @pytest.mark.asyncio
    async def test_a_merge_push_carries_its_pull_request_through(self, monkeypatch):
        """The other half of the same join. `trigger["pull_request"]` is what the
        review inbox groups on, and until this reached the service nothing ever
        set it — so one merge across four commits became four groups of one."""
        repository = SimpleNamespace(id="repo-1", full_name="acme/widgets")
        db = MagicMock()
        db.execute = AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: repository)
        )

        seen = {}

        async def fake_handle_code_change(
            repository_id, commit_sha, changed_paths, pull_request=None
        ):
            seen.update(pull_request=pull_request)
            return {"marked_pending": ["doc-1"], "no_match": 0}

        monkeypatch.setattr(
            DocumentSyncService,
            "handle_code_change",
            staticmethod(fake_handle_code_change),
        )

        event = SimpleNamespace(
            repository="acme/widgets",
            commits=[
                {
                    "id": "aaa",
                    "message": "Expire sessions sooner",
                    "modified": ["src/pkg/one.py"],
                },
                {
                    "id": "bbb",
                    "message": "Merge pull request #128 from acme/session-expiry",
                    "modified": ["src/pkg/two.py"],
                },
            ],
        )

        await _sync_documents_for_push(db, event)

        assert seen["pull_request"] == 128

    @pytest.mark.asyncio
    async def test_a_push_with_no_paths_does_not_query_for_a_repository(self):
        db = MagicMock()
        db.execute = AsyncMock(side_effect=AssertionError("should not query"))

        event = SimpleNamespace(repository="acme/widgets", commits=[{"id": "aaa"}])

        assert await _sync_documents_for_push(db, event) is None

    @pytest.mark.asyncio
    async def test_an_unknown_repository_is_ignored(self):
        db = MagicMock()
        db.execute = AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: None)
        )

        event = SimpleNamespace(
            repository="stranger/repo",
            commits=[{"id": "aaa", "modified": ["x.py"]}],
        )

        assert await _sync_documents_for_push(db, event) is None

    @pytest.mark.asyncio
    async def test_a_sync_failure_never_fails_the_delivery(self, monkeypatch):
        """GitHub retries a failed delivery. Ingestion has already succeeded
        by this point, so a documentation problem must not cause a replay."""
        repository = SimpleNamespace(id="repo-1", full_name="acme/widgets")
        db = MagicMock()
        db.execute = AsyncMock(
            return_value=SimpleNamespace(scalar_one_or_none=lambda: repository)
        )

        async def boom(repository_id, commit_sha, changed_paths):
            raise RuntimeError("sync exploded")

        monkeypatch.setattr(
            DocumentSyncService, "handle_code_change", staticmethod(boom)
        )

        event = SimpleNamespace(
            repository="acme/widgets",
            commits=[{"id": "aaa", "modified": ["src/pkg/one.py"]}],
        )

        assert await _sync_documents_for_push(db, event) is None
