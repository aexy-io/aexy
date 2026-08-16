"""Creating a document that knows where it came from.

Generation already knew the repository, the branch and the path, and threw all
three away — so every generated document was born unable to notice its code
changing. Everything built on top of `document_code_links` (change detection,
the review queue, the freshness badge, the work list an agent reads) had
nothing to read, because nothing in the product ever wrote a row.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from aexy.api import documents as documents_api
from aexy.models.documentation import TemplateCategory
from aexy.schemas.document import GenerateFromRepositoryRequest
from aexy.services.document_generation_service import DocumentGenerationService

pytestmark = pytest.mark.asyncio

WORKSPACE = "11111111-1111-4111-8111-111111111111"
DOC = "22222222-2222-4222-8222-222222222222"
GENERATED = {"type": "doc", "content": [{"type": "paragraph"}]}


@pytest.fixture(autouse=True)
def _module_enabled(monkeypatch):
    async def enabled(*_args, **_kwargs):
        return None

    monkeypatch.setattr(documents_api, "ensure_app_enabled", enabled)

    async def permitted(*_args, **_kwargs):
        return None

    monkeypatch.setattr(documents_api, "check_workspace_permission", permitted)


class FakeDocService:
    """Records what the endpoint asked for."""

    def __init__(self, db):
        self.created_document = None
        self.created_link = None

    async def create_document(self, **kwargs):
        self.created_document = kwargs
        FakeDocService.last = self
        return SimpleNamespace(
            id=DOC,
            workspace_id=WORKSPACE,
            parent_id=None,
            title=kwargs["title"],
            content=kwargs["content"],
            content_text=None,
            icon=kwargs.get("icon"),
            cover_image=None,
            is_template=False,
            is_published=False,
            published_at=None,
            visibility="workspace",
            generation_status="draft",
            last_generated_at=None,
            created_by_id=kwargs["created_by_id"],
            created_by=None,
            last_edited_by_id=kwargs["created_by_id"],
            last_edited_by=None,
            position=0,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )

    async def create_code_link(self, **kwargs):
        self.created_link = kwargs
        return SimpleNamespace(
            id="link-1",
            document_id=kwargs["document_id"],
            repository_id=kwargs["repository_id"],
            repository=SimpleNamespace(full_name="acme/widgets"),
            path=kwargs["path"],
            link_type=kwargs["link_type"],
            branch=kwargs["branch"],
            document_section_id=None,
            last_commit_sha=None,
            last_content_hash=None,
            last_synced_at=None,
            has_pending_changes=False,
            owner_developer_id=kwargs.get("owner_developer_id"),
            sync_mode="propose",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )


class FakeGenService:
    def __init__(self, db, workspace_id=None):
        self.file_calls = 0
        self.module_calls = 0
        FakeGenService.last = self

    async def generate_from_repository(self, **kwargs):
        self.file_calls += 1
        self.file_kwargs = kwargs
        return GENERATED

    async def generate_module_documentation(self, **kwargs):
        self.module_calls += 1
        self.module_kwargs = kwargs
        return GENERATED

    def ensure_renderable(self, content, category):
        return DocumentGenerationService.ensure_renderable(self, content, category)

    @staticmethod
    def is_renderable_document(content):
        return DocumentGenerationService.is_renderable_document(content)

    def _create_fallback_document(self, content, category):
        return DocumentGenerationService._create_fallback_document(
            self, content, category
        )


class FakeDb:
    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1

    async def refresh(self, _obj):
        return None


def wire(monkeypatch):
    monkeypatch.setattr(documents_api, "DocumentService", FakeDocService)
    monkeypatch.setattr(documents_api, "DocumentGenerationService", FakeGenService)

    async def reader(db, repository_id, developer_id):
        return (
            SimpleNamespace(
                id=repository_id,
                full_name="acme/widgets",
                name="widgets",
                owner_login="acme",
            ),
            SimpleNamespace(),
        )

    monkeypatch.setattr(documents_api, "_repository_reader", reader)


async def call(monkeypatch, **overrides):
    wire(monkeypatch)
    data = GenerateFromRepositoryRequest(
        **{
            "repository_id": "repo-1",
            "path": "src/pkg",
            "link_type": "directory",
            "branch": "main",
            **overrides,
        }
    )
    return await documents_api.create_document_from_repository(
        workspace_id=WORKSPACE,
        data=data,
        current_user=SimpleNamespace(id="dev-1"),
        db=FakeDb(),
    )


class TestTheLinkIsCreated:
    async def test_a_generated_document_is_linked_to_its_path(self, monkeypatch):
        result = await call(monkeypatch)

        link = FakeDocService.last.created_link
        assert link["repository_id"] == "repo-1"
        assert link["path"] == "src/pkg"
        assert link["branch"] == "main"
        assert link["link_type"] == "directory"
        assert result.code_link.path == "src/pkg"

    async def test_the_creator_owns_the_sync(self, monkeypatch):
        """Ownership decides the sync's plan tier and its credential
        fallback, so a link created without one is only half-configured."""
        await call(monkeypatch)

        assert FakeDocService.last.created_link["owner_developer_id"] == "dev-1"

    async def test_the_document_kind_is_recorded_on_the_link(self, monkeypatch):
        """Otherwise regeneration falls back to a default and quietly turns a
        module document into function docs."""
        await call(monkeypatch, template_category="module_docs")

        assert (
            FakeDocService.last.created_link["template_category"]
            == TemplateCategory.MODULE_DOCS.value
        )

    async def test_document_and_link_land_in_one_transaction(self, monkeypatch):
        """Two client calls would leave a document that looks generated and
        will never notice a change — the exact failure being removed."""
        db = FakeDb()
        wire(monkeypatch)
        await documents_api.create_document_from_repository(
            workspace_id=WORKSPACE,
            data=GenerateFromRepositoryRequest(
                repository_id="repo-1", path="src/pkg", link_type="directory"
            ),
            current_user=SimpleNamespace(id="dev-1"),
            db=db,
        )

        assert FakeDocService.last.created_document is not None
        assert FakeDocService.last.created_link is not None
        assert db.commits == 1


class TestFileVersusDirectory:
    async def test_a_file_is_documented_from_its_own_contents(self, monkeypatch):
        await call(monkeypatch, path="src/pkg/auth.py", link_type="file")

        assert FakeGenService.last.file_calls == 1
        assert FakeGenService.last.module_calls == 0

    async def test_a_directory_is_documented_as_a_module(self, monkeypatch):
        await call(monkeypatch)

        assert FakeGenService.last.module_calls == 1
        assert FakeGenService.last.file_calls == 0

    async def test_a_custom_prompt_reaches_the_module_generator(self, monkeypatch):
        await call(monkeypatch, custom_prompt="Focus on error handling")

        assert (
            FakeGenService.last.module_kwargs["custom_prompt"]
            == "Focus on error handling"
        )


class TestRenderableContent:
    """F9: `_parse_llm_json` returns whatever parses, and TipTap renders
    content it cannot understand as a blank page — so an invalid document is
    saved, looks empty, and is indistinguishable from a failure."""

    def test_a_real_document_passes(self):
        assert DocumentGenerationService.is_renderable_document(GENERATED) is True

    @pytest.mark.parametrize(
        "content",
        [
            {"title": "Auth", "sections": [{"body": "..."}]},  # valid JSON, not a doc
            {"type": "doc", "content": []},  # a doc with nothing in it
            {"type": "doc"},  # no content key at all
            {"content": [{"type": "paragraph"}]},  # no type
            {"type": "doc", "content": "not a list"},
            [],
            None,
            "just a string",
        ],
    )
    def test_content_the_editor_cannot_render_is_rejected(self, content):
        assert DocumentGenerationService.is_renderable_document(content) is False

    def test_unrenderable_content_becomes_readable_text(self):
        """A page somebody can read and fix beats a blank one they have to
        regenerate blind."""
        service = FakeGenService(None)

        result = service.ensure_renderable(
            {"title": "Auth", "sections": ["a"]}, TemplateCategory.MODULE_DOCS
        )

        assert DocumentGenerationService.is_renderable_document(result) is True
        assert result["metadata"]["fallback"] is True
        # The model's words survive rather than being discarded.
        assert "Auth" in str(result)

    async def test_a_bad_generation_is_never_saved_as_a_blank_page(
        self, monkeypatch
    ):
        wire(monkeypatch)

        async def bad_module_docs(self, **kwargs):
            return {"title": "Not a document", "sections": []}

        monkeypatch.setattr(
            FakeGenService, "generate_module_documentation", bad_module_docs
        )

        result = await call(monkeypatch)

        saved = FakeDocService.last.created_document["content"]
        assert DocumentGenerationService.is_renderable_document(saved) is True
        assert result.document.content["metadata"]["fallback"] is True


class TestErrorsSurvive:
    async def test_a_missing_installation_is_a_403_that_says_what_to_do(
        self, monkeypatch
    ):
        wire(monkeypatch)

        async def no_access(db, repository_id, developer_id):
            raise HTTPException(
                status_code=403,
                detail="No GitHub App installation covers acme. Install the app for that account first.",
            )

        monkeypatch.setattr(documents_api, "_repository_reader", no_access)

        with pytest.raises(HTTPException) as excinfo:
            await documents_api.create_document_from_repository(
                workspace_id=WORKSPACE,
                data=GenerateFromRepositoryRequest(
                    repository_id="repo-1", path="src", link_type="directory"
                ),
                current_user=SimpleNamespace(id="dev-1"),
                db=FakeDb(),
            )

        assert excinfo.value.status_code == 403
        assert "Install the app" in excinfo.value.detail

    def test_a_rate_limit_is_not_reported_as_a_server_error(self):
        """429 and 503 call for different responses — wait, versus try later.
        Collapsing both into 500 tells the user to do the one thing that
        cannot help."""
        from aexy.llm.base import LLMAPIError, LLMRateLimitError

        assert documents_api._generation_http_error(
            LLMRateLimitError("slow down")
        ).status_code == 429
        assert documents_api._generation_http_error(
            LLMAPIError("provider down")
        ).status_code == 503
        assert documents_api._generation_http_error(
            RuntimeError("something else")
        ).status_code == 500
