"""The owner performance scorecard: six weighted KPIs, one rating per owner.

Every figure here is an aggregation of the per-ticket rows
``service_desk_reporting`` already folds, so the scorecard and the TAT report
cannot disagree about what a handshake is or when a stage breached. That sharing
is deliberate and load-bearing — the alternative is two implementations of the
same definition drifting apart, which is exactly how three different breach
thresholds came to coexist in this module before ``Clock``.

**The registry is the code half of a deliberate boundary.** A ``metric_key``
names a computation, and computations are code; everything numeric about a KPI —
its weight, its benchmark, how steeply a miss is punished, the value that scores
full marks, the rating bands — is a row a workspace edits. "Nothing hardcoded"
means no business constant in a module, not a formula language for users. Adding
a seventh KPI is one entry in ``METRICS`` plus one function.

**Cohort figures are always desk-wide.** Productivity is a ratio against the team
average, so it is only meaningful measured across the whole desk. An owner
restricted to their own row still has their score computed against every owner's
closed count — a cohort of one would divide by its own value and score 100
forever, which is not a restricted view but a wrong number. ``scorecard()``
therefore folds the desk unscoped and narrows the *rows returned*, which is a
different thing from narrowing the input.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.services.service_desk_industry_templates import (
    HIGHER_IS_BETTER,
    LOWER_IS_BETTER,
    METRIC_FIRST_RESPONSE,
    METRIC_HANDSHAKE_EFFICIENCY,
    METRIC_KEYS,
    METRIC_NOT_REOPENED,
    METRIC_OWNER_TAT,
    METRIC_PRODUCTIVITY,
    METRIC_ZERO_BREACH,
    UNIT_HOURS,
    UNIT_RATE,
    UNIT_RATIO,
)
from aexy.services.service_desk_reporting import ServiceDeskReporting, TicketReportRow
from aexy.services.service_desk_scorecard_config import (
    KPIView,
    ScorecardConfig,
    load_scorecard_config,
)
from aexy.services.service_desk_taxonomy import Taxonomy

logger = logging.getLogger(__name__)

_HOUR = 3600.0

# Fallback for a KPI row whose `threshold` is NULL — one written before the
# column existed. The live value is `KPIView.threshold`, seeded from the
# template; this exists so a missing number degrades to the long-standing
# default rather than scoring every owner identically.
DEFAULT_HANDSHAKE_LIMIT = 2


@dataclass
class OwnerBucket:
    """One owner's tickets in the reporting period."""

    owner_id: str | None
    owner_name: str
    tickets: list[TicketReportRow]

    @property
    def closed(self) -> list[TicketReportRow]:
        return [t for t in self.tickets if t.is_closed]


@dataclass(frozen=True)
class Cohort:
    """Desk-wide figures a KPI needs in order to be comparative.

    Computed across every owner regardless of who is asking, so an owner reading
    their own card is measured against the desk rather than against themselves.
    """

    # Mean closed-ticket count per owner. None when nobody closed anything, in
    # which case Productivity has nothing to compare against and scores None.
    average_closed: float | None
    owner_count: int
    # The stakeholder bucket that counts as "the owner's own stage" — resolved
    # from the taxonomy, never a literal slug.
    owner_stakeholder: str | None


@dataclass(frozen=True)
class Metric:
    key: str
    # Fallback label. The workspace's KPI row overrides it, so this is only what
    # a freshly seeded desk sees.
    label: str
    unit: str
    direction: str
    # `compute` takes the KPI row as well as the data, so a metric that asks a
    # threshold question reads the workspace's number rather than a constant.
    compute: Callable[[OwnerBucket, Cohort, "KPIView"], float | None]
    # What the KPI means, and how the figure is arrived at — the reference
    # KPI's own prose. Served read-only: they describe what the
    # code does, and a description a workspace could edit into disagreeing with
    # the computation would be worse than no description at all.
    description: str = ""
    how_calculated: str = ""
    # Whether this metric reads `KPIView.threshold`, and what to call it. A
    # settings page showing a bare "Threshold" box on a KPI that ignores it is
    # how a setting comes to look set without doing anything.
    threshold_label: str | None = None

    @property
    def uses_threshold(self) -> bool:
        return self.threshold_label is not None


def _productivity(bucket: OwnerBucket, cohort: Cohort, kpi: KPIView) -> float | None:
    """Closed count as a multiple of the desk average — 1.0 is "at average".

    A ratio rather than a raw count, because the KPI row scores it against a
    ``target`` and a target expressed in tickets would have to be re-set every
    time the desk's volume changed.
    """
    if not cohort.average_closed:
        return None
    return round(len(bucket.closed) / cohort.average_closed, 4)


def _first_response(bucket: OwnerBucket, cohort: Cohort, kpi: KPIView) -> float | None:
    """Average working hours before the desk first moved on the request.

    The first segment of the ledger. Working time,
    not elapsed: a request arriving at 18:00 has not been ignored for fifteen
    hours by nine the next morning.
    """
    values = [
        t.first_response_seconds for t in bucket.tickets if t.first_response_seconds is not None
    ]
    if not values:
        return None
    return round(sum(values) / len(values) / _HOUR, 2)


def _handshake_efficiency(bucket: OwnerBucket, cohort: Cohort, kpi: KPIView) -> float | None:
    """Share of closed tickets resolved in at most ``kpi.threshold`` hand-offs.

    The limit is the workspace's, not this module's. It was
    ``CLEAN_HANDSHAKE_LIMIT = 2`` here — the one figure on this scorecard a desk
    could not change, and it belongs in the KPI's own title.
    ``DEFAULT_HANDSHAKE_LIMIT`` is a fallback for a row written before the
    column existed, not a default anybody is stuck with.
    """
    closed = bucket.closed
    if not closed:
        return None
    limit = kpi.threshold if kpi.threshold is not None else DEFAULT_HANDSHAKE_LIMIT
    clean = sum(1 for t in closed if t.handshakes <= limit)
    return round(clean / len(closed), 4)


def _owner_attributable_tat(bucket: OwnerBucket, cohort: Cohort, kpi: KPIView) -> float | None:
    """Average working hours spent in the owner's own stage.

    The portion of the delay inside the owner's control, isolated from time the
    insurer, the partner or finance held the ticket. Which bucket that is comes
    from the taxonomy (``Cohort.owner_stakeholder``) rather than a hardcoded
    stakeholder name.
    """
    if cohort.owner_stakeholder is None:
        return None
    values = [t.stakeholder_seconds.get(cohort.owner_stakeholder, 0) for t in bucket.tickets]
    if not values:
        return None
    return round(sum(values) / len(values) / _HOUR, 2)


def _zero_breach(bucket: OwnerBucket, cohort: Cohort, kpi: KPIView) -> float | None:
    """Share of tickets whose worst single stage stayed inside the desk's target."""
    if not bucket.tickets:
        return None
    return round(sum(1 for t in bucket.tickets if t.zero_breach) / len(bucket.tickets), 4)


def _not_reopened(bucket: OwnerBucket, cohort: Cohort, kpi: KPIView) -> float | None:
    """Share of closed tickets that stayed closed."""
    closed = bucket.closed
    if not closed:
        return None
    return round(sum(1 for t in closed if not t.reopened) / len(closed), 4)


METRICS: dict[str, Metric] = {
    m.key: m
    for m in (
        Metric(
            METRIC_PRODUCTIVITY,
            "Productivity",
            UNIT_RATIO,
            HIGHER_IS_BETTER,
            _productivity,
            description=(
                "Volume of tickets this owner actually closes, relative to the desk average."
            ),
            how_calculated=(
                "Closed ticket count divided by the average closed count across every owner "
                "in the period, so 1.00x is exactly at the desk average. Capped at 100 so a "
                "high-volume outlier does not stretch the scale for everyone else."
            ),
        ),
        Metric(
            METRIC_FIRST_RESPONSE,
            "First Time Response",
            UNIT_HOURS,
            LOWER_IS_BETTER,
            _first_response,
            description=(
                "How quickly the desk first moves on a request after it arrives."
            ),
            how_calculated=(
                "Average length of each ticket's first pending-with segment, in working hours "
                "on this workspace's clock. A request arriving at 18:00 has not been ignored "
                "for fifteen hours by nine the next morning."
            ),
        ),
        Metric(
            METRIC_HANDSHAKE_EFFICIENCY,
            "Handshake Efficiency",
            UNIT_RATE,
            HIGHER_IS_BETTER,
            _handshake_efficiency,
            description=(
                "Share of closed tickets resolved cleanly, rather than bouncing between "
                "stakeholders before anyone answered."
            ),
            how_calculated=(
                "Closed tickets whose hand-off count is at or under the limit, as a share of "
                "all closed tickets. Hand-offs are the ticket's pending-with changes, not "
                "counting its creation."
            ),
            threshold_label="Max hand-offs",
        ),
        Metric(
            METRIC_OWNER_TAT,
            "Owner-Attributable TAT",
            UNIT_HOURS,
            LOWER_IS_BETTER,
            _owner_attributable_tat,
            description=(
                "The part of the delay inside the owner's own control, isolated from time a "
                "counterparty or another department was holding the ticket."
            ),
            how_calculated=(
                "Average working hours spent in the desk's own queue — the workspace's default "
                "stakeholder — across the owner's tickets."
            ),
        ),
        Metric(
            METRIC_ZERO_BREACH,
            "Zero-Breach",
            UNIT_RATE,
            HIGHER_IS_BETTER,
            _zero_breach,
            description=(
                "Share of tickets where no single stage, with anyone, ever ran past the "
                "desk's breach target."
            ),
            how_calculated=(
                "Tickets whose longest single non-closed stage stayed within the breach "
                "target set under Working Hours & SLA, measured in working days."
            ),
        ),
        Metric(
            METRIC_NOT_REOPENED,
            "Not Reopened",
            UNIT_RATE,
            HIGHER_IS_BETTER,
            _not_reopened,
            description="Share of closed tickets that stayed closed.",
            how_calculated=(
                "Closed tickets that reached the terminal stage exactly once. A requester "
                "replying after closure reopens the ticket, which counts as a second visit."
            ),
        ),
    )
}

# Fail at import if a template declares a KPI nothing can compute. This is the
# coverage half of the check whose structural half lives in
# `service_desk_industry_templates._validate` — the dependency runs this way so
# the template catalogue stays free of database imports.
if missing := set(METRIC_KEYS) - set(METRICS):
    raise ValueError(f"scorecard metrics declared but not implemented: {sorted(missing)}")


def _unit_of(kpi) -> str:
    """How a KPI's raw figure should be read.

    A built-in's unit comes from the registry; a custom one's from the shape of
    its own sentence — a share is a rate, an average of a duration is hours.
    """
    if kpi.is_custom:
        from aexy.services.service_desk_formula import parse

        try:
            return parse(kpi.definition).unit()
        except HTTPException:
            # Same reasoning as `_raw_values`: an unreadable row loses its unit,
            # not the response it appears in.
            return "rate"
    metric = METRICS.get(kpi.metric_key)
    return metric.unit if metric else "rate"


def metric_catalogue() -> list[dict]:
    """The vocabulary a settings page offers, so it need not hardcode the list.

    Carries the prose too. Somebody setting a benchmark needs to know what the
    KPI actually measures, and until now that had nowhere to live.
    """
    return [
        {
            "key": m.key,
            "label": m.label,
            "unit": m.unit,
            "direction": m.direction,
            "description": m.description,
            "how_calculated": m.how_calculated,
            "uses_threshold": m.uses_threshold,
            "threshold_label": m.threshold_label,
        }
        for m in METRICS.values()
    ]


def _owner_stakeholder(taxonomy: Taxonomy) -> str | None:
    """Which bucket counts as "the owner is holding it".

    The workspace's default stakeholder: intake parks every new ticket there and
    it is the queue an owner works out of. Resolved rather than named, so a desk
    that calls it Support and one that calls it KAM both measure the same thing.
    """
    return taxonomy.default_stakeholder_slug


class ServiceDeskScorecard:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def scorecard(
        self,
        workspace_id: str,
        *,
        viewer_id: str | None = None,
        restrict_to_owner_id: str | None = None,
        filters=None,
    ) -> dict:
        """Per-owner KPI figures, scores, weighted total and rating.

        ``restrict_to_owner_id`` narrows the rows that come back to one person
        while leaving the cohort computed across the desk. That is what makes an
        owner's own card accurate: their Productivity is still a ratio against
        every owner's closed count, not against themselves. Callers that may see
        everyone pass None.
        """
        config = await load_scorecard_config(self.db, workspace_id)

        # Deliberately unscoped: see the module docstring. The endpoint decides
        # who may ask; this decides what the numbers mean.
        rows, clock, taxonomy = await ServiceDeskReporting(self.db).collect(
            workspace_id, developer_id=None, filters=filters
        )

        buckets = self._bucket(rows)
        cohort = self._cohort(buckets, taxonomy)

        # Raw figures for EVERY owner first, then scores — because a
        # cohort-relative KPI cannot be computed one owner at a time. Custom
        # KPIs with `relative_to_desk_average` divide by the desk mean, and the
        # mean needs the whole desk even when one row comes back.
        values_by_kpi = self._raw_values(buckets, cohort, config, taxonomy, clock)

        visible = [
            b
            for b in buckets.values()
            if restrict_to_owner_id is None or b.owner_id == restrict_to_owner_id
        ]
        results = [self._score_owner(bucket, config, values_by_kpi) for bucket in visible]
        # Best first, so the conversation starts at the top of the table. Ties
        # break on name for a stable order between two identical runs; unrated
        # owners sort last rather than as a zero.
        results.sort(
            key=lambda r: (-(r["sim_score"] if r["sim_score"] is not None else -1), r["owner"])
        )

        return {
            "kpis": [
                {
                    "metric_key": k.metric_key,
                    "label": k.label,
                    "weight": k.weight,
                    "direction": k.direction,
                    "unit": _unit_of(k),
                    "benchmark": k.benchmark,
                    "penalty_per_unit": k.penalty_per_unit,
                    "target": k.target,
                    "source": k.source,
                    "definition": k.definition,
                    # So an exported scorecard can say which definition produced
                    # it. Editing a KPI rewrites what past scores meant, and a
                    # review conversation has to stay reproducible.
                    "definition_version": k.definition_version,
                }
                for k in config.enabled_kpis
            ],
            "bands": [
                {"rating": b.rating, "min_score": b.min_score, "label": b.label}
                for b in config.bands
            ],
            "rows": results,
            # Published so a reader can see what Productivity was measured
            # against, and so an owner shown only their own row can tell the
            # comparison was made across the desk.
            "cohort": {
                "owners": cohort.owner_count,
                "average_closed": cohort.average_closed,
                "owner_stakeholder": cohort.owner_stakeholder,
            },
            "restricted_to_self": restrict_to_owner_id is not None,
            "working_day_hours": round(clock.working_day_seconds / _HOUR, 2),
            "breach_red_days": clock.breach_red_days,
        }

    def _raw_values(
        self,
        buckets: dict[str, OwnerBucket],
        cohort: Cohort,
        config: ScorecardConfig,
        taxonomy: Taxonomy,
        clock,
    ) -> dict[str, dict[str, float | None]]:
        """``{metric_key: {owner_id: raw figure}}`` across the whole desk.

        Two phases rather than one pass per owner, because normalising against
        the desk mean is not something an owner's own tickets can answer.
        """
        from aexy.services.service_desk_formula import (
            evaluate,
            normalise_to_cohort,
            parse,
        )

        out: dict[str, dict[str, float | None]] = {}
        for kpi in config.enabled_kpis:
            per_owner: dict[str, float | None] = {}
            if kpi.is_custom:
                try:
                    definition = parse(kpi.definition)
                except HTTPException:
                    # A stored definition that will not parse — hand-edited SQL,
                    # a partial restore. Skipped like an unimplemented built-in
                    # rather than raised: one malformed row must cost its own
                    # column, not the whole report for everyone who opens it.
                    logger.warning(
                        "Scorecard KPI %s has an unreadable definition; skipping",
                        kpi.metric_key,
                    )
                    out[kpi.metric_key] = {owner_id: None for owner_id in buckets}
                    continue
                for owner_id, bucket in buckets.items():
                    per_owner[owner_id] = evaluate(definition, bucket.tickets, taxonomy, clock)
                if definition.relative_to_desk_average:
                    per_owner = normalise_to_cohort(per_owner)
            else:
                metric = METRICS.get(kpi.metric_key)
                for owner_id, bucket in buckets.items():
                    if metric is None:
                        # A row naming a metric this build does not implement —
                        # possible after a downgrade. Skipped rather than fatal:
                        # the rest of the card is still worth showing.
                        logger.warning("Scorecard KPI %s has no implementation", kpi.metric_key)
                        per_owner[owner_id] = None
                    else:
                        per_owner[owner_id] = metric.compute(bucket, cohort, kpi)
            out[kpi.metric_key] = per_owner
        return out

    def _score_owner(
        self,
        bucket: OwnerBucket,
        config: ScorecardConfig,
        values_by_kpi: dict[str, dict[str, float | None]],
    ) -> dict:
        values: dict[str, float | None] = {}
        scores: dict[str, float | None] = {}
        for kpi in config.enabled_kpis:
            value = values_by_kpi.get(kpi.metric_key, {}).get(bucket.owner_id or "")
            values[kpi.metric_key] = value
            scores[kpi.metric_key] = kpi.score(value)

        total, weight_scored = config.weighted_total(scores)
        band = config.band_for(total)
        return {
            "owner_id": bucket.owner_id,
            "owner": bucket.owner_name,
            "tickets": len(bucket.tickets),
            "tickets_closed": len(bucket.closed),
            "values": values,
            "scores": scores,
            "sim_score": total,
            # How much of the weight actually had data behind it. A total built
            # from 0.6 of the weights is a weaker statement than one built from
            # all of it, and the reader should be able to see which they have.
            "weight_scored": weight_scored,
            "rating": band.rating if band else None,
            "rating_label": band.label if band else None,
        }

    async def preview(
        self,
        workspace_id: str,
        *,
        draft_kpis: list[dict],
        draft_bands: list[dict],
        filters=None,
    ) -> dict:
        """What a proposed config would score, next to what the live one scores.

        The most important call in the feature. A KPI you cannot preview is one
        you find out is wrong at somebody's review, and adding a KPI at weight
        0.10 rescales every other weight and re-grades named people — so the
        screen has to be able to say "Dana 81 -> 76" *before* anyone saves.

        Computed over the whole desk regardless of who asks, like the scorecard
        itself; the endpoint gates who may ask. Nothing is written.
        """
        from aexy.services.service_desk_scorecard_config import (
            BandView,
            KPIView,
            ScorecardConfig,
            validate_config,
        )

        rows, clock, taxonomy = await ServiceDeskReporting(self.db).collect(
            workspace_id, developer_id=None, filters=filters
        )
        # Not the weight sum: see `validate_config`. A preview of a config
        # mid-edit is exactly the case where the weights do not add up yet.
        validate_config(draft_kpis, draft_bands, taxonomy, require_weight_sum=False)

        buckets = self._bucket(rows)
        cohort = self._cohort(buckets, taxonomy)

        proposed = ScorecardConfig(
            kpis=tuple(
                KPIView(
                    metric_key=k["metric_key"],
                    label=k["label"],
                    weight=float(k.get("weight") or 0),
                    direction=k["direction"],
                    benchmark=k.get("benchmark"),
                    penalty_per_unit=k.get("penalty_per_unit"),
                    target=k.get("target"),
                    threshold=k.get("threshold"),
                    enabled=bool(k.get("enabled", True)),
                    position=index,
                    source=k.get("source", "builtin"),
                    definition=k.get("definition"),
                    status=k.get("status", "published"),
                )
                for index, k in enumerate(draft_kpis)
            ),
            bands=tuple(
                BandView(rating=int(b["rating"]), min_score=float(b.get("min_score") or 0), label=b["label"])
                for b in sorted(draft_bands, key=lambda b: -float(b.get("min_score") or 0))
            ),
        )
        live = await load_scorecard_config(self.db, workspace_id)

        after = self._score_all(buckets, cohort, proposed, taxonomy, clock)
        before = self._score_all(buckets, cohort, live, taxonomy, clock)
        before_by_owner = {r["owner_id"]: r for r in before}

        return {
            "kpis": [
                {"metric_key": k.metric_key, "label": k.label, "unit": _unit_of(k)}
                for k in proposed.enabled_kpis
            ],
            "rows": [
                {
                    **row,
                    # The blast radius, per person. Null when this owner had no
                    # rating either side — a change from nothing to nothing is
                    # not a change anyone needs to see.
                    "previous_score": (prev := before_by_owner.get(row["owner_id"], {})).get("sim_score"),
                    "previous_rating_label": prev.get("rating_label"),
                }
                for row in after
            ],
            "cohort": {"owners": cohort.owner_count, "average_closed": cohort.average_closed},
        }

    def _bucket(self, rows) -> dict[str, OwnerBucket]:
        buckets: dict[str, OwnerBucket] = {}
        for row in rows:
            # Tickets nobody owns are excluded rather than pooled into an
            # "(unassigned)" row: a scorecard grades people, and an unassigned
            # ticket has nobody to grade. They still appear in the TAT report,
            # which is where that gap is meant to be visible.
            if not row.owner_id:
                continue
            bucket = buckets.get(row.owner_id)
            if bucket is None:
                bucket = buckets[row.owner_id] = OwnerBucket(
                    owner_id=row.owner_id, owner_name=row.owner or "", tickets=[]
                )
            bucket.tickets.append(row)
        return buckets

    def _cohort(self, buckets: dict[str, OwnerBucket], taxonomy: Taxonomy) -> Cohort:
        closed_counts = [len(b.closed) for b in buckets.values()]
        return Cohort(
            average_closed=(
                round(sum(closed_counts) / len(closed_counts), 4) if closed_counts else None
            ),
            owner_count=len(buckets),
            owner_stakeholder=_owner_stakeholder(taxonomy),
        )

    def _score_all(
        self,
        buckets: dict[str, OwnerBucket],
        cohort: Cohort,
        config: ScorecardConfig,
        taxonomy: Taxonomy,
        clock,
    ) -> list[dict]:
        values_by_kpi = self._raw_values(buckets, cohort, config, taxonomy, clock)
        results = [self._score_owner(b, config, values_by_kpi) for b in buckets.values()]
        # Best first, so the conversation starts at the top of the table. Ties
        # break on name for a stable order between two identical runs; unrated
        # owners sort last rather than as a zero.
        results.sort(
            key=lambda r: (-(r["sim_score"] if r["sim_score"] is not None else -1), r["owner"])
        )
        return results

    async def export_csv(
        self,
        workspace_id: str,
        *,
        viewer_id: str | None = None,
        restrict_to_owner_id: str | None = None,
        filters=None,
    ) -> tuple[str, str]:
        """The scorecard as CSV, columns driven by the same config as the screen."""
        import csv
        import io
        from datetime import datetime, timezone

        from aexy.services.service_desk_config import ticket_prefix

        report = await self.scorecard(
            workspace_id,
            viewer_id=viewer_id,
            restrict_to_owner_id=restrict_to_owner_id,
            filters=filters,
        )

        header = ["Owner", "Tickets", "Tickets Closed"]
        for kpi in report["kpis"]:
            header += [kpi["label"], f"{kpi['label']} Score"]
        header += ["Weighted Score", "Rating", "Rating Label"]

        buffer = io.StringIO()
        writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
        writer.writerow(header)
        for row in report["rows"]:
            line = [row["owner"], row["tickets"], row["tickets_closed"]]
            for kpi in report["kpis"]:
                key = kpi["metric_key"]
                line += [_cell(row["values"].get(key)), _cell(row["scores"].get(key))]
            line += [
                _cell(row["sim_score"]),
                _cell(row["rating"]),
                row["rating_label"] or "",
            ]
            writer.writerow(line)

        prefix = await ticket_prefix(self.db, workspace_id)
        stamp = datetime.now(timezone.utc).date().isoformat()
        # A BOM so Excel opens a UTF-8 file as UTF-8, matching the other exports.
        return "﻿" + buffer.getvalue(), f"{prefix.lower()}-scorecard-{stamp}.csv"


def _cell(value) -> str:
    """Blank for "no data", never 0 — the distinction the whole module preserves."""
    return "" if value is None else str(value)
