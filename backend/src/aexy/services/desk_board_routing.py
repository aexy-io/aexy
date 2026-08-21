"""Which Service Desk bucket a board's work is pending with.

A ticket converted to a task is no longer waiting on the person who logged it —
it is waiting on whoever owns the board the task landed on. Nothing computed
that, so the ticket kept whatever ``pending_with`` it already had and somebody
moved it by hand, which is the same class of complaint as tickets not routing to
their account owner.

The chain already existed in the schema, unused end to end::

    board (Team) -> Team.department_id -> Department.function_key
                 -> ServiceDeskStakeholder.function_key -> bucket

``Team.desk_stakeholder_slug`` short-circuits it for a board the org chart cannot
describe.

**Every answer carries a reason, including the failures.** A resolver that
returns ``None`` for "no department", "department has no function" and "no bucket
claims that function" alike leaves an admin with a feature that silently does
nothing and no way to find out why — which is precisely how the account-owner
routing went unnoticed until an ops lead complained. The reasons are stable
identifiers so the UI can phrase them and the ticket log can quote them.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.organization import Department
from aexy.models.service_desk import ServiceDeskStakeholder
from aexy.models.team import Team
from aexy.services.org_functions import function_key_spellings

#: Why a board resolved to the bucket it did — or to nothing.
REASON_OVERRIDE = "override"
REASON_DEPARTMENT = "department"
REASON_NO_BOARD = "no_board"
REASON_NO_DEPARTMENT = "no_department"
REASON_DEPARTMENT_HAS_NO_FUNCTION = "department_has_no_function"
REASON_NO_BUCKET_FOR_FUNCTION = "no_bucket_for_function"


@dataclass(frozen=True)
class BoardRouting:
    """What a board routes to, and how that was decided."""

    board_id: str
    stakeholder_slug: str | None
    reason: str
    department_id: str | None = None
    department_name: str | None = None
    function_key: str | None = None

    @property
    def resolved(self) -> bool:
        return self.stakeholder_slug is not None

    def as_response_fields(self) -> dict:
        """The shape the project API adds to a board's representation."""
        return {
            "department_id": self.department_id,
            "department_name": self.department_name,
            "desk_stakeholder_slug": self.stakeholder_slug,
            "desk_routing_reason": self.reason,
        }


async def resolve_board_routing(
    db: AsyncSession, workspace_id: str, board_id: str
) -> BoardRouting:
    """Resolve one board. See :func:`resolve_board_routings`."""
    routings = await resolve_board_routings(db, workspace_id, [board_id])
    return routings.get(
        board_id,
        BoardRouting(board_id=board_id, stakeholder_slug=None, reason=REASON_NO_BOARD),
    )


async def resolve_board_routings(
    db: AsyncSession, workspace_id: str, board_ids: list[str]
) -> dict[str, BoardRouting]:
    """Resolve many boards in a fixed number of queries.

    Batched because the settings page renders the resolved bucket on every board
    row; per-row resolution there would be one query per board per render.
    """
    if not board_ids:
        return {}

    boards = (
        (
            await db.execute(
                select(
                    Team.id, Team.department_id, Team.desk_stakeholder_slug
                ).where(Team.id.in_(board_ids), Team.workspace_id == workspace_id)
            )
        )
        .all()
    )
    if not boards:
        return {}

    department_ids = {row.department_id for row in boards if row.department_id}
    departments: dict[str, Department] = {}
    if department_ids:
        departments = {
            d.id: d
            for d in (
                await db.execute(
                    select(Department).where(
                        Department.id.in_(department_ids),
                        Department.workspace_id == workspace_id,
                    )
                )
            )
            .scalars()
            .all()
        }

    # Only active buckets. A retired bucket must not be resolved *into* — that is
    # what retiring one means — even though a ticket already sitting in it still
    # renders its label.
    buckets = list(
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
    by_slug = {b.slug: b for b in buckets}

    def bucket_for_function(function_key: str) -> ServiceDeskStakeholder | None:
        # Matched across every spelling of the key, because a live workspace
        # holds the retired `ops_kam` on one side and `operations` on the other;
        # comparing a single string is how this silently resolved to nothing.
        spellings = set(function_key_spellings(function_key)) or {function_key}
        for candidate in buckets:
            if candidate.semantics != "internal" or not candidate.function_key:
                continue
            if candidate.function_key in spellings:
                return candidate
        return None

    out: dict[str, BoardRouting] = {}
    for row in boards:
        department = departments.get(row.department_id) if row.department_id else None
        base = {
            "board_id": row.id,
            "department_id": department.id if department else None,
            "department_name": department.name if department else None,
            "function_key": department.function_key if department else None,
        }

        # The override wins, but only while it still names a live bucket —
        # otherwise retiring a bucket would silently start routing boards into
        # something no queue matches.
        override = row.desk_stakeholder_slug
        if override and override in by_slug:
            out[row.id] = BoardRouting(
                **base, stakeholder_slug=override, reason=REASON_OVERRIDE
            )
            continue

        if department is None:
            out[row.id] = BoardRouting(
                **base, stakeholder_slug=None, reason=REASON_NO_DEPARTMENT
            )
            continue
        if not department.function_key:
            out[row.id] = BoardRouting(
                **base,
                stakeholder_slug=None,
                reason=REASON_DEPARTMENT_HAS_NO_FUNCTION,
            )
            continue

        bucket = bucket_for_function(department.function_key)
        if bucket is None:
            out[row.id] = BoardRouting(
                **base, stakeholder_slug=None, reason=REASON_NO_BUCKET_FOR_FUNCTION
            )
            continue

        out[row.id] = BoardRouting(
            **base, stakeholder_slug=bucket.slug, reason=REASON_DEPARTMENT
        )

    return out


def explain(routing: BoardRouting, board_name: str | None = None) -> str:
    """One sentence for the ticket log saying how the bucket was chosen.

    Written into the ticket rather than only logged server-side: when the desk
    does something on its own, the person reading the ticket a week later is the
    one who needs to know why, and they cannot read the application log.
    """
    board = f'"{board_name}"' if board_name else "the board"
    if routing.reason == REASON_OVERRIDE:
        return f"Moved by {board}, which routes to '{routing.stakeholder_slug}' directly."
    if routing.reason == REASON_DEPARTMENT:
        return (
            f"Moved by {board}, which belongs to "
            f'"{routing.department_name}" ({routing.function_key}).'
        )
    if routing.reason == REASON_NO_DEPARTMENT:
        return (
            f"Left where it was: {board} does not belong to a department, so there "
            "is nothing to hand this to. Set one in the board's settings."
        )
    if routing.reason == REASON_DEPARTMENT_HAS_NO_FUNCTION:
        return (
            f'Left where it was: {board} belongs to "{routing.department_name}", '
            "which has no function assigned on the org chart."
        )
    if routing.reason == REASON_NO_BUCKET_FOR_FUNCTION:
        return (
            f'Left where it was: no active pending-with bucket is owned by '
            f'"{routing.department_name}" ({routing.function_key}).'
        )
    return f"Left where it was: {board} could not be found."
