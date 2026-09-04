"""Resolving a workspace's scorecard configuration: KPI rows and rating bands.

Shaped after ``service_desk_taxonomy.load_taxonomy`` and
``service_desk_clock.load_clock``: one read builds an immutable snapshot, and
everything downstream is pure. The scorecard scores every owner against the same
config, so it loads once per report rather than per row.

Seeding is lazy and idempotent, from the workspace's industry template. The
template is where the defaults live — not this module, and not the scoring code
— so "first response should be 4 hours" is a number in a catalogue of starting
points, and a workspace that disagrees edits a row instead of asking for a
release.

Nothing here computes a score. The curves are applied in
``service_desk_scorecard``, which is also where a ``metric_key`` becomes a
figure; this module only decides what the workspace's config *is*.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.service_desk import ServiceDeskScorecardBand, ServiceDeskScorecardKPI
from aexy.services.service_desk_industry_templates import (
    DEFAULT_TEMPLATE_SLUG,
    DIRECTIONS,
    HIGHER_IS_BETTER,
    LOWER_IS_BETTER,
    METRIC_KEYS,
    WEIGHT_SUM_TOLERANCE,
    IndustryTemplate,
    get_template,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class KPIView:
    metric_key: str
    label: str
    weight: float
    direction: str
    benchmark: float | None
    penalty_per_unit: float | None
    target: float | None
    # A number inside the metric's own question, for metrics that ask one.
    threshold: float | None
    enabled: bool
    position: int
    # "builtin" (metric_key names a computation) or "custom" (`definition`
    # holds a sentence over the closed vocabulary in service_desk_formula).
    source: str = "builtin"
    definition: dict | None = None
    definition_version: int = 1
    # "published" | "draft". Drafts are previewable and never scored.
    status: str = "published"

    @property
    def is_custom(self) -> bool:
        return self.source == "custom"

    @property
    def is_draft(self) -> bool:
        return self.status == "draft"

    def score(self, value: float | None) -> float | None:
        """Turn a raw figure into 0-100, or None when there was nothing to score.

        None propagates rather than becoming zero. "This owner closed nothing
        this period" and "this owner scored zero" are different facts, and the
        conflating them rates somebody
        *Unsatisfactory* for people who simply had no eligible tickets.
        """
        if value is None:
            return None
        if self.direction == LOWER_IS_BETTER:
            # Full marks up to the benchmark, then a linear penalty. Both halves
            # come from the KPI row, so a desk can move the target or flatten the
            # slope without a deploy.
            benchmark = self.benchmark or 0.0
            penalty = self.penalty_per_unit or 0.0
            raw = 100.0 - max(0.0, value - benchmark) * penalty
        else:
            # `target` is the value that scores 100. Validated positive on write
            # and on template import; guarded anyway so a hand-edited row cannot
            # divide by zero in the middle of a report.
            target = self.target or 0.0
            if target <= 0:
                return None
            raw = (value / target) * 100.0
        return round(max(0.0, min(100.0, raw)), 2)


@dataclass(frozen=True)
class BandView:
    rating: int
    min_score: float
    label: str


@dataclass(frozen=True)
class ScorecardConfig:
    """An immutable snapshot of one workspace's scorecard rules."""

    kpis: tuple[KPIView, ...]
    bands: tuple[BandView, ...]

    @property
    def enabled_kpis(self) -> tuple[KPIView, ...]:
        """What actually scores: enabled AND published.

        A draft is deliberately excluded here rather than filtered at each call
        site — every consumer of the config gets the same answer, so a
        half-built KPI cannot reach a rating through a path somebody forgot.
        """
        return tuple(k for k in self.kpis if k.enabled and not k.is_draft)

    def weighted_total(self, scores: dict[str, float | None]) -> tuple[float | None, float]:
        """The weighted score, and the share of weight that could be scored.

        KPIs with no data are excluded and the remainder is **renormalised**, so
        an owner missing one KPI is graded on the five that applied rather than
        being docked that KPI's weight. Returns ``(None, 0.0)`` when nothing at
        all could be scored — an owner with no eligible tickets has no rating,
        which is a different statement from a bad one.
        """
        total = 0.0
        weight_scored = 0.0
        for kpi in self.enabled_kpis:
            score = scores.get(kpi.metric_key)
            if score is None:
                continue
            total += score * kpi.weight
            weight_scored += kpi.weight
        if weight_scored <= 0:
            return None, 0.0
        return round(total / weight_scored, 2), round(weight_scored, 4)

    def band_for(self, score: float | None) -> BandView | None:
        """The first band whose floor the score clears. Bands are highest first."""
        if score is None:
            return None
        return next((b for b in self.bands if score >= b.min_score), None)


def _views(
    kpis: list[ServiceDeskScorecardKPI], bands: list[ServiceDeskScorecardBand]
) -> ScorecardConfig:
    return ScorecardConfig(
        kpis=tuple(
            KPIView(
                metric_key=k.metric_key,
                label=k.label,
                weight=float(k.weight or 0.0),
                direction=k.direction,
                benchmark=None if k.benchmark is None else float(k.benchmark),
                penalty_per_unit=None if k.penalty_per_unit is None else float(k.penalty_per_unit),
                target=None if k.target is None else float(k.target),
                threshold=None if k.threshold is None else float(k.threshold),
                enabled=bool(k.enabled),
                position=k.position,
                source=k.source or "builtin",
                definition=k.definition,
                definition_version=k.definition_version or 1,
                status=k.status or "published",
            )
            # Ordered here rather than relying on the query, so a config built
            # from freshly seeded rows and one read back from the database come
            # out in the same order.
            for k in sorted(kpis, key=lambda r: (r.position, r.metric_key))
        ),
        bands=tuple(
            BandView(rating=b.rating, min_score=float(b.min_score), label=b.label)
            # Highest floor first: `band_for` takes the first match.
            for b in sorted(bands, key=lambda r: -r.min_score)
        ),
    )


async def _read(
    db: AsyncSession, workspace_id: str
) -> tuple[list[ServiceDeskScorecardKPI], list[ServiceDeskScorecardBand]]:
    kpis = list(
        (
            await db.execute(
                select(ServiceDeskScorecardKPI).where(
                    ServiceDeskScorecardKPI.workspace_id == workspace_id
                )
            )
        )
        .scalars()
        .all()
    )
    bands = list(
        (
            await db.execute(
                select(ServiceDeskScorecardBand).where(
                    ServiceDeskScorecardBand.workspace_id == workspace_id
                )
            )
        )
        .scalars()
        .all()
    )
    return kpis, bands


async def _template_for(db: AsyncSession, workspace_id: str) -> IndustryTemplate:
    """The workspace's template, or the neutral default.

    Reads the same ``settings["service_desk"]["industry_template"]`` the taxonomy
    reads, so a desk's scorecard and its vocabulary can never come from two
    different starting points.
    """
    from aexy.models.workspace import Workspace

    ws = await db.get(Workspace, workspace_id)
    sd = ((ws.settings or {}).get("service_desk") or {}) if ws else {}
    template = get_template(sd.get("industry_template")) or get_template(DEFAULT_TEMPLATE_SLUG)
    assert template is not None  # DEFAULT_TEMPLATE_SLUG is in the catalogue
    return template


async def load_scorecard_config(
    db: AsyncSession, workspace_id: str, *, seed: bool = True
) -> ScorecardConfig:
    """The workspace's scorecard rules, seeding the template's set if it has none.

    Pass ``seed=False`` from read-only paths that must not write — a scheduled
    job walking every workspace, for instance.
    """
    kpis, bands = await _read(db, workspace_id)
    if (kpis and bands) or not seed:
        return _views(kpis, bands)

    template = await _template_for(db, workspace_id)
    logger.info(
        "Seeding Service Desk scorecard for workspace %s from template %s",
        workspace_id,
        template.slug,
    )
    await seed_scorecard_config(db, workspace_id, template)
    kpis, bands = await _read(db, workspace_id)
    return _views(kpis, bands)


async def seed_scorecard_config(
    db: AsyncSession, workspace_id: str, template: IndustryTemplate
) -> tuple[int, int]:
    """Insert any of the template's KPI rows and bands the workspace hasn't got.

    Idempotent by ``metric_key`` and ``rating``, and it never edits an existing
    row: applying a template to a desk that has already tuned its weights must
    not silently reset them. Returns ``(kpis_added, bands_added)``.
    """
    existing_kpis = {
        k
        for k in (
            await db.execute(
                select(ServiceDeskScorecardKPI.metric_key).where(
                    ServiceDeskScorecardKPI.workspace_id == workspace_id
                )
            )
        )
        .scalars()
        .all()
    }
    existing_bands = {
        b
        for b in (
            await db.execute(
                select(ServiceDeskScorecardBand.rating).where(
                    ServiceDeskScorecardBand.workspace_id == workspace_id
                )
            )
        )
        .scalars()
        .all()
    }

    added_k = 0
    for position, spec in enumerate(template.resolved_scorecard_kpis()):
        if spec.metric_key in existing_kpis:
            continue
        db.add(
            ServiceDeskScorecardKPI(
                id=str(uuid4()),
                workspace_id=workspace_id,
                metric_key=spec.metric_key,
                label=spec.label,
                weight=spec.weight,
                direction=spec.direction,
                benchmark=spec.benchmark,
                penalty_per_unit=spec.penalty_per_unit,
                target=spec.target,
                threshold=spec.threshold,
                enabled=spec.enabled,
                position=position,
            )
        )
        added_k += 1

    added_b = 0
    for spec in template.resolved_scorecard_bands():
        if spec.rating in existing_bands:
            continue
        db.add(
            ServiceDeskScorecardBand(
                id=str(uuid4()),
                workspace_id=workspace_id,
                rating=spec.rating,
                min_score=spec.min_score,
                label=spec.label,
            )
        )
        added_b += 1

    if added_k or added_b:
        await db.flush()
    return added_k, added_b


def validate_config(
    kpis: list[dict], bands: list[dict], taxonomy=None, *, require_weight_sum: bool = True
) -> None:
    """Reject a config that would produce numbers nobody could trust.

    Raised at the API boundary as a 422. Every rule here has a failure mode that
    looks like a working report: weights summing to 0.9 deflate every score by a
    tenth, a missing benchmark scores every owner identically, and bands that do
    not reach zero leave low scorers unrated.

    ``require_weight_sum=False`` for the preview. The sum is a *save-time*
    invariant, not a scoring one — ``weighted_total`` divides by the weight it
    actually scored, so a set summing to 1.1 still produces correct relative
    figures. Enforcing it in the preview made the builder's own default path
    fail: adding a KPI to a set already totalling 1.0 is how every new KPI
    starts, and refusing to show its effect until the user has gone and
    rebalanced the others is refusing at exactly the moment the preview exists
    to help.
    """
    if not kpis:
        raise HTTPException(status_code=422, detail="The scorecard needs at least one KPI")

    keys = [k.get("metric_key") for k in kpis]
    if len(keys) != len(set(keys)):
        raise HTTPException(status_code=422, detail="Duplicate KPI metric keys")

    # Built-ins must name a computation; customs bring their own definition and
    # only need a key unique within the workspace.
    builtin_keys = [k.get("metric_key") for k in kpis if k.get("source", "builtin") != "custom"]
    if unknown := sorted(set(builtin_keys) - set(METRIC_KEYS)):
        raise HTTPException(
            status_code=422,
            detail=f"Unknown metrics {unknown} (known: {', '.join(sorted(METRIC_KEYS))})",
        )
    for k in kpis:
        if k.get("source", "builtin") != "custom":
            continue
        if not k.get("metric_key"):
            raise HTTPException(status_code=422, detail="A custom KPI needs a key")
        if k["metric_key"] in METRIC_KEYS:
            # Otherwise a custom row could shadow "productivity" and the
            # scorecard would silently score something else under that name.
            raise HTTPException(
                status_code=422,
                detail=f"{k['metric_key']!r} is a built-in metric — choose another key",
            )
        if taxonomy is None:
            # The definition can only be checked against a workspace's own
            # fields. Refusing is right: accepting it unchecked is how a
            # definition naming a deleted stakeholder gets stored.
            raise HTTPException(
                status_code=422, detail="Custom KPIs cannot be validated without a taxonomy"
            )
        from aexy.services.service_desk_formula import parse, validate as validate_definition

        validate_definition(parse(k.get("definition")), taxonomy)

    for k in kpis:
        key = k.get("metric_key")
        if k.get("direction") not in DIRECTIONS:
            raise HTTPException(status_code=422, detail=f"{key}: invalid direction")
        if not k.get("enabled") or k.get("status") == "draft":
            # A disabled KPI carries no weight and is never scored, and neither
            # is a draft — so neither needs a complete curve. That is the point
            # of both: parking one you have not decided how to tune yet.
            continue
        if float(k.get("weight") or 0) <= 0:
            raise HTTPException(status_code=422, detail=f"{key}: weight must be greater than 0")
        if k["direction"] == LOWER_IS_BETTER:
            if k.get("benchmark") is None or k.get("penalty_per_unit") is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"{key}: lower-is-better needs a benchmark and a penalty per unit",
                )
            if float(k["benchmark"]) < 0 or float(k["penalty_per_unit"]) < 0:
                raise HTTPException(
                    status_code=422, detail=f"{key}: benchmark and penalty cannot be negative"
                )
        elif not k.get("target") or float(k["target"]) <= 0:
            raise HTTPException(
                status_code=422, detail=f"{key}: higher-is-better needs a target above 0"
            )
        # Not required: only some metrics ask a threshold question, and the
        # registry — not this validator — knows which. But a negative one is
        # nonsense for every metric that does read it.
        if k.get("threshold") is not None and float(k["threshold"]) < 0:
            raise HTTPException(status_code=422, detail=f"{key}: threshold cannot be negative")

    total = sum(
        float(k.get("weight") or 0)
        for k in kpis
        if k.get("enabled") and k.get("status") != "draft"
    )
    if require_weight_sum and abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
        # Naming the actual sum matters: "weights must total 1" with no figure
        # sends someone back to add up six numbers by hand.
        raise HTTPException(
            status_code=422,
            detail=f"Enabled KPI weights must total 1.0 (they currently total {round(total, 4)})",
        )

    if not bands:
        raise HTTPException(status_code=422, detail="The scorecard needs at least one rating band")
    ratings = [b.get("rating") for b in bands]
    if len(ratings) != len(set(ratings)):
        raise HTTPException(status_code=422, detail="Duplicate rating values")
    floors = sorted((float(b.get("min_score") or 0) for b in bands), reverse=True)
    if len(set(floors)) != len(floors):
        raise HTTPException(status_code=422, detail="Two rating bands share a floor")
    if min(floors) > 0:
        raise HTTPException(
            status_code=422,
            detail="The lowest rating band must start at 0, or scores below it would be unrated",
        )


async def replace_config(
    db: AsyncSession, workspace_id: str, kpis: list[dict], bands: list[dict], taxonomy=None
) -> ScorecardConfig:
    """Replace the whole config in one go.

    Whole-set rather than per-row, because the weights must total 1: a per-row
    edit is either invalid on its own or opens a window in which every score on
    every screen is wrong. Same reasoning ``ignored_senders`` uses.
    """
    validate_config(kpis, bands, taxonomy)

    existing_kpis, existing_bands = await _read(db, workspace_id)
    by_key = {k.metric_key: k for k in existing_kpis}
    by_rating = {b.rating: b for b in existing_bands}

    seen_keys: set[str] = set()
    for position, k in enumerate(kpis):
        key = k["metric_key"]
        seen_keys.add(key)
        row = by_key.get(key)
        if row is None:
            row = ServiceDeskScorecardKPI(
                id=str(uuid4()), workspace_id=workspace_id, metric_key=key
            )
            db.add(row)
        row.label = k["label"]
        row.weight = float(k.get("weight") or 0)
        row.direction = k["direction"]
        row.benchmark = None if k.get("benchmark") is None else float(k["benchmark"])
        row.penalty_per_unit = (
            None if k.get("penalty_per_unit") is None else float(k["penalty_per_unit"])
        )
        row.target = None if k.get("target") is None else float(k["target"])
        row.threshold = None if k.get("threshold") is None else float(k["threshold"])
        row.enabled = bool(k.get("enabled", True))
        row.position = position
        row.source = k.get("source", "builtin")
        row.status = k.get("status", "published")

        definition = k.get("definition")
        if row.source == "custom":
            from aexy.services.service_desk_formula import parse, to_dict

            normalised = to_dict(parse(definition))
            # Bump only when the meaning actually changed. Renaming a KPI or
            # nudging its weight is not a new definition, and a version that
            # ticks on every save tells a reader nothing.
            if row.definition != normalised:
                row.definition_version = (row.definition_version or 0) + 1
                row.definition = normalised
        else:
            row.definition = None
    for key, row in by_key.items():
        if key not in seen_keys:
            await db.delete(row)

    seen_ratings: set[int] = set()
    for b in bands:
        rating = int(b["rating"])
        seen_ratings.add(rating)
        row = by_rating.get(rating)
        if row is None:
            row = ServiceDeskScorecardBand(
                id=str(uuid4()), workspace_id=workspace_id, rating=rating
            )
            db.add(row)
        row.min_score = float(b.get("min_score") or 0)
        row.label = b["label"]
    for rating, row in by_rating.items():
        if rating not in seen_ratings:
            await db.delete(row)

    await db.flush()
    read_kpis, read_bands = await _read(db, workspace_id)
    return _views(read_kpis, read_bands)


__all__ = [
    "BandView",
    "HIGHER_IS_BETTER",
    "KPIView",
    "LOWER_IS_BETTER",
    "ScorecardConfig",
    "load_scorecard_config",
    "replace_config",
    "seed_scorecard_config",
    "validate_config",
]
