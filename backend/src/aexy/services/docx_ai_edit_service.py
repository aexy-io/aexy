"""Asking a model to draft an edit to a Word document.

The model decides *what* changes; it never writes anything. Its answer is an op
list, persisted as a ``ProposedChange`` and reviewed as tracked changes a person
accepts or rejects one at a time. That split is the whole design: Python is a bad
place to write OOXML redlines, and an LLM is a bad place to be trusted with a
contract.

Three things arrive here from three different doors — an in-editor panel, a
background job, and somebody tagging the handle in a Word comment — and all
three land on ``draft_edit``. There is one prompt, one validator and one
proposal shape, because a suggestion that behaves differently depending on how
it was asked for is a suggestion nobody can review consistently.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.gateway import get_llm_gateway
from aexy.llm.json_utils import extract_json_object
from aexy.models.documentation import (
    CONTENT_FORMAT_DOCX,
    Document,
    ProposedEditSource,
)
from aexy.models.proposed_change import ProposedChange
from aexy.services import docx_ai_settings
from aexy.services.docx_service import (
    BROWSER_ONLY_OPS,
    DocxComment,
    DocxOpUnsupported,
    DocxParagraph,
    DocxReadError,
    extract_comments,
    extract_structured,
    validate_ops,
)
from aexy.services.proposed_edits_service import ProposedEditsService

logger = logging.getLogger(__name__)

Scope = Literal["document", "selection"]


class DocxAiEditError(Exception):
    """The draft could not be produced, with a reason worth showing a person."""


class DocxAiDisabledError(DocxAiEditError):
    """This workspace has AI editing of Word documents switched off."""


# How much of a document goes into one prompt. A 300-page contract will not fit
# any context window, and the failure of a silent overrun is the worst kind: the
# model answers about the part it saw and the reviewer cannot tell.
_MAX_PROMPT_CHARS = 60_000

# Enough for a summary plus twenty-five ops of a sentence or two each.
_TOKENS_ESTIMATE = 4000

_SUMMARY_MAX = 400


SYSTEM_PROMPT = """You edit Word documents for the Aexy platform. You are given \
a document as a numbered list of paragraphs, and a request. You reply with a \
JSON object describing the edits.

Output JSON shape:
{
  "summary": "One sentence a reviewer reads before opening the redline.",
  "ops": [ ... ]
}

Op kinds:

- {"kind": "replace_text", "find": "exact text from a paragraph", \
"replace": "new text", "count": <optional expected number of occurrences>}
- {"kind": "set_table_cell", "table_index": 0, "row": 1, "column": 2, \
"text": "new cell text"}
- {"kind": "append_section", "heading": "New heading", "level": 2, \
"markdown": "The section body."}
- {"kind": "replace_section_body", "heading": "Existing heading", \
"markdown": "The replacement body."}
- {"kind": "add_comment", "anchor_find": "exact text from a paragraph", \
"text": "the remark"}
- {"kind": "reply_to_comment", "comment_id": "0", "text": "the reply"}
- {"kind": "resolve_comment", "comment_id": "0"}

Rules:
1. `find` and `anchor_find` MUST be copied character for character from the \
paragraph text you were given. They are matched exactly. Do not add markdown \
emphasis, do not fix spacing, do not paraphrase.
2. Prefer the narrowest op that expresses the change. Replacing one phrase is \
reviewable; replacing a whole section is not.
3. Use `add_comment` when you have a concern you should not silently guess at — \
a clause contradicting another section, a figure you cannot verify. Do not \
rewrite text on a guess and do not leave a comment about a change you already \
made.
4. When you are answering a comment, reply to it AND make the edit it asked \
for. Add a `resolve_comment` for it only when your edit fully settles it.
5. Only `set_table_cell` may change a table cell. Do not use `replace_text` on \
cell contents.
6. Make no edit you were not asked for. A document is somebody's work, not a \
draft to improve.

Reply with valid JSON only — no prose, no backticks, no commentary."""


@dataclass(frozen=True)
class DraftRequest:
    """What to ask for, independent of which door it came in through."""

    document_id: str
    requested_by_id: str | None = None
    instruction: str | None = None
    """Free text from a person. Absent for a pure "address the comments" run."""
    selection_text: str | None = None
    scope: Scope = "document"
    address_comments: bool = False
    """Read the document's own comment threads and answer them."""
    comment_ids: tuple[str, ...] = ()
    """Answer only these comments. Used by the mention trigger."""
    trigger: dict[str, Any] | None = None
    """Recorded on the proposal: what caused this, for the review queue."""


def _render_paragraphs(paragraphs: list[DocxParagraph]) -> tuple[str, bool]:
    """The document as the model sees it, and whether it had to be cut short.

    Plain text, not the Markdown extraction, because `find` is matched against
    exactly these strings. A model handed `**Tier**` writes a `find` containing
    asterisks the document does not contain, and the reviewer opens an empty
    redline with nothing to explain it.
    """
    lines: list[str] = []
    used = 0
    truncated = False
    for paragraph in paragraphs:
        prefix = f"[{paragraph.index}]"
        if paragraph.heading_level:
            prefix += f" (heading {paragraph.heading_level})"
        elif paragraph.in_table:
            prefix += " (table cell)"
        line = f"{prefix} {paragraph.text}"
        if used + len(line) > _MAX_PROMPT_CHARS:
            truncated = True
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines), truncated


def _render_tables(extract: Any) -> str:
    """Table coordinates, so `set_table_cell` has something to address.

    The automation protocol has no table operations, so a cell is only reachable
    by `(table_index, row, column)` — which means the model has to be told what
    those coordinates hold.
    """
    if not extract.tables:
        return ""
    blocks: list[str] = []
    for index, table in enumerate(extract.tables):
        rows = [
            f"  row {row_index}: "
            + " | ".join(f"[col {col}] {cell}" for col, cell in enumerate(row))
            for row_index, row in enumerate(table.rows)
        ]
        blocks.append(f"Table {index}:\n" + "\n".join(rows))
    return "\n\n".join(blocks)


def _render_comments(comments: list[DocxComment]) -> str:
    """Open comment threads, with the words each one is about.

    Resolved threads are left out: they have been dealt with, and offering them
    invites the model to reopen a settled argument.
    """
    lines: list[str] = []
    for comment in comments:
        if comment.resolved:
            continue
        who = comment.author or "someone"
        kind = "reply to" if comment.is_reply else "comment"
        about = f' about "{comment.anchor_text}"' if comment.anchor_text else ""
        lines.append(f"[comment {comment.id}] {kind} by {who}{about}: {comment.text}")
    return "\n".join(lines)


def _build_user_prompt(
    extract: Any,
    comments: list[DocxComment],
    request: DraftRequest,
) -> str:
    body, truncated = _render_paragraphs(extract.paragraphs)

    parts: list[str] = []
    if request.instruction:
        parts.append(f"Request: {request.instruction.strip()}")

    if request.selection_text and request.scope == "selection":
        parts.append(
            "The reader has selected this text and the request is about it. "
            "Change nothing outside it:\n"
            f"{request.selection_text.strip()}"
        )

    if request.address_comments:
        wanted = comments
        if request.comment_ids:
            wanted = [c for c in comments if c.id in request.comment_ids]
            parts.append(
                "Answer these comments and nothing else: "
                + ", ".join(request.comment_ids)
            )
        else:
            parts.append("Answer the open comments below.")
        rendered = _render_comments(wanted)
        if rendered:
            parts.append(f"Comments:\n{rendered}")

    parts.append(f"Document paragraphs:\n{body}")

    tables = _render_tables(extract)
    if tables:
        parts.append(f"Tables:\n{tables}")

    if truncated:
        # Said out loud, because the alternative is a model confidently
        # answering about a document it only partly read.
        parts.append(
            "NOTE: this document was too long to include in full. You are seeing "
            "the beginning of it. Do not propose edits to parts you cannot see, "
            "and say so in your summary."
        )

    parts.append("Return JSON only.")
    return "\n\n".join(parts)


def _coerce_ops(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """The summary and the op list, or a refusal naming what was wrong."""
    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise DocxAiEditError("The model did not say what its edit changes.")

    ops = payload.get("ops")
    if not isinstance(ops, list) or not ops:
        raise DocxAiEditError("The model proposed no edits.")
    if not all(isinstance(op, dict) for op in ops):
        raise DocxAiEditError("The model's edits were not all objects.")

    return summary.strip()[:_SUMMARY_MAX], ops


def _check_ops_against_document(
    ops: list[dict[str, Any]],
    paragraphs: list[DocxParagraph],
    comments: list[DocxComment],
) -> None:
    """Refuse an op that cannot possibly apply, while we can still say why.

    ``validate_ops`` checks shape without the document. This is the other half:
    a ``find`` the document does not contain is the single most common way a
    model's edit fails, and it fails *silently* — the browser reports the op
    skipped, the reviewer sees a redline missing a change nobody mentioned. Far
    better to refuse the draft and let the caller ask again.
    """
    texts = [paragraph.text for paragraph in paragraphs]
    comment_ids = {comment.id for comment in comments}

    for index, op in enumerate(ops):
        kind = op.get("kind")

        if kind in ("replace_text", "add_comment"):
            field = "find" if kind == "replace_text" else "anchor_find"
            needle = op.get(field)
            if not isinstance(needle, str) or not needle:
                raise DocxAiEditError(f"Edit {index + 1} has no text to look for.")
            if not any(needle in text for text in texts):
                raise DocxAiEditError(
                    f"Edit {index + 1} looks for text this document does not "
                    f"contain: {needle!r}."
                )

        elif kind in ("reply_to_comment", "resolve_comment"):
            target = op.get("comment_id")
            if str(target) not in comment_ids:
                raise DocxAiEditError(
                    f"Edit {index + 1} answers comment {target!r}, which is not "
                    "in this document."
                )


class DocxAiEditService:
    """Drafts an edit to a Word document and queues it for review."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def draft_edit(self, request: DraftRequest) -> ProposedChange:
        """Ask the model for an edit and store it as a pending proposal.

        Raises ``DocxAiEditError`` — or ``DocxAiDisabledError`` — with a message
        written for a person, because every caller has somebody waiting: the
        panel shows it, the background job records it, and the mention trigger
        replies with it.
        """
        document = await self.db.get(Document, request.document_id)
        if document is None:
            raise DocxAiEditError("That document no longer exists.")
        if document.content_format != CONTENT_FORMAT_DOCX:
            raise DocxAiEditError(
                "This is not a Word document. Ask the AI for a rewrite instead."
            )

        workspace_id = str(document.workspace_id) if document.workspace_id else None
        settings = (
            await docx_ai_settings.get_settings(self.db, workspace_id)
            if workspace_id
            else docx_ai_settings.DocxAiSettings()
        )
        # Checked here rather than only at the route, so the background activity
        # and the save-time mention scan are covered by the same rule — the
        # argument `LLMGateway._ensure_ai_enabled` makes for the kill switch.
        if not settings.enabled:
            raise DocxAiDisabledError(
                "AI editing of Word documents is switched off for this workspace."
            )

        if not request.instruction and not request.address_comments:
            raise DocxAiEditError("Say what the AI should change.")

        raw = await self._load_bytes(request.document_id)
        try:
            extract = extract_structured(raw)
        except DocxReadError as exc:
            raise DocxAiEditError(f"That document could not be read: {exc}") from exc

        comments: list[DocxComment] = []
        if request.address_comments:
            try:
                comments = extract_comments(raw)
            except DocxReadError:
                comments = []
            if not comments:
                raise DocxAiEditError("This document has no comments to answer.")

        gateway = get_llm_gateway()
        if gateway is None:
            raise DocxAiEditError("No AI provider is configured.")

        user_prompt = _build_user_prompt(extract, comments, request)
        # `workspace_id` is what applies the workspace kill switch and a BYO
        # provider key. Omitting it silently bypasses both.
        #
        # `feature` is how the workspace's model choice for Word editing is
        # found — set at /settings/ai/models, resolved in llm/resolution.py.
        response, *_ = await gateway.call_llm(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            tokens_estimate=_TOKENS_ESTIMATE,
            workspace_id=workspace_id,
            developer_id=request.requested_by_id,
            db=self.db,
            feature="docs.docx_edit",
        )

        payload = extract_json_object(response)
        if payload is None:
            logger.warning("docx_ai_edit: unparseable response for %s", request.document_id)
            raise DocxAiEditError("The AI's answer could not be read. Try again.")

        summary, ops = _coerce_ops(payload)
        ops = self._enforce_policy(ops, settings)

        try:
            validate_ops(ops)
        except DocxOpUnsupported as exc:
            raise DocxAiEditError(str(exc)) from exc

        _check_ops_against_document(ops, extract.paragraphs, comments)

        return await ProposedEditsService(self.db).create_proposal(
            document_id=request.document_id,
            source=ProposedEditSource.AGENT_DOCX_EDIT,
            proposed_ops=ops,
            proposed_by_id=request.requested_by_id,
            diff_summary={"summary": summary, "op_count": len(ops)},
            trigger=request.trigger,
            notify_owner=settings.notify_owner,
        )

    def _enforce_policy(
        self,
        ops: list[dict[str, Any]],
        settings: docx_ai_settings.DocxAiSettings,
    ) -> list[dict[str, Any]]:
        """Apply the workspace's limits to what the model came back with.

        Comment ops are DROPPED when the workspace disallows them, rather than
        failing the draft: the model chose to raise a concern instead of
        rewriting, and losing the remark is a smaller harm than losing the edits
        that came with it. Over the cap is a refusal, because silently keeping
        the first twenty-five of forty changes would hand a reviewer a redline
        that is not the proposal.
        """
        if not settings.allow_ai_comments:
            kept = [op for op in ops if op.get("kind") not in BROWSER_ONLY_OPS]
            if len(kept) != len(ops):
                logger.info(
                    "docx_ai_edit.comments_dropped count=%d", len(ops) - len(kept)
                )
            if not kept:
                raise DocxAiEditError(
                    "The AI had a question rather than an edit, and comments are "
                    "switched off for this workspace."
                )
            ops = kept

        if len(ops) > settings.max_ops:
            raise DocxAiEditError(
                f"The AI proposed {len(ops)} changes, more than this workspace's "
                f"limit of {settings.max_ops}. Ask for something narrower."
            )
        return ops

    async def _load_bytes(self, document_id: str) -> bytes:
        """The document's current bytes.

        Imported inside the method: `DocumentService` reaches storage and pulls
        in the object-store client, which this module has no other reason to
        depend on.
        """
        from aexy.services.document_service import DocumentService

        raw = await DocumentService(self.db).get_docx_bytes(document_id)
        if raw is None:
            # None means the row has no storage key or storage would not answer.
            # Distinguished from an unreadable package, which extract_structured
            # reports, because the fixes are different: one is ours.
            raise DocxAiEditError(
                "This document's file could not be loaded. Try again in a moment."
            )
        return raw
