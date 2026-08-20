"""Agent document tools.

The point worth pinning: a Word document must read as its text, not as an empty
document. `content` is `{}` for one, so a tool that walked the TipTap tree would
tell the model "this document is empty" — and a model given that will confidently
summarise nothing, which is worse than an error.
"""

import io
import uuid

import pytest

from aexy.agents.builder import TOOL_REGISTRY, AgentBuilder, CustomAgent
from aexy.agents.tools.document_tools import (
    CreateDocumentTool,
    ReadDocumentTool,
    SearchDocumentsTool,
)
from aexy.models.developer import Developer
from aexy.models.documentation import CONTENT_FORMAT_DOCX
from aexy.services.document_service import DocumentService
from tests.conftest import seed_workspace

docx = pytest.importorskip("docx", reason="python-docx is required for Word support")

pytestmark = pytest.mark.asyncio


class _FakeStorage:
    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    def is_configured(self):
        return True

    def put_object(self, key, data, content_type, **_):
        self.objects[key] = (data, content_type)
        return True

    def get_object(self, key):
        return self.objects.get(key)


@pytest.fixture
def storage(mocker):
    fake = _FakeStorage()
    mocker.patch(
        "aexy.services.document_service.get_storage_service", return_value=fake
    )
    return fake


def _docx_bytes() -> bytes:
    document = docx.Document()
    document.add_heading("Pricing policy", 1)
    document.add_paragraph("Discounts above 20% need finance sign-off.")
    table = document.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text = "Tier"
    table.rows[0].cells[1].text = "Ceiling"
    table.rows[1].cells[0].text = "Growth"
    table.rows[1].cells[1].text = "25%"
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


async def _developer(db) -> str:
    developer = Developer(id=str(uuid.uuid4()), name="Ada")
    db.add(developer)
    await db.flush()
    return str(developer.id)


class TestRegistration:
    async def test_tools_are_registered_and_categorised(self):
        """`get_available_tools` drives the agent-config UI, so a tool missing
        from the registry cannot be switched on for an agent at all."""
        for name in ("read_document", "search_documents", "create_document"):
            assert name in TOOL_REGISTRY

        categories = {
            tool["name"]: tool["category"]
            for tool in AgentBuilder.get_available_tools()
        }
        assert categories["read_document"] == "documents"
        assert categories["search_documents"] == "documents"
        assert categories["create_document"] == "documents"

    async def test_agent_injects_the_context_each_tool_needs(self, db_session):
        """A tool instantiated without its context silently returns
        "Database connection not available" for every call, which reads to the
        model as a broken workspace rather than a wiring mistake."""
        agent = CustomAgent(
            agent_name="doc reader",
            agent_goal="read documents",
            agent_prompt="You read documents.",
            tool_names=["read_document", "search_documents", "create_document"],
            workspace_id="ws-1",
            user_id="dev-1",
            db=db_session,
        )

        read = agent._create_tool_instance(ReadDocumentTool)
        assert read is not None
        assert read.workspace_id == "ws-1"
        assert read.db is db_session

        search = agent._create_tool_instance(SearchDocumentsTool)
        assert search is not None and search.workspace_id == "ws-1"

        create = agent._create_tool_instance(CreateDocumentTool)
        # Without an author a created document cannot be attributed, so the
        # agent has to pass one through.
        assert create is not None
        assert create.workspace_id == "ws-1"
        assert create.user_id == "dev-1"
        assert create.db is db_session

    async def test_the_agent_resolves_all_three_by_name(self, db_session):
        agent = CustomAgent(
            agent_name="doc reader",
            agent_goal="read documents",
            agent_prompt="You read documents.",
            tool_names=["read_document", "search_documents", "create_document"],
            workspace_id="ws-1",
            user_id="dev-1",
            db=db_session,
        )
        assert sorted(tool.name for tool in agent.tools) == [
            "create_document",
            "read_document",
            "search_documents",
        ]


class TestReadDocument:
    async def test_reads_a_word_document_as_text(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Pricing policy",
        )

        tool = ReadDocumentTool(workspace_id=workspace_id, db=db_session)
        out = await tool._arun(document_id=document.id)

        assert "Pricing policy" in out
        assert "Discounts above 20% need finance sign-off." in out
        # The table too — the old extractor dropped it, and a policy whose limits
        # live in a table would read as a policy with no limits.
        assert "25%" in out
        assert "Word document" in out

    async def test_reads_a_tiptap_document(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        service = DocumentService(db_session)
        document = await service.create_document(
            workspace_id=workspace_id, created_by_id=author, title="Runbook"
        )
        await service.update_document(
            document_id=document.id,
            updated_by_id=author,
            content={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Restart the worker."}],
                    }
                ],
            },
        )

        tool = ReadDocumentTool(workspace_id=workspace_id, db=db_session)
        out = await tool._arun(document_id=document.id)

        assert "Runbook" in out
        assert "Restart the worker." in out

    async def test_truncation_is_reported(self, db_session, storage):
        """A silently truncated document is one a model will reason about as if
        it were complete."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Pricing policy",
        )

        tool = ReadDocumentTool(workspace_id=workspace_id, db=db_session)
        out = await tool._arun(document_id=document.id, max_chars=20)

        assert "[truncated at 20 characters of" in out

    async def test_a_document_in_another_workspace_is_not_readable(
        self, db_session, storage
    ):
        mine = await seed_workspace(db_session)
        theirs = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=theirs,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Theirs",
        )

        tool = ReadDocumentTool(workspace_id=mine, db=db_session)
        out = await tool._arun(document_id=document.id)

        assert "No document" in out
        assert "Discounts above" not in out

    async def test_missing_db_is_reported_not_raised(self):
        tool = ReadDocumentTool(workspace_id="ws-1", db=None)
        assert "Error" in await tool._arun(document_id="whatever")


class TestSearchDocuments:
    async def test_finds_a_word_document_by_its_body(self, db_session, storage):
        """The body of a Word document is only searchable because extraction
        writes it to `content_text`."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Untitled upload",
        )

        tool = SearchDocumentsTool(workspace_id=workspace_id, db=db_session)
        out = await tool._arun(query="finance sign-off")

        assert "Untitled upload" in out
        assert "[Word]" in out

    async def test_no_matches_says_so(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        tool = SearchDocumentsTool(workspace_id=workspace_id, db=db_session)
        assert "No documents match" in await tool._arun(query="nothing here")


class TestCreateDocument:
    async def test_creates_a_tiptap_document_from_markdown(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)

        tool = CreateDocumentTool(
            workspace_id=workspace_id, user_id=author, db=db_session
        )
        out = await tool._arun(title="Notes", markdown="# Notes\n\nOne thing.")

        assert "Created document 'Notes'" in out

    async def test_creates_a_real_word_document(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)

        tool = CreateDocumentTool(
            workspace_id=workspace_id, user_id=author, db=db_session
        )
        out = await tool._arun(
            title="Quarterly report",
            markdown="# Q3\n\n| Metric | Value |\n| --- | --- |\n| Velocity | 42 |",
            as_word_document=True,
        )

        assert "Created Word document 'Quarterly report'" in out

        # And it really is a Word document, with the table intact.
        from sqlalchemy import select

        from aexy.models.documentation import Document
        from aexy.services.docx_service import extract_structured

        document = (
            await db_session.execute(
                select(Document).where(Document.title == "Quarterly report")
            )
        ).scalar_one()
        assert document.content_format == CONTENT_FORMAT_DOCX
        raw = storage.objects[document.docx_storage_key][0]
        extract = extract_structured(raw)
        assert extract.tables[0].rows[1] == ["Velocity", "42"]

    async def test_empty_markdown_is_reported(self, db_session, storage):
        """`markdown_to_tiptap` refuses empty input rather than saving a blank
        document, and the tool has to pass that on instead of swallowing it."""
        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)

        tool = CreateDocumentTool(
            workspace_id=workspace_id, user_id=author, db=db_session
        )
        out = await tool._arun(title="Empty", markdown="   ")

        assert "nothing to save" in out

    async def test_no_author_is_refused(self, db_session, storage):
        workspace_id = await seed_workspace(db_session)
        tool = CreateDocumentTool(workspace_id=workspace_id, user_id="", db=db_session)
        assert "Error" in await tool._arun(title="X", markdown="Body.")


class TestProposeDocxEdit:
    """An agent proposes; it never writes.

    The tool returning "Error: ..." rather than raising is deliberate — a model
    reads the string and can correct itself. What matters is that no path through
    it mutates the document.
    """

    async def test_it_queues_a_proposal_without_touching_the_document(
        self, db_session, storage
    ):
        from aexy.agents.tools.document_tools import ProposeDocxEditTool
        from aexy.services.proposed_edits_service import ProposedEditsService

        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Pricing policy",
        )
        sha_before = document.docx_content_sha

        tool = ProposeDocxEditTool(
            workspace_id=workspace_id, user_id=author, db=db_session
        )
        out = await tool._arun(
            document_id=document.id,
            summary="Raise the discount ceiling to 25%.",
            ops=[{"kind": "replace_text", "find": "25%", "replace": "30%"}],
        )

        assert "Proposed 1 edit(s)" in out
        assert "unchanged until" in out

        pending = await ProposedEditsService(db_session).list_pending(document.id)
        assert len(pending) == 1
        assert pending[0].is_docx_proposal is True
        assert pending[0].source == "agent_docx_edit"
        assert pending[0].diff_summary["summary"] == "Raise the discount ceiling to 25%."

        refreshed = await DocumentService(db_session).get_document(document.id)
        assert refreshed.docx_content_sha == sha_before

    async def test_invalid_ops_are_refused_at_propose_time(self, db_session, storage):
        """An agent told "that op was invalid" while it still has the document in
        context can write a better one; a reviewer told the same thing hours later
        can only delete it."""
        from aexy.agents.tools.document_tools import ProposeDocxEditTool
        from aexy.services.proposed_edits_service import ProposedEditsService

        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=workspace_id,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Pricing policy",
        )

        tool = ProposeDocxEditTool(
            workspace_id=workspace_id, user_id=author, db=db_session
        )
        out = await tool._arun(
            document_id=document.id,
            summary="Do something impossible.",
            ops=[{"kind": "rewrite_everything"}],
        )

        assert "cannot be applied" in out
        assert await ProposedEditsService(db_session).list_pending(document.id) == []

    async def test_a_tiptap_document_is_refused_with_a_pointer(
        self, db_session, storage
    ):
        from aexy.agents.tools.document_tools import ProposeDocxEditTool

        workspace_id = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_document(
            workspace_id=workspace_id, created_by_id=author, title="Runbook"
        )

        tool = ProposeDocxEditTool(
            workspace_id=workspace_id, user_id=author, db=db_session
        )
        out = await tool._arun(
            document_id=document.id, summary="x", ops=[{"kind": "replace_text", "find": "a"}]
        )

        assert "not a Word document" in out

    async def test_another_workspaces_document_is_invisible(self, db_session, storage):
        from aexy.agents.tools.document_tools import ProposeDocxEditTool

        mine = await seed_workspace(db_session)
        theirs = await seed_workspace(db_session)
        author = await _developer(db_session)
        document = await DocumentService(db_session).create_docx_document(
            workspace_id=theirs,
            created_by_id=author,
            raw=_docx_bytes(),
            title="Theirs",
        )

        tool = ProposeDocxEditTool(workspace_id=mine, user_id=author, db=db_session)
        out = await tool._arun(
            document_id=document.id,
            summary="x",
            ops=[{"kind": "replace_text", "find": "a"}],
        )

        assert "No document" in out

    async def test_it_is_registered_and_categorised(self):
        assert "propose_docx_edit" in TOOL_REGISTRY
        categories = {
            tool["name"]: tool["category"]
            for tool in AgentBuilder.get_available_tools()
        }
        assert categories["propose_docx_edit"] == "documents"
