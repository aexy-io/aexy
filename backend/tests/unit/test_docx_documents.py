"""A Word document as a first-class document.

The interesting cases here are the ones where a docx document would otherwise be
handled *successfully but wrongly*, because its `content` is `{}` by design:

* a TipTap walker over `{}` finds no nodes and reports no error, so a
  regeneration, a GitHub export, or an approved AI proposal would each report
  success having written an empty document over a real one;
* `compute_content_sha({})` is a perfectly stable hash, so the proposed-edit
  staleness check would never fire;
* duplicating the row without copying the bytes yields a document that opens as
  a blank page.

Each of those is pinned below. They are the reason the guards exist, and a
failure here means a Word document can be silently emptied.
"""

import io
import uuid

import pytest
from fastapi import HTTPException

from aexy.api.documents import require_docx_body, require_tiptap_body
from aexy.models.developer import Developer
from aexy.models.documentation import (
    CONTENT_FORMAT_DOCX,
    CONTENT_FORMAT_TIPTAP,
    Document,
    DocumentVersion,
)
from aexy.services.document_service import (
    DocumentService,
    DocxConflictError,
    compute_docx_sha,
    docx_version_key,
)
from aexy.services.proposed_edits_service import ProposedEditsService
from tests.conftest import seed_workspace

docx = pytest.importorskip("docx", reason="python-docx is required for Word support")

pytestmark = pytest.mark.asyncio


class _FakeStorage:
    """In-memory stand-in for the S3 storage service."""

    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    def is_configured(self):
        return True

    def put_object(self, key, data, content_type, **_):
        self.objects[key] = (data, content_type)
        return True

    def get_object(self, key):
        return self.objects.get(key)

    def get_object_stream(self, key, byte_range=None, chunk_size=256 * 1024):
        obj = self.objects.get(key)
        if obj is None:
            return None
        data, ctype = obj
        return {
            "iter": iter([data]),
            "content_type": ctype,
            "content_length": len(data),
            "content_range": None,
        }

    def get_object_url(self, key):
        return f"s3://test/{key}"

    def key_from_url(self, url):
        return None


@pytest.fixture
def storage(mocker):
    fake = _FakeStorage()
    mocker.patch(
        "aexy.services.document_service.get_storage_service", return_value=fake
    )
    return fake


def _docx_bytes(title="Requirements", body="Ship the billing rewrite.") -> bytes:
    document = docx.Document()
    document.add_heading(title, 1)
    document.add_paragraph(body)
    table = document.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text = "Tier"
    table.rows[0].cells[1].text = "Price"
    table.rows[1].cells[0].text = "Starter"
    table.rows[1].cells[1].text = "$50k"
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


async def _developer(db, name="Ada") -> str:
    developer = Developer(id=str(uuid.uuid4()), name=name)
    db.add(developer)
    await db.flush()
    return str(developer.id)


# ─── Creation ─────────────────────────────────────────────────────────────


class TestCreateDocxDocument:
    async def test_row_shape(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        raw = _docx_bytes()

        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=raw,
            title="Requirements",
        )

        assert document.content_format == CONTENT_FORMAT_DOCX
        assert document.is_docx is True
        assert document.content == {}
        # The row points at the version object; there is no mutable "current".
        assert document.docx_storage_key == docx_version_key(document.id, 1)
        assert document.docx_size_bytes == len(raw)
        assert document.docx_content_sha == compute_docx_sha(raw)

    async def test_bytes_reach_storage(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        raw = _docx_bytes()

        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id, created_by_id=author, raw=raw, title="R"
        )

        # Exactly one object, and it is the one the row names. An earlier shape
        # also wrote a mutable `current.docx`, which meant storage was touched
        # before the row was committed — see `docx_version_key`.
        assert storage.objects[docx_version_key(document.id, 1)][0] == raw
        assert list(storage.objects) == [docx_version_key(document.id, 1)]

    async def test_content_text_carries_the_extracted_markdown(
        self, db_session, storage
    ):
        """This is what makes search, embeddings and the knowledge graph work for
        a Word document with no docx-specific code of their own."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)

        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        assert "# Requirements" in document.content_text
        assert "Ship the billing rewrite." in document.content_text
        # And the table, which the old extractor dropped entirely.
        assert "$50k" in document.content_text

    async def test_unreadable_bytes_create_nothing(self, db_session, storage):
        """Parse first, write second. A file that cannot be read must not leave a
        document behind that nobody can open."""
        from aexy.services.docx_service import DocxReadError

        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)

        with pytest.raises(DocxReadError):
            await DocumentService(db_session).create_docx_document(
                workspace_id=workspace_id,
                created_by_id=author,
                raw=b"not a docx at all",
                title="R",
            )

        assert storage.objects == {}


# ─── Saving ───────────────────────────────────────────────────────────────


class TestReplaceDocxBytes:
    async def test_creates_a_new_version_and_moves_the_sha(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )
        first_sha = document.docx_content_sha

        edited = _docx_bytes(body="Ship the payments rebuild instead.")
        updated = await service.replace_docx_bytes(
            document_id=document.id, updated_by_id=author, raw=edited
        )

        assert updated.docx_content_sha == compute_docx_sha(edited)
        assert updated.docx_content_sha != first_sha
        assert "payments rebuild" in updated.content_text

        versions = await service.get_version_history(document.id)
        assert [v.version_number for v in versions] == [2, 1]
        assert all(v.content_format == CONTENT_FORMAT_DOCX for v in versions)
        # Version 1 still holds the original bytes: history is not rewritten.
        assert storage.objects[docx_version_key(document.id, 1)][0] != edited
        # And the row now names the new version rather than a mutated pointer.
        assert updated.docx_storage_key == docx_version_key(document.id, 2)
        assert storage.objects[docx_version_key(document.id, 2)][0] == edited

    async def test_stale_save_is_refused(self, db_session, storage):
        """The editor holds a whole document in memory, so a blind write would
        discard the other author's save in full rather than merging around it."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )
        opened_sha = document.docx_content_sha

        # Somebody else saves first.
        await service.replace_docx_bytes(
            document_id=document.id,
            updated_by_id=author,
            raw=_docx_bytes(body="Their edit."),
        )

        with pytest.raises(DocxConflictError) as caught:
            await service.replace_docx_bytes(
                document_id=document.id,
                updated_by_id=author,
                raw=_docx_bytes(body="My edit, based on a stale copy."),
                expected_sha=opened_sha,
            )

        # The current sha travels with the error so the editor can be told what
        # it now holds a stale copy of.
        assert caught.value.current_sha != opened_sha
        refreshed = await service.get_document(document.id)
        assert "Their edit." in refreshed.content_text

    async def test_matching_sha_is_accepted(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        updated = await service.replace_docx_bytes(
            document_id=document.id,
            updated_by_id=author,
            raw=_docx_bytes(body="Fine."),
            expected_sha=document.docx_content_sha,
        )
        assert updated is not None

    async def test_refuses_a_tiptap_document(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_document(
            workspace_id=workspace_id, created_by_id=author, title="Plain"
        )

        with pytest.raises(ValueError, match="not a Word document"):
            await service.replace_docx_bytes(
                document_id=document.id, updated_by_id=author, raw=_docx_bytes()
            )


class TestRestore:
    async def test_restore_is_forward_only(self, db_session, storage):
        """Matching TipTap restore semantics: the history a restore was made from
        stays readable instead of being rewritten."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        original = _docx_bytes(body="Version one.")
        document = await service.create_docx_document(
            workspace_id=workspace_id, created_by_id=author, raw=original, title="R"
        )
        await service.replace_docx_bytes(
            document_id=document.id,
            updated_by_id=author,
            raw=_docx_bytes(body="Version two."),
        )

        versions = await service.get_version_history(document.id)
        v1 = next(v for v in versions if v.version_number == 1)

        # Routed through the generic entry point, which is what the API calls.
        restored = await service.restore_version(
            document_id=document.id, version_id=str(v1.id), restored_by_id=author
        )

        assert "Version one." in restored.content_text
        assert restored.docx_content_sha == compute_docx_sha(original)
        history = await service.get_version_history(document.id)
        assert [v.version_number for v in history] == [3, 2, 1]


class TestDuplicate:
    async def test_duplicate_copies_the_bytes(self, db_session, storage):
        """A row claiming to be a Word document with no file behind it opens as a
        blank page — the failure looks like data loss, not a bug."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        original = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        copy = await service.duplicate_document(
            document_id=original.id,
            workspace_id=workspace_id,
            duplicated_by_id=author,
        )

        assert copy is not None
        assert copy.id != original.id
        assert copy.content_format == CONTENT_FORMAT_DOCX
        assert copy.docx_storage_key == docx_version_key(copy.id, 1)
        assert storage.objects[copy.docx_storage_key][0] == storage.objects[
            original.docx_storage_key
        ][0]
        assert copy.docx_content_sha == original.docx_content_sha


# ─── Guards ───────────────────────────────────────────────────────────────


class TestTipTapWritesAreRefused:
    async def test_update_document_refuses_a_tiptap_body(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        with pytest.raises(ValueError, match="Word document"):
            await service.update_document(
                document_id=document.id,
                updated_by_id=author,
                content={"type": "doc", "content": [{"type": "paragraph"}]},
            )

    async def test_format_independent_fields_still_apply(self, db_session, storage):
        """Renaming a Word document is not a body edit and must keep working."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        updated = await service.update_document(
            document_id=document.id, updated_by_id=author, title="Renamed", icon="📄"
        )

        assert updated.title == "Renamed"
        assert updated.icon == "📄"
        assert updated.content_format == CONTENT_FORMAT_DOCX

    async def test_tiptap_proposal_is_refused_at_the_queue(self, db_session, storage):
        """The one chokepoint every AI write path goes through, including the
        code-change sync that reaches it with no HTTP request to guard.

        Without this, `compute_content_sha({})` gives the proposal a stable base
        sha, the staleness check never fires, and approving it writes an empty
        TipTap tree over a real document while the bytes sit untouched.
        """
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)

        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        with pytest.raises(ValueError, match="Word document"):
            await ProposedEditsService(db_session).create_proposal(
                document_id=document.id,
                source="manual_ai_edit",
                proposed_content={"type": "doc", "content": [{"type": "paragraph"}]},
                proposed_by_id=author,
            )


class TestApiGuards:
    """The guards read `content_format`, so they work on any document shape."""

    def test_require_tiptap_body_rejects_docx(self):
        docx_doc = Document(content_format=CONTENT_FORMAT_DOCX)
        with pytest.raises(HTTPException) as caught:
            require_tiptap_body(docx_doc)
        assert caught.value.status_code == 409

    def test_require_tiptap_body_allows_tiptap(self):
        require_tiptap_body(Document(content_format=CONTENT_FORMAT_TIPTAP))

    def test_require_docx_body_rejects_tiptap(self):
        with pytest.raises(HTTPException) as caught:
            require_docx_body(Document(content_format=CONTENT_FORMAT_TIPTAP))
        assert caught.value.status_code == 409

    def test_require_docx_body_allows_docx(self):
        require_docx_body(Document(content_format=CONTENT_FORMAT_DOCX))

    def test_a_document_with_no_format_reads_as_tiptap(self):
        """Every pre-existing row predates the column and is TipTap; the default
        must not route one of them to a Word renderer."""
        require_tiptap_body(Document())


class TestVersionRowsAreWellFormed:
    async def test_docx_versions_carry_their_own_key(self, db_session, storage):
        from sqlalchemy import select

        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="R",
        )

        rows = (
            await db_session.execute(
                select(DocumentVersion).where(
                    DocumentVersion.document_id == document.id
                )
            )
        ).scalars().all()

        assert len(rows) == 1
        assert rows[0].content_format == CONTENT_FORMAT_DOCX
        assert rows[0].docx_storage_key == docx_version_key(document.id, 1)
        assert rows[0].docx_size_bytes == document.docx_size_bytes
        assert rows[0].content == {}


class TestNothingIsOverwritten:
    """The invariant that makes the sha trustworthy.

    Every save writes a new object and the commit repoints the row at it. Nothing
    in storage is ever mutated, so a commit that does not land leaves an
    unreferenced object — never a row whose `docx_content_sha` describes bytes
    that are no longer there, which is what would quietly void the
    optimistic-concurrency check.
    """

    async def test_each_save_adds_an_object_and_repoints_the_row(
        self, db_session, storage
    ):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(body="One."),
            title="R",
        )
        keys = [document.docx_storage_key]

        for index, body in enumerate(("Two.", "Three."), start=2):
            updated = await service.replace_docx_bytes(
                document_id=document.id,
                updated_by_id=author,
                raw=_docx_bytes(body=body),
            )
            assert updated.docx_storage_key == docx_version_key(document.id, index)
            keys.append(updated.docx_storage_key)

        # Three distinct objects, one per save, none reused.
        assert len(set(keys)) == 3
        assert sorted(storage.objects) == sorted(keys)

    async def test_the_rows_key_and_sha_always_agree_with_storage(
        self, db_session, storage
    ):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)

        document = await service.create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(body="One."),
            title="R",
        )
        await service.replace_docx_bytes(
            document_id=document.id,
            updated_by_id=author,
            raw=_docx_bytes(body="Two."),
        )

        refreshed = await service.get_document(document.id)
        stored = storage.objects[refreshed.docx_storage_key][0]
        assert compute_docx_sha(stored) == refreshed.docx_content_sha
        assert refreshed.docx_size_bytes == len(stored)
