"""Importing a Notion or Confluence export.

Built against archives shaped the way the real exports are, because the parts
that go wrong in a migration are not the paragraphs — they are the filenames,
the link targets and the vendor macros.

Three properties carry the feature:

* **internal links resolve.** A migrated wiki whose links 404 is worse than no
  migration: people check three pages, find two broken, and stop trusting all
  of it. `TestLinkRewriting` is the two-pass proof.
* **a re-run resumes.** The first attempt at a large migration usually fails on
  something, and an importer that starts from zero on retry turns one bad page
  into four thousand duplicates.
* **one bad page does not lose the rest.** `partial` is a terminal state.
"""

import io
import uuid
import zipfile

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentImportJob
from aexy.services.document_import.service import (
    STATUS_COMPLETED,
    STATUS_PARTIAL,
    DocumentImportService,
    ImportError_,
)
from aexy.services.document_import.sources import Source, detect_source
from tests.conftest import seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


NOTION_ID_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
NOTION_ID_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"


def _zip(files: dict[str, bytes | str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, payload in files.items():
            archive.writestr(
                name, payload if isinstance(payload, bytes) else payload.encode()
            )
    return buffer.getvalue()


def _notion_archive() -> bytes:
    """Shaped like a real Notion export: the page id is glued to the filename,
    and internal links point at those literal paths."""
    return _zip(
        {
            f"Export/Runbook {NOTION_ID_A}.md": (
                "# Runbook\n\n"
                "Escalation lives in "
                f"[Escalation](Escalation%20{NOTION_ID_B}.md).\n\n"
                "| Env | Host |\n| --- | --- |\n| prod | a1 |\n\n"
                "![Diagram](Runbook/diagram.png)\n"
            ),
            f"Export/Escalation {NOTION_ID_B}.md": (
                "# Escalation\n\n- page the on-call\n  - then the manager\n"
            ),
            "Export/Runbook/diagram.png": b"\x89PNG\r\n\x1a\nfake",
        }
    )


def _confluence_archive() -> bytes:
    return _zip(
        {
            "space/1001.html": (
                "<html><head><title>Deploy</title></head><body>"
                "<h1>Deploy</h1>"
                '<ac:structured-macro ac:name="code">'
                '<ac:parameter ac:name="language">bash</ac:parameter>'
                "<ac:plain-text-body><![CDATA[kubectl apply -f .]]>"
                "</ac:plain-text-body></ac:structured-macro>"
                '<ac:link><ri:page ri:content-title="Rollback"/></ac:link>'
                "</body></html>"
            ),
            "space/1002.html": (
                "<html><head><title>Rollback</title></head><body>"
                "<h1>Rollback</h1><p>Revert the release.</p>"
                "</body></html>"
            ),
            "space/index.html": "<html><body>index</body></html>",
        }
    )


class _FakeStorage:
    """Enough of the storage service for the importer to store attachments."""

    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put_object(self, key, data, content_type):
        self.objects[key] = (data, content_type)
        return True

    def get_object(self, key):
        return self.objects.get(key)

    def generate_presigned_get_url(self, key, expires_in=3600):
        return None


@pytest.fixture
def storage(mocker):
    fake = _FakeStorage()
    mocker.patch(
        "aexy.services.storage_service.get_storage_service", return_value=fake
    )
    mocker.patch(
        "aexy.services.document_service.get_storage_service", return_value=fake
    )
    return fake


async def _workspace(db):
    workspace_id = await seed_workspace(db)
    developer = Developer(id=str(uuid.uuid4()), name="Importer")
    db.add(developer)
    await db.flush()
    await seed_member(db, workspace_id, str(developer.id), role="admin")
    return workspace_id, str(developer.id)


async def _job(db, workspace_id: str, developer_id: str, source: str):
    job = DocumentImportJob(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        requested_by_id=developer_id,
        source=source,
        archive_key="unused-in-tests",
    )
    db.add(job)
    await db.flush()
    return job


async def _run(db, raw: bytes, workspace_id: str, developer_id: str):
    service = DocumentImportService(db)
    archive, source, pages = service.read_archive(raw)
    job = await _job(db, workspace_id, developer_id, source.value)

    id_map = await service.scan(
        job,
        pages,
        workspace_id=workspace_id,
        space_id=None,
        created_by_id=developer_id,
    )
    progress = await service.convert(
        job, archive, source, pages, id_map, workspace_id=workspace_id
    )
    await service.finish(job, progress)
    return service, job, progress, id_map


def _texts(content: dict) -> list[str]:
    out: list[str] = []

    def walk(node):
        if node.get("type") == "text":
            out.append(node.get("text", ""))
        for child in node.get("content") or []:
            walk(child)

    walk(content)
    return out


def _links(content: dict) -> list[str]:
    out: list[str] = []

    def walk(node):
        for mark in node.get("marks") or []:
            if mark.get("type") == "link":
                out.append((mark.get("attrs") or {}).get("href", ""))
        for child in node.get("content") or []:
            walk(child)

    walk(content)
    return out


def _images(content: dict) -> list[str]:
    out: list[str] = []

    def walk(node):
        if node.get("type") == "image":
            out.append((node.get("attrs") or {}).get("src", ""))
        for child in node.get("content") or []:
            walk(child)

    walk(content)
    return out


# ──────────────────────────────────────────────────────────────────────
# Detection


class TestDetection:
    def test_a_notion_export_is_recognised(self):
        assert detect_source([f"Runbook {NOTION_ID_A}.md"]) is Source.NOTION

    def test_a_confluence_export_is_recognised(self):
        assert (
            detect_source(["space/index.html", "space/1001.html"])
            is Source.CONFLUENCE
        )

    def test_plain_markdown_is_recognised(self):
        assert detect_source(["notes/one.md", "notes/two.md"]) is Source.MARKDOWN

    def test_an_unreadable_file_is_refused_clearly(self):
        with pytest.raises(ImportError_):
            DocumentImportService(None).read_archive(b"not a zip at all")


# ──────────────────────────────────────────────────────────────────────
# The two passes


class TestNotionImport:
    async def test_every_page_becomes_a_document(self, db_session, storage):
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, progress, id_map = await _run(
            db_session, _notion_archive(), workspace_id, developer_id
        )

        assert progress.imported == 2
        assert progress.failed == 0
        assert set(id_map) == {NOTION_ID_A, NOTION_ID_B}

    async def test_the_title_loses_the_notion_id(self, db_session, storage):
        """Notion's filename is the title with a 32-hex id glued on. Leaving it
        gives every page a name ending in gibberish."""
        workspace_id, developer_id = await _workspace(db_session)
        await _run(db_session, _notion_archive(), workspace_id, developer_id)

        titles = {
            d.title
            for d in (
                await db_session.execute(
                    select(Document).where(Document.workspace_id == workspace_id)
                )
            )
            .scalars()
            .all()
        }
        assert titles == {"Runbook", "Escalation"}

    async def test_structure_survives(self, db_session, storage):
        """The fidelity parser, exercised through the real pipeline."""
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, _progress, id_map = await _run(
            db_session, _notion_archive(), workspace_id, developer_id
        )

        runbook = (
            await db_session.execute(
                select(Document).where(Document.id == id_map[NOTION_ID_A])
            )
        ).scalar_one()
        types = [n["type"] for n in runbook.content["content"]]
        assert "table" in types
        assert "image" in types


class TestLinkRewriting:
    async def test_an_internal_link_points_at_the_new_document(
        self, db_session, storage
    ):
        """The property the whole two-pass design exists for.

        A wiki is mostly forward references, so a single-pass importer leaves
        most links resolving to nothing.
        """
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, _progress, id_map = await _run(
            db_session, _notion_archive(), workspace_id, developer_id
        )

        runbook = (
            await db_session.execute(
                select(Document).where(Document.id == id_map[NOTION_ID_A])
            )
        ).scalar_one()

        assert f"/docs/{id_map[NOTION_ID_B]}" in _links(runbook.content)

    async def test_an_external_link_is_left_alone(self, db_session, storage):
        workspace_id, developer_id = await _workspace(db_session)
        raw = _zip(
            {
                f"Page {NOTION_ID_A}.md": (
                    "# Page\n\nSee [the docs](https://example.test/guide).\n"
                )
            }
        )
        _s, _job, _p, id_map = await _run(db_session, raw, workspace_id, developer_id)

        document = (
            await db_session.execute(
                select(Document).where(Document.id == id_map[NOTION_ID_A])
            )
        ).scalar_one()
        assert _links(document.content) == ["https://example.test/guide"]

    async def test_a_confluence_page_link_resolves_by_title(
        self, db_session, storage
    ):
        """Confluence links name the target by title, not by path."""
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, _progress, id_map = await _run(
            db_session, _confluence_archive(), workspace_id, developer_id
        )

        deploy = (
            await db_session.execute(
                select(Document).where(Document.id == id_map["1001"])
            )
        ).scalar_one()
        assert f"/docs/{id_map['1002']}" in _links(deploy.content)


class TestAttachments:
    async def test_an_image_is_uploaded_and_rewritten(self, db_session, storage):
        """The stored `src` must be a durable app path, not a presigned URL —
        `presign_stored_object` is explicit that those are generated
        per-response and never stored, so one in a document body is a dead link
        within the hour."""
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, _progress, id_map = await _run(
            db_session, _notion_archive(), workspace_id, developer_id
        )

        runbook = (
            await db_session.execute(
                select(Document).where(Document.id == id_map[NOTION_ID_A])
            )
        ).scalar_one()

        sources = _images(runbook.content)
        assert sources, "the image was dropped"
        assert sources[0].startswith(
            f"/api/v1/workspaces/{workspace_id}/documents/attachments/"
        ), sources[0]
        assert "X-Amz" not in sources[0], "a presigned URL was stored"

    async def test_a_missing_attachment_is_reported_not_fatal(
        self, db_session, storage
    ):
        workspace_id, developer_id = await _workspace(db_session)
        raw = _zip(
            {f"Page {NOTION_ID_A}.md": "# Page\n\n![Gone](missing/nowhere.png)\n"}
        )
        _s, _job, progress, _id_map = await _run(
            db_session, raw, workspace_id, developer_id
        )

        assert progress.imported == 1
        assert any("attachment not found" in w for w in progress.warnings)


class TestConfluenceMacros:
    async def test_a_code_macro_becomes_a_code_block(self, db_session, storage):
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, _progress, id_map = await _run(
            db_session, _confluence_archive(), workspace_id, developer_id
        )

        deploy = (
            await db_session.execute(
                select(Document).where(Document.id == id_map["1001"])
            )
        ).scalar_one()

        blocks = [n for n in deploy.content["content"] if n["type"] == "codeBlock"]
        assert blocks, "the code macro was flattened"
        assert blocks[0]["attrs"]["language"] == "bash"
        assert "kubectl apply -f ." in _texts(blocks[0])

    async def test_the_title_comes_from_the_document(self, db_session, storage):
        """Confluence's filename is a numeric id, so the title has to be read
        out of the page."""
        workspace_id, developer_id = await _workspace(db_session)
        _s, _job, _progress, id_map = await _run(
            db_session, _confluence_archive(), workspace_id, developer_id
        )

        titles = {
            d.title
            for d in (
                await db_session.execute(
                    select(Document).where(Document.workspace_id == workspace_id)
                )
            )
            .scalars()
            .all()
        }
        assert {"Deploy", "Rollback"} <= titles


# ──────────────────────────────────────────────────────────────────────
# Failure and resume


class TestResilience:
    async def test_a_rerun_does_not_duplicate(self, db_session, storage):
        """The reason `id_map` is persisted. Without it, a retry after a
        partial failure turns one bad page into a second copy of everything."""
        workspace_id, developer_id = await _workspace(db_session)
        service = DocumentImportService(db_session)
        raw = _notion_archive()

        archive, source, pages = service.read_archive(raw)
        job = await _job(db_session, workspace_id, developer_id, source.value)

        first = await service.scan(
            job, pages, workspace_id=workspace_id, space_id=None,
            created_by_id=developer_id,
        )
        second = await service.scan(
            job, pages, workspace_id=workspace_id, space_id=None,
            created_by_id=developer_id,
        )

        assert first == second

        count = len(
            (
                await db_session.execute(
                    select(Document).where(Document.workspace_id == workspace_id)
                )
            )
            .scalars()
            .all()
        )
        assert count == 2, f"the second scan created duplicates ({count} documents)"

    async def test_a_zip_slip_entry_is_ignored(self, db_session):
        """An archive entry naming `../` is either malicious or broken, and
        nothing downstream needs it."""
        raw = _zip({"../../etc/passwd.md": "# nope\n", "ok.md": "# fine\n"})
        _archive, _source, pages = DocumentImportService(None).read_archive(raw)
        assert [p.path for p in pages] == ["ok.md"]

    async def test_an_archive_with_no_pages_yields_none(self, db_session):
        raw = _zip({"logo.png": b"\x89PNG", "data.bin": b"\x00\x01"})
        _archive, _source, pages = DocumentImportService(None).read_archive(raw)
        assert pages == []

    async def test_a_clean_import_completes(self, db_session, storage):
        workspace_id, developer_id = await _workspace(db_session)
        _s, job, _progress, _id_map = await _run(
            db_session, _notion_archive(), workspace_id, developer_id
        )
        assert job.status == STATUS_COMPLETED

    async def test_one_bad_page_leaves_the_rest(self, db_session, storage):
        """`partial` is a terminal state, not a failure mode: one page that
        will not convert must not roll back the four thousand that did."""
        workspace_id, developer_id = await _workspace(db_session)
        raw = _zip(
            {
                f"Good {NOTION_ID_A}.md": "# Good\n\nReal content.\n",
                f"Empty {NOTION_ID_B}.md": "   \n\n",
            }
        )
        _s, job, progress, _id_map = await _run(
            db_session, raw, workspace_id, developer_id
        )

        assert progress.imported == 1
        assert progress.failed == 1
        assert job.status == STATUS_PARTIAL
        assert any("Empty" in w for w in progress.warnings)
