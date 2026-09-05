"""Document tools for AI agents.

Reading and creating workspace documents, Word documents included.

These deliberately stop short of *editing* an existing document. An agent that
rewrites a document in place has no way to know which sentences a person wrote
and cared about, and a silent overwrite leaves nothing to compare against — the
version history records what changed but never that anyone disagreed. Aexy
already has the answer to that (`ProposedChange`, the review gate the Docs UI
renders as a banner), and wiring a Word document into it needs tracked changes to
be reviewable as a redline rather than a diff of two opaque files. That is the
next phase; until then an agent reads and creates, and a person edits.
"""

from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class ReadDocumentInput(BaseModel):
    """Input for reading a document."""

    document_id: str = Field(description="The id of the document to read")
    max_chars: int = Field(
        default=20000,
        description="Truncate the returned text at this many characters",
    )


class ReadDocumentTool(BaseTool):
    """Read a workspace document as Markdown."""

    name: str = "read_document"
    description: str = (
        "Read a document from the workspace docs. Returns its title and body as "
        "Markdown. Works for both ordinary documents and uploaded Word (.docx) "
        "documents, including their tables and headings."
    )
    args_schema: type[BaseModel] = ReadDocumentInput
    workspace_id: str = ""
    user_id: str = ""
    db: Any = None

    def _run(self, document_id: str, max_chars: int = 20000) -> str:
        return "Reading a document requires the async runtime."

    async def _arun(self, document_id: str, max_chars: int = 20000) -> str:
        """Read a document, whatever its body format.

        Reads `content_text` rather than walking `content`: for a Word document
        `content` is `{}` and a TipTap walker would report an empty document
        rather than an error. `content_text` holds the extracted Markdown for
        both formats, which is exactly what a model should be given.
        """
        from sqlalchemy import select

        from aexy.models.documentation import Document

        if not self.db or not self.workspace_id:
            return "Error: Database connection not available"

        try:
            result = await self.db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.workspace_id == self.workspace_id,
                )
            )
            document = result.scalar_one_or_none()
            if document is None or document.deleted_at is not None:
                return f"No document {document_id} in this workspace."

            # The agent reads as its principal, not as the workspace. Without
            # this a "summarise document X" prompt reads any private page whose
            # id the model has seen — including one it saw in an earlier,
            # differently-scoped conversation.
            from aexy.services.document_access import AccessLevel, DocumentAccess

            if not self.user_id:
                return (
                    "Error: this agent has no user to act for, so it cannot "
                    "read documents."
                )
            level = await DocumentAccess(self.db).resolve(
                document, self.user_id, workspace_id=self.workspace_id
            )
            if level == AccessLevel.NONE:
                return f"No document {document_id} in this workspace."

            body = document.content_text or ""
            if not body.strip() and not document.is_docx:
                # A TipTap document whose text was never extracted; fall back to
                # walking the tree rather than reporting it as empty.
                from aexy.services.document_service import DocumentService

                body = DocumentService(self.db)._extract_text(document.content or {})

            if not body.strip():
                return f"'{document.title}' has no readable text."

            truncated = body[:max_chars]
            suffix = (
                f"\n\n[truncated at {max_chars} characters of {len(body)}]"
                if len(body) > max_chars
                else ""
            )
            kind = "Word document" if document.is_docx else "document"
            return f"# {document.title}\n({kind})\n\n{truncated}{suffix}"
        except Exception as exc:  # noqa: BLE001
            return f"Error reading document: {exc}"


class SearchDocumentsInput(BaseModel):
    """Input for searching documents."""

    query: str = Field(description="Text to search for in document titles and bodies")
    limit: int = Field(default=10, description="Maximum number of results")


class SearchDocumentsTool(BaseTool):
    """Find documents in the workspace by their text."""

    name: str = "search_documents"
    description: str = (
        "Search the workspace's documents by title and body text. Returns "
        "matching document ids, titles and a snippet. Use this to find a "
        "document id before calling read_document."
    )
    args_schema: type[BaseModel] = SearchDocumentsInput
    workspace_id: str = ""
    user_id: str = ""
    db: Any = None

    def _run(self, query: str, limit: int = 10) -> str:
        return "Searching documents requires the async runtime."

    async def _arun(self, query: str, limit: int = 10) -> str:
        if not self.db or not self.workspace_id:
            return "Error: Database connection not available"

        try:
            from aexy.services.document_access import DocumentAccess
            from aexy.services.document_service import DocumentService

            # An agent sees exactly what the person it is acting for sees.
            # Refusing outright when there is no user is deliberate: an agent
            # with no principal has no basis for reading anything, and the
            # obvious alternative — search the whole workspace — is the leak.
            if not self.user_id:
                return (
                    "Error: this agent has no user to act for, so it cannot "
                    "search documents."
                )

            clause = await DocumentAccess(self.db).visible_clause(
                self.workspace_id, self.user_id
            )
            hits = await DocumentService(self.db).search_documents(
                workspace_id=self.workspace_id,
                query=query,
                limit=limit,
                access_clause=clause,
            )
            if not hits:
                return f"No documents match '{query}'."

            lines = []
            for hit in hits:
                document = hit.document
                snippet = " ".join((hit.snippet or document.content_text or "").split())[
                    :200
                ]
                kind = " [Word]" if document.is_docx else ""
                lines.append(
                    f"- {document.title}{kind} (id: {document.id})"
                    + (f"\n  {snippet}" if snippet else "")
                )
            return "\n".join(lines)
        except Exception as exc:  # noqa: BLE001
            return f"Error searching documents: {exc}"


class CreateDocumentInput(BaseModel):
    """Input for creating a document."""

    title: str = Field(description="Title for the new document")
    markdown: str = Field(
        description=(
            "The document body as Markdown. Headings, lists, tables, code "
            "blocks, blockquotes and inline bold/italic/links are supported."
        )
    )
    as_word_document: bool = Field(
        default=False,
        description=(
            "Create a Word (.docx) document instead of an ordinary one. Choose "
            "this when the result is meant to be downloaded, sent to someone "
            "outside the workspace, or opened in Word."
        ),
    )
    parent_id: str | None = Field(
        default=None, description="Optional parent document id to nest under"
    )


class CreateDocumentTool(BaseTool):
    """Create a new workspace document from Markdown."""

    name: str = "create_document"
    description: str = (
        "Create a new document in the workspace docs from Markdown. Can produce "
        "either an ordinary Aexy document or a real Word (.docx) document. "
        "Creates a new document only — it never modifies an existing one."
    )
    args_schema: type[BaseModel] = CreateDocumentInput
    workspace_id: str = ""
    user_id: str = ""
    db: Any = None

    def _run(self, title: str, markdown: str, **_: Any) -> str:
        return "Creating a document requires the async runtime."

    async def _arun(
        self,
        title: str,
        markdown: str,
        as_word_document: bool = False,
        parent_id: str | None = None,
    ) -> str:
        if not self.db or not self.workspace_id:
            return "Error: Database connection not available"
        if not self.user_id:
            return "Error: No author to attribute this document to"

        try:
            from aexy.services.document_service import DocumentService
            from aexy.services.markdown_to_tiptap import (
                MarkdownError,
                markdown_to_tiptap,
            )

            service = DocumentService(self.db)

            if as_word_document:
                from aexy.services.docx_service import render_docx

                document = await service.create_docx_document(
                    workspace_id=self.workspace_id,
                    created_by_id=self.user_id,
                    raw=render_docx(markdown),
                    title=title,
                    parent_id=parent_id,
                )
                return (
                    f"Created Word document '{document.title}' (id: {document.id})."
                )

            try:
                content = markdown_to_tiptap(markdown)
            except MarkdownError as exc:
                return f"That Markdown produced nothing to save: {exc}"

            document = await service.create_document(
                workspace_id=self.workspace_id,
                created_by_id=self.user_id,
                title=title,
                content=content,
                parent_id=parent_id,
            )
            return f"Created document '{document.title}' (id: {document.id})."
        except Exception as exc:  # noqa: BLE001
            return f"Error creating document: {exc}"


class ProposeDocxEditInput(BaseModel):
    """Input for proposing an edit to a Word document."""

    document_id: str = Field(description="The id of the Word document to edit")
    summary: str = Field(
        description=(
            "One sentence a reviewer will read before opening the redline, "
            "saying what this changes and why."
        )
    )
    ops: list[dict[str, Any]] = Field(
        description=(
            "The edits, applied in order. Each op is an object with a 'kind':\n"
            '- {"kind": "replace_text", "find": "...", "replace": "...", '
            '"count": <optional expected occurrences>}\n'
            '- {"kind": "set_table_cell", "table_index": 0, "row": 1, '
            '"column": 2, "text": "..."}\n'
            '- {"kind": "append_section", "heading": "...", "level": 2, '
            '"markdown": "..."}\n'
            '- {"kind": "replace_section_body", "heading": "...", '
            '"markdown": "..."}\n'
            "Prefer the narrowest op that expresses the change: replacing one "
            "phrase is reviewable, replacing a whole section is not."
        )
    )


class ProposeDocxEditTool(BaseTool):
    """Propose an edit to a Word document, for a person to review."""

    name: str = "propose_docx_edit"
    description: str = (
        "Propose changes to an existing Word (.docx) document. This does NOT "
        "modify the document — it queues a proposal that a person reviews as "
        "tracked changes and then accepts or rejects. Use this instead of "
        "rewriting a document: it is the only way to change one that already has "
        "content."
    )
    args_schema: type[BaseModel] = ProposeDocxEditInput
    workspace_id: str = ""
    user_id: str = ""
    db: Any = None

    def _run(self, document_id: str, summary: str, ops: list[dict[str, Any]]) -> str:
        return "Proposing an edit requires the async runtime."

    async def _arun(
        self, document_id: str, summary: str, ops: list[dict[str, Any]]
    ) -> str:
        """Queue the proposal, having first checked it could actually apply.

        The ops are validated here rather than at approve time. An agent handed
        "that op was invalid" while it still has the document in context can
        write a better one; a reviewer told the same thing hours later can only
        delete it.
        """
        from sqlalchemy import select

        from aexy.models.documentation import Document, ProposedEditSource
        from aexy.services.docx_service import DocxOpUnsupported, validate_ops
        from aexy.services.proposed_edits_service import ProposedEditsService

        if not self.db or not self.workspace_id:
            return "Error: Database connection not available"

        try:
            result = await self.db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.workspace_id == self.workspace_id,
                )
            )
            document = result.scalar_one_or_none()
            if document is None:
                return f"No document {document_id} in this workspace."
            if not document.is_docx:
                return (
                    f"'{document.title}' is not a Word document. Editing an "
                    "ordinary document goes through the document update API, "
                    "which queues its own proposal."
                )

            try:
                validate_ops(ops)
            except DocxOpUnsupported as exc:
                return f"That edit cannot be applied: {exc}"

            proposal = await ProposedEditsService(self.db).create_proposal(
                document_id=document_id,
                source=ProposedEditSource.AGENT_DOCX_EDIT,
                proposed_ops=ops,
                proposed_by_id=self.user_id or None,
                diff_summary={"summary": summary, "op_count": len(ops)},
            )
            return (
                f"Proposed {len(ops)} edit(s) to '{document.title}' for review "
                f"(proposal {proposal.id}). The document is unchanged until "
                "someone accepts the tracked changes."
            )
        except Exception as exc:  # noqa: BLE001
            return f"Error proposing edit: {exc}"
