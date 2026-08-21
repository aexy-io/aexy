"""Turning a Word document into issues, in two steps.

A document arrives with work in it — a numbered requirements spec, a client's
review with twenty comments in the margin, a QA report where every finding is a
defect. Retyping that into a board is the job nobody does, so it stays in the
document and stops being tracked.

**Two steps, on purpose.** ``preview`` reads and proposes; ``create`` writes.
Nothing reaches a board until a person has seen the list and taken things off it.
That is not politeness — these rows become work a team is measured against, and a
model that mistook a heading for a deliverable would put a phantom task in
somebody's sprint. The same reasoning the edit path uses for its redline gate,
with a lighter mechanism because there is no document to mark up.

**Both pickers belong to the run, not the workspace.** The same document read for
"unresolved comments → tickets" and for "requirements → sprint tasks" is two
different asks, and a workspace-level default would make one of them wrong. So
the caller names the sources and the target every time.

The three sources answer different questions and combine:

* ``comments`` — every open comment thread. What a reviewer actually marked up,
  and the highest-signal source in a document that has been through review.
  Reuses the extraction the ``@aexy`` trigger reads.
* ``markers`` — ``TODO``, ``ACTION``, ``FIXME`` and friends in the body text.
  Predictable and free: no model call, no cost, and no judgement.
* ``model`` — the AI reads the document and proposes a list. Finds work that is
  neither commented nor tagged, which is most of it in a spec written by
  somebody who was not thinking about a tracker.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.documentation import CONTENT_FORMAT_DOCX, Document
from aexy.services.docx_service import (
    DocxReadError,
    extract_comments,
    extract_structured,
)

logger = logging.getLogger(__name__)

Source = Literal["comments", "markers", "model"]
Target = Literal["sprint_task", "bug", "user_story", "ticket"]

SOURCES: tuple[Source, ...] = ("comments", "markers", "model")
TARGETS: tuple[Target, ...] = ("sprint_task", "bug", "user_story", "ticket")

# Words people actually leave in a document when they mean "somebody do this".
# Deliberately anchored at a word boundary and case-insensitive: `TODO`, `To-do:`
# and `todo` are the same intent, while `ACTIONABLE` is not a marker.
_MARKER = re.compile(
    r"\b(TODO|TO-?DO|FIXME|ACTION|ACTION ITEM|AI|TBD|XXX|FOLLOW ?UP|OPEN ISSUE)\b"
    r"\s*[:\-–]?\s*",
    re.IGNORECASE,
)

# `AI` is in the pattern because "AI:" is a common shorthand for "action item" in
# minutes — but it is also two letters that appear constantly in a document about
# artificial intelligence. Only counted when it is followed by a separator, which
# "AI features" is not.
_BARE_AI = re.compile(r"\bAI\b(?!\s*[:\-–])", re.IGNORECASE)

_MAX_CANDIDATES = 100
_MAX_PROMPT_CHARS = 40_000

_SYSTEM_PROMPT = """You read a document and list the work it implies.

Return JSON only: {"issues": [{"title": "...", "detail": "...", "kind": "..."}]}

Rules:
- `title` is one imperative line under 120 characters — "Add rate limiting to the
  export endpoint", not "Rate limiting".
- `detail` quotes or paraphrases the part of the document that says so. A person
  reading the issue on a board has not read the document.
- `kind` is one of: requirement, defect, question, action.
- List only work that is genuinely implied. A heading is not a deliverable, and a
  sentence describing how something already works is not a task. An empty list is
  a correct answer for a document that contains no work.
- Do not invent scope. If the document is vague, say so in `detail` rather than
  guessing at what was meant.
"""


# "As a finance manager, I want to export the ledger, so that I can reconcile."
#
# Specs written for a tracker say this literally, and when they do there is no
# reason to guess: the persona is on the page. Tolerant of the punctuation people
# actually use (comma, semicolon, dash, or nothing) and of "I'd like" / "I need"
# in place of "I want".
_STORY_FORM = re.compile(
    r"\bas\s+an?\s+(?P<as_a>.+?)"
    r"[,;:\-–\s]+i\s*(?:want|need|would\s+like|'d\s+like)\s+(?:to\s+)?(?P<i_want>.+?)"
    r"(?:[,;:\-–\s]+so\s+that\s+(?P<so_that>.+?))?"
    r"[.\s]*$",
    re.IGNORECASE | re.DOTALL,
)


def parse_story_form(text: str) -> dict[str, str] | None:
    """The three parts of a user story, if the text states them.

    Returns None when it does not, which is the common case and not a failure —
    "The system shall support CSV export" is a requirement with no persona in it,
    and inventing one would be putting words in a stakeholder's mouth.
    """
    flat = " ".join((text or "").split())
    if not flat:
        return None
    match = _STORY_FORM.search(flat)
    if match is None:
        return None

    as_a = (match.group("as_a") or "").strip(" ,;:-–")
    i_want = (match.group("i_want") or "").strip(" ,;:-–")
    if not as_a or not i_want:
        return None

    parts = {"as_a": as_a, "i_want": i_want}
    so_that = (match.group("so_that") or "").strip(" ,;:-–")
    if so_that:
        parts["so_that"] = so_that
    return parts


@dataclass
class Candidate:
    """One proposed issue, and where in the document it came from.

    ``origin`` matters more than it looks: a person deciding whether to keep a
    row needs to know whether a reviewer wrote it in a comment, an author tagged
    it, or a model inferred it. Those warrant different amounts of trust.
    """

    title: str
    detail: str = ""
    source: Source = "model"
    kind: str = "action"
    origin: str = ""
    """Human description of where it came from — "Priya's comment", "§4.2"."""
    comment_id: str | None = None
    paragraph_index: int | None = None

    #: The three parts of a user story, when the document stated them. Absent
    #: when it did not, which is why `CreateOptions.default_persona` exists.
    as_a: str | None = None
    i_want: str | None = None
    so_that: str | None = None


@dataclass
class CreateOptions:
    """What a target needs beyond a title, when it needs anything.

    Each of the four has its own creation protocol, and pretending otherwise is
    how you get a row that exists but belongs nowhere.
    """

    #: `sprint_task` only. A task has to live in a sprint.
    sprint_id: str | None = None
    #: `ticket` only. A ticket belongs to a form — that is what defines its
    #: fields, its SLA and who it is for. There is no sensible default.
    form_id: str | None = None
    #: `user_story` only. Who the story is for, when the document did not say.
    #:
    #: A story's `as_a` is required by the model, and most documents are not
    #: written in story form — so this is asked of the person rather than guessed
    #: at. It used to be filled with a placeholder, which put a fake stakeholder
    #: on a backlog and made every imported story say the same meaningless thing.
    default_persona: str | None = None

    #: Applied to every created row, so a batch can be found again.
    labels: list[str] = field(default_factory=list)
    assignee_id: str | None = None


class DocxIntakeError(Exception):
    """The intake could not run, with a reason worth showing a person."""


class DocxIntakeService:
    """Reads a Word document for work items, and creates them on request."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── step one: read and propose ──

    async def preview(
        self,
        document_id: str,
        sources: tuple[Source, ...],
        requested_by_id: str | None = None,
    ) -> list[Candidate]:
        """Propose issues. Writes nothing.

        Sources are unioned and then de-duplicated by title, because a
        requirement that somebody also commented on is one piece of work, not
        two. The comment wins on a tie: a person wrote it.
        """
        unknown = [s for s in sources if s not in SOURCES]
        if unknown:
            raise DocxIntakeError(f"Unknown source: {', '.join(unknown)}")
        if not sources:
            raise DocxIntakeError("Choose at least one place to read from.")

        document = await self.db.get(Document, document_id)
        if document is None:
            raise DocxIntakeError("That document no longer exists.")
        if document.content_format != CONTENT_FORMAT_DOCX:
            raise DocxIntakeError("This is not a Word document.")

        raw = await self._load_bytes(document_id)

        found: list[Candidate] = []
        # Comments first, so a person's own words win the de-duplication below.
        if "comments" in sources:
            found.extend(self._from_comments(raw))
        if "markers" in sources:
            found.extend(self._from_markers(raw))
        if "model" in sources:
            found.extend(
                await self._from_model(
                    raw,
                    workspace_id=(
                        str(document.workspace_id) if document.workspace_id else None
                    ),
                    requested_by_id=requested_by_id,
                )
            )

        return self._with_story_parts(self._dedupe(found))[:_MAX_CANDIDATES]

    def _from_comments(self, raw: bytes) -> list[Candidate]:
        """Every open comment thread as a candidate.

        Resolved threads are skipped for the same reason the edit trigger skips
        them: somebody marked that conversation finished, and reopening it as a
        task is not what they meant. Replies are skipped too — a thread is one
        piece of work, and its first message is the ask.
        """
        try:
            comments = extract_comments(raw)
        except DocxReadError:
            return []

        out: list[Candidate] = []
        for comment in comments:
            if comment.resolved or comment.is_reply:
                continue
            text = " ".join(comment.text.split())
            if not text:
                continue
            out.append(
                Candidate(
                    title=_as_title(text),
                    detail=(
                        f'On "{comment.anchor_text}": {text}'
                        if comment.anchor_text
                        else text
                    ),
                    source="comments",
                    kind="question",
                    origin=f"{comment.author}'s comment" if comment.author else "a comment",
                    comment_id=comment.id,
                )
            )
        return out

    def _from_markers(self, raw: bytes) -> list[Candidate]:
        """Paragraphs carrying a TODO-style marker.

        No model call, so this costs nothing and never surprises anybody — the
        trade is that it only finds work somebody already tagged.
        """
        try:
            extract = extract_structured(raw)
        except DocxReadError:
            return []

        out: list[Candidate] = []
        for paragraph in extract.paragraphs:
            text = " ".join((paragraph.text or "").split())
            if not text:
                continue
            match = _MARKER.search(text)
            if match is None:
                continue
            # "AI features" is not an action item. See `_BARE_AI`.
            if match.group(1).upper() == "AI" and _BARE_AI.search(match.group(0)):
                continue
            remainder = text[match.end() :].strip() or text
            out.append(
                Candidate(
                    title=_as_title(remainder),
                    detail=text,
                    source="markers",
                    kind="action",
                    origin=f"paragraph {paragraph.index}",
                    paragraph_index=paragraph.index,
                )
            )
        return out

    async def _from_model(
        self,
        raw: bytes,
        workspace_id: str | None,
        requested_by_id: str | None,
    ) -> list[Candidate]:
        """Ask the model what work the document implies.

        Goes through the gateway with a registered feature id, so the workspace
        kill switch, its credential and its model choice all apply — the same
        rule every other AI call in the product follows.
        """
        from aexy.llm.gateway import get_llm_gateway

        gateway = get_llm_gateway()
        if gateway is None:
            raise DocxIntakeError(
                "No AI provider is configured, so the document cannot be read "
                "for work items. Comments and markers still work."
            )

        try:
            extract = extract_structured(raw)
        except DocxReadError as exc:
            raise DocxIntakeError(f"That document could not be read: {exc}") from exc

        body = "\n".join(
            f"[{p.index}] {p.text}" for p in extract.paragraphs if (p.text or "").strip()
        )[:_MAX_PROMPT_CHARS]
        if not body.strip():
            return []

        response, *_ = await gateway.call_llm(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=body,
            tokens_estimate=len(body) // 3,
            workspace_id=workspace_id,
            developer_id=requested_by_id,
            db=self.db,
            feature="docs.docx_intake",
        )

        try:
            parsed = json.loads(_json_slice(response))
            issues = parsed.get("issues") or []
        except (json.JSONDecodeError, AttributeError):
            logger.warning("docx_intake.unparseable_response")
            raise DocxIntakeError(
                "The AI's answer could not be read. Try again, or use comments "
                "and markers instead."
            ) from None

        out: list[Candidate] = []
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            title = _as_title(str(issue.get("title") or ""))
            if not title:
                continue
            out.append(
                Candidate(
                    title=title,
                    detail=str(issue.get("detail") or ""),
                    source="model",
                    kind=str(issue.get("kind") or "action"),
                    origin="found by the AI",
                )
            )
        return out

    @staticmethod
    def _with_story_parts(candidates: list[Candidate]) -> list[Candidate]:
        """Fill in the story form wherever the text already states it.

        Applied to every source, not just the model's: "As a reviewer, I want…"
        is a story sentence whether somebody typed it in a comment, tagged it
        with TODO, or the model repeated it back.

        Reads the detail first and falls back to the title, because the title is
        shortened and may have cut the "so that" clause off.
        """
        for candidate in candidates:
            if candidate.as_a:
                continue
            parts = parse_story_form(candidate.detail) or parse_story_form(
                candidate.title
            )
            if parts:
                candidate.as_a = parts["as_a"]
                candidate.i_want = parts["i_want"]
                candidate.so_that = parts.get("so_that")
        return candidates

    @staticmethod
    def _dedupe(candidates: list[Candidate]) -> list[Candidate]:
        """One row per piece of work, keeping the first occurrence.

        Sources are appended comments-first, so a requirement that a reviewer
        also commented on keeps the human's wording.
        """
        seen: set[str] = set()
        out: list[Candidate] = []
        for candidate in candidates:
            key = re.sub(r"[^a-z0-9]+", " ", candidate.title.lower()).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(candidate)
        return out

    # ── step two: create what was kept ──

    async def create(
        self,
        document_id: str,
        target: Target,
        candidates: list[Candidate],
        options: CreateOptions,
        created_by_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Write the kept candidates to the chosen target.

        Returns what was created, one entry each, so the caller can link to them.
        Refuses rather than guessing when a target needs context it was not
        given — a task with no sprint or a ticket with no form is a row that
        exists and belongs nowhere.
        """
        if target not in TARGETS:
            raise DocxIntakeError(f"Unknown target: {target}")
        if not candidates:
            raise DocxIntakeError("Nothing was selected.")

        document = await self.db.get(Document, document_id)
        if document is None:
            raise DocxIntakeError("That document no longer exists.")
        workspace_id = str(document.workspace_id) if document.workspace_id else None
        if not workspace_id:
            raise DocxIntakeError("This document does not belong to a workspace.")

        if target == "sprint_task":
            return await self._create_sprint_tasks(
                document, candidates, options, created_by_id
            )
        if target == "bug":
            return await self._create_bugs(
                workspace_id, document, candidates, options, created_by_id
            )
        if target == "user_story":
            return await self._create_stories(
                workspace_id, document, candidates, options, created_by_id
            )
        return await self._create_tickets(
            workspace_id, document, candidates, options, created_by_id
        )

    async def _create_sprint_tasks(
        self,
        document: Document,
        candidates: list[Candidate],
        options: CreateOptions,
        created_by_id: str | None,
    ) -> list[dict[str, Any]]:
        if not options.sprint_id:
            raise DocxIntakeError("Choose a sprint for these tasks to go into.")

        from aexy.services.sprint_task_service import SprintTaskService

        service = SprintTaskService(self.db)
        created: list[dict[str, Any]] = []
        for candidate in candidates:
            task = await service.add_task(
                sprint_id=options.sprint_id,
                title=candidate.title,
                description=_body(candidate, document),
                # `source_type`/`source_id` are how a task says where it came
                # from, which is exactly what an intake needs to record.
                source_type="docx_intake",
                source_id=_provenance_id(document, candidate),
                source_url=f"/docs/{document.id}",
                labels=options.labels or None,
                assignee_id=options.assignee_id,
            )
            created.append({"id": str(task.id), "title": task.title, "key": None})
        return created

    async def _create_bugs(
        self,
        workspace_id: str,
        document: Document,
        candidates: list[Candidate],
        options: CreateOptions,
        created_by_id: str | None,
    ) -> list[dict[str, Any]]:
        from aexy.models.bug import Bug

        created: list[Bug] = []
        # No local counting any more. `Bug` has a `before_insert` listener that
        # allocates its key atomically against the workspace counter, so a batch
        # gets distinct keys and so does a concurrent create from anywhere else.
        # This used to count rows once and increment locally, which was correct
        # within one batch and raced with everything outside it.
        for candidate in candidates:
            bug = Bug(
                workspace_id=workspace_id,
                title=candidate.title,
                description=_body(candidate, document),
                reporter_id=created_by_id,
                labels=options.labels or None,
                assignee_id=options.assignee_id,
                # Provenance, the same way a synced bug records where it came
                # from — so a row on a board can be traced back to the paragraph
                # or comment that produced it.
                source_type="docx_intake",
                source_id=_provenance_id(document, candidate),
                source_url=f"/docs/{document.id}",
            )
            created.append(bug)
            self.db.add(bug)
        # Flushed before the keys are read: the listener assigns them during the
        # INSERT, so `bug.key` is None until then.
        await self.db.flush()
        return [
            {"id": str(bug.id), "title": bug.title, "key": bug.key} for bug in created
        ]

    async def _create_stories(
        self,
        workspace_id: str,
        document: Document,
        candidates: list[Candidate],
        options: CreateOptions,
        created_by_id: str | None,
    ) -> list[dict[str, Any]]:
        from aexy.models.story import UserStory

        # A story needs somebody it is for. Where the document said so, that was
        # parsed at preview; where it did not, the person is asked. Refusing is
        # the whole fix here: this used to write "someone reading this document"
        # into every imported story, which is a fake stakeholder on a backlog and
        # tells a team nothing about who wanted the thing.
        unattributed = [c for c in candidates if not c.as_a]
        if unattributed and not options.default_persona:
            example = unattributed[0].title
            raise DocxIntakeError(
                f"{len(unattributed)} of these do not say who they are for — "
                f'for example "{example}". Say who the stories are for, or write '
                "them in the document as \"As a …, I want …\"."
            )

        created: list[UserStory] = []
        # Keys come from the `before_insert` listener, as with bugs above.
        for candidate in candidates:
            story = UserStory(
                workspace_id=workspace_id,
                title=candidate.title,
                # Parsed from the document where it said so, otherwise the
                # persona the person supplied. Never inferred: guessing "As a
                # user" for a compliance requirement puts words in a
                # stakeholder's mouth.
                as_a=candidate.as_a or options.default_persona or "",
                i_want=candidate.i_want or candidate.title,
                so_that=candidate.so_that,
                description=_body(candidate, document),
                reporter_id=created_by_id,
                labels=options.labels or None,
                source_type="docx_intake",
                source_id=_provenance_id(document, candidate),
                source_url=f"/docs/{document.id}",
            )
            created.append(story)
            self.db.add(story)
        await self.db.flush()
        return [
            {"id": str(s.id), "title": s.title, "key": s.key} for s in created
        ]

    async def _create_tickets(
        self,
        workspace_id: str,
        document: Document,
        candidates: list[Candidate],
        options: CreateOptions,
        created_by_id: str | None,
    ) -> list[dict[str, Any]]:
        """Through ``TicketService``, not by inserting rows.

        A ticket has no `title` or `description` column: its content lives in
        `field_values`, whose shape is defined by the form. Writing that blob
        directly would mean guessing at the form's field ids, and a ticket whose
        required fields are unfilled is a row that exists and cannot be worked.
        So this goes through the same service a public form submission does, and
        the form's own field ids are read first.
        """
        if not options.form_id:
            raise DocxIntakeError(
                "Choose a ticket form. A ticket's fields, its SLA and who it is "
                "for all come from its form, so there is no sensible default."
            )

        from aexy.models.ticketing import TicketFormField
        from aexy.schemas.ticketing import PublicTicketSubmission
        from aexy.services.ticket_service import TicketService

        fields = (
            await self.db.execute(
                select(TicketFormField)
                .where(TicketFormField.form_id == options.form_id)
                .order_by(TicketFormField.position)
            )
        ).scalars().all()
        if not fields:
            raise DocxIntakeError(
                "That ticket form has no fields, so there is nowhere to put the "
                "issue's text."
            )

        # The first single-line field carries the title; the first multi-line one
        # carries the body. Chosen by shape rather than by name, because a form's
        # labels are the workspace's to write and could be in any language.
        title_field = next(
            (f for f in fields if f.field_type in ("text", "short_text")), fields[0]
        )
        body_field = next(
            (f for f in fields if f.field_type in ("textarea", "long_text")), None
        )

        service = TicketService(self.db)
        created: list[dict[str, Any]] = []
        for candidate in candidates:
            values: dict[str, Any] = {str(title_field.id): candidate.title}
            if body_field is not None:
                values[str(body_field.id)] = _body(candidate, document)
            else:
                # No long field: append the body to the title rather than drop
                # it, since losing the context silently is the worse outcome.
                values[str(title_field.id)] = (
                    f"{candidate.title} — {_body(candidate, document)}"
                )

            ticket = await service.create_ticket(
                form_id=options.form_id,
                workspace_id=workspace_id,
                submission=PublicTicketSubmission(field_values=values),
            )
            # `create_ticket` fills `Ticket.title` by looking for a
            # "title"/"subject"/"summary" key in `field_values` — and this path
            # keys everything by the form field's UUID, so it finds nothing and
            # the ticket headlines its form name instead. That is the exact bug
            # main fixed by adding the column; set it here rather than
            # reintroduce it through this door.
            if not ticket.title:
                ticket.title = candidate.title
            created.append(
                {
                    "id": str(ticket.id),
                    "title": candidate.title,
                    "key": f"#{ticket.ticket_number}",
                }
            )
        # The titles set above are pending until flushed.
        await self.db.flush()
        return created

    async def _load_bytes(self, document_id: str) -> bytes:
        from aexy.services.document_service import DocumentService

        raw = await DocumentService(self.db).get_docx_bytes(document_id)
        if raw is None:
            raise DocxIntakeError("This document's bytes are not available.")
        return raw


def _as_title(text: str, limit: int = 120) -> str:
    """One line short enough to be a row title.

    Cut at the FIRST usable sentence end, not the last: "Add rate limiting" is a
    better title than "Add rate limiting. Then check the audit trail. Then confirm
    with legal before the review, and also chec…", and the last sentence end
    before the limit gives the second one.
    """
    flat = " ".join((text or "").split())
    if not flat:
        return ""
    if len(flat) <= limit:
        return flat

    # No minimum length. A short first sentence in a document is usually the
    # summary line, which is exactly what a title wants — and length is a poor
    # proxy for usefulness anyway: "Add rate limiting" is seventeen characters
    # and a perfectly good title, while a hundred-character elided run-on is not.
    stop = flat.find(". ")
    if 0 < stop < limit:
        return flat[:stop]
    return flat[: limit - 1] + "…"


def _provenance_id(document: Document, candidate: Candidate) -> str:
    """A stable id for where in the document this came from.

    Recorded on the created row so an issue can be traced back to the comment or
    paragraph that produced it — and so a second intake run over the same
    document can tell what it has already turned into work.
    """
    anchor = candidate.comment_id or candidate.paragraph_index
    return f"{document.id}:{candidate.source}:{anchor if anchor is not None else 'model'}"


def _body(candidate: Candidate, document: Document) -> str:
    """The issue's description: what the document said, and where to find it."""
    parts = [candidate.detail] if candidate.detail else []
    where = candidate.origin or "this document"
    parts.append(f'From "{document.title}" ({where}) — /docs/{document.id}')
    return "\n\n".join(parts)


def _json_slice(text: str) -> str:
    """The outermost JSON object in a response that may be wrapped in prose."""
    start = text.find("{")
    end = text.rfind("}")
    return text[start : end + 1] if start != -1 and end > start else text
