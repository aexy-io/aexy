"""Resolving a workspace's Service Desk taxonomy: stakeholders + request types.

Where the enums used to be. Callers ask questions about *meaning* — "is this
bucket terminal?", "which function key owns it?", "what does untriaged mail
become?" — and never compare a slug to a literal. That indirection is the whole
point: the answers now come from rows a workspace can edit.

Shaped after ``service_desk_clock.load_clock``: one read builds an immutable
snapshot, and everything downstream is pure. Call sites that touch many tickets
load it once rather than querying per row.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.service_desk import ServiceDeskRequestType, ServiceDeskStakeholder
from aexy.services.service_desk_industry_templates import (
    DEFAULT_TEMPLATE_SLUG,
    DEFAULT_TERMINOLOGY,
    SEMANTIC_CLOSED,
    SEMANTIC_EXTERNAL,
    SEMANTIC_INTERNAL,
    IndustryTemplate,
    get_template,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StakeholderView:
    slug: str
    label: str
    semantics: str
    function_key: str | None
    position: int


@dataclass(frozen=True)
class RequestTypeView:
    slug: str
    label: str
    is_default: bool
    position: int


@dataclass(frozen=True)
class Taxonomy:
    """An immutable snapshot of one workspace's desk vocabulary."""

    stakeholders: tuple[StakeholderView, ...]
    request_types: tuple[RequestTypeView, ...]
    terminology: dict[str, str]
    template_slug: str | None

    # -- stakeholders -------------------------------------------------------

    def stakeholder(self, slug: str | None) -> StakeholderView | None:
        if not slug:
            return None
        return next((s for s in self.stakeholders if s.slug == slug), None)

    def has_stakeholder(self, slug: str | None) -> bool:
        return self.stakeholder(slug) is not None

    def semantics_of(self, slug: str | None) -> str | None:
        s = self.stakeholder(slug)
        return s.semantics if s else None

    def is_closed(self, slug: str | None) -> bool:
        """Whether this bucket is terminal — the clock-stopping question.

        Unknown slugs are *not* closed. A ticket holding a slug that has since
        been deleted should keep accruing time and stay visible, not silently
        drop out of every open queue.
        """
        return self.semantics_of(slug) == SEMANTIC_CLOSED

    @property
    def closed_slug(self) -> str | None:
        """The workspace's terminal bucket, or None if it has no taxonomy."""
        return next((s.slug for s in self.stakeholders if s.semantics == SEMANTIC_CLOSED), None)

    @property
    def open_slugs(self) -> tuple[str, ...]:
        return tuple(s.slug for s in self.stakeholders if s.semantics != SEMANTIC_CLOSED)

    @property
    def internal_function_keys(self) -> dict[str, str]:
        """``{stakeholder_slug: function_key}`` for internal buckets.

        The replacement for the ``INTERNAL_PENDING_WITH`` module dict, which
        hardcoded one company's department names and could not be inspected,
        let alone changed, from the UI.
        """
        return {
            s.slug: s.function_key
            for s in self.stakeholders
            if s.semantics == SEMANTIC_INTERNAL and s.function_key
        }

    @property
    def default_stakeholder_slug(self) -> str | None:
        """Where a new ticket starts: the first internal bucket by position.

        Intake has to put a ticket *somewhere*, and "with the team that fields
        incoming mail" is the only sensible default. Falls back to the first
        non-terminal bucket for a taxonomy with no internal ones.
        """
        internal = [s for s in self.stakeholders if s.semantics == SEMANTIC_INTERNAL]
        if internal:
            return internal[0].slug
        other = [s for s in self.stakeholders if s.semantics != SEMANTIC_CLOSED]
        return other[0].slug if other else None

    # -- request types ------------------------------------------------------

    def has_request_type(self, slug: str | None) -> bool:
        return bool(slug) and any(r.slug == slug for r in self.request_types)

    @property
    def default_request_type_slug(self) -> str | None:
        explicit = next((r.slug for r in self.request_types if r.is_default), None)
        if explicit:
            return explicit
        return self.request_types[0].slug if self.request_types else None

    # -- terminology --------------------------------------------------------

    def term(self, key: str) -> str:
        """A user-facing noun ("account", "vendors", "owner")."""
        return self.terminology.get(key) or DEFAULT_TERMINOLOGY.get(key, key)

    @property
    def is_empty(self) -> bool:
        return not self.stakeholders and not self.request_types


EMPTY_TAXONOMY = Taxonomy(
    stakeholders=(),
    request_types=(),
    terminology=dict(DEFAULT_TERMINOLOGY),
    template_slug=None,
)


def _views(
    stakeholders: list[ServiceDeskStakeholder],
    request_types: list[ServiceDeskRequestType],
    terminology: dict[str, str],
    template_slug: str | None,
) -> Taxonomy:
    return Taxonomy(
        stakeholders=tuple(
            StakeholderView(s.slug, s.label, s.semantics, s.function_key, s.position)
            for s in sorted(stakeholders, key=lambda r: (r.position, r.slug))
        ),
        request_types=tuple(
            RequestTypeView(r.slug, r.label, r.is_default, r.position)
            for r in sorted(request_types, key=lambda r: (r.position, r.slug))
        ),
        terminology={**DEFAULT_TERMINOLOGY, **(terminology or {})},
        template_slug=template_slug,
    )


async def _read(db: AsyncSession, workspace_id: str) -> tuple[list, list]:
    stakeholders = list(
        (
            await db.execute(
                select(ServiceDeskStakeholder).where(
                    ServiceDeskStakeholder.workspace_id == workspace_id,
                    ServiceDeskStakeholder.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    request_types = list(
        (
            await db.execute(
                select(ServiceDeskRequestType).where(
                    ServiceDeskRequestType.workspace_id == workspace_id,
                    ServiceDeskRequestType.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    return stakeholders, request_types


async def _settings(db: AsyncSession, workspace_id: str) -> dict:
    from aexy.models.workspace import Workspace

    ws = await db.get(Workspace, workspace_id)
    return ((ws.settings or {}).get("service_desk") or {}) if ws else {}


def external_slug_for(taxonomy: Taxonomy, term_key: str) -> str | None:
    """The external bucket that speaks for the ``account`` or ``vendor`` table.

    There is no explicit link between an external stakeholder and a master-data
    table, so it is inferred from the bucket's label matching the workspace's own
    noun for that table. Insurance broking labels them "Partner" and "Insurer",
    which is exactly what the old fixed ``partner`` / ``insurer`` slugs meant, so
    existing desks keep behaving identically. Returns None when a workspace has
    renamed one without the other, in which case callers must not guess.
    """
    want = (taxonomy.term(term_key) or "").strip().lower()
    if not want:
        return None
    for s in taxonomy.stakeholders:
        if s.semantics == SEMANTIC_EXTERNAL and (s.label or "").strip().lower() == want:
            return s.slug
    return None


async def load_taxonomy(db: AsyncSession, workspace_id: str, *, seed: bool = True) -> Taxonomy:
    """The workspace's taxonomy, seeding a starting set if it has none.

    Seeding is lazy and idempotent (the same shape as
    ``TaskConfigService.seed_default_categories``) so enabling the desk doesn't
    require a separate setup step. Which template gets seeded is deliberately
    *not* inferred from the workspace's data — it reads
    ``settings["service_desk"]["industry_template"]`` and otherwise uses the
    neutral default. Guessing an industry from ticket contents would be worse
    than asking.

    Pass ``seed=False`` from read-only paths that must not write (schedules
    walking every workspace, for instance).
    """
    sd = await _settings(db, workspace_id)
    template_slug = sd.get("industry_template")
    terminology = sd.get("terminology") or {}

    stakeholders, request_types = await _read(db, workspace_id)
    if stakeholders or request_types or not seed:
        return _views(stakeholders, request_types, terminology, template_slug)

    template = get_template(template_slug) or get_template(DEFAULT_TEMPLATE_SLUG)
    assert template is not None  # DEFAULT_TEMPLATE_SLUG is in the catalogue
    logger.info(
        "Seeding Service Desk taxonomy for workspace %s from template %s",
        workspace_id,
        template.slug,
    )
    await seed_taxonomy(db, workspace_id, template)
    stakeholders, request_types = await _read(db, workspace_id)
    return _views(
        stakeholders,
        request_types,
        terminology or template.resolved_terminology(),
        template_slug or template.slug,
    )


async def seed_taxonomy(
    db: AsyncSession,
    workspace_id: str,
    template: IndustryTemplate,
) -> tuple[int, int]:
    """Insert any of the template's rows the workspace hasn't got.

    Idempotent by slug, and it never edits or deletes an existing row: applying
    a template to a live desk must not silently relabel buckets that tickets are
    already sitting in. Returns ``(stakeholders_added, request_types_added)``.
    """
    existing_stakeholders = {
        s
        for s in (
            await db.execute(
                select(ServiceDeskStakeholder.slug).where(
                    ServiceDeskStakeholder.workspace_id == workspace_id
                )
            )
        )
        .scalars()
        .all()
    }
    existing_request_types = {
        s
        for s in (
            await db.execute(
                select(ServiceDeskRequestType.slug).where(
                    ServiceDeskRequestType.workspace_id == workspace_id
                )
            )
        )
        .scalars()
        .all()
    }

    added_s = 0
    for position, spec in enumerate(template.stakeholders):
        if spec.slug in existing_stakeholders:
            continue
        db.add(
            ServiceDeskStakeholder(
                id=str(uuid4()),
                workspace_id=workspace_id,
                slug=spec.slug,
                label=spec.label,
                semantics=spec.semantics,
                function_key=spec.function_key,
                position=position,
                is_active=True,
            )
        )
        added_s += 1

    # Only claim the default flag if the workspace hasn't already got one —
    # `uq_service_desk_request_type_default` allows exactly one.
    has_default = bool(
        (
            await db.execute(
                select(ServiceDeskRequestType.id).where(
                    ServiceDeskRequestType.workspace_id == workspace_id,
                    ServiceDeskRequestType.is_default.is_(True),
                )
            )
        ).first()
    )
    added_r = 0
    for position, rt in enumerate(template.request_types):
        if rt.slug in existing_request_types:
            continue
        claim_default = rt.is_default and not has_default
        if claim_default:
            has_default = True
        db.add(
            ServiceDeskRequestType(
                id=str(uuid4()),
                workspace_id=workspace_id,
                slug=rt.slug,
                label=rt.label,
                is_default=claim_default,
                position=position,
                is_active=True,
            )
        )
        added_r += 1

    if added_s or added_r:
        await db.flush()
    return added_s, added_r
