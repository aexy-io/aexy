"""What a pull request did to the pages that describe its code.

The guidance this produces has to be *earned*. "Remember to update the docs" is
advice nobody needs and everybody mutes; the only version worth sending names
something we actually checked. So every rule below needs two signals to fire —
one from the change and one from the page — and a rule with only one stays quiet.

Concretely: a Python-only pull request against a page full of screenshots says
nothing about screenshots, and a UI pull request against a page with no images
says nothing either. That conjunction is the whole design, and the test that
proves it is the negative one.

Deliberately no LLM. The rest of this pipeline is model-free on purpose — the
docstring on `list_documents_needing_update` puts it as "everything here is a
join" — and the ceiling on this guidance is bounded by patterns we can
enumerate anyway. A model here would make the page slow, non-deterministic,
untestable and billable per view, to say the same four things.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from urllib.parse import unquote

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.document_impact import (
    DocImpactState,
    PullRequestDocImpact,
    PullRequestDocImpactItem,
)
from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentCodeLink
from aexy.models.proposed_change import ChangeStatus, ProposedChange
from aexy.models.repository import Repository
from aexy.models.workspace_doc_impact_settings import (
    DEFAULT_DOC_IMPACT_SETTINGS,
    WorkspaceDocImpactSettings,
)
from aexy.services.document_sync_service import AffectedLinks, DocumentSyncService
from aexy.services.github_write_service import COMMENT_MARKER

logger = logging.getLogger(__name__)

# How many screenshot locations to name before it stops being useful. Somebody
# reading "and 14 more" has already got the point.
MAX_IMAGE_SPOTS = 6

_IMAGE_SUFFIXES = (".tsx", ".jsx", ".vue", ".svelte")
_STYLE_SUFFIXES = (".css", ".scss", ".sass", ".less")
_UI_DIRECTORIES = frozenset({"app", "components", "pages", "views", "screens"})

# Living under `components/` is not enough on its own. A `.py` file there cannot
# change what a screen looks like, and calling it a UI change fired the screenshot
# guidance on a backend-only pull request — the exact failure this feature is
# supposed to avoid, found by seeding a real pull request rather than by any unit
# test, because the obvious test case put its Python under `backend/`.
#
# A deny-list rather than an allow-list because the directory clause exists to
# catch the cases an extension misses — `useFilters.ts`, a hook that shapes a
# screen — and enumerating every front-end extension would lose those again.
_NOT_FRONTEND_SUFFIXES = (
    ".py",
    ".rb",
    ".go",
    ".java",
    ".kt",
    ".rs",
    ".php",
    ".cs",
    ".md",
    ".rst",
    ".sql",
    ".sh",
    ".yml",
    ".yaml",
    ".toml",
    ".txt",
)

_API_DIRECTORIES = frozenset({"api", "routers", "routes", "schemas", "endpoints"})
_API_FILENAME_SUFFIXES = ("_router.py", "_routes.py", "route.ts", "route.js")

_CONFIG_FILENAMES = frozenset(
    {
        "dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
        "settings.py",
        "config.py",
        ".env.example",
        "makefile",
    }
)
_CONFIG_DIRECTORIES = frozenset({"nginx", "terraform", "helm", "k8s", "deploy"})
_CONFIG_SUFFIXES = (".tf", ".env.example", ".ini", ".conf")

# A page whose setup steps a configuration change could invalidate. Matched
# against heading text, so a document that merely mentions Docker in a paragraph
# does not qualify.
_SETUP_HEADING = re.compile(
    r"instal|setup|set up|config|getting started|prerequisit|deploy|running",
    re.IGNORECASE,
)

# Next.js App Router: only a page file *is* a route. `route.ts` is an endpoint,
# not a screen, so it is excluded here and counted as an API signal instead.
_PAGE_FILENAMES = frozenset({"page.tsx", "page.jsx", "page.ts", "page.js"})


def _node_text(node: dict) -> str:
    """The visible text of a TipTap node, flattened."""
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "text":
        return node.get("text") or ""
    return "".join(_node_text(child) for child in node.get("content") or [])


def _image_label(attrs: dict) -> str | None:
    """A name for an image, from its own URL.

    Returns None rather than a placeholder when there is nothing to name: a
    `data:` URI has no filename, and inventing English here would put a string
    the client cannot translate into a payload that is otherwise all data.
    """
    src = (attrs.get("src") or "").strip()
    alt = (attrs.get("alt") or "").strip()

    if src.startswith("data:"):
        return alt or None

    path = src.split("#", 1)[0].split("?", 1)[0].rstrip("/")
    segment = unquote(path.rsplit("/", 1)[-1]) if path else ""
    return segment or alt or None


def summarise_images(content: dict | None) -> dict:
    """How many images a page carries, and where in the page they sit.

    Not stored. Recomputed on every read, because an author who deleted the
    screenshots would otherwise be told about screenshots — and being told
    something confidently wrong is what turns a useful nudge into one people
    learn to skip.

    `heading` is the nearest preceding heading rather than a link, because there
    is nothing to link to: TipTap renders headings without ids, the document page
    has no hash handling, and `DocumentCodeLink.document_section_id` is the only
    node-id precedent in the product and nothing populates it for images. Naming
    the section is what can be said truthfully, and "under *Creating a filter*"
    is arguably more use than a scroll position anyway.
    """
    spots: list[dict] = []
    count = 0
    heading: str | None = None

    def walk(node: object) -> None:
        nonlocal count, heading
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return

        node_type = node.get("type")
        if node_type == "heading":
            heading = _node_text(node).strip() or None
            return  # a heading cannot contain an image
        if node_type == "image":
            count += 1
            if len(spots) < MAX_IMAGE_SPOTS:
                spots.append(
                    {
                        "heading": heading,
                        "label": _image_label(node.get("attrs") or {}),
                    }
                )
            return

        walk(node.get("content") or [])

    walk(content or {})
    return {"count": count, "spots": spots}


def route_for_path(path: str) -> str | None:
    """The Next.js App Router route a changed file *is*, when it is one.

    Narrow on purpose, and only fires on a `page.*` file under an `app/`
    directory — where the mapping is not a guess but the framework's own rule.
    Most UI changes touch components rather than page files, so this stays quiet
    far more often than it speaks; it is a bonus clause on the screenshot line,
    never the mechanism.

    What it deliberately will not do is trace imports to guess which routes a
    component appears on. There is no import graph in this repository to trace,
    and a confidently named wrong route is worse than no route at all.
    """
    segments = [s for s in (path or "").strip().split("/") if s]
    if not segments or segments[-1] not in _PAGE_FILENAMES:
        return None

    try:
        # Last `app` segment: `frontend/src/app/...` and `app/...` both work, and
        # a nested `app` directory inside the tree is still the router root for
        # anything under it.
        start = len(segments) - 1 - segments[::-1].index("app")
    except ValueError:
        return None

    parts: list[str] = []
    for segment in segments[start + 1 : -1]:
        # Route groups and parallel routes organise files without appearing in
        # the URL. Dropping them is what makes `(app)/docs` resolve to `/docs`.
        if segment.startswith("(") and segment.endswith(")"):
            continue
        if segment.startswith("@"):
            continue
        if segment.startswith("[") and segment.endswith("]"):
            inner = segment[1:-1]
            if inner.startswith("[") and inner.endswith("]"):
                inner = inner[1:-1]  # [[...optional]]
            if inner.startswith("..."):
                parts.append("*")
            else:
                parts.append(f":{inner}")
            continue
        parts.append(segment)

    return "/" + "/".join(parts) if parts else "/"


def classify_paths(paths: list[str]) -> set[str]:
    """What kinds of thing a change touched, from its paths alone."""
    kinds: set[str] = set()

    for raw in paths or []:
        normalised = (raw or "").strip().lstrip("./")
        if not normalised:
            continue
        lowered = normalised.lower()
        segments = lowered.split("/")
        filename = segments[-1]

        if lowered.endswith(_IMAGE_SUFFIXES) or lowered.endswith(_STYLE_SUFFIXES):
            kinds.add("ui")
        elif any(
            segment in _UI_DIRECTORIES for segment in segments[:-1]
        ) and not lowered.endswith(_NOT_FRONTEND_SUFFIXES):
            kinds.add("ui")

        if any(segment in _API_DIRECTORIES for segment in segments[:-1]):
            kinds.add("api")
        elif filename.endswith(_API_FILENAME_SUFFIXES):
            kinds.add("api")

        if (
            filename in _CONFIG_FILENAMES
            or filename.startswith("docker-compose")
            or lowered.endswith(_CONFIG_SUFFIXES)
            or any(segment in _CONFIG_DIRECTORIES for segment in segments[:-1])
        ):
            kinds.add("config")

    return kinds


def document_signals(content: dict | None) -> set[str]:
    """What a page contains that a change could invalidate."""
    signals: set[str] = set()

    def walk(node: object) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return

        node_type = node.get("type")
        if node_type == "image":
            signals.add("images")
        elif node_type == "codeBlock":
            signals.add("code_blocks")
        elif node_type == "heading" and _SETUP_HEADING.search(_node_text(node)):
            signals.add("setup_heading")

        walk(node.get("content") or [])

    walk(content or {})
    return signals


def derive_guidance(
    *,
    matched_paths: list[str],
    content: dict | None,
    template_category: str | None = None,
    images: dict | None = None,
) -> list[dict]:
    """What is worth saying about this page, given this change.

    Returns `{"id", "params"}` entries and **never prose**. The client renders
    them, which is the only way the guidance can be translated — the existing
    `/review` group headings are server-rendered English (`review_items.py:_group`)
    and are untranslatable for exactly that reason. A precedent not to copy.

    An empty list is a normal, common answer. The card then shows the matched
    paths and the staleness chip, which is already more than the product could
    say before.
    """
    path_kinds = classify_paths(matched_paths)
    signals = document_signals(content)
    category = (template_category or "").strip().lower()
    guidance: list[dict] = []

    if images is None:
        images = summarise_images(content)

    # Screenshots. The sharpest case, and the one nothing in the product could
    # answer before: a UI change silently invalidates every screenshot of that
    # screen, and the images are naked `src` URLs absent from `content_text`.
    #
    # The change-side signal is "ui" and nothing else. `template_category` was
    # briefly allowed to stand in for it — "a guide's screenshots are its point" —
    # but that is a *document-side* fact, and letting it satisfy the change-side
    # half collapses the conjunction this whole module is built on: every guide
    # with an image then got the screenshot line for a backend-only change.
    # Caught by seeding a real pull request, because both seeded pages happened to
    # be guides. Having images is already the document-side signal; the category
    # cannot be both halves.
    if "images" in signals and "ui" in path_kinds and images["count"]:
        headings = [
            spot["heading"] for spot in images["spots"] if spot.get("heading")
        ]
        labels = [spot["label"] for spot in images["spots"] if spot.get("label")]
        guidance.append(
            {
                "id": "screenshots",
                "params": {
                    "count": images["count"],
                    # De-duplicated, order preserved: three screenshots under one
                    # heading should name it once.
                    "headings": list(dict.fromkeys(headings)),
                    "labels": list(dict.fromkeys(labels)),
                },
            }
        )

        # Only ever a sub-line of the screenshot guidance. On its own, "your
        # change touched /tickets" tells somebody nothing they did not know.
        routes = [route for route in map(route_for_path, matched_paths) if route]
        if routes:
            guidance.append(
                {"id": "route", "params": {"routes": list(dict.fromkeys(routes))}}
            )

    # The request or response shape may have moved. Needs a page that actually
    # shows one — a code block, or an explicit declaration that it is API
    # reference — or this fires on every page that happens to sit over `api/`.
    if "api" in path_kinds and (
        "code_blocks" in signals or category == "api_docs"
    ):
        guidance.append(
            {
                "id": "apiSurface",
                "params": {"paths": _api_paths(matched_paths)},
            }
        )

    # Setup steps. Both halves matter: a configuration change is only worth
    # mentioning to a page that tells somebody how to set the thing up.
    if "config" in path_kinds and "setup_heading" in signals:
        guidance.append(
            {
                "id": "setup",
                "params": {"paths": _config_paths(matched_paths)},
            }
        )

    return guidance


def _api_paths(paths: list[str]) -> list[str]:
    return [path for path in paths if "api" in classify_paths([path])]


def _config_paths(paths: list[str]) -> list[str]:
    return [path for path in paths if "config" in classify_paths([path])]


def render_pr_comment(
    *,
    pages: list[dict],
    impact_url: str,
    merged: bool = False,
    truncated: bool = False,
) -> str:
    """The comment body, as Markdown.

    Written to be worth reading once and then ignored, which is the realistic
    best case for a bot comment: it names the pages and the files that matched,
    says where the screenshots are, and stops. No checklist, no "please remember",
    nothing that reads as nagging on the fourth push.

    `pages` entries: {title, url, paths: [...], screenshots: int, guidance: [...]}
    """
    lead = (
        "This merged, and these pages describe the code it changed:"
        if merged
        else "These pages describe code this pull request changes:"
    )
    lines = [f"**Documentation impact** — {lead}", ""]

    for page in pages:
        title = page["title"]
        link = f"[{title}]({page['url']})" if page.get("url") else title
        lines.append(f"- {link}")
        paths = page.get("paths") or []
        if paths:
            shown = ", ".join(f"`{p}`" for p in paths[:3])
            more = f" +{len(paths) - 3} more" if len(paths) > 3 else ""
            lines.append(f"  - matched {shown}{more}")
        shots = page.get("screenshots") or 0
        if shots and any(g.get("id") == "screenshots" for g in page.get("guidance", [])):
            headings = [
                h
                for g in page.get("guidance", [])
                if g.get("id") == "screenshots"
                for h in (g.get("params", {}).get("headings") or [])
            ]
            where = f" under {', '.join(headings)}" if headings else ""
            plural = "screenshot" if shots == 1 else "screenshots"
            lines.append(
                f"  - **{shots} {plural}**{where} — a UI change may have "
                f"invalidated them"
            )

    if truncated:
        lines += [
            "",
            "_This pull request touches more files than were checked, so the list "
            "may be incomplete._",
        ]

    lines += ["", f"[Open the documentation impact page]({impact_url})", COMMENT_MARKER]
    return "\n".join(lines)


def render_resolved_pr_comment(*, impact_url: str) -> str:
    """What the comment says once nobody has anything left to do.

    Reached when every affected page was marked "no update needed". Short on
    purpose: the previous body listed pages and screenshots, and leaving that
    text up after somebody answered would make the comment a stale claim rather
    than a current statement.
    """
    return "\n".join(
        [
            "**Documentation impact** — nothing outstanding.",
            "",
            "Every page this pull request affects has been marked as needing no "
            "update.",
            "",
            f"[Documentation impact page]({impact_url})",
            COMMENT_MARKER,
        ]
    )


def render_check_run(*, pages: list[dict], merged: bool = False) -> tuple[str, str]:
    """`(title, summary)` for the check run. Neutral by default — see settings."""
    count = len(pages)
    noun = "page" if count == 1 else "pages"
    title = f"{count} documented {noun} affected"
    with_shots = sum(1 for page in pages if page.get("screenshots"))
    summary_lines = [f"- {page['title']}" for page in pages]
    if with_shots:
        summary_lines.append("")
        # "1 of them contain" is the sort of thing that makes a bot look like a
        # bot. One page is "it", several are "N of them".
        summary_lines.append(
            "It contains screenshots that a UI change may have invalidated."
            if count == 1
            else f"{with_shots} of them contain screenshots that a UI change may "
            f"have invalidated."
        )
    if merged:
        summary_lines.insert(0, "This merged; the pages below are now behind.\n")
    return title, "\n".join(summary_lines)


class DocumentImpactService:
    """Records what a pull request affects, and reads it back for the page."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(self, workspace_id: str) -> dict:
        """The workspace's doc-impact settings, or the documented defaults.

        An absent row and a row configured to the defaults answer identically, so
        no caller has to know which it got.
        """
        row = await self.db.scalar(
            select(WorkspaceDocImpactSettings).where(
                WorkspaceDocImpactSettings.workspace_id == workspace_id
            )
        )
        if row is None:
            return dict(DEFAULT_DOC_IMPACT_SETTINGS)
        return {
            "enabled": row.enabled,
            "pr_comment_enabled": row.pr_comment_enabled,
            "check_run_enabled": row.check_run_enabled,
            "check_run_conclusion": row.check_run_conclusion,
            "github_write_block_reason": row.github_write_block_reason,
            "github_write_blocked_at": row.github_write_blocked_at,
        }

    async def update_settings(
        self, workspace_id: str, changes: dict, *, developer_id: str | None
    ) -> dict:
        """Create the row on first write. Only the keys given are touched."""
        row = await self.db.scalar(
            select(WorkspaceDocImpactSettings).where(
                WorkspaceDocImpactSettings.workspace_id == workspace_id
            )
        )
        if row is None:
            row = WorkspaceDocImpactSettings(workspace_id=workspace_id)
            self.db.add(row)

        for key in (
            "enabled",
            "pr_comment_enabled",
            "check_run_enabled",
            "check_run_conclusion",
        ):
            if changes.get(key) is not None:
                setattr(row, key, changes[key])
        row.updated_by_id = developer_id

        await self.db.flush()
        return await self.get_settings(workspace_id)

    async def record_github_write_block(
        self, workspace_id: str, reason: str | None
    ) -> None:
        """Remember that a write was refused, so the settings screen can say so.

        Cleared by passing None on the first success. Denormalised onto the
        settings row rather than derived from the impact rows, because the banner
        should be a single-row read and because "is anything currently broken" is a
        workspace-level question.
        """
        row = await self.db.scalar(
            select(WorkspaceDocImpactSettings).where(
                WorkspaceDocImpactSettings.workspace_id == workspace_id
            )
        )
        if row is None:
            if reason is None:
                return  # nothing configured and nothing wrong: no row needed
            row = WorkspaceDocImpactSettings(workspace_id=workspace_id)
            self.db.add(row)

        row.github_write_block_reason = reason
        row.github_write_blocked_at = datetime.now(timezone.utc) if reason else None
        await self.db.flush()

    async def record_impact(
        self,
        *,
        repository_id: str,
        pull_request_number: int,
        changed_paths: list[str],
        head_sha: str,
        moment: str,
        pull_request_id: str | None = None,
        title: str | None = None,
        author_developer_id: str | None = None,
        author_login: str | None = None,
        truncated: bool = False,
    ) -> dict | None:
        """Evaluate a pull request and decide whether to say anything.

        Returns None when there is nothing to record at all, which is the common
        case and must stay cheap. Otherwise returns what the caller needs to
        deliver:

            {"impact_id", "notify": "opened" | "merged" | None,
             "notify_document_ids": [...], "affected_count": int,
             "url_path": "/docs/impact/{repository_id}/{number}"}

        `notify` is decided here rather than by the caller, because the rule
        needs the high-water mark and the high-water mark is written in the same
        transaction. A caller deciding separately would be a second opinion about
        state it had to re-read.

        The timestamps are set here too, before the notification is actually
        sent. That is deliberate: `_notify_quietly` never raises, so "sent"
        is best-effort whoever writes it, and doing it in one transaction is
        worth more than a window in which a crash re-notifies.
        """
        # Volume guard. Without this, every pull request in every connected
        # repository leaves a row forever — including repositories where no
        # document exists to match, which is most of them.
        link_count = await self.db.scalar(
            select(func.count())
            .select_from(DocumentCodeLink)
            .where(DocumentCodeLink.repository_id == repository_id)
        )
        if not link_count:
            return None

        sync_service = DocumentSyncService(self.db)
        affected = await sync_service.resolve_affected_links(
            repository_id, changed_paths, commit_sha=head_sha
        )

        impact = await self._upsert_header(
            repository_id=repository_id,
            pull_request_number=pull_request_number,
            head_sha=head_sha,
            moment=moment,
            pull_request_id=pull_request_id,
            title=title,
            author_developer_id=author_developer_id,
            author_login=author_login,
            changed_path_count=len(affected.substantive_paths),
        )

        current_ids = await self._sync_items(impact, affected)

        # Dismissed documents are excluded from the notify set, not filtered by
        # the caller afterwards: "no update needed" has to suppress the merge
        # nudge structurally, or it is a mute with extra steps.
        dismissed = await self._dismissed_document_ids(impact.id)
        candidates = [doc_id for doc_id in current_ids if doc_id not in dismissed]

        notify, notify_ids = self._decide_notification(impact, moment, candidates)

        if notify:
            impact.notified_document_ids = sorted(
                set(impact.notified_document_ids or []) | set(candidates)
            )
            if notify == "opened":
                impact.notified_open_at = datetime.now(timezone.utc)
            else:
                impact.notified_merged_at = datetime.now(timezone.utc)

        await self.db.flush()

        return {
            "impact_id": str(impact.id),
            "notify": notify,
            "notify_document_ids": notify_ids,
            "affected_count": len(current_ids),
            "truncated": truncated,
            "url_path": f"/docs/impact/{repository_id}/{pull_request_number}",
        }

    def _decide_notification(
        self, impact: PullRequestDocImpact, moment: str, candidates: list[str]
    ) -> tuple[str | None, list[str]]:
        """One notification per pull request, unless the affected set grew.

        The growth rule is why `notified_document_ids` never shrinks: reverting a
        file and re-adding it on the next push must not re-notify, and a person
        who has already been told about three pages does not need telling again
        because a fourth commit touched the same three.
        """
        if not candidates:
            return None, []

        if moment == "merged":
            if impact.notified_merged_at:
                return None, []
            return "merged", candidates

        if not impact.notified_open_at:
            return "opened", candidates

        # A later push. Only what is new, and worded from the new alone.
        already = set(impact.notified_document_ids or [])
        grew = [doc_id for doc_id in candidates if doc_id not in already]
        return ("opened", grew) if grew else (None, [])

    async def _upsert_header(
        self,
        *,
        repository_id: str,
        pull_request_number: int,
        head_sha: str,
        moment: str,
        pull_request_id: str | None,
        title: str | None,
        author_developer_id: str | None,
        author_login: str | None,
        changed_path_count: int,
    ) -> PullRequestDocImpact:
        existing = await self.db.scalar(
            select(PullRequestDocImpact).where(
                and_(
                    PullRequestDocImpact.repository_id == repository_id,
                    PullRequestDocImpact.pull_request_number == pull_request_number,
                )
            )
        )

        if existing is None:
            existing = PullRequestDocImpact(
                repository_id=repository_id,
                pull_request_number=pull_request_number,
                head_sha=head_sha,
                state=DocImpactState.OPEN,
                notified_document_ids=[],
            )
            self.db.add(existing)

        existing.head_sha = head_sha
        # The high-water mark, not the latest push's count — the items accumulate
        # across pushes, so overwriting this let the page say "2 of 1 changed
        # files are described by a page here" after a second push touched one
        # file and matched nothing. Both numbers have to describe the same span.
        existing.changed_path_count = max(
            existing.changed_path_count or 0, changed_path_count
        )
        # Only ever filled in, never cleared: a later webhook that happens not to
        # carry the author must not erase the one that did.
        existing.pull_request_id = pull_request_id or existing.pull_request_id
        existing.title = title or existing.title
        existing.author_developer_id = (
            author_developer_id or existing.author_developer_id
        )
        existing.author_login = author_login or existing.author_login

        if moment == "merged":
            # One-way. A reopened pull request that was already merged is not a
            # thing GitHub can produce, and treating it as open again would
            # re-ask about work that already landed.
            existing.state = DocImpactState.MERGED
            existing.merged_at = existing.merged_at or datetime.now(timezone.utc)

        await self.db.flush()
        return existing

    async def _sync_items(
        self, impact: PullRequestDocImpact, affected: AffectedLinks
    ) -> list[str]:
        """One item per affected document, with its matches unioned in.

        Several links on one document collapse into one row: being told the same
        page twice because it watches two paths is noise, and the paths are all
        in `matched` anyway.
        """
        by_document: dict[str, list[dict]] = {}
        workspaces: dict[str, str] = {}

        for match in affected.matches:
            link = match.link
            document = link.document
            if not document:
                continue
            document_id = str(document.id)
            by_document.setdefault(document_id, []).append(
                {
                    "code_link_id": str(link.id),
                    "path": link.path,
                    "link_type": link.link_type,
                    "branch": link.branch,
                    "matched_paths": match.matched_paths,
                }
            )
            workspaces[document_id] = str(document.workspace_id)

        if not by_document:
            return []

        existing_items = (
            await self.db.scalars(
                select(PullRequestDocImpactItem).where(
                    PullRequestDocImpactItem.impact_id == impact.id
                )
            )
        ).all()
        existing_by_document = {str(i.document_id): i for i in existing_items}

        for document_id, entries in by_document.items():
            item = existing_by_document.get(document_id)
            if item is None:
                self.db.add(
                    PullRequestDocImpactItem(
                        impact_id=impact.id,
                        document_id=document_id,
                        workspace_id=workspaces[document_id],
                        matched=entries,
                    )
                )
                continue
            item.matched = _union_matches(item.matched or [], entries)

        await self.db.flush()
        # Every document this pull request has ever been seen to affect, not only
        # the ones its most recent push touched — the card must not forget a file
        # from an earlier commit.
        return sorted(set(existing_by_document) | set(by_document))

    async def get_impact(
        self, *, workspace_id: str, repository_id: str, pull_request_number: int
    ) -> dict:
        """The page's read model.

        Always returns a payload, never raises for "nothing here". A pull request
        that touches no documented path is the most ordinary situation in the
        product, and answering it with a 404 would put a red error toast in front
        of somebody for whom nothing is wrong. `analyzed` distinguishes "we looked
        and there was nothing" from "we never looked".
        """
        impact = await self.db.scalar(
            select(PullRequestDocImpact).where(
                and_(
                    PullRequestDocImpact.repository_id == repository_id,
                    PullRequestDocImpact.pull_request_number == pull_request_number,
                )
            )
        )

        repository_document_count = await self.db.scalar(
            select(func.count())
            .select_from(DocumentCodeLink)
            .where(DocumentCodeLink.repository_id == repository_id)
        ) or 0

        # Named, so the page can say "acme/app#412" and link back to the pull
        # request. Nothing else here needs the repository row, so it is read once.
        repository_full_name = await self.db.scalar(
            select(Repository.full_name).where(Repository.id == repository_id)
        )

        if impact is None:
            return {
                "analyzed": False,
                "repository_id": repository_id,
                "repository_full_name": repository_full_name,
                "pull_request_number": pull_request_number,
                "repository_document_count": repository_document_count,
                "items": [],
            }

        items = (
            await self.db.scalars(
                select(PullRequestDocImpactItem).where(
                    and_(
                        PullRequestDocImpactItem.impact_id == impact.id,
                        # Workspace-scoped on the item, so a repository adopted by
                        # two workspaces cannot show one's pages to the other.
                        PullRequestDocImpactItem.workspace_id == workspace_id,
                    )
                )
            )
        ).all()

        document_ids = [str(item.document_id) for item in items]
        documents = await self._load_documents(document_ids)
        links = await self._load_links(items)
        proposals = await self._pending_proposal_ids(
            workspace_id, document_ids, impact.pull_request_number
        )
        dismissers = await self._load_developer_names(
            [
                str(item.dismissed_by_developer_id)
                for item in items
                if item.dismissed_by_developer_id
            ]
        )

        rendered = [
            self._render_item(item, documents, links, proposals, dismissers, impact)
            for item in items
            if str(item.document_id) in documents
        ]
        # Work first, then what somebody already handled.
        order = {"needs_review": 0, "edited": 1, "proposal_pending": 2, "dismissed": 3}
        rendered.sort(key=lambda entry: order.get(entry["status"], 9))

        return {
            "analyzed": True,
            "impact_id": str(impact.id),
            "repository_id": repository_id,
            "repository_full_name": repository_full_name,
            "pull_request_number": impact.pull_request_number,
            "pull_request_title": impact.title,
            "state": impact.state,
            "head_sha": impact.head_sha,
            "author_developer_id": (
                str(impact.author_developer_id)
                if impact.author_developer_id
                else None
            ),
            "author_login": impact.author_login,
            "changed_path_count": impact.changed_path_count,
            "repository_document_count": repository_document_count,
            "detected_at": impact.detected_at,
            "merged_at": impact.merged_at,
            "pr_comment_status": impact.pr_comment_status,
            "pr_comment_error": impact.pr_comment_error,
            "check_run_status": impact.check_run_status,
            "check_run_error": impact.check_run_error,
            "items": rendered,
        }

    def _render_item(
        self,
        item: PullRequestDocImpactItem,
        documents: dict,
        links: dict,
        proposals: dict,
        dismissers: dict,
        impact: PullRequestDocImpact,
    ) -> dict:
        document = documents[str(item.document_id)]
        matched = item.matched or []
        matched_paths = [
            path for entry in matched for path in (entry.get("matched_paths") or [])
        ]

        # Recomputed, never stored: an author who deleted the screenshots would
        # otherwise be told about screenshots, and being told something
        # confidently wrong is what makes a nudge one people learn to skip.
        images = summarise_images(document.content)

        link_rows = []
        template_category = None
        for entry in matched:
            link = links.get(entry.get("code_link_id"))
            if link is None:
                continue
            template_category = template_category or link.template_category
            link_rows.append(
                {
                    "code_link_id": str(link.id),
                    "path": entry.get("path") or link.path,
                    "link_type": entry.get("link_type") or link.link_type,
                    "branch": entry.get("branch") or link.branch,
                    "sync_mode": link.sync_mode,
                    "template_category": link.template_category,
                    "has_pending_changes": link.has_pending_changes,
                    "last_synced_at": link.last_synced_at,
                    "owner_developer_id": (
                        str(link.owner_developer_id)
                        if link.owner_developer_id
                        else None
                    ),
                    "matched_paths": entry.get("matched_paths") or [],
                }
            )

        proposal_id = proposals.get(str(item.document_id))
        if item.dismissed_at:
            status = "dismissed"
        elif proposal_id:
            status = "proposal_pending"
        elif document.updated_at and impact.detected_at and (
            document.updated_at > impact.detected_at
        ):
            # "Edited since", not "updated": autosave bumps `updated_at` on any
            # keystroke, so the copy must not claim more than it knows.
            status = "edited"
        else:
            status = "needs_review"

        return {
            "document_id": str(item.document_id),
            "document_title": document.title,
            "document_icon": document.icon,
            "document_updated_at": document.updated_at,
            "status": status,
            "links": link_rows,
            "screenshots": images,
            "guidance": derive_guidance(
                matched_paths=matched_paths,
                content=document.content,
                template_category=template_category,
                images=images,
            ),
            "proposal_id": proposal_id,
            "dismissed_at": item.dismissed_at,
            "dismissed_by_developer_id": (
                str(item.dismissed_by_developer_id)
                if item.dismissed_by_developer_id
                else None
            ),
            "dismissed_by_name": dismissers.get(
                str(item.dismissed_by_developer_id or "")
            ),
            "dismiss_reason": item.dismiss_reason,
        }

    async def set_dismissed(
        self,
        *,
        workspace_id: str,
        repository_id: str,
        pull_request_number: int,
        document_id: str,
        developer_id: str | None,
        dismissed: bool,
        reason: str | None = None,
    ) -> bool:
        """Say "no update needed" for this page on this pull request, or undo it.

        Scoped to the pull request, and deliberately narrow: it does **not** clear
        `has_pending_changes`. "No update needed for this change" is not "this page
        is in sync with all of its code", and the sidebar dot keeps its own truth.

        Returns False when there is no such item — you can only dismiss something
        you were shown, so that is a real error for the caller to turn into a 404.
        """
        item = await self.db.scalar(
            select(PullRequestDocImpactItem)
            .join(
                PullRequestDocImpact,
                PullRequestDocImpact.id == PullRequestDocImpactItem.impact_id,
            )
            .where(
                and_(
                    PullRequestDocImpact.repository_id == repository_id,
                    PullRequestDocImpact.pull_request_number == pull_request_number,
                    PullRequestDocImpactItem.document_id == document_id,
                    PullRequestDocImpactItem.workspace_id == workspace_id,
                )
            )
        )
        if item is None:
            return False

        if dismissed:
            item.dismissed_at = datetime.now(timezone.utc)
            item.dismissed_by_developer_id = developer_id
            item.dismiss_reason = (reason or "").strip() or None
        else:
            item.dismissed_at = None
            item.dismissed_by_developer_id = None
            item.dismiss_reason = None

        await self.db.flush()
        return True

    async def _load_documents(self, document_ids: list[str]) -> dict:
        if not document_ids:
            return {}
        rows = await self.db.scalars(
            select(Document).where(Document.id.in_(document_ids))
        )
        return {str(document.id): document for document in rows}

    async def _load_links(self, items: list[PullRequestDocImpactItem]) -> dict:
        link_ids = [
            entry.get("code_link_id")
            for item in items
            for entry in (item.matched or [])
            if entry.get("code_link_id")
        ]
        if not link_ids:
            return {}
        rows = await self.db.scalars(
            select(DocumentCodeLink).where(DocumentCodeLink.id.in_(link_ids))
        )
        return {str(link.id): link for link in rows}

    async def _pending_proposal_ids(
        self, workspace_id: str, document_ids: list[str], pull_request_number: int
    ) -> dict:
        """Documents that already have a proposal waiting from *this* pull request.

        A card that links out to the waiting proposal and hides its own update
        button, because generating a second one only creates a second thing for
        somebody to review.
        """
        if not document_ids:
            return {}
        rows = await self.db.scalars(
            select(ProposedChange).where(
                and_(
                    ProposedChange.workspace_id == workspace_id,
                    ProposedChange.entity_type == "document",
                    ProposedChange.entity_id.in_(document_ids),
                    ProposedChange.status == ChangeStatus.PENDING.value,
                )
            )
        )
        found: dict[str, str] = {}
        for row in rows:
            trigger = row.trigger or {}
            if trigger.get("pull_request") == pull_request_number:
                found.setdefault(str(row.entity_id), str(row.id))
        return found

    async def _load_developer_names(self, developer_ids: list[str]) -> dict:
        if not developer_ids:
            return {}
        rows = await self.db.scalars(
            select(Developer).where(Developer.id.in_(developer_ids))
        )
        return {str(dev.id): dev.name for dev in rows}

    async def _dismissed_document_ids(self, impact_id: str) -> set[str]:
        rows = await self.db.execute(
            select(PullRequestDocImpactItem.document_id).where(
                and_(
                    PullRequestDocImpactItem.impact_id == impact_id,
                    PullRequestDocImpactItem.dismissed_at.is_not(None),
                )
            )
        )
        return {str(row[0]) for row in rows}


def _union_matches(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """Merge two match lists per code link, unioning their paths.

    A second commit touching one more file must not make the card forget the file
    from the first: what the author needs is everything this pull request did.
    """
    merged: dict[str, dict] = {}
    for entry in [*existing, *incoming]:
        key = entry.get("code_link_id") or entry.get("path") or ""
        if key not in merged:
            merged[key] = {**entry, "matched_paths": list(entry.get("matched_paths") or [])}
            continue
        paths = merged[key]["matched_paths"]
        for path in entry.get("matched_paths") or []:
            if path not in paths:
                paths.append(path)
    for entry in merged.values():
        entry["matched_paths"] = sorted(entry["matched_paths"])
    return list(merged.values())
